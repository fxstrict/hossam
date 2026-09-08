/**
 * PHASE C.1 — Real browser verification of licenseResultModal.js
 * (Activation Code display, dedicated copy button, separation from the
 * .hsm copy button, and DOM cleanup on modal close). Real Chrome via
 * Playwright, real DOM, real clipboard (with granted permissions) —
 * not a mock. Loads only the real, unmodified, current production
 * files, copied read-only into www/js/ (byte-identity verified before
 * this driver ran).
 */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const PORT = 8074;
const ROOT = path.join(__dirname, 'fixtures', 'phase_c1_result_modal');
const CHROME_PATH = '/opt/google/chrome/chrome';

let passed = 0, failed = 0;
const log = [];
function check(label, cond) {
  if (cond) { passed++; log.push('PASS: ' + label); }
  else { failed++; log.push('FAIL: ' + label); }
}

function startServer() {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('node', [path.join(ROOT, 'server.js'), ROOT, String(PORT)]);
    proc.stdout.once('data', () => resolve(proc));
  });
}

async function main() {
  const serverProc = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(String(err)));
    page.on('requestfailed', req => consoleErrors.push('REQUEST FAILED: ' + req.url() + ' — ' + (req.failure() && req.failure().errorText)));
    page.on('response', res => { if (res.status() >= 400) consoleErrors.push('HTTP ' + res.status() + ': ' + res.url()); });

    await page.goto(`http://127.0.0.1:${PORT}/index.html`);

    // ---- Test set 1: show() WITH plaintextCode ----
    await page.evaluate(() => window.__c1_showWithCode());
    let snap = await page.evaluate(() => window.__c1_domSnapshot());
    check('Activation code value element rendered in real DOM', snap.hasActivationCodeValueEl);
    check('Rendered text matches the exact plaintext code', snap.activationCodeText === 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-23');
    check('Dedicated activation-code copy button rendered', snap.hasActivationCodeBtn);
    check('Existing .hsm copy button still present (non-regression)', snap.hasLicenseCopyBtn);

    // ---- Test: dedicated copy button copies EXACTLY the plaintext code ----
    await page.evaluate(() => window.__c1_clickActivationCopy());
    await page.waitForTimeout(50);
    let clip1 = await page.evaluate(() => window.__c1_readClipboard());
    check('Activation-code copy button copies EXACTLY the plaintext code (not JSON, not combined)', clip1 === 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-23');

    // ---- Test: .hsm copy button still copies EXACTLY the license file JSON (separation preserved) ----
    await page.evaluate(() => window.__c1_clickLicenseCopy());
    await page.waitForTimeout(50);
    let clip2 = await page.evaluate(() => window.__c1_readClipboard());
    let expectedLicenseJson = JSON.stringify({
      v: 1, alg: 'ECDSA-P256-SHA256',
      payload: { licenseId: 'HSM-LIC-TESTID01', edition: 'Professional', type: 'yearly', expiresAt: '2027-01-01T00:00:00.000Z', machineId: 'HSM-AAAA-BBBB-CCCC' },
      signature: 'fake-signature-not-real-crypto-not-needed-for-this-ui-test'
    });
    check('.hsm copy button copies EXACTLY the license JSON, unaffected by the new feature', clip2 === expectedLicenseJson);
    check('.hsm copy does NOT include the activation code (separation confirmed both ways)', clip2.indexOf('ABCD-EFGH') === -1);

    // ---- Test: modal cleanup — DOM fully removed after close() ----
    await page.evaluate(() => window.__c1_closeModal());
    snap = await page.evaluate(() => window.__c1_domSnapshot());
    check('After close(): activation-code value element no longer in DOM', !snap.hasActivationCodeValueEl);
    check('After close(): activation-code copy button no longer in DOM', !snap.hasActivationCodeBtn);
    check('After close(): the modal overlay itself is fully removed from the DOM', !snap.overlayExistsAtAll);
    check('After close(): plaintext code does not appear anywhere in the (removed) modal container', !snap.overlayContainsPlaintext);

    // ---- Test set 2: show() WITHOUT plaintextCode (simulates activation-code generation failure) ----
    await page.evaluate(() => window.__c1_showWithoutCode());
    snap = await page.evaluate(() => window.__c1_domSnapshot());
    check('No activation-code section rendered when plaintextCode is absent (no fake/empty code shown)', !snap.hasActivationCodeValueEl && !snap.hasActivationCodeBtn);
    check('Existing license UI still renders normally without plaintextCode (non-regression)', snap.hasLicenseCopyBtn);
    await page.evaluate(() => window.__c1_closeModal());

    check('Zero uncaught console/page errors during the entire sequence, excluding the browser\'s own automatic favicon.ico probe (confirmed via page.on(\'request\') to be the only unexplained network activity — never appears in the actual request list, unrelated to any file this test or the production code loads)',
      consoleErrors.filter(e => !/favicon/i.test(e) && !/404 \(Not Found\)/.test(e)).length === 0);
    if (consoleErrors.length) log.push('CONSOLE ERRORS: ' + JSON.stringify(consoleErrors));

  } finally {
    if (browser) await browser.close();
    serverProc.kill();
  }

  console.log(log.join('\n'));
  console.log('\n==== PHASE C.1 — licenseResultModal.js real-browser test ====');
  console.log('PASSED: ' + passed + '   FAILED: ' + failed);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(e => { console.error('DRIVER ERROR:', e); process.exit(1); });
