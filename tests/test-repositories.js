/**
 * Repository / business-logic integration tests.
 * Loads the real js/core + js/repositories files unmodified in a shimmed
 * browser-like global, backed by fake-indexeddb, and exercises the CRM
 * workflows: customer creation, device transfer, license issue/renew,
 * subscription state machine, payments, RBAC, audit log.
 *
 * Run: node tests/test-repositories.js
 */
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
  'js/crypto/LicenseCrypto.js'
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
  console.log('=== Repository / business logic integration tests ===');

  let customer;
  await check('CustomersRepository.create assigns sequential clientNumber', async () => {
    customer = await window.HLMCustomersRepository.create({
      officeName: 'مكتب أحمد فتحي للمحاماة',
      lawyerName: 'أحمد فتحي',
      phone: '0100000000',
      email: 'ahmed@example.com',
      governorate: 'القاهرة'
    });
    assert.strictEqual(customer.clientNumber, 'C000001');
    assert.strictEqual(customer.status, 'active');
  });

  await check('a second customer gets the next sequential number', async () => {
    const c2 = await window.HLMCustomersRepository.create({ officeName: 'مكتب آخر' });
    assert.strictEqual(c2.clientNumber, 'C000002');
  });

  await check('CustomersRepository.search matches office/lawyer/phone/governorate', async () => {
    const r1 = await window.HLMCustomersRepository.search('أحمد فتحي');
    assert.strictEqual(r1.length, 1);
    const r2 = await window.HLMCustomersRepository.search('0100000000');
    assert.strictEqual(r2.length, 1);
    const r3 = await window.HLMCustomersRepository.search('nonexistent-zzz');
    assert.strictEqual(r3.length, 0);
  });

  await check('customer create() wrote an audit log entry', async () => {
    const logs = await window.HLMAuditLogRepository.recent();
    const found = logs.find((l) => l.entityId === customer.id && l.action === 'create');
    assert(found, 'expected an audit log entry for customer creation');
    assert.strictEqual(found.entity, 'العملاء');
  });

  let device;
  await check('DevicesRepository validates and stores a Machine ID', async () => {
    assert.strictEqual(window.HLMDevicesRepository.isValidMachineId('HSM-8D2A-E98F-41AA'), true);
    assert.strictEqual(window.HLMDevicesRepository.isValidMachineId('not-a-machine-id'), false);
    device = await window.HLMDevicesRepository.create({ customerId: customer.id, machineId: 'hsm-8d2a-e98f-41aa' });
    assert.strictEqual(device.machineId, 'HSM-8D2A-E98F-41AA'); // normalized uppercase
    assert.strictEqual(device.status, 'active');
  });

  let keyPair, licenseFile;
  await check('issue a license: crypto + repository + subscription sync all agree', async () => {
    keyPair = await window.HLMCrypto.generateKeyPair();
    licenseFile = await window.HLMCrypto.buildLicenseFile({
      customerName: customer.officeName,
      customerPhone: customer.phone,
      machineId: device.machineId,
      edition: 'Professional',
      type: 'yearly',
      modules: ['AI', 'Backup'],
      graceDays: 15
    }, keyPair.privateKey);

    const licenseRecord = await window.HLMLicensesRepository.recordIssued({
      customerId: customer.id, deviceId: device.id, licenseFile: licenseFile, reason: 'new'
    });
    assert.strictEqual(licenseRecord.status, 'issued');
    assert.strictEqual(licenseRecord.licenseId, licenseFile.payload.licenseId);

    const sub = await window.HLMSubscriptionsRepository.syncFromLicense(customer.id, licenseFile.payload);
    assert.strictEqual(sub.edition, 'Professional');
    assert.strictEqual(sub.endDate, licenseFile.payload.expiresAt);

    const state = window.HLMSubscriptionsRepository.computeState(sub, new Date());
    assert.strictEqual(state.state, 'active');
    assert(state.daysRemaining > 360 && state.daysRemaining <= 365);
  });

  await check('subscription state machine: ACTIVE -> GRACE -> READ_ONLY matches expected boundaries', async () => {
    const sub = { endDate: new Date(Date.now() - 5 * 86400000).toISOString(), graceDays: 15 };
    const s1 = window.HLMSubscriptionsRepository.computeState(sub, new Date());
    assert.strictEqual(s1.state, 'grace');
    assert.strictEqual(s1.daysIntoGrace, 5);

    const sub2 = { endDate: new Date(Date.now() - 20 * 86400000).toISOString(), graceDays: 15 };
    const s2 = window.HLMSubscriptionsRepository.computeState(sub2, new Date());
    assert.strictEqual(s2.state, 'read_only');

    const lifetimeSub = { endDate: null };
    const s3 = window.HLMSubscriptionsRepository.computeState(lifetimeSub, new Date());
    assert.strictEqual(s3.state, 'lifetime');
  });

  await check('renewing a license: same customer/device, new licenseId, subscription updates', async () => {
    const renewed = await window.HLMCrypto.buildLicenseFile({
      customerName: customer.officeName, machineId: device.machineId,
      edition: 'Professional', type: 'yearly', modules: ['AI', 'Backup'], graceDays: 15
    }, keyPair.privateKey);
    assert.notStrictEqual(renewed.payload.licenseId, licenseFile.payload.licenseId);

    await window.HLMLicensesRepository.recordIssued({
      customerId: customer.id, deviceId: device.id, licenseFile: renewed, reason: 'renewal'
    });
    const history = await window.HLMLicensesRepository.forCustomer(customer.id);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].reason, 'renewal'); // sorted newest first
  });

  let newDevice;
  await check('device transfer: old device inactive, new device active, linked', async () => {
    newDevice = await window.HLMDevicesRepository.transfer(device.id, 'HSM-1111-2222-3333');
    const oldDevice = await window.HLMDevicesRepository.getById(device.id);
    assert.strictEqual(oldDevice.status, 'inactive');
    assert.strictEqual(newDevice.status, 'active');
    assert.strictEqual(newDevice.transferredFrom, device.id);
    assert.strictEqual(newDevice.customerId, customer.id);
  });

  await check('license revoke + Google Sheet row builder', async () => {
    const history = await window.HLMLicensesRepository.forCustomer(customer.id);
    const revoked = await window.HLMLicensesRepository.revoke(history[0].id, 'تأخر السداد');
    assert.strictEqual(revoked.status, 'revoked');
    const row = window.HLMLicensesRepository.buildRevokeSheetRow(revoked, 'تأخر السداد');
    assert.strictEqual(row.licenseId, revoked.licenseId);
    assert.strictEqual(row.reason, 'تأخر السداد');
  });

  await check('PaymentsRepository: sequential invoice numbers + revenue totals', async () => {
    const p1 = await window.HLMPaymentsRepository.create({ customerId: customer.id, amount: 3000, method: 'transfer', status: 'paid' });
    assert.strictEqual(p1.invoiceNumber, 'INV-000001');
    await window.HLMPaymentsRepository.create({ customerId: customer.id, amount: 1500, method: 'cash', status: 'unpaid' });
    const total = await window.HLMPaymentsRepository.totalRevenue();
    assert.strictEqual(total, 3000);
  });

  await check('UsersRepository: passwords are hashed, never stored in plain text', async () => {
    const user = await window.HLMUsersRepository.createUser({
      username: 'admin', name: 'مدير النظام', role: 'super_admin', password: 'S3cur3P@ss'
    });
    assert.strictEqual(user.password, undefined, 'plaintext password must not be persisted on the record');
    assert(user.passwordHash && user.passwordHash.length === 64, 'expected a 256-bit hex hash');
    assert.notStrictEqual(user.passwordHash, 'S3cur3P@ss');

    const authOk = await window.HLMUsersRepository.authenticate('admin', 'S3cur3P@ss');
    assert(authOk, 'correct password must authenticate');
    const authBad = await window.HLMUsersRepository.authenticate('admin', 'wrong-password');
    assert.strictEqual(authBad, null, 'wrong password must not authenticate');
  });

  await check('RBAC: role permission matrix enforced correctly', async () => {
    assert.strictEqual(window.HLMUsersRepository.hasPermission('super_admin', 'licenses.issue'), true);
    assert.strictEqual(window.HLMUsersRepository.hasPermission('accountant', 'licenses.issue'), false);
    assert.strictEqual(window.HLMUsersRepository.hasPermission('accountant', 'payments.view'), true);
    assert.strictEqual(window.HLMUsersRepository.hasPermission('sales', 'licenses.issue'), false);
    assert.strictEqual(window.HLMUsersRepository.hasPermission('support', 'licenses.resend'), true);
    assert.strictEqual(window.HLMUsersRepository.hasPermission('support', 'licenses.issue'), false);
  });

  await check('SettingsRepository: get/set roundtrip + default catalogue present', async () => {
    await window.HLMSettingsRepository.set('officeName', 'مكتب الحسام للمحاماة');
    const v = await window.HLMSettingsRepository.get('officeName');
    assert.strictEqual(v, 'مكتب الحسام للمحاماة');
    assert(window.HLM_DEFAULT_SETTINGS.editions.includes('Professional'));
    assert(window.HLM_DEFAULT_SETTINGS.modulesCatalogue.includes('WhatsApp'));
  });

  await check('backup export/import round-trips all stores', async () => {
    const snapshot = await window.HLMDb.exportAll();
    assert(snapshot.customers.length >= 2);
    assert(snapshot.licenses.length >= 2);
    assert(snapshot.payments.length >= 2);

    // wipe and restore
    for (const store of Object.keys(window.HLMDb.STORES)) await window.HLMDb.clear(store);
    const emptyCustomers = await window.HLMCustomersRepository.getAll();
    assert.strictEqual(emptyCustomers.length, 0);

    await window.HLMDb.importAll(snapshot, 'replace');
    const restoredCustomers = await window.HLMCustomersRepository.getAll();
    assert.strictEqual(restoredCustomers.length, snapshot.customers.length);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
