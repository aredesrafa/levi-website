# Levi Recorder — Marketing Website

Static marketing site for **Levi Meeting Audio Recorder**, served at
**https://levirecorder.app**. Plain HTML/CSS/JS (no framework, no build step)
plus a small Cloudflare Worker that backs the contact form.

## Stack

- **Static pages:** `index.html`, `contact.html`, `privacy.html`.
- **Styles:** `styles.css` (home), `contact.css`, `privacy.css`.
- **Scripts:** `script.js` (home interactions + conversion tracking),
  `contact.js` (contact form), `i18n.js` (localization).
- **Localization:** `locales/*.json` (en, pt-BR, es, it, fr) loaded by `i18n.js`.
- **Contact backend:** `worker/` — Cloudflare Worker `levi-contact` that
  receives the form POST and sends mail via the Resend API.

## Local development

It is a static site, so any static server works:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

`localhost:8000` / `127.0.0.1:8000` are already in the Worker's CORS allow-list,
so the contact form works locally against the deployed Worker.

## Deploy

- **Site:** hosted on **GitHub Pages**. Pushing to **`main`** triggers the
  automatic Pages build/publish — there is no `.github/workflows`; Pages serves
  the branch directly. The custom domain is pinned by the `CNAME` file
  (`levirecorder.app`).
- **Contact Worker:** deployed separately with Wrangler from `worker/`:

  ```bash
  cd worker && npx wrangler deploy
  ```

  The Worker needs a `RESEND_API_KEY` secret (`npx wrangler secret put
  RESEND_API_KEY`). The form posts to
  `https://levi-contact.infinitybuilder.workers.dev`.

## Analytics & conversion tracking

Four trackers are loaded on every page (see the `<head>` of each `.html`):

| Tool             | ID                         | Purpose                              |
| ---------------- | -------------------------- | ------------------------------------ |
| Google Analytics | `G-3L5J12BFJ0`             | GA4 traffic/behavior                 |
| Google Ads       | `AW-18232657346`           | Conversion tracking for paid traffic |
| Microsoft Clarity| `wulz7uk3oy`               | Session heatmaps/recordings          |
| Reddit Pixel     | `a2_j6ez7imlu8si`          | Reddit Ads conversion tracking       |

### macOS Download conversion (Google Ads)

The key paid-campaign signal is a **download click from a real macOS visitor**.
It is implemented in `script.js` (`leviIsRealMac()` + a delegated click listener
on every `a[href*="apps.apple.com"]`):

- Fires **only** when the visitor is on real macOS — explicitly excludes
  iPhone/iPad/Android/Windows, including iPadOS Safari which masquerades as Mac
  (filtered via `navigator.maxTouchPoints`).
- On a qualifying click it sends two events:
  ```js
  gtag('event', 'conversion', { send_to: 'AW-18232657346/UoHVCI3Krb4cEMKLgfZD' });
  gtag('event', 'download_click_macos', { link_location: '…' });
  ```
- The `conversion` event feeds the Google Ads conversion action
  **"macOS Download Click"** (category *Inscrição / Sign-up*, primary, count
  *One*, 90-day click window, data-driven attribution, value 1).
- Ad-click attribution is handled by Google automatically via the `gclid`
  (auto-tagging is on); we do **not** gate on it. Google only counts clicks that
  carried a `gclid` within the conversion window.
- The `download_click_macos` GA4 event is currently for analysis only. It can be
  marked as a GA4 Key Event and imported into Ads later if we move off the native
  conversion (do **not** run both as Primary for the same action — that
  double-counts).

> We cannot measure the *actual* App Store install from the website — the Mac App
> Store has no install postback to Google Ads. The download click is the proxy
> conversion. To estimate real installs, see App Store campaign tracking below.

### macOS Download conversion (Reddit Ads)

Mirrors the Google Ads setup, in the **same** click listener in `script.js`, so
the same real-macOS gate (`leviIsRealMac()`) applies — no double-firing on
iPad/iPhone/Android/Windows.

