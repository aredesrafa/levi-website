/* Levi Recorder — site interactions */

// ── Nav scroll state ──
const nav = document.getElementById('nav');
function updateNav() {
  nav.classList.toggle('scrolled', window.scrollY > 24);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// ── Mobile menu toggle ──
const navToggle  = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');

navToggle?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
  mobileMenu.setAttribute('aria-hidden', String(!isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

mobileMenu?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    mobileMenu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  });
});

// ── Scroll-triggered reveals ──
const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ── Placeholder: prevent dead # anchors ──
document.querySelectorAll('a[href="#"]').forEach(a => {
  a.addEventListener('click', e => e.preventDefault());
});

// ── App Store campaign attribution ──
// Mac App Store links default to ct=website. When a visitor arrives with an
// Apple campaign token on the landing URL (e.g. ?ct=googleads from a Google Ads
// Final URL), propagate it to every App Store link so App Store Connect
// attributes the install to that campaign instead of "website". Also forwards
// the optional provider token (pt). Without this the token never reaches the
// App Store and paid installs would be miscredited to organic/website.
(() => {
  const params = new URLSearchParams(location.search);
  const ct = params.get('ct');
  const pt = params.get('pt');
  if (!ct && !pt) return;
  document.querySelectorAll('a[href*="apps.apple.com"]').forEach(link => {
    const url = new URL(link.href);
    if (ct) url.searchParams.set('ct', ct);
    if (pt) url.searchParams.set('pt', pt);
    link.href = url.toString();
  });
})();

// ── Conversion: macOS Download click ──
// Fires a Google Ads conversion + GA4 event only when the visitor is on real
// macOS (not iPhone/iPad/Android/Windows) and clicks a Mac App Store link.
// Google Ads only attributes the conversion to clicks that carried a gclid
// within the conversion window, so we fire for every qualifying macOS click
// and let Google handle ad-click attribution.
function leviIsRealMac() {
  const ua = navigator.userAgent || '';
  const platform =
    (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform ||
    '';
  const looksMac = /Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua);
  // iPadOS Safari reports as "Mac"; a real Mac has no multi-touch screen.
  const isTouchDevice = navigator.maxTouchPoints > 1;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  return looksMac && !isTouchDevice && !isMobile;
}

const leviOnMac = leviIsRealMac();

document.querySelectorAll('a[href*="apps.apple.com"]').forEach(link => {
  link.addEventListener('click', () => {
    if (!leviOnMac || typeof gtag !== 'function') return;
    // Google Ads conversion (macOS Download Click)
    gtag('event', 'conversion', {
      send_to: 'AW-18232657346/UoHVCI3Krb4cEMKLgfZD'
    });
    // GA4 event for analysis / optional future key-event import
    gtag('event', 'download_click_macos', {
      link_location: link.closest('section')?.id || link.className || 'unknown'
    });
  });
});
