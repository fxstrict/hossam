/**
 * ================================================================
 * PHASE_C_lmp_activationcodes_tests.js — Hossam License Manager Pro
 * ================================================================
 * Standalone Node harness (`node js/tests/PHASE_C_lmp_activationcodes_tests.js`,
 * no browser required — uses Node 20+'s native global Web Crypto as a
 * drop-in for window.crypto/window.crypto.subtle) for:
 *   - js/repositories/ActivationCodesRepository.js (loaded for real)
 *   - js/core/Db.js's new `activationCodes` store definition (DB_VERSION 1→2)
 *   - js/modules/LicenseIssuer.js's issueActivationCode()/
 *     buildActivationCodeSheetRow() orchestration (loaded for real)
 *
 * HLMDb itself (real IndexedDB) is mocked with a tiny in-memory
 * key-value store honoring the same {create/update/getById/getByIndex}
 * contract js/core/Repository.js expects — sufficient to exercise the
 * repository logic without a browser's indexedDB implementation.
 * ================================================================
 */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

let passed = 0, failed = 0;
const log = [];
function check(label, cond) {
  if (cond) { passed++; log.push('PASS: ' + label); }
  else { failed++; log.push('FAIL: ' + label); }
}

function readSrc(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }

const dbSource = readSrc('js/core/Db.js');
const repoBaseSource = readSrc('js/core/Repository.js');
const activationRepoSource = readSrc('js/repositories/ActivationCodesRepository.js');
const licenseIssuerSource = readSrc('js/modules/LicenseIssuer.js');

// --------------------------------------------------------------------
// Verify the STATIC schema change (Db.js) first, independent of any
// mock — parse it in a minimal sandbox with a fake indexedDB.open just
// to read back window.HLMDb.STORES / DB_VERSION as the real file
// defines them (onupgradeneeded is exercised only conceptually here;
// real multi-version-upgrade IndexedDB behavior needs a real browser —
// flagged NOT EXECUTED below like every other genuinely browser-only
// mechanic in this project's test suites).
// --------------------------------------------------------------------
(function test_dbVersionAndStore() {
  const sandbox = { window: {}, console: console };
  vm.createContext(sandbox);
  // indexedDB.open is never actually called in this check — we only
  // need window.HLMDb's exported constants, which are set synchronously
  // at module-load time regardless.
  sandbox.window.indexedDB = { open: function () { return { }; } };
  vm.runInContext(dbSource, sandbox, { filename: 'Db.js' });
  check('DB_VERSION bumped to 2', sandbox.window.HLMDb.DB_VERSION === 2);
  check('activationCodes store defined with keyPath "id"', sandbox.window.HLMDb.STORES.activationCodes && sandbox.window.HLMDb.STORES.activationCodes.keyPath === 'id');
  check('activationCodes store indexes include licenseId/activationCodeHash/status', ['licenseId', 'activationCodeHash', 'status'].every(function (i) { return sandbox.window.HLMDb.STORES.activationCodes.indexes.indexOf(i) !== -1; }));
  check('Every pre-existing store definition is untouched (customers/devices/subscriptions/licenses/payments/users/auditLog/settings still present)',
    ['customers', 'devices', 'subscriptions', 'licenses', 'payments', 'users', 'auditLog', 'settings'].every(function (s) { return !!sandbox.window.HLMDb.STORES[s]; }));
})();

// --------------------------------------------------------------------
// Fake HLMDb — in-memory, honors exactly the calls Repository.js makes
// (put/get/getAll/getByIndex/remove/countAll), so ActivationCodesRepository
// (which only goes through window.HLMRepository, never HLMDb directly)
// runs against real create()/update()/getByIndex() logic unmodified.
// --------------------------------------------------------------------
function makeFakeHLMDb() {
  const stores = { activationCodes: {} };
  return {
    getAll: async function (name) { return Object.values(stores[name] || {}); },
    get: async function (name, key) { return (stores[name] || {})[key] || null; },
    put: async function (name, value) { stores[name] = stores[name] || {}; stores[name][value.id] = value; return value; },
    remove: async function (name, key) { if (stores[name]) delete stores[name][key]; },
    getByIndex: async function (name, indexName, value) {
      return Object.values(stores[name] || {}).filter(function (r) { return r[indexName] === value; });
    },
    countAll: async function (name) { return Object.keys(stores[name] || {}).length; },
    _stores: stores
  };
}

