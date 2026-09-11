/**
 * ============================================================================
 * HOSSAM LICENSE MANAGER PRO — js/core/ApiClient.js
 * ----------------------------------------------------------------------------
 * PHASE F.2 — Automated License Revocation Write Path.
 *
 * This is the FIRST network abstraction ever added to License Manager Pro.
 * The F.2 read-only forensic audit confirmed no fetch/XMLHttpRequest/axios/
 * endpoint-configuration/authentication-storage capability existed anywhere
 * in this project before this file — this is a genuinely new network
 * boundary, not a refactor of an existing integration (F.2 audit §K).
 *
 * SCOPE — deliberately narrow:
 *   The only capability this file provides is calling the elhossam Apps
 *   Script backend's `setLicenseStatus` action (Config/09_License.gs /
 *   apiSetLicenseStatus() — additive-only, see that file's own PHASE F.2
 *   section). Nothing else about elhossam's API surface is exposed here.
 *
 * SECURITY RULES ENFORCED IN THIS FILE (do not relax without re-reading the
 * F.2 implementation mandate §3/§4/§20):
 *   - The admin secret is accepted only as a plain in-memory function
 *     argument for the single call that needs it. It is never stored on
 *     `window`, never written to localStorage/IndexedDB/sessionStorage,
 *     never logged (no console.*, no thrown-error interpolation of it).
 *   - The secret travels only in the HTTPS POST body — never in the URL,
 *     query string, or any log line. (Apps Script Web Apps have no
 *     reliable custom-header mechanism, so a header-based transport is not
 *     used — see the F.2 implementation mandate §4 for why POST-body is
 *     the accepted transport here.)
 *   - POST only. No GET-based variant of this call exists or is offered.
 *   - A bounded timeout (AbortController) prevents an indefinitely hung
 *     request from leaving the operator's UI stuck holding the secret in
 *     a pending closure longer than necessary.
 *   - Network failures are distinguished from valid API-level failures —
 *     callers must be able to tell "could not reach the server at all"
 *     apart from "the server answered with UNAUTHORIZED/NOT_FOUND/etc."
 * ============================================================================
 */
(function (window) {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 15000;

  /**
   * @param {string} baseUrl        The office's elhossam Apps Script Web
   *   App URL, exactly as the operator supplies it for this call. Not
   *   persisted by this module — see js/modules/licenseModals.js for how
   *   the operator provides it per-operation (F.2 implementation mandate
   *   §18/§19: the endpoint URL is not a secret, but this project has no
   *   existing office/backend mapping, and inventing a multi-office
   *   config store is explicitly out of scope for F.2).
   * @param {{licenseId:string, status:string, note?:string, adminSecret:string}} fields
   * @param {number} [timeoutMs]
   * @returns {Promise<{networkError:boolean, data:?Object}>}
   *   networkError:true  → could not complete the HTTP round-trip at all
   *     (fetch rejection, timeout, non-JSON response). `data` is null.
   *   networkError:false → a real, fully-parsed server response was
   *     received (whether it reports success or a typed failure is up to
   *     the caller to inspect in `data`).
   *   Never throws.
   */
  async function setLicenseStatus(baseUrl, fields, timeoutMs) {
    var url = String(baseUrl || '').trim();
    if (!url || !fields || !fields.licenseId || !fields.status || !fields.adminSecret) {
      return { networkError: true, data: null };
    }

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, timeoutMs || DEFAULT_TIMEOUT_MS);
    }

    try {
      var response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // matches elhossam's existing ApiService POST convention (avoids CORS preflight against a plain Apps Script Web App)
        body: JSON.stringify({
          action: 'setLicenseStatus',
          licenseId: fields.licenseId,
          status: fields.status,
          note: fields.note || '',
          adminSecret: fields.adminSecret
        }),
        signal: controller ? controller.signal : undefined
      });

      var text = await response.text();
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (parseErr) { return { networkError: true, data: null }; }

      return { networkError: false, data: parsed };
    } catch (e) {
      // fetch rejection, abort/timeout, or any other transport-level
      // failure — uniformly reported as networkError, never surfaced
      // with the secret or the raw exception (which could theoretically
      // echo request internals in some environments).
      return { networkError: true, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  window.HLMApiClient = {
    setLicenseStatus: setLicenseStatus
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.HLMApiClient;
})(typeof window !== 'undefined' ? window : globalThis);
