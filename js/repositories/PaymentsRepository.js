/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/PaymentsRepository.js
 * Invoices/payments per customer. method: 'transfer'|'vodafone_cash'|'cash'|
 * 'check'. status: 'paid' | 'unpaid'.
 */
(function (window) {
  'use strict';

  function PaymentsRepository() {
    window.HLMRepository.call(this, 'payments', 'الفواتير');
  }
  PaymentsRepository.prototype = Object.create(window.HLMRepository.prototype);

  PaymentsRepository.prototype.forCustomer = async function (customerId) {
    var rows = await this.getByIndex('customerId', customerId);
    rows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return rows;
  };

  PaymentsRepository.prototype.nextInvoiceNumber = async function () {
    var all = await this.getAll();
    var max = 0;
    all.forEach(function (p) {
      var m = /^INV-0*(\d+)$/.exec(p.invoiceNumber || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'INV-' + String(max + 1).padStart(6, '0');
  };

  PaymentsRepository.prototype.create = async function (data, actor) {
    var payload = Object.assign({}, data);
    if (!payload.invoiceNumber) payload.invoiceNumber = await this.nextInvoiceNumber();
    if (!payload.date) payload.date = window.HLMUtils.nowIso();
    if (!payload.status) payload.status = 'unpaid';
    return window.HLMRepository.prototype.create.call(this, payload, actor);
  };

  PaymentsRepository.prototype.totalRevenue = async function (year) {
    var all = await this.getAll();
    return all
      .filter(function (p) { return p.status === 'paid' && (!year || new Date(p.date).getFullYear() === year); })
      .reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0);
  };

  window.HLMPaymentsRepository = new PaymentsRepository();
})(typeof window !== 'undefined' ? window : globalThis);
