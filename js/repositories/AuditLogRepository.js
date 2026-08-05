/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/AuditLogRepository.js
 * Append-only audit trail: who issued/renewed/transferred/revoked what,
 * for which customer, when. Cannot be edited. Can only be cleared by a
 * Super Admin (enforced in the Settings/AuditLog screen, not here).
 */
(function (window) {
  'use strict';

  function AuditLogRepository() {
    window.HLMRepository.call(this, 'auditLog', 'سجل العمليات');
  }
  AuditLogRepository.prototype = Object.create(window.HLMRepository.prototype);

  AuditLogRepository.prototype.log = async function (entry) {
    var record = Object.assign({
      id: window.HLMUtils.uuid(),
      at: window.HLMUtils.nowIso()
    }, entry);
    await window.HLMDb.put('auditLog', record);
    window.HLMBus.emit('auditlog:new', record);
    return record;
  };

  AuditLogRepository.prototype.recent = async function (limit) {
    var all = await this.getAll();
    all.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return typeof limit === 'number' ? all.slice(0, limit) : all;
  };

  /** Only callable by UI code that has already verified Super Admin role. */
  AuditLogRepository.prototype.clearAll = async function () {
    await window.HLMDb.clear('auditLog');
  };

  window.HLMAuditLogRepository = new AuditLogRepository();
})(typeof window !== 'undefined' ? window : globalThis);
