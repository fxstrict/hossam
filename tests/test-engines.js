'use strict';
require('fake-indexeddb/auto');
const { webcrypto } = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;
if (!global.crypto || !global.crypto.subtle) global.crypto = webcrypto;
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');

const ROOT = path.join(__dirname, '..');
[
  'js/core/EventBus.js',
  'js/core/Db.js',
  'js/core/Repository.js',
  'js/repositories/AuditLogRepository.js',
  'js/repositories/CustomersRepository.js',
  'js/repositories/DevicesRepository.js',
  'js/repositories/SubscriptionsRepository.js',
  'js/repositories/LicensesRepository.js',
  'js/repositories/PaymentsRepository.js',
  'js/repositories/UsersRepository.js',
  'js/repositories/SettingsRepository.js',
  'js/crypto/LicenseCrypto.js',
  'js/modules/StatsEngine.js',
  'js/modules/SearchEngine.js',
  'js/modules/ReportsEngine.js'
].forEach((rel) => require(path.join(ROOT, rel)));

let passed = 0, failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL  ' + name + '  ->  ' + (e.stack || e.message));
    failed++;
  }
}

(async () => {
  console.log('=== StatsEngine / SearchEngine / ReportsEngine tests ===');

  const now = new Date('2026-08-04T00:00:00.000Z');

  const c1 = await window.HLMCustomersRepository.create({ officeName: 'مكتب نشط', governorate: 'القاهرة' });
  const c2 = await window.HLMCustomersRepository.create({ officeName: 'مكتب على وشك الانتهاء', governorate: 'الجيزة' });
  const c3 = await window.HLMCustomersRepository.create({ officeName: 'مكتب فترة سماح', governorate: 'القاهرة' });
  const c4 = await window.HLMCustomersRepository.create({ officeName: 'مكتب منتهي تمامًا', governorate: 'الإسكندرية' });
  const c5 = await window.HLMCustomersRepository.create({ officeName: 'مكتب دائم', governorate: 'القاهرة' });

  await window.HLMSubscriptionsRepository.create({ customerId: c1.id, edition: 'Professional', endDate: new Date(now.getTime() + 200 * 86400000).toISOString(), graceDays: 15 });
  await window.HLMSubscriptionsRepository.create({ customerId: c2.id, edition: 'Enterprise', endDate: new Date(now.getTime() + 3 * 86400000).toISOString(), graceDays: 15 });
  await window.HLMSubscriptionsRepository.create({ customerId: c3.id, edition: 'Professional', endDate: new Date(now.getTime() - 5 * 86400000).toISOString(), graceDays: 15 });
  await window.HLMSubscriptionsRepository.create({ customerId: c4.id, edition: 'Starter', endDate: new Date(now.getTime() - 40 * 86400000).toISOString(), graceDays: 15 });
  await window.HLMSubscriptionsRepository.create({ customerId: c5.id, edition: 'Enterprise', endDate: null, graceDays: 15 });

  await window.HLMPaymentsRepository.create({ customerId: c1.id, amount: 5000, status: 'paid', date: now.toISOString() });
  await window.HLMPaymentsRepository.create({ customerId: c2.id, amount: 2000, status: 'unpaid', date: now.toISOString() });

  const device = await window.HLMDevicesRepository.create({ customerId: c1.id, machineId: 'HSM-AAAA-BBBB-CCCC' });
  await window.HLMLicensesRepository.recordIssued({
    customerId: c1.id, deviceId: device.id,
    licenseFile: { payload: { licenseId: 'HSM-LIC-DEADBEEF', edition: 'Professional', type: 'yearly', machineId: device.machineId, modules: [], issuedAt: now.toISOString(), expiresAt: null } }
  });

  await check('computeDashboardStats: counts active/expiring/lifetime/read-only correctly', async () => {
    const customers = await window.HLMCustomersRepository.getAll();
    const subs = await window.HLMSubscriptionsRepository.getAll();
    const licenses = await window.HLMLicensesRepository.getAll();
    const payments = await window.HLMPaymentsRepository.getAll();
    const stats = window.HLMStatsEngine.computeDashboardStats(customers, subs, licenses, payments, now);

    assert.strictEqual(stats.totalCustomers, 5);
    assert.strictEqual(stats.lifetimeCount, 1);
    assert.strictEqual(stats.activeSubscriptions, 3); // c1, c2, c5(lifetime)
    assert.strictEqual(stats.expiredSubscriptions, 2); // c3 (grace), c4 (read_only)
    assert.strictEqual(stats.expiringWithinWeek, 1); // c2
    assert.strictEqual(stats.revenueThisYear, 5000);
  });

  await check('computeNotifications: produces correctly typed + sorted feed', async () => {
    const customers = await window.HLMCustomersRepository.getAll();
    const subs = await window.HLMSubscriptionsRepository.getAll();
    const feed = window.HLMStatsEngine.computeNotifications(customers, subs, now);

    assert.strictEqual(feed.counts.expiringSoon, 1);
    assert.strictEqual(feed.counts.gracePeriod, 1);
    assert.strictEqual(feed.counts.readOnly, 1);
    // sorted: read_only/expiring_today before grace before expiring_soon
    const types = feed.items.map((i) => i.type);
    assert(types.indexOf('read_only') < types.indexOf('expiring_soon'));
  });

  await check('globalSearch: finds a customer by Machine ID', async () => {
    const results = await window.HLMSearchEngine.globalSearch('HSM-AAAA-BBBB-CCCC');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].customer.id, c1.id);
  });

  await check('globalSearch: finds a customer by License ID', async () => {
    const results = await window.HLMSearchEngine.globalSearch('DEADBEEF');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].customer.id, c1.id);
  });

  await check('globalSearch: finds a customer by office name substring', async () => {
    const results = await window.HLMSearchEngine.globalSearch('دائم');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].customer.id, c5.id);
  });

  await check('applyFilters: expired filter returns only read_only customers', async () => {
    const results = await window.HLMSearchEngine.applyFilters(['expired']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, c4.id);
  });

  await check('applyFilters: unpaid + governorate-agnostic combination', async () => {
    const results = await window.HLMSearchEngine.applyFilters(['unpaid']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, c2.id);
  });

  await check('ReportsEngine.toCsv: correct header, escaping, and UTF-8 BOM', async () => {
    const rows = [{ a: 'قيمة تحتوي على, فاصلة', b: 'سطر\nجديد' }];
    const csv = window.HLMReportsEngine.toCsv(rows, [{ label: 'العمود أ', value: 'a' }, { label: 'العمود ب', value: 'b' }]);
    assert(csv.startsWith('\uFEFF'));
    assert(csv.includes('"قيمة تحتوي على, فاصلة"'));
    assert(csv.includes('"سطر\nجديد"'));
  });

  await check('ReportsEngine.allCustomersReport: includes edition + expiry via subscriptions join', async () => {
    const customers = await window.HLMCustomersRepository.getAll();
    const subs = await window.HLMSubscriptionsRepository.getAll();
    const report = window.HLMReportsEngine.allCustomersReport(customers, subs);
    const csv = window.HLMReportsEngine.toCsv(report.rows, report.columns);
    assert(csv.includes('Professional') || csv.includes('Enterprise'));
    assert(csv.includes('دائم')); // lifetime customer shows "دائم" not a date
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
