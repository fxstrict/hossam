/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/StatsEngine.js
 * Pure functions only (no DOM, no IndexedDB calls) — computes dashboard
 * counters and the notification feed from already-loaded arrays. Kept
 * separate from rendering so business rules can be unit-tested directly.
 */
(function (window) {
  'use strict';

  /**
   * @param {Array} customers
   * @param {Array} subscriptions one row per customer (current snapshot)
   * @param {Array} licenses full history
   * @param {Array} payments
   * @param {Date} [now]
   */
  function computeDashboardStats(customers, subscriptions, licenses, payments, now) {
    now = now || new Date();
    var subsByCustomer = {};
    subscriptions.forEach(function (s) { subsByCustomer[s.customerId] = s; });

    var stats = {
      totalCustomers: customers.length,
      activeSubscriptions: 0,
      expiredSubscriptions: 0,
      expiringWithinWeek: 0,
      expiringToday: 0,
      lifetimeCount: 0,
      byEdition: {},
      totalDevices: 0,
      revenueThisYear: 0,
      newCustomersThisMonth: 0
    };

    customers.forEach(function (c) {
      var created = c.createdAt ? new Date(c.createdAt) : null;
      if (created && created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()) {
        stats.newCustomersThisMonth++;
      }
      var sub = subsByCustomer[c.id];
      if (!sub) return;
      var state = window.HLMSubscriptionsRepository.computeState(sub, now);
      stats.byEdition[sub.edition] = (stats.byEdition[sub.edition] || 0) + 1;

      if (state.state === 'lifetime') { stats.lifetimeCount++; stats.activeSubscriptions++; return; }
      if (state.state === 'active') {
        stats.activeSubscriptions++;
        if (state.daysRemaining <= 7) stats.expiringWithinWeek++;
        if (state.daysRemaining === 0) stats.expiringToday++;
      } else {
        stats.expiredSubscriptions++;
      }
    });

    var thisYear = now.getFullYear();
    payments.forEach(function (p) {
      if (p.status === 'paid' && new Date(p.date).getFullYear() === thisYear) {
        stats.revenueThisYear += Number(p.amount) || 0;
      }
    });

    return stats;
  }

  /**
   * Builds the notification feed described in the spec: expiring today,
   * expiring this week, in grace period, read-only.
   */
  function computeNotifications(customers, subscriptions, now) {
    now = now || new Date();
    var customersById = {};
    customers.forEach(function (c) { customersById[c.id] = c; });

    var items = [];
    subscriptions.forEach(function (sub) {
      var customer = customersById[sub.customerId];
      if (!customer) return;
      var state = window.HLMSubscriptionsRepository.computeState(sub, now);
      if (state.state === 'active' && state.daysRemaining <= 7) {
        items.push({
          type: state.daysRemaining <= 0 ? 'expiring_today' : 'expiring_soon',
          severity: state.daysRemaining <= 0 ? 'danger' : 'warning',
          customerId: customer.id,
          customerName: customer.officeName,
          daysRemaining: state.daysRemaining,
          message: state.daysRemaining <= 0
            ? 'اشتراك "' + customer.officeName + '" ينتهي اليوم'
            : 'اشتراك "' + customer.officeName + '" ينتهي خلال ' + state.daysRemaining + ' يوم'
        });
      } else if (state.state === 'grace') {
        items.push({
          type: 'grace_period', severity: 'warning',
          customerId: customer.id, customerName: customer.officeName,
          daysIntoGrace: state.daysIntoGrace,
          message: '"' + customer.officeName + '" في فترة السماح (يوم ' + state.daysIntoGrace + ')'
        });
      } else if (state.state === 'read_only') {
        items.push({
          type: 'read_only', severity: 'danger',
          customerId: customer.id, customerName: customer.officeName,
          message: '"' + customer.officeName + '" في وضع القراءة فقط (انتهى الاشتراك)'
        });
      }
    });

    items.sort(function (a, b) {
      var order = { expiring_today: 0, read_only: 1, grace_period: 2, expiring_soon: 3 };
      return order[a.type] - order[b.type];
    });

    return {
      items: items,
      counts: {
        expiringToday: items.filter(function (i) { return i.type === 'expiring_today'; }).length,
        expiringSoon: items.filter(function (i) { return i.type === 'expiring_soon'; }).length,
        gracePeriod: items.filter(function (i) { return i.type === 'grace_period'; }).length,
        readOnly: items.filter(function (i) { return i.type === 'read_only'; }).length
      }
    };
  }

  window.HLMStatsEngine = {
    computeDashboardStats: computeDashboardStats,
    computeNotifications: computeNotifications
  };
})(typeof window !== 'undefined' ? window : globalThis);
