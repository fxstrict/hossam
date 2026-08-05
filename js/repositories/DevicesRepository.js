/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/DevicesRepository.js
 * A "device" is one Machine ID (HSM-XXXX-XXXX-XXXX) a customer has
 * activated on. status: 'active' | 'inactive' (superseded by transfer).
 */
(function (window) {
  'use strict';

  var MACHINE_ID_RE = /^HSM-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i;

  function DevicesRepository() {
    window.HLMRepository.call(this, 'devices', 'الأجهزة');
  }
  DevicesRepository.prototype = Object.create(window.HLMRepository.prototype);

  DevicesRepository.prototype.isValidMachineId = function (id) {
    return MACHINE_ID_RE.test(String(id || '').trim());
  };

  DevicesRepository.prototype.forCustomer = function (customerId) {
    return this.getByIndex('customerId', customerId);
  };

  DevicesRepository.prototype.findByMachineId = async function (machineId) {
    var matches = await this.getByIndex('machineId', String(machineId || '').trim().toUpperCase());
    return matches[0] || null;
  };

  DevicesRepository.prototype.create = async function (data, actor) {
    var payload = Object.assign({}, data);
    if (payload.machineId) payload.machineId = String(payload.machineId).trim().toUpperCase();
    if (!payload.status) payload.status = 'active';
    if (!payload.activatedAt) payload.activatedAt = window.HLMUtils.nowIso();
    return window.HLMRepository.prototype.create.call(this, payload, actor);
  };

  /**
   * Marks the given device inactive and registers/returns a new active
   * device for the same customer with the new machine ID — used by the
   * "نقل جهاز" (device transfer) flow.
   */
  DevicesRepository.prototype.transfer = async function (oldDeviceId, newMachineId, actor) {
    var oldDevice = await this.getById(oldDeviceId);
    if (!oldDevice) throw new Error('device_not_found');
    await this.update(oldDeviceId, { status: 'inactive', deactivatedAt: window.HLMUtils.nowIso() }, actor);
    var newDevice = await this.create({
      customerId: oldDevice.customerId,
      machineId: newMachineId,
      status: 'active',
      transferredFrom: oldDeviceId
    }, actor);
    return newDevice;
  };

  window.HLMDevicesRepository = new DevicesRepository();
})(typeof window !== 'undefined' ? window : globalThis);
