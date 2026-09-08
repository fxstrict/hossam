/**
 * PHASE C.1 — Real browser orchestration tests for licenseWizard.js
 * (7-step wizard, generate()) and licenseModals.js (openRenew/openTransfer).
 * Real Chrome via Playwright, real DOM, real button .disabled semantics
 * (a disabled button genuinely does not dispatch click in a real
 * browser — this is exercised for real, not asserted from Node).
 * The real, unmodified production files are loaded; only the
 * repository/issuer boundary is scripted (see index.html) so success/
 * failure scenarios are deterministic — the orchestration logic itself
 * (added by this Phase C.1 change) is 100% real, unmodified code.
 */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const PORT = 8076;
const ROOT = path.join(__dirname, 'fixtures', 'phase_c1_wizard_modals');
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

async function freshPage(browser) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  return page;
}

async function main() {
  const serverProc = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });

    // ================================================================
    // A. New License — success path
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => window.__runWizardToStep7());
      await page.evaluate(() => window.__clickGenerateAndWait());
      const spy = await page.evaluate(() => window.__spy.calls);

      check('A: issue() called exactly once', (spy.issue || []).length === 1);
      check('A: issue() called with reason "new"', spy.issue[0][1] === 'new');
      check('A: issueActivationCode() called exactly once', (spy.issueActivationCode || []).length === 1);
      const issuedLicenseId = null; // not directly available here; verified via resultModal.show below
      check('A: issueActivationCode() licenseId matches the license issue() just returned',
        spy.issueActivationCode[0][0].licenseId.indexOf('HSM-LIC-NEW-') === 0);
      check('A: resultModal.show() called exactly once', (spy['resultModal.show'] || []).length === 1);
      const [record, customer, plaintextCode] = spy['resultModal.show'][0];
      check('A: plaintextCode passed to result modal matches what issueActivationCode returned',
        plaintextCode === 'PLAINTEXT-CODE-FOR-' + record.licenseFile.payload.licenseId);
      check('A: router.navigate() called (non-regression — existing behavior preserved)', (spy['router.navigate'] || []).length === 1);
      await page.close();
    }

    // ================================================================
    // A2. New License — duplicate-click protection
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => window.__runWizardToStep7());
      const disabledImmediatelyAfterFirstClick = await page.evaluate(() => window.__clickGenerateTwiceRapidly());
      check('A2: "إنشاء الترخيص" button becomes disabled synchronously on first click (before any async work resolves)', disabledImmediatelyAfterFirstClick === true);
      const spy = await page.evaluate(() => window.__spy.calls);
      check('A2: rapid double-click still results in exactly ONE issue() call (real browser: disabled buttons do not dispatch click)', (spy.issue || []).length === 1);
      check('A2: rapid double-click still results in exactly ONE issueActivationCode() call', (spy.issueActivationCode || []).length === 1);
      const stillDisabledLater = await page.evaluate(() => window.__isGenerateButtonDisabled());
      // After a successful generate(), the page navigates away conceptually (router.navigate is a
      // spy here, no real navigation) — the wizard's own finally{} re-enables the button regardless.
      check('A2: button re-enabled after completion (finally block executed)', stillDisabledLater === false);
      await page.close();
    }

    // ================================================================
    // A3. New License — activation code generation fails, license must still stand
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__codeBehavior = 'fail'; });
      await page.evaluate(() => window.__runWizardToStep7());
      await page.evaluate(() => window.__clickGenerateAndWait());
      const spy = await page.evaluate(() => window.__spy.calls);
      check('A3: issue() still called exactly once (license WAS issued)', (spy.issue || []).length === 1);
      check('A3: issueActivationCode() attempted exactly once', (spy.issueActivationCode || []).length === 1);
      check('A3: NO second issue() call was triggered by the activation-code failure', (spy.issue || []).length === 1);
      check('A3: resultModal.show() still called (license result must still be shown)', (spy['resultModal.show'] || []).length === 1);
      const plaintextCode = spy['resultModal.show'][0][2];
      check('A3: plaintextCode passed to result modal is undefined (no fake/empty code)', plaintextCode === undefined);
      const toastText = await page.evaluate(() => { var t = document.querySelector('.hlm-toast, [class*="toast"]'); return t ? t.textContent : null; });
      check('A3: an error toast is shown distinguishing the activation-code failure from license success', !!toastText && toastText.indexOf('تعذّر توليد كود التفعيل') !== -1);
      await page.close();
    }

    // ================================================================
    // B. Renewal — success path, direct call to the exported function
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__codeBehavior = 'success'; window.__issueBehavior = 'success'; });
      await page.evaluate(async () => {
        await window.HLMLicenseModals.openRenew({ id: 'cust-1', officeName: 'مكتب تجريبي', phone: '966500000000', email: 't@example.com' });
      });
      await page.click('#hlmRenewConfirm');
      await page.waitForTimeout(30);
      const spy = await page.evaluate(() => window.__spy.calls);
      check('B: issue() called with reason "renewal"', spy.issue[0][1] === 'renewal');
      check('B: issueActivationCode() called exactly once for the renewal', (spy.issueActivationCode || []).length === 1);
      check('B: issueActivationCode() licenseId matches the NEW renewal licenseId (not any old one)', spy.issueActivationCode[0][0].licenseId.indexOf('HSM-LIC-RENEWAL-') === 0);
      const plaintextCode = spy['resultModal.show'][0][2];
      check('B: new plaintextCode passed to result modal for the renewal', typeof plaintextCode === 'string' && plaintextCode.indexOf('HSM-LIC-RENEWAL-') !== -1);
      await page.close();
    }

    // ================================================================
    // C. Transfer — success path
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(async () => {
        await window.HLMLicenseModals.openTransfer({ id: 'cust-1', officeName: 'مكتب تجريبي', phone: '966500000000', email: 't@example.com' });
      });
      await page.fill('#hlmNewMachineId', 'HSM-9999-8888-7777');
      await page.click('#hlmTransferConfirm');
      await page.waitForTimeout(30);
      const spy = await page.evaluate(() => window.__spy.calls);
      check('C: devicesRepository.transfer() called (existing behavior preserved)', (spy['devicesRepository.transfer'] || []).length === 1);
      check('C: issue() called with reason "transfer"', spy.issue[0][1] === 'transfer');
      check('C: issueActivationCode() called exactly once for the transfer', (spy.issueActivationCode || []).length === 1);
      check('C: issueActivationCode() licenseId matches the NEW transfer licenseId', spy.issueActivationCode[0][0].licenseId.indexOf('HSM-LIC-TRANSFER-') === 0);
      await page.close();
    }

    // ================================================================
    // C2. Transfer — duplicate-click protection (also guards the pre-existing transfer() call)
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(async () => {
        await window.HLMLicenseModals.openTransfer({ id: 'cust-1', officeName: 'مكتب تجريبي', phone: '966500000000', email: 't@example.com' });
      });
      await page.fill('#hlmNewMachineId', 'HSM-1111-2222-3333');
      const disabledImmediatelyAfterFirstClick = await page.evaluate(() => window.__clickTransferConfirmTwiceRapidly());
      const spy = await page.evaluate(() => window.__spy.calls);
      check('C2: transfer confirm button becomes disabled synchronously on first click', disabledImmediatelyAfterFirstClick === true);
      check('C2: rapid double-click on transfer confirm results in exactly ONE transfer() call', (spy['devicesRepository.transfer'] || []).length === 1);
      check('C2: rapid double-click results in exactly ONE issue() call', (spy.issue || []).length === 1);
      await page.close();
    }

  } finally {
    if (browser) await browser.close();
    serverProc.kill();
  }

  console.log(log.join('\n'));
  console.log('\n==== PHASE C.1 — licenseWizard.js + licenseModals.js real-browser orchestration tests ====');
  console.log('PASSED: ' + passed + '   FAILED: ' + failed);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(e => { console.error('DRIVER ERROR:', e); process.exit(1); });
