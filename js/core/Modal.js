/**
 * HOSSAM LICENSE MANAGER PRO — js/core/Modal.js
 */
(function (window) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function open(opts) {
    close(); // only one modal at a time
    var overlay = document.createElement('div');
    overlay.className = 'hlm-modal-overlay';
    overlay.id = 'hlmActiveModal';
    overlay.innerHTML =
      '<div class="hlm-modal' + (opts.large ? ' hlm-modal--lg' : '') + '">' +
        '<div class="hlm-modal__header"><h3 style="margin:0;">' + escapeHtml(opts.title) + '</h3><button class="hlm-modal__close" id="hlmModalCloseBtn">&times;</button></div>' +
        '<div class="hlm-modal__body">' + opts.body + '</div>' +
        (opts.footer ? '<div class="hlm-modal__footer">' + opts.footer + '</div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(); });
    document.getElementById('hlmModalCloseBtn').addEventListener('click', close);
    if (opts.onMount) opts.onMount(overlay);
    return overlay;
  }

  function close() {
    var existing = document.getElementById('hlmActiveModal');
    if (existing) existing.remove();
  }

  window.HLMModal = { open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
