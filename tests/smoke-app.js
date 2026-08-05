/**
 * End-to-end UI smoke test. Loads the REAL index.html + all real script
 * files in jsdom (not re-implemented stubs), polyfills IndexedDB and
 * Web Crypto, and drives the actual DOM the way a user/browser would:
 * clicking buttons, filling inputs, dispatching events.
 *
 * Run: node tests/smoke-app.js
 */
'use strict';
const path = require('path');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('crypto');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

let passed = 0, failed = 0;
function assertTrue(cond, msg) {
  if (!cond) throw new Error('assertion failed: ' + msg);
}
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
/** Polls until predicate(window) is truthy or times out. */
async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < (timeoutMs || 3000)) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error('waitFor timed out: ' + label);
}

function setInputValue(win, selector, value) {
  const el = win.document.querySelector(selector);
  if (!el) throw new Error('input not found: ' + selector);
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

function click(win, selector) {
  const el = win.document.querySelector(selector);
  if (!el) throw new Error('element not found to click: ' + selector);
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

(async () => {
  console.log('=== End-to-end UI smoke test (real index.html in jsdom) ===');

  let dom, win, doc;

  await check('boots index.html, opens IndexedDB, shows first-run signup screen', async () => {
    dom = await JSDOM.fromFile(INDEX, {
      resources: 'usable',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        // Polyfill IndexedDB + Web Crypto BEFORE any app script runs.
        const FDBFactory = require('fake-indexeddb/lib/FDBFactory').default || require('fake-indexeddb/lib/FDBFactory');
        window.indexedDB = new FDBFactory();
        Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
        // jsdom's URL.createObjectURL/revokeObjectURL are unimplemented; stub them.
        window.URL.createObjectURL = () => 'blob:stub';
        window.URL.revokeObjectURL = () => {};
        window.navigator.clipboard = { writeText: async () => {} };
      }
    });
    win = dom.window;
    doc = win.document;
    win.HLMTestErrors = [];
    win.addEventListener('error', (ev) => { win.HLMTestErrors.push(ev.error ? (ev.error.stack || ev.error.message) : ev.message); });

    await waitFor(() => doc.getElementById('hlmFirstRunForm'), 4000, 'first-run form');
    assertTrue(doc.querySelector('.hlm-login-card'), 'login card should be visible');
  });

  await check('first-run signup creates Super Admin and boots the shell', async () => {
    setInputValue(win, '#hlmSetupName', 'مدير النظام');
    setInputValue(win, '#hlmSetupUsername', 'admin');
    setInputValue(win, '#hlmSetupPassword', 'S3curePass123');
    click(win, '#hlmFirstRunForm button[type="submit"]');
    await waitFor(() => doc.getElementById('hlmSidebar'), 4000, 'app shell sidebar');
    assertTrue(doc.querySelector('.hlm-nav__link[data-path="/dashboard"]'), 'dashboard nav link present');
  });

  await check('dashboard renders stat cards with zero customers', async () => {
    await waitFor(() => doc.querySelectorAll('.hlm-stat').length > 0, 3000, 'dashboard stats');
    const firstStat = doc.querySelector('.hlm-stat .hlm-stat__value');
    assertTrue(firstStat.textContent.trim() === '0', 'total customers should start at 0, got ' + firstStat.textContent);
  });

  await check('Settings screen: importing a generated private key loads the session-only KeySession', async () => {
    win.location.hash = '#/settings';
    await waitFor(() => doc.getElementById('hlmKeyCard') && doc.getElementById('hlmPrivateKeyPem'), 3000, 'settings key card');

    const pair = await win.HLMCrypto.generateKeyPair();
    setInputValue(win, '#hlmPrivateKeyPem', pair.privateKeyPem);
    click(win, '#hlmImportKeyBtn');
    await waitFor(() => win.HLMKeySession.isLoaded(), 3000, 'key session loaded');
    assertTrue(doc.querySelector('#hlmKeyCard .hlm-badge--success'), 'should show "loaded for this session" badge');
  });

  await check('Settings screen: "توليد مفتاح جديد" tab offers working download buttons for BOTH the private and public key files', async () => {
    // Clear the session key first so the generate/import tabs render again
    // instead of the "already loaded" state.
    win.HLMKeySession.clear();
    win.location.hash = '#/dashboard';
    win.location.hash = '#/settings';
    await waitFor(() => doc.getElementById('hlmKeyTabs'), 3000, 'key tabs visible again after clearing session');

    click(win, '#hlmKeyTabs .hlm-tab[data-tab="generate"]');
    await waitFor(() => doc.getElementById('hlmGenerateKeyBtn'), 2000, 'generate tab body');

    // Spy on downloadBlob to capture exactly what each button downloads,
    // without needing real browser file-save plumbing.
    const captured = [];
    const originalDownload = win.HLMReportsEngine.downloadBlob;
    win.HLMReportsEngine.downloadBlob = (content, filename, mime) => { captured.push({ content, filename, mime }); };

    click(win, '#hlmGenerateKeyBtn');
    await waitFor(() => doc.getElementById('hlmDownloadPrivateBtn') && doc.getElementById('hlmDownloadPublicJsBtn'), 3000, 'both download buttons appear after generating');

    click(win, '#hlmDownloadPrivateBtn');
    click(win, '#hlmDownloadPublicJsBtn');

    win.HLMReportsEngine.downloadBlob = originalDownload; // restore

    assertTrue(captured.length === 2, 'expected exactly two downloads to have been triggered, got ' + captured.length);

    const privateDownload = captured.find((c) => c.filename === 'private-key.pem');
    assertTrue(!!privateDownload, 'private-key.pem download button must exist and work');
    assertTrue(privateDownload.content.includes('BEGIN PRIVATE KEY'), 'private key download must contain real PEM content');

    const publicDownload = captured.find((c) => c.filename === 'license-public-key.js');
    assertTrue(!!publicDownload, 'license-public-key.js download button must exist and work');
    assertTrue(publicDownload.content.includes('HOSSAM_LICENSE_PUBLIC_KEY_JWK'), 'public key file must define the exact global the real app reads');
    assertTrue(publicDownload.content.includes('"kty": "EC"'), 'public key file must contain the actual JWK data');
  });

  let customerId;
  await check('Customers screen: create a new customer via the real modal form', async () => {
    win.location.hash = '#/customers';
    await waitFor(() => doc.getElementById('hlmAddCustomerBtn'), 3000, 'customers screen');
    click(win, '#hlmAddCustomerBtn');
    await waitFor(() => doc.getElementById('hlmField_officeName'), 2000, 'customer form modal');

    setInputValue(win, '#hlmField_officeName', 'مكتب الاختبار للمحاماة');
    setInputValue(win, '#hlmField_lawyerName', 'المستشار تجريبي');
    setInputValue(win, '#hlmField_phone', '01099998888');
    setInputValue(win, '#hlmField_governorate', 'القاهرة');
    click(win, '#hlmModalSave');

    await waitFor(() => !doc.getElementById('hlmActiveModal'), 2000, 'modal closed after save');
    await waitFor(() => doc.querySelectorAll('#hlmCustomerListBody tr[data-id]').length === 1, 3000, 'customer row appears in list');
    customerId = doc.querySelector('#hlmCustomerListBody tr[data-id]').getAttribute('data-id');
    assertTrue(!!customerId, 'captured the new customer id');
  });

  await check('Customer detail: office tab shows the data we entered, tabs switch correctly', async () => {
    win.location.hash = '#/customers/' + customerId;
    await waitFor(() => doc.getElementById('hlmCustomerTabBody') && doc.getElementById('hlmCustomerTabBody').textContent.includes('مكتب الاختبار'), 3000, 'office tab content');

    click(win, '.hlm-tab[data-tab="devices"]');
    await waitFor(() => doc.querySelector('.hlm-tab[data-tab="devices"]').classList.contains('is-active'), 2000, 'devices tab active');
    await waitFor(() => !doc.getElementById('hlmCustomerTabBody').querySelector('.hlm-skeleton'), 2000, 'devices tab finished loading');
    assertTrue(doc.getElementById('hlmCustomerTabBody').textContent.includes('لا توجد أجهزة'), 'no devices yet, expected empty state');
  });

  let issuedLicenseId;
  await check('Full 7-step license wizard: new device -> Enterprise -> yearly -> modules -> users -> generate', async () => {
    win.location.hash = '#/licenses/new/' + customerId;
    await waitFor(() => doc.getElementById('hlmWizardBody') && doc.getElementById('hlmWizCustList'), 3000, 'wizard step 1');
    assertTrue(doc.getElementById('hlmWizardBody').textContent.includes('مكتب الاختبار'), 'step 1 should preselect our customer');

    click(win, '#hlmWizardNext'); // -> step 2 (device)
    await waitFor(() => doc.getElementById('hlmWizNewDeviceToggle'), 2000, 'step 2 device');
    click(win, '#hlmWizNewDeviceToggle');
    await waitFor(() => !doc.getElementById('hlmWizNewDeviceField').classList.contains('hlm-hidden'), 1000, 'new device field visible');
    setInputValue(win, '#hlmWizNewMachineId', 'HSM-1A2B-3C4D-5E6F');

    click(win, '#hlmWizardNext'); // -> step 3 (edition)
    await waitFor(() => doc.querySelector('input[name="hlmWizEdition"]'), 2000, 'step 3 edition');
    const enterpriseRadio = Array.from(doc.querySelectorAll('input[name="hlmWizEdition"]')).find((r) => r.value === 'Enterprise');
    enterpriseRadio.checked = true;
    enterpriseRadio.dispatchEvent(new win.Event('change', { bubbles: true }));

    click(win, '#hlmWizardNext'); // -> step 4 (duration)
    await waitFor(() => doc.querySelector('input[name="hlmWizType"]'), 2000, 'step 4 duration');
    const yearlyRadio = Array.from(doc.querySelectorAll('input[name="hlmWizType"]')).find((r) => r.value === 'yearly');
    yearlyRadio.checked = true;
    yearlyRadio.dispatchEvent(new win.Event('change', { bubbles: true }));

    click(win, '#hlmWizardNext'); // -> step 5 (modules)
    await waitFor(() => doc.querySelector('input[name="hlmWizModule"]'), 2000, 'step 5 modules');
    const aiModule = Array.from(doc.querySelectorAll('input[name="hlmWizModule"]')).find((cb) => cb.value === 'AI');
    aiModule.checked = true;
    aiModule.dispatchEvent(new win.Event('change', { bubbles: true }));

    click(win, '#hlmWizardNext'); // -> step 6 (users)
    await waitFor(() => doc.querySelector('input[name="hlmWizUsers"]'), 2000, 'step 6 users');
    const tenUsers = Array.from(doc.querySelectorAll('input[name="hlmWizUsers"]')).find((r) => r.value === '10');
    tenUsers.checked = true;
    tenUsers.dispatchEvent(new win.Event('change', { bubbles: true }));

    click(win, '#hlmWizardNext'); // -> step 7 (review)
    await waitFor(() => doc.getElementById('hlmWizardBody').textContent.includes('Enterprise'), 2000, 'step 7 review shows Enterprise');
    assertTrue(doc.getElementById('hlmWizardBody').textContent.includes('HSM-1A2B-3C4D-5E6F'), 'review shows new machine id');

    click(win, '#hlmWizardNext'); // generate
    await waitFor(() => doc.getElementById('hlmActiveModal') && doc.getElementById('hlmActiveModal').textContent.includes('تم إصدار الترخيص'), 4000, 'license result modal');
    assertTrue(win.HLMTestErrors.length === 0, 'no uncaught JS errors during wizard: ' + win.HLMTestErrors.join(' | '));

    const licenseIdEl = doc.querySelector('#hlmActiveModal .hlm-field div[style*="font-weight:800"]');
    issuedLicenseId = licenseIdEl ? licenseIdEl.textContent.trim() : null;
    assertTrue(issuedLicenseId && issuedLicenseId.startsWith('HSM-LIC-'), 'captured issued license id, got ' + issuedLicenseId);
    assertTrue(doc.getElementById('hlmActiveModal').querySelector('svg'), 'QR code SVG rendered in result modal');
    win.HLMModal.close();
  });

  await check('license now appears in customer subscription + licenses tabs, and in the global /licenses screen', async () => {
    win.location.hash = '#/customers/' + customerId;
    await waitFor(() => doc.getElementById('hlmCustomerTabBody'), 2000, 'customer detail reloaded');
    click(win, '.hlm-tab[data-tab="subscription"]');
    await waitFor(() => doc.getElementById('hlmCustomerTabBody').textContent.includes('Enterprise'), 2000, 'subscription tab shows Enterprise');

    click(win, '.hlm-tab[data-tab="licenses"]');
    await waitFor(() => doc.getElementById('hlmCustomerTabBody').textContent.includes(issuedLicenseId), 2000, 'licenses tab lists issued license');

    win.location.hash = '#/licenses';
    await waitFor(() => doc.body.textContent.includes(issuedLicenseId), 3000, 'global licenses screen lists it too');
  });

  await check('global search finds the customer by the new Machine ID', async () => {
    win.location.hash = '#/dashboard';
    await waitFor(() => doc.getElementById('hlmGlobalSearch'), 2000, 'dashboard with topbar search');
    setInputValue(win, '#hlmGlobalSearch', 'HSM-1A2B-3C4D-5E6F');
    await waitFor(() => {
      const panel = doc.getElementById('hlmSearchResults');
      return panel && !panel.classList.contains('hlm-hidden') && panel.textContent.includes('مكتب الاختبار');
    }, 2000, 'search results show the customer');
  });

  await check('renew flow: issues a second license for the same device via the quick modal', async () => {
    win.location.hash = '#/customers/' + customerId;
    await waitFor(() => doc.getElementById('hlmRenewBtn'), 3000, 'renew button visible for license_manager/super_admin');
    click(win, '#hlmRenewBtn');
    await waitFor(() => doc.getElementById('hlmRenewConfirm'), 2000, 'renew modal open');
    click(win, '#hlmRenewConfirm');
    await waitFor(() => doc.getElementById('hlmActiveModal') && doc.getElementById('hlmActiveModal').textContent.includes('تم إصدار الترخيص'), 4000, 'renewed license result modal');
    win.HLMModal.close();

    win.location.hash = '#/customers/' + customerId;
    await waitFor(() => doc.getElementById('hlmCustomerTabBody'), 2000, 'reloaded after renew');
    click(win, '.hlm-tab[data-tab="licenses"]');
    await waitFor(() => doc.querySelectorAll('#hlmCustomerTabBody tbody tr').length === 2, 3000, 'now two licenses in history');
  });

  await check('transfer flow: deactivates old device, activates new one, issues a third license', async () => {
    win.location.hash = '#/customers/' + customerId;
    await waitFor(() => doc.getElementById('hlmTransferBtn'), 3000, 'transfer button visible');
    click(win, '#hlmTransferBtn');
    await waitFor(() => doc.getElementById('hlmNewMachineId'), 2000, 'transfer modal open');
    setInputValue(win, '#hlmNewMachineId', 'HSM-9999-8888-7777');
    click(win, '#hlmTransferConfirm');
    await waitFor(() => doc.getElementById('hlmActiveModal') && doc.getElementById('hlmActiveModal').textContent.includes('تم إصدار الترخيص'), 4000, 'transfer license result modal');
    win.HLMModal.close();

    win.location.hash = '#/customers/' + customerId;
    await waitFor(() => doc.getElementById('hlmCustomerTabBody'), 2000, 'reloaded after transfer');
    click(win, '.hlm-tab[data-tab="devices"]');
    await waitFor(() => doc.querySelectorAll('#hlmCustomerTabBody tbody tr').length === 2, 3000, 'now two devices: old inactive + new active');
    const rows = Array.from(doc.querySelectorAll('#hlmCustomerTabBody tbody tr'));
    const activeCount = rows.filter((r) => r.textContent.includes('نشط') && !r.textContent.includes('غير نشط')).length;
    assertTrue(activeCount === 1, 'exactly one device should be active after transfer, got ' + activeCount);
  });

  await check('XSS regression: an office name containing HTML/script does not execute and renders as literal text in modal titles', async () => {
    win.location.hash = '#/customers';
    await waitFor(() => doc.getElementById('hlmAddCustomerBtn'), 3000, 'customers screen');
    click(win, '#hlmAddCustomerBtn');
    await waitFor(() => doc.getElementById('hlmField_officeName'), 2000, 'customer form modal');

    const maliciousName = '<img src=x onerror="window.HLMXSSFired=true">مكتب شرير';
    setInputValue(win, '#hlmField_officeName', maliciousName);
    setInputValue(win, '#hlmField_phone', '01000000000');
    click(win, '#hlmModalSave');
    await waitFor(() => !doc.getElementById('hlmActiveModal'), 2000, 'modal closed after save');

    const rows = Array.from(doc.querySelectorAll('#hlmCustomerListBody tr[data-id]'));
    const xssCustomerId = rows[0].getAttribute('data-id'); // list is sorted newest-first
    win.location.hash = '#/customers/' + xssCustomerId;
    await waitFor(() => doc.getElementById('hlmRenewBtn') || doc.getElementById('hlmCustomerActions'), 3000, 'customer detail with malicious name loaded');

    // openRenew() has no active device, so it just toasts an error and
    // never opens a modal — that alone proves nothing about escaping.
    // Use the payment modal instead, which always opens and interpolates
    // customer.officeName directly into its title.
    click(win, '.hlm-tab[data-tab="payments"]');
    await waitFor(() => doc.getElementById('hlmAddPaymentBtn'), 2000, 'payments tab loaded');
    click(win, '#hlmAddPaymentBtn');
    await waitFor(() => doc.getElementById('hlmActiveModal'), 2000, 'payment modal opened');

    assertTrue(win.HLMXSSFired !== true, 'onerror handler must NOT have executed — title was not properly escaped');
    const titleEl = doc.querySelector('#hlmActiveModal .hlm-modal__header h3');
    assertTrue(titleEl.querySelector('img') === null, 'the <img> tag must render as inert text, not a real DOM element');
    assertTrue(titleEl.textContent.includes('مكتب شرير'), 'the literal office name text should still be visible in the title');
    win.HLMModal.close();
  });

  await check('RBAC: logout returns to the (non-first-run) login screen; login re-enters the app', async () => {
    click(win, '#hlmLogoutBtn');
    await sleep(50);
    // logout triggers a full page reload in the real app; jsdom won't
    // actually reload, so drive the same effect explicitly here.
    win.HLMAuth.logout();
    await win.HLMLoginScreen.render();
    await waitFor(() => doc.getElementById('hlmLoginForm'), 3000, 'ordinary login form (not first-run) after a user exists');

    setInputValue(win, '#hlmUsername', 'admin');
    setInputValue(win, '#hlmPassword', 'S3curePass123');
    click(win, '#hlmLoginForm button[type="submit"]');
    await waitFor(() => doc.getElementById('hlmSidebar'), 3000, 'back in the app shell after login');
  });

  await check('no uncaught JS errors occurred anywhere during the whole session', async () => {
    assertTrue(win.HLMTestErrors.length === 0, 'errors: ' + win.HLMTestErrors.join(' | '));
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
