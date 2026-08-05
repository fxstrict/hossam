/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/SearchEngine.js
 * Implements the spec's "شريط بحث عملاق": one query box that matches
 * across customers, devices (Machine ID), licenses (License ID), and
 * payments (invoice number) — always resolving to a customer result.
 */
(function (window) {
  'use strict';

  async function globalSearch(term) {
    var q = String(term || '').trim().toLowerCase();
    if (!q) return [];

    var customers = await window.HLMCustomersRepository.getAll();
    var devices = await window.HLMDevicesRepository.getAll();
    var licenses = await window.HLMLicensesRepository.getAll();
    var payments = await window.HLMPaymentsRepository.getAll();

    var matchedCustomerIds = new Set();
    var reasons = {}; // customerId -> array of match reasons

    function addMatch(customerId, reason) {
      if (!customerId) return;
      matchedCustomerIds.add(customerId);
      (reasons[customerId] = reasons[customerId] || []).push(reason);
    }

    customers.forEach(function (c) {
      var haystack = [c.officeName, c.lawyerName, c.phone, c.whatsapp, c.email, c.governorate, c.clientNumber]
        .filter(Boolean).join(' ').toLowerCase();
      if (haystack.indexOf(q) !== -1) addMatch(c.id, 'بيانات العميل');
    });

    devices.forEach(function (d) {
      if (d.machineId && d.machineId.toLowerCase().indexOf(q) !== -1) addMatch(d.customerId, 'رقم الجهاز: ' + d.machineId);
    });

    licenses.forEach(function (l) {
      if (l.licenseId && l.licenseId.toLowerCase().indexOf(q) !== -1) addMatch(l.customerId, 'معرّف الترخيص: ' + l.licenseId);
    });

    payments.forEach(function (p) {
      if (p.invoiceNumber && p.invoiceNumber.toLowerCase().indexOf(q) !== -1) addMatch(p.customerId, 'رقم الفاتورة: ' + p.invoiceNumber);
    });

    var customersById = {};
    customers.forEach(function (c) { customersById[c.id] = c; });

    return Array.from(matchedCustomerIds)
      .map(function (id) { return { customer: customersById[id], reasons: reasons[id] }; })
      .filter(function (r) { return !!r.customer; });
  }

  /**
   * Applies the filter chips described in the spec: المنتهية، المنتهية
   * قريبًا، Lifetime، Enterprise، Professional، غير مدفوعة، فترة السماح،
   * قراءة فقط.
   */
  async function applyFilters(filterKeys) {
    var customers = await window.HLMCustomersRepository.getAll();
    var subscriptions = await window.HLMSubscriptionsRepository.getAll();
    var payments = await window.HLMPaymentsRepository.getAll();
    var subsByCustomer = {};
    subscriptions.forEach(function (s) { subsByCustomer[s.customerId] = s; });
    var unpaidCustomerIds = new Set(payments.filter(function (p) { return p.status === 'unpaid'; }).map(function (p) { return p.customerId; }));
    var now = new Date();

    return customers.filter(function (c) {
      var sub = subsByCustomer[c.id];
      var state = sub ? window.HLMSubscriptionsRepository.computeState(sub, now) : null;
      return filterKeys.every(function (key) {
        switch (key) {
          case 'expired': return state && state.state === 'read_only';
          case 'expiring_soon': return state && state.state === 'active' && state.daysRemaining <= 7;
          case 'lifetime': return state && state.state === 'lifetime';
          case 'grace': return state && state.state === 'grace';
          case 'read_only': return state && state.state === 'read_only';
          case 'enterprise': return sub && sub.edition === 'Enterprise';
          case 'professional': return sub && sub.edition === 'Professional';
          case 'unpaid': return unpaidCustomerIds.has(c.id);
          default: return true;
        }
      });
    });
  }

  window.HLMSearchEngine = { globalSearch: globalSearch, applyFilters: applyFilters };
})(typeof window !== 'undefined' ? window : globalThis);