- The **Reddit Pixel** base code lives in the `<head>` of every page and fires
  `rdt('track','PageVisit')` on load (analogous to the GA4 pageview).
- On a qualifying macOS download click it sends a **custom conversion event**:
  ```js
  rdt('track', 'Custom', { customEventName: 'Download', conversionId: '<uuid>' });
  ```
- `conversionId` is a fresh UUID per click. It exists for **pixel ⇄ Conversions
  API deduplication**: if a server-side CAPI event is ever added for the same
  click, send the same id as its `conversion_id`.
- Ad-click attribution is automatic — the pixel stores the Reddit click id
  (`rdt_cid`) from the landing URL/cookie and attaches it.
- In **Reddit Events Manager**, map the custom event **`Download`** as the
  campaign's conversion event (the `TRAFFIC` campaign objective can then optimize
  toward it). From 2026-07-13, ad groups/CBO campaigns require a
  `conversion_pixel_id` — this pixel `a2_j6ez7imlu8si` is it.

> **Conversions API (CAPI) token is intentionally NOT in this repo.** The token
> from Reddit's setup is a **server-side secret**; embedding it in a static site
> would leak it publicly. Only the client-side pixel (public `pixel_id`) is
> installed here. If we later want server-side CAPI events
> (`POST /api/v3/pixels/a2_j6ez7imlu8si/conversion_events`), do it from the
> Cloudflare `worker/` with the token stored as a secret env var, reusing the
> `conversionId` above for dedup.

### App Store campaign tracking

Download links default to `?ct=website&mt=12`. The `ct` (campaign text) shows up
in **App Store Connect → Analytics → Acquisition**, and `mt=12` routes to the Mac
App Store.

To attribute *installs* to a paid channel, the campaign flows through the site,
not straight to the App Store (the visitor must land on the site for the macOS
download conversion to fire):

```
ad  →  levirecorder.app/?ct=googleads  →  apps.apple.com/...?ct=googleads&mt=12
```

`script.js` reads an incoming `ct` (and optional `pt`) from the landing URL and
**rewrites every App Store link** to carry that token, overriding the default
`ct=website`. Without this the token would stay on the landing page and never
reach the App Store, so paid installs would be miscredited to "website".

## Pending manual steps / things to remember

These are **not** in code and must be done in the respective consoles:

- [ ] **Google Ads — Final URL + suffix:** set the ad **Final URL** to the site
      (`https://levirecorder.app/`), not the App Store directly, so the visitor
      lands on the site and the conversion can fire. Put the campaign token in the
      **Final URL suffix**: `ct=googleads` (plus any `utm_*` you want). The site
      then propagates `ct` to the App Store link (see App Store campaign tracking
      above). `mt=12` is an App Store param and is not needed on the site URL.
- [ ] **Google Ads — campaign goal:** ensure the **Inscrição** goal (which holds
      `macOS Download Click`) is active on the campaigns. It is set as an
      account-default goal, so it should apply automatically.
- [ ] **Google Ads status:** the conversion shows *"Configuração incorreta"*
      until the first real conversions (clicks carrying a `gclid`) arrive — this
      clears on its own (up to ~24h). Verify with **Google Tag Assistant** on a
      Mac: load the site, click Download, confirm the `conversion` hit with
      `send_to: AW-18232657346/UoHVCI3Krb4cEMKLgfZD`.
- [ ] **Microsoft Clarity:** the `clarity.ms` tag was observed returning `503` on
      load (likely transient). Re-check that sessions are recording.

## File map

```
index.html / contact.html / privacy.html   pages
styles.css / contact.css / privacy.css      styles
script.js                                    home + conversion tracking
contact.js                                   contact form
i18n.js + locales/*.json                     localization (en, pt-BR, es, it, fr)
assets/                                       images, logos, icons
worker/                                       Cloudflare Worker (contact → Resend)
CNAME                                         custom domain (levirecorder.app)
```
