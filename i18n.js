/* Levi Recorder — i18n engine */

const SUPPORTED = ['en', 'pt-BR', 'es'];
const DEFAULT_LOCALE = 'en';

let translations = {};

window.t = key => translations[key] ?? key;

function detectLocale() {
  const stored = localStorage.getItem('locale');
  if (stored && SUPPORTED.includes(stored)) return stored;

  const lang = navigator.language || navigator.userLanguage || '';
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('es')) return 'es';
  return DEFAULT_LOCALE;
}

async function loadLocale(locale) {
  const res = await fetch(`locales/${locale}.json`);
  if (!res.ok) throw new Error(`locale ${locale} not found`);
  return res.json();
}

function applyTranslations(t) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (t[key] !== undefined) el.innerHTML = t[key];
  });

  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.dataset.i18nAttr.split(',').forEach(pair => {
      const [attr, key] = pair.trim().split(':');
      if (t[key] !== undefined) el.setAttribute(attr, t[key]);
    });
  });

  const titleKey = document.documentElement.dataset.i18nTitle;
  if (titleKey && t[titleKey]) document.title = t[titleKey];
}

function updateSwitcher(locale) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const active = btn.dataset.locale === locale;
    btn.classList.toggle('lang-btn--active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

let currentLocale = DEFAULT_LOCALE;

async function setLocale(locale) {
  if (!SUPPORTED.includes(locale)) return;
  try {
    translations = await loadLocale(locale);
    currentLocale = locale;
    localStorage.setItem('locale', locale);
    applyTranslations(translations);
    updateSwitcher(locale);
    document.documentElement.lang = locale;
  } catch (e) {
    if (locale !== DEFAULT_LOCALE) {
      console.warn(`i18n: falling back to ${DEFAULT_LOCALE}`, e);
      await setLocale(DEFAULT_LOCALE);
    }
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.lang-btn');
  if (btn?.dataset.locale) setLocale(btn.dataset.locale);
});

setLocale(detectLocale());
