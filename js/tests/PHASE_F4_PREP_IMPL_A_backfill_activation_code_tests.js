/**
 * PHASE F.4-PREP-IMPL-A — Real browser orchestration tests for
 * licenseModals.js's new openBackfillActivationCode() (LMP UI wiring
 * for generating a fresh Activation Code for an already-issued
 * license). Real Chrome via Playwright, real DOM, real button
 * .disabled semantics — same convention as
 * PHASE_C1_wizard_modals_flow_tests.js.
 *
 * The real, unmodified production licenseModals.js is loaded; only the
 * HLMLicensesRepository/HLMLicenseIssuer boundary is scripted (see
 * fixtures/phase_f4_prep_impl_a_backfill_code/index.html) so success/
 * failure/missing-licenseId scenarios are deterministic. The
 * orchestration logic itself (openBackfillActivationCode(), added by
 * this phase) is 100% real, unmodified code.
 */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const PORT = 8077;
const ROOT = path.join(__dirname, 'fixtures', 'phase_f4_prep_impl_a_backfill_code');
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
    // Test A — Existing generation pipeline reused, success path
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => window.__openBackfill('rec-1'));
      check('A: confirmation modal opens (recovery-first warning shown before generation)', await page.evaluate(() => window.__isConfirmationModalOpen()));

      await page.evaluate(() => window.__clickConfirmAndWait());
      const spy = await page.evaluate(() => window.__spy.calls);

      check('A: license looked up by the LMP-local id (not a manually typed licenseId)', spy['licensesRepository.getById'][0][0] === 'rec-1');
      check('A: issueActivationCode() called exactly once', (spy.issueActivationCode || []).length === 1);
      check('A: issueActivationCode() called with the license\'s existing licenseId', spy.issueActivationCode[0][0].licenseId === 'HSM-LIC-EXISTING-1');
      check('A: issueActivationCode() called with the license\'s existing customerId', spy.issueActivationCode[0][0].customerId === 'cust-1');
      check('A: buildActivationCodeSheetRow() called exactly once, reusing the existing builder', (spy.buildActivationCodeSheetRow || []).length === 1);
      check('A: buildActivationCodeSheetRow() called with the record issueActivationCode() returned', spy.buildActivationCodeSheetRow[0][0].licenseId === 'HSM-LIC-EXISTING-1');

      const codeText = await page.evaluate(() => window.__resultCodeText());
      check('A: generated plaintext code is displayed to the operator', codeText === 'PLAINTEXT-CODE-FOR-HSM-LIC-EXISTING-1-1');
      const rowText = await page.evaluate(() => window.__resultRowText());
      check('A: Sheet row (from the existing builder) is displayed for copy/paste', !!rowText && rowText.indexOf('HSM-LIC-EXISTING-1') !== -1);
      check('A: displayed row never contains the plaintext code', rowText.indexOf('PLAINTEXT-CODE-FOR') === -1);

      await page.evaluate(() => window.__clickCopyCode());
      await page.evaluate(() => window.__clickCopyRow());
      const clip = await page.evaluate(() => window.__spy.calls['clipboard.writeText']);
      check('A: copy-code button copies the plaintext code', clip[0][0] === 'PLAINTEXT-CODE-FOR-HSM-LIC-EXISTING-1-1');
      check('A: copy-row button copies the Sheet row JSON', clip[1][0].indexOf('HSM-LIC-EXISTING-1') !== -1);

      await page.evaluate(() => window.__clickDone());
      await page.close();
    }

    // ================================================================
    // Test B — Missing licenseId: no generation, no mutation
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__licenseLookup = 'missing-licenseId'; window.__openBackfill('rec-2'); });
      await page.evaluate(() => window.__clickConfirmAndWait());
      const spy = await page.evaluate(() => window.__spy.calls);

      check('B: issueActivationCode() is NEVER called when the selected license has no licenseId', !spy.issueActivationCode);
      check('B: an existing-style error is shown to the operator', await page.evaluate(() => window.__isErrorShown()));
      check('B: confirmation modal remains open (no silent close) so the operator sees the error', await page.evaluate(() => window.__isConfirmationModalOpen()));
      await page.close();
    }

    // ================================================================
    // Test B2 — License record not found at all: same guard
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__licenseLookup = 'not-found'; window.__openBackfill('rec-404'); });
      await page.evaluate(() => window.__clickConfirmAndWait());
      const spy = await page.evaluate(() => window.__spy.calls);
      check('B2: issueActivationCode() is NEVER called when the license record cannot be found', !spy.issueActivationCode);
      check('B2: an existing-style error is shown to the operator', await page.evaluate(() => window.__isErrorShown()));
      await page.close();
    }

    // ================================================================
    // Test D — Explicit operator confirmation: cancel means no generation
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__licenseLookup = 'has-licenseId'; window.__openBackfill('rec-1'); });
      await page.evaluate(() => window.__clickCancel());
      await new Promise(r => setTimeout(r, 30));
      const spy = await page.evaluate(() => window.__spy.calls);
      check('D: cancelling the confirmation dialog never calls issueActivationCode()', !spy.issueActivationCode);
      check('D: cancelling closes the confirmation modal', !(await page.evaluate(() => window.__isConfirmationModalOpen())));
      await page.close();
    }

    // ================================================================
    // Test E1 — Generation pipeline failure surfaces an error, no partial state
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__licenseLookup = 'has-licenseId'; window.__codeBehavior = 'fail'; window.__openBackfill('rec-1'); });
      await page.evaluate(() => window.__clickConfirmAndWait());
      check('E1: a generation failure shows an existing-style error to the operator', await page.evaluate(() => window.__isErrorShown()));
      const spy = await page.evaluate(() => window.__spy.calls);
      check('E1: buildActivationCodeSheetRow() is never called if generation itself failed', !spy.buildActivationCodeSheetRow);
      await page.close();
    }

    // ================================================================
    // Test 9 — Duplicate generation / double-click safety
    // ================================================================
    {
      const page = await freshPage(browser);
      await page.evaluate(() => { window.__licenseLookup = 'has-licenseId'; window.__codeBehavior = 'success'; window.__openBackfill('rec-1'); });
      const disabledRightAfterFirstClick = await page.evaluate(() => window.__clickConfirmTwiceRapidly());
      const spy = await page.evaluate(() => window.__spy.calls);
      check('9: confirm button is disabled immediately after the first click (before the async call resolves)', disabledRightAfterFirstClick === true);
      check('9: a rapid second click while disabled does not generate a second activation code', (spy.issueActivationCode || []).length === 1);
      await page.close();
    }

  } finally {
    if (browser) await browser.close();
    serverProc.kill();
  }

  console.log('\n' + log.join('\n'));
  console.log('\n==== PHASE F.4-PREP-IMPL-A — Hossam License Manager Pro (licenseModals.js openBackfillActivationCode()) — Playwright harness ====');
  console.log('PASSED: ' + passed + '   FAILED: ' + failed);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
