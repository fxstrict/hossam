/**
 * HOSSAM LICENSE MANAGER PRO — js/core/EventBus.js
 * Tiny pub/sub so modules (repositories, notifications, UI screens) can
 * react to data changes without direct coupling.
 */
(function (window) {
  'use strict';

  var listeners = {};

  function on(event, handler) {
    (listeners[event] = listeners[event] || []).push(handler);
    return function off() {
      listeners[event] = (listeners[event] || []).filter(function (h) { return h !== handler; });
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).slice().forEach(function (handler) {
      try { handler(payload); } catch (e) { console.error('[EventBus] handler error for ' + event, e); }
    });
  }

  window.HLMBus = { on: on, emit: emit };
})(typeof window !== 'undefined' ? window : globalThis);
