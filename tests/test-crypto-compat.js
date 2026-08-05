/**
 * Compatibility test: HLMCrypto (browser, used by License Manager Pro)
 * <-> the real app's js/license/LicenseCrypto.js verify() logic
 * <-> tools/license-generator/generate-license.js canonicalStringify()
 *
 * Run: node tests/test-crypto-compat.js
 */
'use strict';
const { webcrypto } = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Minimal browser shim so we can load js/crypto/LicenseCrypto.js unmodified.
global.window = global;
if (!global.crypto || !global.crypto.subtle) global.crypto = webcrypto;
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
global.TextEncoder = require('util').TextEncoder;
global.CryptoKey = webcrypto.CryptoKey || function () {};

require(path.join(__dirname, '..', 'js', 'crypto', 'LicenseCrypto.js'));
const HLMCrypto = global.HLMCrypto;

// The REAL app's verifier logic, loaded from the uploaded project so we
// test against the actual shipped code, not a re-implementation.
const REAL_APP = path.join(
  '/home/claude/work/project/app'
);
// LicenseCrypto.js (main app) is an IIFE attaching window.LicenseCrypto.
// Re-use the same shimmed `global` (it also defines window.LicenseCrypto,
// distinct global name from HLMCrypto so no collision).
require(path.join(REAL_APP, 'js', 'license', 'LicenseCrypto.js'));
const RealAppLicenseCrypto = global.LicenseCrypto;

// generate-license.js's canonicalStringify, extracted by re-reading the
// file's source text (it's not exported as a module) to assert byte-
// identical serialization independently, without executing its CLI.
const genSrc = fs.readFileSync(
  path.join(REAL_APP, 'tools', 'license-generator', 'generate-license.js'),
  'utf8'
);
const genFnMatch = genSrc.match(/function canonicalStringify\([\s\S]*?\n}/);
assert(genFnMatch, 'could not extract canonicalStringify from generate-license.js');
// eslint-disable-next-line no-eval
const cliCanonicalStringify = (0, eval)('(' + genFnMatch[0] + ')');

let passed = 0, failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL  ' + name + '  ->  ' + e.message);
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL  ' + name + '  ->  ' + e.message);
    failed++;
  }
}

