/* Levi Recorder — Contact page interactions */

// ── Nav mobile toggle (shared behaviour) ──
const navToggle  = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');

navToggle?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
  mobileMenu.setAttribute('aria-hidden', String(!isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

// ── Type tabs ──
const tabs   = document.querySelectorAll('.contact-tab');
const typeEl = document.getElementById('formType');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    typeEl.value = tab.dataset.type;
  });
});

// ── Form submit with success state ──
const form      = document.getElementById('contactForm');
const success   = document.getElementById('contactSuccess');
const formError = document.getElementById('formError');

form?.addEventListener('submit', async e => {
  e.preventDefault();

  let valid = true;
  form.querySelectorAll('[required]').forEach(field => {
    field.classList.remove('error');
    if (!field.value.trim()) {
      field.classList.add('error');
      valid = false;
    }
  });
  if (!valid) return;

  const submitBtn   = form.querySelector('.form-submit');
  const originalHTML = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.querySelector('span').textContent = window.t('contact.sending') || 'Sending…';
  formError.hidden = true;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (res.ok && data.success) {
      form.hidden    = true;
      success.hidden = false;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHTML;
      formError.textContent = data.message || window.t('contact.err.generic') || 'Something went wrong. Please try again.';
      formError.hidden = false;
    }
  } catch {
    clearTimeout(timeout);
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;
    formError.textContent = window.t('contact.err.connection') || 'Could not send message. Please check your connection and try again.';
    formError.hidden = false;
  }
});

// Clear error state on input
form?.querySelectorAll('input, textarea').forEach(field => {
  field.addEventListener('input', () => field.classList.remove('error'));
});
