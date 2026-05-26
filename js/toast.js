/* ==========================================================
   TOAST — Non-blocking notification system
   ========================================================== */

import { TOAST_DURATION_MS } from './constants.js';

let container = null;

/** Initialize with the toast container DOM element */
export function initToast(containerEl) {
  container = containerEl;
}

/** Show a toast notification */
export function showToast(message, type = 'info') {
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => el.remove());
  }, TOAST_DURATION_MS);
}