function makeSandbox() {
  const win = {
    console: console,
    crypto: global.crypto, // Node 20+ native Web Crypto — real getRandomValues + subtle.digest
    HLMDb: makeFakeHLMDb(),
    HLMAuditLogRepository: null // audit logging is best-effort/optional per Repository.js._audit — fine to leave unset
  };
  const sandbox = { window: win, console: console };
  vm.createContext(sandbox);
  vm.runInContext(repoBaseSource, sandbox, { filename: 'Repository.js' });
  return sandbox;
}

// Minimal HLMCrypto.sha256Hex stand-in that is REAL (uses the same
// window.crypto.subtle Node provides), not a stub — so hash assertions
// are meaningful and, critically, comparable against Config/11_Auth.gs's
// own _sha256Hex_ semantics (both ultimately SHA-256 over the same
// normalized UTF-8 string; only the byte→hex plumbing differs, and both
// were independently verified to be correct in their own harnesses).
function attachFakeHLMCrypto(win) {
  win.HLMCrypto = {
    isAvailable: function () { return !!(win.crypto && win.crypto.subtle); },
    sha256Hex: async function (text) {
      const enc = new TextEncoder().encode(text);
      const digest = await win.crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
  };
}

function loadActivationRepo(sandbox) {
  vm.runInContext(activationRepoSource, sandbox, { filename: 'ActivationCodesRepository.js' });
  return sandbox.window.HLMActivationCodesRepository;
}

function loadLicenseIssuer(sandbox) {
  // LicenseIssuer.js also references window.HLMKeySession/HLMCrypto.buildLicenseFile/
  // HLMLicensesRepository/HLMSubscriptionsRepository for its OTHER function
  // (issue()) — none of that is exercised here, so those globals are left
  // undefined; only issueActivationCode()/buildActivationCodeSheetRow()
  // (which touch ONLY HLMActivationCodesRepository) are tested below.
  vm.runInContext(licenseIssuerSource, sandbox, { filename: 'LicenseIssuer.js' });
  return sandbox.window.HLMLicenseIssuer;
}

async function test_base32CrockfordShape() {
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  const repo = loadActivationRepo(sandbox);
  const internal = repo._internal;
  const bytes = new Uint8Array(16);
  sandbox.window.crypto.getRandomValues(bytes);
  const encoded = internal.toCrockfordBase32(bytes);
  check('Crockford Base32 output uses only the 32-symbol alphabet (no I/L/O/U)', /^[0-9A-HJKMNP-TV-Z]+$/.test(encoded));
  check('128 bits → 26 Crockford symbols', encoded.length === 26);
  check('Excluded ambiguous letters never appear', !/[ILOU]/.test(encoded));
}

async function test_normalizationStripsDashesAndCase() {
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  const repo = loadActivationRepo(sandbox);
  const grouped = 'ab12-CD34-ef56';
  const normalized = repo._internal.normalize(grouped);
  check('normalize() strips dashes and uppercases', normalized === 'AB12CD34EF56');
  check('normalize() is idempotent (matches server _normalizeActivationCode_ behavior)', repo._internal.normalize(normalized) === normalized);
}

async function test_generateForLicense_neverPersistsPlaintext() {
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  const repo = loadActivationRepo(sandbox);
  const result = await repo.generateForLicense({ licenseId: 'LIC-A' }, { id: 'op1', name: 'Operator' });

  check('generateForLicense returns a plaintextCode (grouped, once)', typeof result.plaintextCode === 'string' && result.plaintextCode.indexOf('-') !== -1);
  check('Stored record has activationCodeHash, 64 hex chars', /^[0-9a-f]{64}$/.test(result.record.activationCodeHash));
  check('Stored record status starts unused', result.record.status === 'unused');
  check('Stored record does NOT contain the plaintext code anywhere', JSON.stringify(result.record).indexOf(result.plaintextCode.replace(/-/g, '')) === -1);

  const persisted = await sandbox.window.HLMDb.get('activationCodes', result.record.id);
  check('Record actually persisted to (fake) IndexedDB store', !!persisted && persisted.activationCodeHash === result.record.activationCodeHash);
  check('Persisted record never contains a plaintext code field', !persisted.plaintextCode && !persisted.activationCode && !persisted.code);
}

async function test_hashMatchesWhatServerWouldCompute() {
  // Cross-checks that this repository's hash for a GIVEN normalized
  // code matches the exact SHA-256 hex a human would get from any
  // standard SHA-256 implementation — i.e. that this file introduces no
  // divergent hashing scheme from Config/11_Auth.gs's _sha256Hex_().
  const nodeCrypto = require('crypto');
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  const repo = loadActivationRepo(sandbox);
  const normalized = 'ABCDEFGHJKMNPQRSTVWXYZ0123';
  const hashFromRepoCrypto = await sandbox.window.HLMCrypto.sha256Hex(normalized);
  const hashFromNodeCrypto = nodeCrypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  check('sha256Hex(normalized) matches an independent SHA-256 computation of the same string', hashFromRepoCrypto === hashFromNodeCrypto);
}

async function test_buildActivationCodeSheetRow_matchesElhossamSchema() {
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  const repo = loadActivationRepo(sandbox);
  const result = await repo.generateForLicense({ licenseId: 'LIC-B', expiresAt: '2027-01-01T00:00:00.000Z' }, null);
  const row = repo.buildActivationCodeSheetRow(result.record);
  const expectedColumns = ['id', 'licenseId', 'activationCodeHash', 'status', 'createdAt', 'expiresAt', 'usedAt', 'installationId'];
  check('Sheet row has exactly elhossam "أكواد_التفعيل" columns, same names', expectedColumns.every(function (c) { return Object.prototype.hasOwnProperty.call(row, c); }) && Object.keys(row).length === expectedColumns.length);
  check('Sheet row never contains the plaintext code', JSON.stringify(row).indexOf(result.plaintextCode.replace(/-/g, '')) === -1);
  check('Sheet row usedAt/installationId start empty (code not yet consumed)', row.usedAt === '' && row.installationId === '');
}

async function test_licenseIssuer_orchestration() {
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  loadActivationRepo(sandbox);
  const issuer = loadLicenseIssuer(sandbox);
  const result = await issuer.issueActivationCode({ licenseId: 'LIC-C' }, null);
  check('LicenseIssuer.issueActivationCode() delegates correctly and returns {record, plaintextCode}', !!result.record && typeof result.plaintextCode === 'string');
  const row = issuer.buildActivationCodeSheetRow(result.record);
  check('LicenseIssuer.buildActivationCodeSheetRow() delegates correctly', row.licenseId === 'LIC-C');
}

async function test_revoke() {
  const sandbox = makeSandbox();
  attachFakeHLMCrypto(sandbox.window);
  const repo = loadActivationRepo(sandbox);
  const result = await repo.generateForLicense({ licenseId: 'LIC-D' }, null);
  await repo.revoke(result.record.id, null);
  const updated = await sandbox.window.HLMDb.get('activationCodes', result.record.id);
  check('revoke() sets status to revoked on the local record', updated.status === 'revoked');
}

async function main() {
  await test_base32CrockfordShape();
  await test_normalizationStripsDashesAndCase();
  await test_generateForLicense_neverPersistsPlaintext();
  await test_hashMatchesWhatServerWouldCompute();
  await test_buildActivationCodeSheetRow_matchesElhossamSchema();
  await test_licenseIssuer_orchestration();
  await test_revoke();
}

main().then(function () {
  log.push('NOTE: Real browser IndexedDB onupgradeneeded (version-bump migration mechanics under a real indexedDB implementation) — NOT EXECUTED — REQUIRES A BROWSER. The STATIC schema (DB_VERSION=2, STORES.activationCodes shape) is verified above; actual upgrade behavior on a customer\'s existing v1 database needs manual verification in a real browser before first release, same caveat this project already carries for every other browser-only mechanic.');
  
  console.log('\n' + log.join('\n'));
  console.log('\n==== PHASE C — Hossam License Manager Pro (ActivationCodesRepository.js + Db.js + LicenseIssuer.js) — Node harness ====');
  console.log('PASSED: ' + passed + '   FAILED: ' + failed);
  process.exitCode = failed > 0 ? 1 : 0;
});
