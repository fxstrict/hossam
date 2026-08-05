/**
 * HOSSAM LICENSE MANAGER PRO — js/core/KeySession.js
 * Holds the ECDSA private signing CryptoKey for THIS TAB SESSION ONLY.
 * Never written to IndexedDB/localStorage/sessionStorage — a page reload
 * clears it and the operator must reload the PEM or regenerate. This is
 * intentional (Security Engineering Standard: never persist private keys).
 */
(function (window) {
  'use strict';

  var _privateKey = null;
  var _publicKeyJwk = null; // safe to keep in memory + persist (it's public)
  var _loadedAt = null;

  function isLoaded() { return !!_privateKey; }

  function set(privateKey, publicKeyJwk) {
    _privateKey = privateKey;
    _publicKeyJwk = publicKeyJwk || null;
    _loadedAt = new Date().toISOString();
    window.HLMBus.emit('keysession:changed', { loaded: true });
  }

  function clear() {
    _privateKey = null;
    _publicKeyJwk = null;
    _loadedAt = null;
    window.HLMBus.emit('keysession:changed', { loaded: false });
  }

  function getPrivateKey() { return _privateKey; }
  function getPublicKeyJwk() { return _publicKeyJwk; }
  function getLoadedAt() { return _loadedAt; }

  window.HLMKeySession = {
    isLoaded: isLoaded,
    set: set,
    clear: clear,
    getPrivateKey: getPrivateKey,
    getPublicKeyJwk: getPublicKeyJwk,
    getLoadedAt: getLoadedAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
