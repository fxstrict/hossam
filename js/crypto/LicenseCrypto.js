/**
 * ============================================================================
 * HOSSAM LICENSE MANAGER PRO
 * File: js/crypto/LicenseCrypto.js
 * ----------------------------------------------------------------------------
 * In-browser replacement for tools/license-generator/generate-license.js.
 * Runs entirely client-side via window.crypto.subtle (Web Crypto API) —
 * no server, no Node.js required, no network call for signing.
 *
 * COMPATIBILITY CONTRACT (do not change without updating BOTH sides):
 *   - canonicalStringify() below is byte-for-byte identical to the one in
 *     نظام الحسام's js/license/LicenseCrypto.js and tools/license-generator/
 *     generate-license.js. Any drift breaks every future license's signature
 *     verification in the main app.
 *   - Curve: P-256 (secp256r1 / prime256v1). Hash: SHA-256.
 *   - Signature format: raw r||s (IEEE P1363) — the native output of
 *     crypto.subtle.sign('ECDSA', ...), and the same format the main app's
 *     verify() expects. Never DER-encode.
 *   - License file shape: { v:1, alg:'ECDSA-P256-SHA256', payload, signature }
 *     with the exact payload field set used by the real app's LicenseCore.js.
 *
 * KEY HANDLING (Security Engineering Standard: never store Private Keys
 * in IndexedDB): the private key never leaves this browser tab and is
 * NEVER persisted to IndexedDB, localStorage, or any storage at all. It
 * lives only as an in-memory CryptoKey for the current session (see
 * js/modules/settings.js "مفتاح التوقيع"), imported fresh each time the
 * operator pastes the PEM or generates a new pair. Closing the tab
 * discards it — by design, not by omission.
 * ============================================================================
 */
