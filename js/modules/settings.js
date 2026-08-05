/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/settings.js
 * Route /settings (super_admin only).
 *
 * "مفتاح التوقيع" section: loads the ECDSA private key for THIS BROWSER
 * SESSION ONLY (js/core/KeySession.js) — never written to storage. The
 * operator either pastes the existing tools/license-generator private
 * key PEM (to keep issuing under the same key already embedded in every
 * customer's installed app), or generates a brand-new key pair (which
 * then requires updating js/license/license-public-key.js in نظام
 * الحسام itself and re-issuing for existing customers — a deliberate,
 * visible choice, not a silent one).
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  // Holds { privateKeyPem, publicKeyJwk } for a few seconds right after
  // "توليد مفتاح جديد" succeeds, so the very next re-render (triggered by
  // window.HLMKeySession.set() below) can show the two download buttons
  // as part of the SAME "loaded" render — instead of writing them into a
  // separate DOM node that render is about to replace. There is only ever
  // one settings screen instance on screen at a time, so a module-level
  // variable is safe here.
  var pendingGeneratedPair = null;

  async function render(container) {
    var appSettings = Object.assign({}, window.HLM_DEFAULT_SETTINGS, await window.HLMSettingsRepository.getAllAsMap());

    container.innerHTML =
      '<div class="hlm-page-header"><h1>الإعدادات</h1></div>' +

      '<div class="hlm-card" id="hlmKeyCard"></div>' +

      '<div class="hlm-card">' +
        '<div class="hlm-card__title">بيانات المكتب الافتراضية</div>' +
        '<div class="hlm-form-grid">' +
          '<div class="hlm-field"><label>اسم المكتب</label><input type="text" id="hlmSetOfficeName" value="' + esc(appSettings.officeName) + '"></div>' +
          '<div class="hlm-field"><label>فترة السماح الافتراضية (أيام)</label><input type="number" id="hlmSetGraceDays" value="' + appSettings.defaultGraceDays + '"></div>' +
        '</div>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmSaveGeneralBtn">حفظ</button>' +
      '</div>';

    document.getElementById('hlmSaveGeneralBtn').addEventListener('click', async function () {
      await window.HLMSettingsRepository.set('officeName', document.getElementById('hlmSetOfficeName').value.trim());
      await window.HLMSettingsRepository.set('defaultGraceDays', parseInt(document.getElementById('hlmSetGraceDays').value, 10) || 15);
      window.HLM_DEFAULT_SETTINGS.officeName = document.getElementById('hlmSetOfficeName').value.trim();
      window.HLM_DEFAULT_SETTINGS.defaultGraceDays = parseInt(document.getElementById('hlmSetGraceDays').value, 10) || 15;
      window.HLMToast.success('تم حفظ الإعدادات');
    });

    pendingGeneratedPair = null;
    drawKeyCard();
    var offKeySessionListener = window.HLMBus.on('keysession:changed', drawKeyCard);

    // Unsubscribe when navigating away, so repeated visits to /settings
    // don't stack up duplicate listeners on the shared event bus.
    return function cleanup() {
      offKeySessionListener();
    };
  }

  function buildPublicKeyJsFile(jwk) {
    var dateStr = new Date().toISOString().slice(0, 10);
    return (
      '/**\n' +
      ' * PUBLIC key only — آمن تمامًا أن يُنشر مع التطبيق، لا يمكن به توقيع تراخيص.\n' +
      ' * تم توليده تلقائيًا من Hossam License Manager Pro بتاريخ ' + dateStr + '.\n' +
      ' *\n' +
      ' * طريقة التركيب: استبدل به الملف القديم بنفس هذا الاسم بالضبط في مشروع\n' +
      ' * الحسام على المسار: js/license/license-public-key.js\n' +
      ' * (لا حاجة لتعديل أي محتوى يدويًا — هذا الملف جاهز للاستخدام كما هو).\n' +
      ' */\n' +
      '(typeof window !== \'undefined\' ? window : globalThis).HOSSAM_LICENSE_PUBLIC_KEY_JWK = ' +
      JSON.stringify(jwk, null, 2) + ';\n'
    );
  }

  function downloadButtonsHtml() {
    return (
      '<div class="hlm-field" style="margin-top:14px;">' +
        '<label>الخطوة 1 — المفتاح الخاص (نسخة احتياطية، احفظها في مكان آمن الآن)</label>' +
        '<button class="hlm-btn hlm-btn--primary hlm-btn--block" id="hlmDownloadPrivateBtn">⬇ تنزيل private-key.pem</button>' +
        '<div class="hlm-field-hint">هذا الملف سرّي بالكامل — لا ترسله أو تشاركه مع أحد. لن تتمكن من رؤيته مرة أخرى بعد إغلاق هذه الصفحة.</div>' +
      '</div>' +
      '<div class="hlm-field">' +
        '<label>الخطوة 2 — المفتاح العام (ملف جاهز للتركيب مباشرة في مشروع الحسام)</label>' +
        '<button class="hlm-btn hlm-btn--primary hlm-btn--block" id="hlmDownloadPublicJsBtn">⬇ تنزيل license-public-key.js</button>' +
        '<div class="hlm-field-hint">استبدل به الملف الموجود على المسار <code>js/license/license-public-key.js</code> في مشروع الحسام مباشرة — بدون أي نسخ أو تعديل يدوي.</div>' +
      '</div>'
    );
  }

  function drawKeyCard() {
    var card = document.getElementById('hlmKeyCard');
    if (!card) return;
    var loaded = window.HLMKeySession.isLoaded();
    var showDownloads = loaded && pendingGeneratedPair;

    card.innerHTML =
      '<div class="hlm-card__title">مفتاح التوقيع (Private Key)</div>' +
      (loaded
        ? '<div class="hlm-badge hlm-badge--success" style="margin-bottom:12px;">محمّل لهذه الجلسة فقط ✓ (منذ ' + new Date(window.HLMKeySession.getLoadedAt()).toLocaleTimeString('ar-EG') + ')</div>' +
          '<p class="hlm-field-hint">لن يُحفظ هذا المفتاح أبدًا على أي قرص — سيُطلب منك إعادة إدخاله عند إغلاق المتصفح أو تحديث الصفحة، حماية للمفتاح الخاص بالتوقيع.</p>' +
          (showDownloads ? downloadButtonsHtml() : '') +
          '<button class="hlm-btn hlm-btn--danger hlm-btn--sm" id="hlmClearKeyBtn" style="margin-top:14px;">إخلاء المفتاح من الذاكرة الآن</button>'
        : '<div class="hlm-badge hlm-badge--warning" style="margin-bottom:12px;">لم يتم تحميل مفتاح توقيع بعد — لا يمكن إصدار أي ترخيص</div>' +
          '<div class="hlm-tabs" id="hlmKeyTabs">' +
            '<div class="hlm-tab is-active" data-tab="import">استخدام المفتاح الحالي</div>' +
            '<div class="hlm-tab" data-tab="generate">توليد مفتاح جديد</div>' +
          '</div>' +
          '<div id="hlmKeyTabBody"></div>');

    if (loaded) {
      document.getElementById('hlmClearKeyBtn').addEventListener('click', function () {
        pendingGeneratedPair = null;
        window.HLMKeySession.clear();
        window.HLMToast.info('تم إخلاء المفتاح من الذاكرة');
      });
      if (showDownloads) {
        var pairRef = pendingGeneratedPair;
        document.getElementById('hlmDownloadPrivateBtn').addEventListener('click', function () {
          window.HLMReportsEngine.downloadBlob(pairRef.privateKeyPem, 'private-key.pem', 'application/x-pem-file');
        });
        document.getElementById('hlmDownloadPublicJsBtn').addEventListener('click', function () {
          window.HLMReportsEngine.downloadBlob(buildPublicKeyJsFile(pairRef.publicKeyJwk), 'license-public-key.js', 'text/javascript;charset=utf-8');
        });
      }
      return;
    }

    showImportTab();
    document.querySelectorAll('#hlmKeyTabs .hlm-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#hlmKeyTabs .hlm-tab').forEach(function (x) { x.classList.remove('is-active'); });
        t.classList.add('is-active');
        if (t.getAttribute('data-tab') === 'import') showImportTab(); else showGenerateTab();
      });
    });
  }

  function showImportTab() {
    document.getElementById('hlmKeyTabBody').innerHTML =
      '<p class="hlm-field-hint">الصق محتوى ملف <code>tools/license-generator/keys/private-key.pem</code> الموجود بمشروع الحسام الأساسي. لن يُرسل أو يُخزَّن — يُستخدم فقط في متصفحك لتوقيع التراخيص.</p>' +
      '<div class="hlm-field"><textarea id="hlmPrivateKeyPem" rows="7" placeholder="-----BEGIN PRIVATE KEY-----..."></textarea></div>' +
      '<button class="hlm-btn hlm-btn--primary" id="hlmImportKeyBtn">تحميل المفتاح لهذه الجلسة</button>' +
      '<div id="hlmKeyError" class="hlm-field-error hlm-hidden" style="margin-top:8px;"></div>';
    document.getElementById('hlmImportKeyBtn').addEventListener('click', async function () {
      var pem = document.getElementById('hlmPrivateKeyPem').value.trim();
      var errEl = document.getElementById('hlmKeyError');
      try {
        var key = await window.HLMCrypto.importPrivateKeyPem(pem);
        pendingGeneratedPair = null; // imported keys have no "just generated" downloads to show
        window.HLMKeySession.set(key, null);
        window.HLMToast.success('تم تحميل المفتاح بنجاح لهذه الجلسة');
      } catch (e) {
        errEl.textContent = 'تعذّر قراءة المفتاح — تأكد من نسخ الملف كاملًا بصيغة PEM صحيحة';
        errEl.classList.remove('hlm-hidden');
      }
    });
  }

  function showGenerateTab() {
    document.getElementById('hlmKeyTabBody').innerHTML =
      '<p class="hlm-field-hint">⚠ توليد مفتاح جديد يعني أن التراخيص الجديدة لن تعمل إلا بعد استبدال ملف ' +
      '<code>js/license/license-public-key.js</code> داخل مشروع الحسام بالملف الجاهز الذي سيُنزَّل لك فور التوليد، ثم إعادة نشر المشروع. لا تفعل هذا إلا إذا كنت تنوي ذلك فعلًا.</p>' +
      '<button class="hlm-btn hlm-btn--danger" id="hlmGenerateKeyBtn">توليد زوج مفاتيح جديد الآن</button>';
    document.getElementById('hlmGenerateKeyBtn').addEventListener('click', async function () {
      var pair = await window.HLMCrypto.generateKeyPair();
      // Set this BEFORE calling HLMKeySession.set(): that call fires
      // 'keysession:changed' synchronously, which re-runs drawKeyCard()
      // immediately and switches the card to its "loaded" state — so the
      // download buttons must already be ready to be included in that
      // very same render, not written afterward into a node that render
      // just replaced.
      pendingGeneratedPair = { privateKeyPem: pair.privateKeyPem, publicKeyJwk: pair.publicKeyJwk };
      window.HLMKeySession.set(pair.privateKey, pair.publicKeyJwk);
      window.HLMToast.success('تم توليد المفتاح — نزّل نسختيه الآن أدناه');
    });
  }

  window.HLMSettingsScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
