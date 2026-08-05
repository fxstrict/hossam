/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/LicensesRepository.js
 * Every license ever issued (the full signed .hsm JSON plus bookkeeping:
 * which customer/device, current status). status: 'issued' | 'revoked'.
 * Revoking here does NOT remotely disable the customer's install (this
 * tool has no server) — see LicensesRepository.buildRevokeSheetRow(),
 * which produces the exact row the operator pastes into the "التراخيص"
 * tab of the project's Google Sheet, per the existing revoke workflow
 * documented in كتالوج استخدام نظام الترخيص §7.
 */
(function (window) {
  'use strict';

  function LicensesRepository() {
    window.HLMRepository.call(this, 'licenses', 'التراخيص');
  }
  LicensesRepository.prototype = Object.create(window.HLMRepository.prototype);

  LicensesRepository.prototype.forCustomer = async function (customerId) {
    var rows = await this.getByIndex('customerId', customerId);
    rows.sort(function (a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); });
    return rows;
  };

  LicensesRepository.prototype.findByLicenseId = async function (licenseId) {
    var rows = await this.getByIndex('licenseId', licenseId);
    return rows[0] || null;
  };

  /** Persists a freshly-signed license file (from HLMCrypto.buildLicenseFile)
   *  as a history record. */
  LicensesRepository.prototype.recordIssued = async function (opts, actor) {
    var payload = opts.licenseFile.payload;
    return this.create({
      customerId: opts.customerId,
      deviceId: opts.deviceId,
      licenseId: payload.licenseId,
      licenseFile: opts.licenseFile,
      edition: payload.edition,
      type: payload.type,
      machineId: payload.machineId,
      modules: payload.modules,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      status: 'issued',
      reason: opts.reason || 'new'
    }, actor);
  };

  LicensesRepository.prototype.revoke = async function (id, reason, actor) {
    return this.update(id, { status: 'revoked', revokedAt: window.HLMUtils.nowIso(), revokeReason: reason || '' }, actor);
  };

  /** Row to paste into the project's Google Sheet "التراخيص" tab, matching
   *  كتالوج استخدام نظام الترخيص §7 exactly (licenseId, customer, machineId,
   *  date, reason) — the actual remote revoke channel used by نظام الحسام
   *  today (no server API exists to call this automatically). */
  LicensesRepository.prototype.buildRevokeSheetRow = function (licenseRecord, reason) {
    return {
      licenseId: licenseRecord.licenseId,
      machineId: licenseRecord.machineId,
      revokedAt: new Date().toISOString().slice(0, 10),
      reason: reason || ''
    };
  };

  window.HLMLicensesRepository = new LicensesRepository();
})(typeof window !== 'undefined' ? window : globalThis);
