/**
 * ============================================================================
 * HOSSAM LICENSE MANAGER PRO — js/core/Repository.js
 * ----------------------------------------------------------------------------
 * Base Repository. All entity repositories (Customers, Devices, Licenses,
 * Subscriptions, Payments, Users, Settings) extend this. Direct HLMDb calls
 * from UI modules are forbidden — everything goes through a Repository so
 * audit logging, id generation, and timestamps are never bypassed.
 * ============================================================================
 */
(function (window) {
  'use strict';

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() { return new Date().toISOString(); }

  /**
   * @param {string} storeName IndexedDB object store name (see Db.js STORES)
   * @param {string} entityLabel Arabic label used in audit-log entries
   */
  function Repository(storeName, entityLabel) {
    this.storeName = storeName;
    this.entityLabel = entityLabel || storeName;
  }

  Repository.prototype.getAll = function () {
    return window.HLMDb.getAll(this.storeName);
  };

  Repository.prototype.getById = function (id) {
    return window.HLMDb.get(this.storeName, id);
  };

  Repository.prototype.getByIndex = function (indexName, value) {
    return window.HLMDb.getByIndex(this.storeName, indexName, value);
  };

  Repository.prototype.count = function () {
    return window.HLMDb.countAll(this.storeName);
  };

  /**
   * @param {Object} data
   * @param {Object} [actor] current user performing the action, for audit
   */
  Repository.prototype.create = async function (data, actor) {
    var record = Object.assign({}, data);
    if (!record.id) record.id = uuid();
    record.createdAt = record.createdAt || nowIso();
    record.updatedAt = nowIso();
    await window.HLMDb.put(this.storeName, record);
    await this._audit('create', record.id, actor, { after: record });
    return record;
  };

  Repository.prototype.update = async function (id, patch, actor) {
    var existing = await this.getById(id);
    if (!existing) throw new Error('record_not_found');
    var updated = Object.assign({}, existing, patch, { id: id, updatedAt: nowIso() });
    await window.HLMDb.put(this.storeName, updated);
    await this._audit('update', id, actor, { before: existing, after: updated });
    return updated;
  };

  Repository.prototype.remove = async function (id, actor) {
    var existing = await this.getById(id);
    await window.HLMDb.remove(this.storeName, id);
    await this._audit('delete', id, actor, { before: existing });
    return true;
  };

  Repository.prototype._audit = async function (action, entityId, actor, detail) {
    if (!window.HLMAuditLogRepository || this.storeName === 'auditLog') return;
    try {
      await window.HLMAuditLogRepository.log({
        entity: this.entityLabel,
        entityId: entityId,
        action: action,
        actorId: actor && actor.id,
        actorName: actor && actor.name,
        detail: detail
      });
    } catch (e) {
      // Audit logging must never block the primary operation.
    }
  };

  window.HLMRepository = Repository;
  window.HLMUtils = window.HLMUtils || {};
  window.HLMUtils.uuid = uuid;
  window.HLMUtils.nowIso = nowIso;
})(typeof window !== 'undefined' ? window : globalThis);