(function (window) {
  'use strict';

  var SUBTLE = window.crypto && window.crypto.subtle;

  // ---------------------------------------------------------------------
  // Canonical JSON — MUST match the main app exactly.
  // ---------------------------------------------------------------------
  function canonicalStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
    var keys = Object.keys(value).sort();
    var parts = keys.map(function (k) {
      return JSON.stringify(k) + ':' + canonicalStringify(value[k]);
    });
    return '{' + parts.join(',') + '}';
  }

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    var bin = atob(String(b64).replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }

  // PEM <-> ArrayBuffer helpers (PKCS8 private key, SPKI public key)
  function pemToArrayBuffer(pem) {
    var b64 = String(pem)
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    return base64ToBytes(b64).buffer;
  }

  function arrayBufferToPem(buf, label) {
    var b64 = bytesToBase64(new Uint8Array(buf));
    var lines = b64.match(/.{1,64}/g) || [b64];
    return '-----BEGIN ' + label + '-----\n' + lines.join('\n') + '\n-----END ' + label + '-----\n';
  }

  /**
   * Generates a brand-new ECDSA P-256 key pair entirely in-browser.
   * Returned privateKey/publicKey are extractable CryptoKey objects so
   * the caller can export them for backup (PEM) and for embedding the
   * public key JWK into the main app.
   */
  async function generateKeyPair() {
    if (!SUBTLE) throw new Error('crypto_unavailable');
    var pair = await SUBTLE.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    var privatePkcs8 = await SUBTLE.exportKey('pkcs8', pair.privateKey);
    var publicSpki = await SUBTLE.exportKey('spki', pair.publicKey);
    var publicJwk = await SUBTLE.exportKey('jwk', pair.publicKey);
    return {
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      privateKeyPem: arrayBufferToPem(privatePkcs8, 'PRIVATE KEY'),
      publicKeyPem: arrayBufferToPem(publicSpki, 'PUBLIC KEY'),
      publicKeyJwk: publicJwk
    };
  }

  /** Imports a PKCS8 PEM private key (e.g. the office's existing
   *  tools/license-generator/keys/private-key.pem, pasted by the operator)
   *  as a non-extractable, sign-only CryptoKey. */
  async function importPrivateKeyPem(pem) {
    if (!SUBTLE) throw new Error('crypto_unavailable');
    var buf = pemToArrayBuffer(pem);
    return SUBTLE.importKey(
      'pkcs8',
      buf,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  }

  /** Re-derives the public JWK from an imported private key by round
   *  tripping through JWK export — only works if the key was imported
   *  extractable. Prefer generateKeyPair() when a public JWK is needed;
   *  for imported keys the operator supplies the matching public JWK
   *  from keys/public-key.jwk.json instead. */
  async function importPrivateKeyPemExtractable(pem) {
    if (!SUBTLE) throw new Error('crypto_unavailable');
    var buf = pemToArrayBuffer(pem);
    return SUBTLE.importKey(
      'pkcs8',
      buf,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );
  }

  async function signPayload(payload, privateCryptoKey) {
    if (!SUBTLE) throw new Error('crypto_unavailable');
    var data = new TextEncoder().encode(canonicalStringify(payload));
    var sig = await SUBTLE.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, privateCryptoKey, data);
    return bytesToBase64(new Uint8Array(sig));
  }

  async function verify(payload, signatureB64, publicCryptoKeyOrJwk) {
    if (!SUBTLE || !signatureB64 || !payload) return false;
    try {
      var key = publicCryptoKeyOrJwk;
      if (!(key instanceof CryptoKey)) {
        key = await SUBTLE.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      }
      var data = new TextEncoder().encode(canonicalStringify(payload));
      var sigBytes = base64ToBytes(signatureB64);
      return await SUBTLE.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, sigBytes, data);
    } catch (e) {
      return false;
    }
  }

  async function sha256Hex(text) {
    if (!SUBTLE) return null;
    var data = new TextEncoder().encode(text);
    var digest = await SUBTLE.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
  }

  // ---------------------------------------------------------------------
  // Subscription-type -> duration in days. 'lifetime' => null (forever).
  // Superset of the CLI tool's four types — extra values are additive
  // and never interpreted by the main app's LicenseCore (it only reads
  // expiresAt/graceDays), so this stays fully backward compatible.
  // ---------------------------------------------------------------------
  var TYPE_DAYS = {
    trial: 14,
    monthly: 30,
    quarterly: 90,
    semiannual: 180,
    yearly: 365,
    triennial: 1095,
    lifetime: null
  };

  function addDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function computeExpiry(type, now) {
    var days = Object.prototype.hasOwnProperty.call(TYPE_DAYS, type) ? TYPE_DAYS[type] : 365;
    if (days === null) return null;
    return addDays(now, days).toISOString();
  }

  /**
   * Builds and signs a full .hsm license file, identical in shape to
   * tools/license-generator/generate-license.js output.
   * @param {Object} fields customerName, customerPhone, customerEmail,
   *   machineId, edition, type, modules[], graceDays, maxUsers, licenseId?
   * @param {CryptoKey} privateCryptoKey
   */
  async function buildLicenseFile(fields, privateCryptoKey) {
    var now = new Date();
    var licenseId = fields.licenseId || ('HSM-LIC-' + randomHex(8).toUpperCase());
    var expiresAt = computeExpiry(fields.type, now);

    var payload = {
      licenseId: licenseId,
      customer: {
        name: fields.customerName || '',
        phone: fields.customerPhone || '',
        email: fields.customerEmail || ''
      },
      edition: fields.edition,
      type: fields.type,
      machineId: fields.machineId,
      modules: fields.modules || [],
      issuedAt: now.toISOString(),
      expiresAt: expiresAt,
      supportUntil: fields.type === 'lifetime' ? null : expiresAt,
      graceDays: typeof fields.graceDays === 'number' ? fields.graceDays : 15,
      maxTransfers: typeof fields.maxTransfers === 'number' ? fields.maxTransfers : 2,
      transferCount: typeof fields.transferCount === 'number' ? fields.transferCount : 0
    };
    if (typeof fields.maxUsers === 'number') payload.maxUsers = fields.maxUsers;

    var signature = await signPayload(payload, privateCryptoKey);
    return { v: 1, alg: 'ECDSA-P256-SHA256', payload: payload, signature: signature };
  }

  function randomHex(bytesLen) {
    var arr = new Uint8Array(bytesLen);
    (window.crypto || {}).getRandomValues && window.crypto.getRandomValues(arr);
    return bytesToHex(arr);
  }

  var api = {
    canonicalStringify: canonicalStringify,
    generateKeyPair: generateKeyPair,
    importPrivateKeyPem: importPrivateKeyPem,
    importPrivateKeyPemExtractable: importPrivateKeyPemExtractable,
    signPayload: signPayload,
    verify: verify,
    sha256Hex: sha256Hex,
    computeExpiry: computeExpiry,
    buildLicenseFile: buildLicenseFile,
    TYPE_DAYS: TYPE_DAYS,
    isAvailable: function () { return !!SUBTLE; }
  };

  window.HLMCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