(async () => {
  console.log('=== HLMCrypto <-> real app LicenseCrypto compatibility ===');

  const samplePayload = {
    licenseId: 'HSM-LIC-ABCD1234',
    customer: { name: 'مكتب تجريبي للمحاماة', phone: '0100000000', email: 'a@b.com' },
    edition: 'Professional',
    type: 'yearly',
    machineId: 'HSM-8D2A-E98F-41AA',
    modules: ['AI', 'Backup'],
    issuedAt: '2026-08-04T00:00:00.000Z',
    expiresAt: '2027-08-04T00:00:00.000Z',
    supportUntil: '2027-08-04T00:00:00.000Z',
    graceDays: 15,
    maxTransfers: 2,
    transferCount: 0
  };

  check('canonicalStringify: HLMCrypto matches main app LicenseCrypto.js', () => {
    const a = HLMCrypto.canonicalStringify(samplePayload);
    const b = RealAppLicenseCrypto.canonicalStringify(samplePayload);
    assert.strictEqual(a, b);
  });

  check('canonicalStringify: HLMCrypto matches CLI generate-license.js', () => {
    const a = HLMCrypto.canonicalStringify(samplePayload);
    const b = cliCanonicalStringify(samplePayload);
    assert.strictEqual(a, b);
  });

  check('canonicalStringify: key order independence', () => {
    const shuffled = {
      transferCount: 0, maxTransfers: 2, graceDays: 15,
      supportUntil: samplePayload.supportUntil, expiresAt: samplePayload.expiresAt,
      issuedAt: samplePayload.issuedAt, modules: samplePayload.modules,
      machineId: samplePayload.machineId, type: samplePayload.type,
      edition: samplePayload.edition, customer: samplePayload.customer,
      licenseId: samplePayload.licenseId
    };
    assert.strictEqual(
      HLMCrypto.canonicalStringify(samplePayload),
      HLMCrypto.canonicalStringify(shuffled)
    );
  });

  let keyPair;
  await checkAsync('generateKeyPair produces usable ECDSA P-256 CryptoKeys', async () => {
    keyPair = await HLMCrypto.generateKeyPair();
    assert(keyPair.privateKey && keyPair.publicKey);
    assert(keyPair.privateKeyPem.includes('BEGIN PRIVATE KEY'));
    assert(keyPair.publicKeyJwk.crv === 'P-256');
  });

  let licenseFile;
  await checkAsync('buildLicenseFile signs a full .hsm-shaped license', async () => {
    licenseFile = await HLMCrypto.buildLicenseFile({
      customerName: 'مكتب تجريبي للمحاماة',
      customerPhone: '0100000000',
      customerEmail: 'a@b.com',
      machineId: 'HSM-8D2A-E98F-41AA',
      edition: 'Professional',
      type: 'yearly',
      modules: ['AI', 'Backup'],
      graceDays: 15
    }, keyPair.privateKey);
    assert.strictEqual(licenseFile.v, 1);
    assert.strictEqual(licenseFile.alg, 'ECDSA-P256-SHA256');
    assert(licenseFile.payload.licenseId.startsWith('HSM-LIC-'));
    assert(licenseFile.signature.length > 0);
  });

  await checkAsync('THE CRITICAL TEST: real app LicenseCrypto.verify() accepts a license signed by HLMCrypto', async () => {
    global.HOSSAM_LICENSE_PUBLIC_KEY_JWK = keyPair.publicKeyJwk;
    // Force re-import under the new key (the real module caches its
    // public key promise internally on first use).
    const ok = await RealAppLicenseCrypto.verify(licenseFile.payload, licenseFile.signature);
    assert.strictEqual(ok, true, 'real app verifier rejected a HLMCrypto-issued license');
  });

  await checkAsync('tamper detection: mutated payload fails real app verify()', async () => {
    const tampered = Object.assign({}, licenseFile.payload, { edition: 'Enterprise' });
    const ok = await RealAppLicenseCrypto.verify(tampered, licenseFile.signature);
    assert.strictEqual(ok, false);
  });

  await checkAsync('importPrivateKeyPem round-trip: PEM export -> import -> sign -> verify', async () => {
    const imported = await HLMCrypto.importPrivateKeyPem(keyPair.privateKeyPem);
    const lic2 = await HLMCrypto.buildLicenseFile({
      customerName: 'عميل 2', machineId: 'HSM-1111-2222-3333',
      edition: 'Enterprise', type: 'lifetime', modules: []
    }, imported);
    assert.strictEqual(lic2.payload.expiresAt, null);
    assert.strictEqual(lic2.payload.supportUntil, null);
    const ok = await RealAppLicenseCrypto.verify(lic2.payload, lic2.signature);
    assert.strictEqual(ok, true);
  });

  check('computeExpiry: all subscription types', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    assert.strictEqual(HLMCrypto.computeExpiry('trial', now), new Date('2026-01-15T00:00:00.000Z').toISOString());
    assert.strictEqual(HLMCrypto.computeExpiry('monthly', now), new Date('2026-01-31T00:00:00.000Z').toISOString());
    assert.strictEqual(HLMCrypto.computeExpiry('quarterly', now), new Date('2026-04-01T00:00:00.000Z').toISOString());
    assert.strictEqual(HLMCrypto.computeExpiry('semiannual', now), new Date('2026-06-30T00:00:00.000Z').toISOString());
    assert.strictEqual(HLMCrypto.computeExpiry('yearly', now), new Date('2027-01-01T00:00:00.000Z').toISOString());
    // 1095 days from 2026-01-01 lands on 2028-12-31 (2028 is a leap year)
    assert.strictEqual(HLMCrypto.computeExpiry('triennial', now), new Date('2028-12-31T00:00:00.000Z').toISOString());
    assert.strictEqual(HLMCrypto.computeExpiry('lifetime', now), null);
  });

  await checkAsync('Settings screen: the "ready-to-install" license-public-key.js download is a valid drop-in replacement for the real app file', async () => {
    // Mirrors exactly what js/modules/settings.js's buildPublicKeyJsFile()
    // produces, to verify the contract without needing a DOM.
    function buildPublicKeyJsFile(jwk) {
      return (
        '(typeof window !== \'undefined\' ? window : globalThis).HOSSAM_LICENSE_PUBLIC_KEY_JWK = ' +
        JSON.stringify(jwk, null, 2) + ';\n'
      );
    }

    const genPair = await HLMCrypto.generateKeyPair();
    const fileContent = buildPublicKeyJsFile(genPair.publicKeyJwk);

    assert(fileContent.includes('HOSSAM_LICENSE_PUBLIC_KEY_JWK'), 'must use the exact same global variable name as the real app file');

    const sandbox = {};
    const evalFn = new Function('window', 'globalThis', fileContent + '\nreturn window.HOSSAM_LICENSE_PUBLIC_KEY_JWK;');
    const evaluated = evalFn(sandbox, sandbox);
    assert.deepStrictEqual(evaluated, genPair.publicKeyJwk, 'must be valid, executable JS that sets the global correctly');

    // The real app's verify() caches the imported public CryptoKey for
    // the lifetime of the module (matches real browser/session behavior:
    // it only ever reads window.HOSSAM_LICENSE_PUBLIC_KEY_JWK once). To
    // prove THIS specific JWK verifies correctly — not just reuse the
    // already-cached key from the earlier test — load a completely fresh,
    // uncached copy of the real module.
    const realAppLicenseCryptoPath = path.join(REAL_APP, 'js', 'license', 'LicenseCrypto.js');
    delete require.cache[require.resolve(realAppLicenseCryptoPath)];
    global.HOSSAM_LICENSE_PUBLIC_KEY_JWK = genPair.publicKeyJwk;
    require(realAppLicenseCryptoPath);
    const freshRealAppLicenseCrypto = global.LicenseCrypto;

    const licenseFile = await HLMCrypto.buildLicenseFile({
      customerName: 'عميل تجريبي', machineId: 'HSM-0000-1111-2222', edition: 'Professional', type: 'yearly', modules: []
    }, genPair.privateKey);
    const ok = await freshRealAppLicenseCrypto.verify(licenseFile.payload, licenseFile.signature);
    assert.strictEqual(ok, true, 'the resulting global JWK must actually verify a real license end-to-end, via a fresh (uncached) copy of the real app module');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
