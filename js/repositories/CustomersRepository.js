/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/CustomersRepository.js
 * Each customer = a law office client. Fields mirror the spec's "بيانات
 * المكتب" tab: officeName, lawyerName, phone, whatsapp, email, address,
 * governorate, registrationNumber, notes, status, clientNumber.
 */
(function (window) {
  'use strict';

  function CustomersRepository() {
    window.HLMRepository.call(this, 'customers', 'العملاء');
  }
  CustomersRepository.prototype = Object.create(window.HLMRepository.prototype);

  /** Sequential customer number like C000145, stable across the app's life. */
  CustomersRepository.prototype.nextClientNumber = async function () {
    var all = await this.getAll();
    var max = 0;
    all.forEach(function (c) {
      var m = /^C0*(\d+)$/.exec(c.clientNumber || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var next = max + 1;
    return 'C' + String(next).padStart(6, '0');
  };

  CustomersRepository.prototype.create = async function (data, actor) {
    var payload = Object.assign({}, data);
    if (!payload.clientNumber) payload.clientNumber = await this.nextClientNumber();
    if (!payload.status) payload.status = 'active';
    return window.HLMRepository.prototype.create.call(this, payload, actor);
  };

  /** Full-text-ish search across the fields the spec lists explicitly. */
  CustomersRepository.prototype.search = async function (term) {
    if (!term) return this.getAll();
    var q = term.trim().toLowerCase();
    var all = await this.getAll();
    return all.filter(function (c) {
      return [c.officeName, c.lawyerName, c.phone, c.whatsapp, c.email, c.governorate, c.clientNumber]
        .some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; });
    });
  };

  window.HLMCustomersRepository = new CustomersRepository();
})(typeof window !== 'undefined' ? window : globalThis);
