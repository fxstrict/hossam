/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/LicenseIssuer.js
 * Orchestrates the full "issue a license" workflow used by the wizard,
 * the renew modal, and the transfer modal, so all three stay consistent:
 * sign -> persist license record -> sync subscription snapshot -> audit.
 */
(function (window) {
  'use strict';

  /**
   * @param {Object} fields customerId, deviceId, machineId, customerName,
   *   customerPhone, customerEmail, edition, type, modules[], graceDays,
   *   maxUsers, maxTransfers
   * @param {'new'|'renewal'|'transfer'} reason
   */
  async function issue(fields, reason, actor) {
    if (!window.HLMKeySession.isLoaded()) {
      throw new Error('key_not_loaded');
    }
    var privateKey = window.HLMKeySession.getPrivateKey();
    var licenseFile = await window.HLMCrypto.buildLicenseFile({
      customerName: fields.customerName,
      customerPhone: fields.customerPhone,
      customerEmail: fields.customerEmail,
      machineId: fields.machineId,
      edition: fields.edition,
      type: fields.type,
      modules: fields.modules || [],
      graceDays: fields.graceDays,
      maxUsers: fields.maxUsers,
      maxTransfers: fields.maxTransfers
    }, privateKey);

    var licenseRecord = await window.HLMLicensesRepository.recordIssued({
      customerId: fields.customerId,
      deviceId: fields.deviceId,
      licenseFile: licenseFile,
      reason: reason
    }, actor);

    await window.HLMSubscriptionsRepository.syncFromLicense(fields.customerId, licenseFile.payload, actor);

    return licenseRecord;
  }

  function downloadLicenseFile(licenseFile, customerOfficeName) {
    var name = 'HOSSAM-' + (customerOfficeName || 'license').replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, '_') + '-' + licenseFile.payload.licenseId + '.hsm';
    var blob = new Blob([JSON.stringify(licenseFile, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function whatsappShareLink(phone, licenseFile, officeName) {
    var digits = String(phone || '').replace(/\D/g, '');
    var text = 'مرحبًا ' + (officeName || '') + '،\n' +
      'تم إصدار ترخيص نظام الحسام الخاص بكم.\n' +
      'رقم الترخيص: ' + licenseFile.payload.licenseId + '\n' +
      'النسخة: ' + licenseFile.payload.edition + '\n' +
      (licenseFile.payload.expiresAt ? 'ينتهي في: ' + licenseFile.payload.expiresAt.slice(0, 10) : 'ترخيص دائم') + '\n' +
      'سيتم إرسال ملف التفعيل (.hsm) بشكل منفصل.';
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
  }

  function mailtoLink(email, licenseFile, officeName) {
    var subject = 'ترخيص نظام الحسام - ' + licenseFile.payload.licenseId;
    var body = 'مرحبًا ' + (officeName || '') + '،\n\nمرفق ملف تفعيل نظام الحسام (يُرسل يدويًا كمرفق).\nرقم الترخيص: ' + licenseFile.payload.licenseId;
    return 'mailto:' + encodeURIComponent(email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  /**
   * PHASE C v3/v3.1/v3.2 — issues one new Activation Code for an
   * already-issued license. Does NOT touch LicenseCore/ECDSA/the .hsm
   * signing flow at all (Activation Codes are a wholly separate
   * artifact from the signed license file) — see
   * ActivationCodesRepository.js for the generation/storage rules.
   * @param {{licenseId:string, customerId?:string, expiresAt?:string}} fields
   * @returns {Promise<{record:Object, plaintextCode:string}>}
   */
  async function issueActivationCode(fields, actor) {
    return window.HLMActivationCodesRepository.generateForLicense({
      licenseId: fields.licenseId,
      customerId: fields.customerId,
      expiresAt: fields.expiresAt
    }, actor);
  }

  /** Row to paste into elhossam's "أكواد_التفعيل" Google Sheet tab —
   *  see ActivationCodesRepository.buildActivationCodeSheetRow() for
   *  why this manual-transfer step exists (this tool has no server). */
  function buildActivationCodeSheetRow(record) {
    return window.HLMActivationCodesRepository.buildActivationCodeSheetRow(record);
  }

  window.HLMLicenseIssuer = {
    issue: issue,
    downloadLicenseFile: downloadLicenseFile,
    whatsappShareLink: whatsappShareLink,
    mailtoLink: mailtoLink,
    issueActivationCode: issueActivationCode,
    buildActivationCodeSheetRow: buildActivationCodeSheetRow
  };
})(typeof window !== 'undefined' ? window : globalThis);
