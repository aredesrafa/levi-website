const ALLOWED_ORIGINS = [
  'https://levirecorder.app',
  'https://www.levirecorder.app',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const TEAM_EMAIL = 'team@levirecorder.app';
const FROM = 'Levi Recorder <team@levirecorder.app>';

// A message with more links than this is spam in practice; the legitimate
// contact form is used for bug reports and questions, not link sharing.
const MAX_LINKS_IN_MESSAGE = 3;

const DAILY_LIMIT_PER_IP = 5;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Kill switch. Set CONTACT_FORM_ENABLED = "0" and redeploy to stop every
    // outbound email at once, without deleting the Worker. It runs before any
    // other check so nothing downstream can fail open into a send.
    if (env.CONTACT_FORM_ENABLED === '0') {
      return json({
        success: false,
        message: 'The contact form is temporarily unavailable. Please email team@levirecorder.app directly.',
      }, 503, cors);
    }

    if (request.method !== 'POST') {
      return json({ success: false, message: 'Method not allowed' }, 405, cors);
    }

    // Rate limit before reading the body so a flood costs as little as possible.
    const clientKey = rateLimitKey(request.headers.get('CF-Connecting-IP') || 'unknown');

    // Burst guard first: it is free, and it keeps a flood from burning through
    // the KV write quota that backs the daily cap below.
    if (env.CONTACT_RATE_LIMITER) {
      const { success: withinBurst } = await env.CONTACT_RATE_LIMITER.limit({ key: clientKey });
      if (!withinBurst) {
        console.log('Burst limited:', clientKey);
        return json({ success: false, message: 'Too many messages. Please try again in a minute.' }, 429, cors);
      }
    }

    if (!(await withinDailyQuota(env, clientKey))) {
      console.log('Daily quota reached:', clientKey);
      return json({ success: false, message: 'Daily message limit reached. Please try again tomorrow.' }, 429, cors);
    }

    let body;
    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        const formData = await request.formData();
        body = Object.fromEntries(formData);
      }
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400, cors);
    }

    if (body.botcheck) {
      return json({ success: true }, 200, cors);
    }

    // Turnstile is the only control that stops a bot which rotates its sender
    // address on every submission, so a missing secret must fail closed: an
    // unverified form is what got the domain used as a spam relay.
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('TURNSTILE_SECRET_KEY is not set; refusing to send.');
      return json({ success: false, message: 'The contact form is temporarily unavailable.' }, 503, cors);
    }
    if (!(await passesTurnstile(env.TURNSTILE_SECRET_KEY, body['cf-turnstile-response'], request))) {
      return json({ success: false, message: 'Bot check failed. Please reload the page and try again.' }, 403, cors);
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const message = String(body.message || '').trim();
    const type = String(body.type || 'contact').trim();

    if (!name || !email || !message) {
      return json({ success: false, message: 'Please fill in all fields.' }, 400, cors);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, message: 'Please provide a valid email.' }, 400, cors);
    }
    if (name.length > 200 || message.length > 5000) {
      return json({ success: false, message: 'Input too long.' }, 400, cors);
    }

    // Report success on spam instead of an error: a bot that sees a rejection
    // starts probing for the rule that stopped it. Dropping here also stops the
    // confirmation email, so we never mail an address a spammer chose for us.
    if (isBlockedSender(email, env.BLOCKED_SENDERS)) {
      console.log('Dropped blocked sender:', email);
      return json({ success: true }, 200, cors);
    }

    if (countLinks(message) > MAX_LINKS_IN_MESSAGE) {
      console.log('Dropped link-heavy message from:', email);
      return json({ success: true }, 200, cors);
    }

    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

    // Exactly one email per submission, addressed to us. The form no longer
    // sends anything to the address in the form: that address is unverified,
    // and auto-replying to it is what let a bot use this form to mail
    // strangers. The submitter sees the on-page success state instead.
    const notifyRes = await sendEmail(env.RESEND_API_KEY, {
      from: FROM,
      to: [TEAM_EMAIL],
      reply_to: email,
      subject: `[${typeLabel}] New message from ${name}`,
      text:
        `New ${type} message from the Levi Recorder website:\n\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Type: ${type}\n\n` +
        `Message:\n${message}\n`,
    }).catch(err => err);

    if (!notifyRes.ok) {
      console.error('Resend notify failed:', notifyRes instanceof Error ? String(notifyRes) : await safeText(notifyRes));
      return json({ success: false, message: 'Could not send your message. Please try again.' }, 502, cors);
    }

    return json({ success: true }, 200, cors);
  },
};

// Cloudflare verifies the widget token server-side; a token is single-use, so a
// bot cannot replay one across submissions. Any failure here rejects the
// submission — this check is the whole defence against a sender that rotates
// its address, so it must never fail open.
async function passesTurnstile(secret, token, request) {
  if (!token) return false;

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', String(token));
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const outcome = await res.json();
    if (!outcome.success) console.log('Turnstile rejected:', JSON.stringify(outcome['error-codes'] || []));
    return outcome.success === true;
  } catch (err) {
    console.error('Turnstile verification failed:', String(err));
    return false;
  }
}

// A spammer rotates freely inside their own IPv6 /64, so both limiters key on
// the prefix rather than the full address. IPv4 is used as-is.
function rateLimitKey(ip) {
  if (!ip.includes(':')) return ip;
  return ip.split(':').slice(0, 4).join(':');
}

// The ratelimit binding only accepts a 10s or 60s window, so the daily cap is a
// KV counter. Reads can be up to a minute stale, which lets a burst slip a few
// past the cap — the 3/min burst guard is what bounds that overshoot.
async function withinDailyQuota(env, clientKey) {
  if (!env.CONTACT_QUOTA) return true;

  const key = `quota:${new Date().toISOString().slice(0, 10)}:${clientKey}`;
  try {
    const count = Number(await env.CONTACT_QUOTA.get(key)) || 0;
    if (count >= DAILY_LIMIT_PER_IP) return false;
    // The TTL keeps the namespace self-cleaning; 86400 is KV's minimum.
    await env.CONTACT_QUOTA.put(key, String(count + 1), { expirationTtl: 86400 });
    return true;
  } catch (err) {
    // Fail open: a KV outage must not take the contact form down with it.
    console.error('Daily quota check failed:', String(err));
    return true;
  }
}

// BLOCKED_SENDERS is a comma-separated list of full addresses ("bot@spam.com")
// and bare domains ("spam.com"), so blocking a new spammer is a var edit plus a
// redeploy rather than a code change.
function isBlockedSender(email, blockedSenders) {
  if (!blockedSenders) return false;

  const normalized = normalizeEmail(email);
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);

  return blockedSenders
    .split(',')
    .map(entry => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
    .some(entry => entry === normalized || entry === domain);
}

// Lowercase and drop plus-addressing, so one blocklist entry also covers the
// "same address +tag" trick.
function normalizeEmail(email) {
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at === -1) return lower;
  return `${lower.slice(0, at).split('+')[0]}@${lower.slice(at + 1)}`;
}

function countLinks(message) {
  return (message.match(/https?:\/\/|www\./gi) || []).length;
}

function sendEmail(apiKey, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function safeText(res) {
  try { return await res.text(); } catch { return '<unreadable>'; }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
