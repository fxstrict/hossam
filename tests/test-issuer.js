'use strict';
require('fake-indexeddb/auto');
const { webcrypto } = require('crypto');
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
  'js/core/KeySession.js',
  'js/repositories/AuditLogRepository.js',
  'js/repositories/CustomersRepository.js',
  'js/repositories/DevicesRepository.js',
  'js/repositories/SubscriptionsRepository.js',
  'js/repositories/LicensesRepository.js',
  'js/crypto/LicenseCrypto.js',
  'js/modules/LicenseIssuer.js'
].forEach((rel) => require(path.join(ROOT, rel)));

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.log('  FAIL  ' + name + '  ->  ' + (e.stack || e.message)); failed++; }
}

(async () => {
  console.log('=== KeySession / LicenseIssuer tests ===');

  const customer = await window.HLMCustomersRepository.create({ officeName: 'مكتب اختبار الإصدار' });
  const device = await window.HLMDevicesRepository.create({ customerId: customer.id, machineId: 'HSM-9999-8888-7777' });

  await check('LicenseIssuer.issue throws key_not_loaded when no key session is active', async () => {
    window.HLMKeySession.clear();
    let threw = false;
    try {
      await window.HLMLicenseIssuer.issue({ customerId: customer.id, deviceId: device.id, machineId: device.machineId, customerName: customer.officeName, edition: 'Professional', type: 'yearly' }, 'new');
    } catch (e) { threw = e.message === 'key_not_loaded'; }
    assert(threw, 'expected key_not_loaded error');
  });

  await check('after loading a key session, issue() signs+persists+syncs subscription', async () => {
    const keyPair = await window.HLMCrypto.generateKeyPair();
    window.HLMKeySession.set(keyPair.privateKey, keyPair.publicKeyJwk);
    assert.strictEqual(window.HLMKeySession.isLoaded(), true);

    const licenseRecord = await window.HLMLicenseIssuer.issue({
      customerId: customer.id, deviceId: device.id, machineId: device.machineId,
      customerName: customer.officeName, edition: 'Enterprise', type: 'monthly', modules: ['AI']
    }, 'new', { id: 'u1', name: 'Tester' });

    assert.strictEqual(licenseRecord.status, 'issued');
    assert.strictEqual(licenseRecord.edition, 'Enterprise');

    const sub = await window.HLMSubscriptionsRepository.forCustomer(customer.id);
    assert.strictEqual(sub.edition, 'Enterprise');
    assert.strictEqual(sub.lastLicenseId, licenseRecord.licenseId);

    const logs = await window.HLMAuditLogRepository.recent();
    const found = logs.find((l) => l.entityId === licenseRecord.id && l.action === 'create');
    assert(found, 'expected audit log entry for the issued license');
    assert.strictEqual(found.actorName, 'Tester');
  });

  await check('KeySession.clear() removes the key and issue() fails again', async () => {
    window.HLMKeySession.clear();
    let threw = false;
    try {
      await window.HLMLicenseIssuer.issue({ customerId: customer.id, deviceId: device.id, machineId: device.machineId, edition: 'Professional', type: 'yearly' }, 'renewal');
    } catch (e) { threw = e.message === 'key_not_loaded'; }
    assert(threw);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
