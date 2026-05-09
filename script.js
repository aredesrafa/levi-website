/* Levi Recorder — site interactions */

// ── Nav scroll state ──
const nav = document.getElementById('nav');
function updateNav() {
  nav.classList.toggle('scrolled', window.scrollY > 32);
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

// ── Hero waveform bars ──
(function buildWaveform() {
  const container = document.getElementById('heroWaveform');
  if (!container) return;

  const count  = 90;
  const frag   = document.createDocumentFragment();
  const colors = ['#786D5C', '#8A7D6E', '#6B6154'];

  for (let i = 0; i < count; i++) {
    const t      = i / (count - 1);
    const env    = Math.sin(t * Math.PI);          // bell envelope: tall in center
    const maxH   = 30 + env * 155;
    const lo     = 0.08 + Math.random() * 0.25;
    const dur    = (1.0 + Math.random() * 1.8).toFixed(2);
    const del    = (-Math.random() * 3.5).toFixed(2);
    const color  = colors[Math.floor(Math.random() * colors.length)];

    const bar = document.createElement('div');
    bar.className = 'w-bar';
    bar.style.cssText = [
      `width:3px`,
      `height:${maxH.toFixed(1)}px`,
      `background:${color}`,
      `--dur:${dur}s`,
      `--del:${del}s`,
      `--lo:${lo.toFixed(2)}`,
    ].join(';');
    frag.appendChild(bar);
  }
  container.appendChild(frag);
})();

// ── Scroll-triggered reveals ──
(function initReveal() {
  // Stagger children of grid containers
  document.querySelectorAll('.features-grid, .steps, .pricing-cards').forEach(grid => {
    grid.querySelectorAll(':scope > *').forEach((child, i) => {
      child.classList.add('reveal');
      child.style.setProperty('--delay', `${i * 75}ms`);
    });
  });

  // Single-element reveals
  document.querySelectorAll('.about-inner, .privacy-inner, .cta-inner').forEach(el => {
    el.classList.add('reveal');
  });

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

// ── Smooth anchor for "Download on the Mac App Store" ──
// (placeholder — swap href to actual App Store URL when live)
document.querySelectorAll('a[href="#"]').forEach(a => {
  if (a.classList.contains('logo')) return;
  a.addEventListener('click', e => {
    // Non-destructive placeholder: just prevent dead navigation
    if (a.href === window.location.href || a.getAttribute('href') === '#') {
      e.preventDefault();
    }
  });
});
