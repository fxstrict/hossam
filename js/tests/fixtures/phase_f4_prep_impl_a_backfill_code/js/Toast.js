/**
 * HOSSAM LICENSE MANAGER PRO — js/core/Toast.js
 * Transient toast notifications (success/error/info/warning).
 */
(function (window) {
  'use strict';

  function ensureContainer() {
    var c = document.getElementById('hlmToasts');
    if (!c) {
      c = document.createElement('div');
      c.id = 'hlmToasts';
      c.className = 'hlm-toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  var ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  function show(message, type, durationMs) {
    type = type || 'info';
    durationMs = durationMs || 3800;
    var container = ensureContainer();
    var el = document.createElement('div');
    el.className = 'hlm-toast hlm-toast--' + type;
    el.innerHTML = '<span class="hlm-toast__icon">' + (ICONS[type] || ICONS.info) + '</span>' +
      '<span class="hlm-toast__msg"></span>';
    el.querySelector('.hlm-toast__msg').textContent = message;
    container.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('hlm-toast--in'); });
    setTimeout(function () {
      el.classList.remove('hlm-toast--in');
      setTimeout(function () { el.remove(); }, 250);
    }, durationMs);
  }

  window.HLMToast = {
    success: function (msg) { show(msg, 'success'); },
    error: function (msg) { show(msg, 'error'); },
    warning: function (msg) { show(msg, 'warning'); },
    info: function (msg) { show(msg, 'info'); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
