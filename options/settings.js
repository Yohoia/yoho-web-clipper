import { mountAbout } from '../src/about.js';

mountAbout(document.getElementById('aboutContent'));

// This page is read-only. Only the brand seal enters; the information stays still.
async function showAbout() {
  const stored = await chrome.storage.local.get('preferences').catch(() => ({}));
  if (stored.preferences?.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('reduce-motion');
    return;
  }
  document.querySelector('.seal').animate(
    [{ opacity: 0, transform: 'translateY(-12px) rotate(-9deg)' }, { opacity: 1, transform: 'translateY(0) rotate(-5deg)' }],
    { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' },
  );
}
showAbout();
