/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/licenseModals.js
 * "تجديد الاشتراك" / "نقل جهاز" / "إلغاء ترخيص" quick-action modals,
 * per the spec (no need to run the full 7-step wizard for these).
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  function requireKeyOrWarn() {
    if (!window.HLMKeySession.isLoaded()) {
      window.HLMToast.error('يجب تحميل مفتاح التوقيع أولًا من صفحة الإعدادات');
      window.HLMRouter.navigate('/settings');
      return false;
    }
    return true;
  }

  async function openRenew(customer) {
    if (!requireKeyOrWarn()) return;
    var sub = await window.HLMSubscriptionsRepository.forCustomer(customer.id);
    var devices = await window.HLMDevicesRepository.forCustomer(customer.id);
    var activeDevice = devices.find(function (d) { return d.status === 'active'; }) || devices[0];
    var settings = window.HLM_DEFAULT_SETTINGS;

    if (!activeDevice) { window.HLMToast.error('لا يوجد جهاز نشط لهذا العميل — يجب إصدار ترخيص جديد أولًا'); return; }

    window.HLMModal.open({
      title: 'تجديد الاشتراك — ' + customer.officeName,
      body:
        '<div class="hlm-field"><label>مدة الاشتراك الجديدة</label><select id="hlmRenewType">' +
          settings.subscriptionTypes.map(function (t) { return '<option value="' + t.value + '"' + (sub && sub.type === t.value ? ' selected' : '') + '>' + t.label + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="hlm-field-hint">سيتم إصدار ترخيص جديد لنفس الجهاز (' + esc(activeDevice.machineId) + ') بنفس النسخة (' + esc(sub ? sub.edition : '—') + ').</div>',
      footer: '<button class="hlm-btn" id="hlmModalCancel">إلغاء</button><button class="hlm-btn hlm-btn--primary" id="hlmRenewConfirm">تجديد</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmRenewConfirm').addEventListener('click', async function () {
          var type = document.getElementById('hlmRenewType').value;
          var confirmBtn = this;
          confirmBtn.disabled = true; // PHASE C.1 — local in-flight guard, same rationale as licenseWizard.js
          try {
            var record = await window.HLMLicenseIssuer.issue({
              customerId: customer.id, deviceId: activeDevice.id, machineId: activeDevice.machineId,
              customerName: customer.officeName, customerPhone: customer.phone, customerEmail: customer.email,
              edition: sub ? sub.edition : 'Professional', type: type, modules: sub ? sub.modules : [],
              graceDays: sub ? sub.graceDays : settings.defaultGraceDays
            }, 'renewal', window.HLMAuth.currentUser());
            window.HLMToast.success('تم تجديد الاشتراك بنجاح');

            // PHASE C.1 — renewal produces a brand-new licenseId (issue()
            // never receives an existing one — see the forensic audit),
            // so it needs its own new activation code; the old license's
            // code must not be reused. Isolated try/catch: a failure
            // here must not be reported as a renewal failure, and must
            // not trigger another issue() call.
            var plaintextCode;
            try {
              var activationResult = await window.HLMLicenseIssuer.issueActivationCode({
                licenseId: record.licenseFile.payload.licenseId,
                customerId: customer.id
              }, window.HLMAuth.currentUser());
              plaintextCode = activationResult.plaintextCode;
            } catch (codeErr) {
              window.HLMToast.error('تم التجديد بنجاح، لكن تعذّر توليد كود التفعيل');
            }

            window.HLMModal.close();
            window.HLMLicenseResultModal.show(record, customer, plaintextCode);
          } catch (e) {
            window.HLMToast.error(e.message === 'key_not_loaded' ? 'يجب تحميل مفتاح التوقيع أولًا' : 'حدث خطأ أثناء التجديد');
          } finally {
            confirmBtn.disabled = false;
          }
        });
      }
    });
  }

  async function openTransfer(customer) {
    if (!requireKeyOrWarn()) return;
    var devices = await window.HLMDevicesRepository.forCustomer(customer.id);
    var activeDevice = devices.find(function (d) { return d.status === 'active'; });
    var sub = await window.HLMSubscriptionsRepository.forCustomer(customer.id);
    if (!activeDevice) { window.HLMToast.error('لا يوجد جهاز نشط حاليًا لنقله'); return; }

    window.HLMModal.open({
      title: 'نقل جهاز — ' + customer.officeName,
      body:
        '<div class="hlm-field-hint" style="margin-bottom:12px;">الجهاز الحالي: <b>' + esc(activeDevice.machineId) + '</b> سيُعطَّل تلقائيًا بعد النقل.</div>' +
        '<div class="hlm-field"><label>رقم الجهاز الجديد (Machine ID)</label><input type="text" id="hlmNewMachineId" placeholder="HSM-XXXX-XXXX-XXXX"></div>' +
        '<div id="hlmTransferError" class="hlm-field-error hlm-hidden"></div>',
      footer: '<button class="hlm-btn" id="hlmModalCancel">إلغاء</button><button class="hlm-btn hlm-btn--primary" id="hlmTransferConfirm">نقل وإصدار</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmTransferConfirm').addEventListener('click', async function () {
          var confirmBtn = this;
          var newId = document.getElementById('hlmNewMachineId').value.trim().toUpperCase();
          var errEl = document.getElementById('hlmTransferError');
          if (!window.HLMDevicesRepository.isValidMachineId(newId)) {
            errEl.textContent = 'صيغة رقم الجهاز غير صحيحة (المتوقع: HSM-XXXX-XXXX-XXXX)';
            errEl.classList.remove('hlm-hidden');
            return;
          }
          confirmBtn.disabled = true; // PHASE C.1 — local in-flight guard, set before any
                                       // async work in this handler (including the pre-existing
                                       // device transfer() call) so a duplicate click cannot
                                       // trigger a second transfer/issue/activation-code cycle
          var actor = window.HLMAuth.currentUser();
          var newDevice = await window.HLMDevicesRepository.transfer(activeDevice.id, newId, actor);
          try {
            var record = await window.HLMLicenseIssuer.issue({
              customerId: customer.id, deviceId: newDevice.id, machineId: newDevice.machineId,
              customerName: customer.officeName, customerPhone: customer.phone, customerEmail: customer.email,
              edition: sub ? sub.edition : 'Professional', type: sub ? sub.type : 'yearly', modules: sub ? sub.modules : [],
              graceDays: sub ? sub.graceDays : window.HLM_DEFAULT_SETTINGS.defaultGraceDays
            }, 'transfer', actor);
            window.HLMToast.success('تم نقل الجهاز وإصدار ترخيص جديد');

            // PHASE C.1 — transfer produces a brand-new licenseId (same
            // as renewal — see the forensic audit), so it needs its own
            // new activation code; the previous license's code must not
            // be reused. Isolated try/catch, same rationale as openRenew().
            var plaintextCode;
            try {
              var activationResult = await window.HLMLicenseIssuer.issueActivationCode({
                licenseId: record.licenseFile.payload.licenseId,
                customerId: customer.id
              }, actor);
              plaintextCode = activationResult.plaintextCode;
            } catch (codeErr) {
              window.HLMToast.error('تم النقل بنجاح، لكن تعذّر توليد كود التفعيل');
            }

            window.HLMModal.close();
            window.HLMLicenseResultModal.show(record, customer, plaintextCode);
          } catch (e) {
            window.HLMToast.error('حدث خطأ أثناء إصدار الترخيص الجديد');
          } finally {
            confirmBtn.disabled = false;
          }
        });
      }
    });
  }

  function openRevoke(licenseId, onDone) {
    window.HLMModal.open({
      title: 'إلغاء ترخيص',
      body:
        '<div class="hlm-field-hint" style="margin-bottom:12px;">هذا لا يعطّل النسخة عن بعد فورًا — لا يوجد سيرفر مركزي. سيتم وسم الترخيص كملغى هنا، وإنشاء الصف الجاهز للصقه في جدول جوجل شيتس "التراخيص" حسب طريقة العمل الحالية.</div>' +
        '<div class="hlm-field"><label>سبب الإلغاء</label><input type="text" id="hlmRevokeReason" placeholder="مثال: تأخر السداد"></div>',
      footer: '<button class="hlm-btn" id="hlmModalCancel">تراجع</button><button class="hlm-btn hlm-btn--danger" id="hlmRevokeConfirm">تأكيد الإلغاء</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmRevokeConfirm').addEventListener('click', async function () {
          var reason = document.getElementById('hlmRevokeReason').value.trim();
          var actor = window.HLMAuth.currentUser();
          var revoked = await window.HLMLicensesRepository.revoke(licenseId, reason, actor);
          var row = window.HLMLicensesRepository.buildRevokeSheetRow(revoked, reason);
          window.HLMModal.close();
          window.HLMModal.open({
            title: 'تم الإلغاء — الصف الجاهز لجدول جوجل شيتس',
            body: '<div class="hlm-license-file">' + esc(JSON.stringify(row, null, 2)) + '</div>' +
              '<div class="hlm-field-hint" style="margin-top:10px;">انسخ هذا الصف والصقه في تبويب "التراخيص" بجدول جوجل شيتس الخاص بالحسام لإكمال الإلغاء الفعلي، حسب كتالوج استخدام نظام الترخيص §7.</div>' +
              // PHASE F.2 — additive only: the manual copy-paste instruction
              // above is unchanged; this offers an EXPLICIT, separate,
              // optional automated alternative. Nothing here runs unless
              // the operator clicks it.
              '<div class="hlm-field-hint" style="margin-top:14px;">بديل اختياري: مزامنة هذا الإلغاء تلقائيًا مع سيرفر Apps Script الخاص بمكتبك (بدلًا من اللصق اليدوي).</div>',
            footer: '<button class="hlm-btn" id="hlmModalOk">تم — سألصق يدويًا</button>' +
              '<button class="hlm-btn hlm-btn--primary" id="hlmRemoteSyncBtn">مزامنة تلقائية (اختياري)</button>',
            onMount: function () {
              document.getElementById('hlmModalOk').addEventListener('click', window.HLMModal.close);
              document.getElementById('hlmRemoteSyncBtn').addEventListener('click', function () {
                _openRemoteSync_(revoked, 'revoked', reason);
              });
            }
          });
          if (onDone) onDone();
        });
      }
    });
  }

  /**
   * PHASE F.2 — Automated License Revocation Write Path.
   * Explicit, operator-initiated, additive alternative to the manual
   * copy-paste workflow above. Never runs automatically — only reachable
   * by clicking "مزامنة تلقائية" after the existing local
   * revoke/manual-row flow has already completed successfully.
   *
   * The office backend URL and the administrative secret are both taken
   * as plain form input for THIS call only: neither is written to
   * localStorage/IndexedDB/sessionStorage/`window`, and both are dropped
   * as soon as this function returns (F.2 mandate §20). This project has
   * no existing office/backend configuration store (verified in the F.2
   * audit), so per the mandate (§18/§19) the operator supplies the target
   * backend explicitly, every time, rather than this module inventing a
   * multi-office mapping store.
   *
   * @param {Object} licenseRecord  the just-revoked local LMP record
   * @param {'active'|'revoked'} status
   * @param {string} note
   */
  function _openRemoteSync_(licenseRecord, status, note) {
    window.HLMModal.open({
      title: 'مزامنة تلقائية — ' + licenseRecord.licenseId,
      body:
        '<div class="hlm-field-hint" style="margin-bottom:12px;">' +
          'سيتم تعديل حالة الترخيص <strong>' + esc(licenseRecord.licenseId) + '</strong> إلى ' +
          '<strong>' + (status === 'revoked' ? 'ملغى' : 'ساري') + '</strong> مباشرة على سيرفر Apps Script ' +
          'الذي تحدده أدناه. هذه عملية إدارية على السيرفر، وليست جزءًا من تفعيل أي جهاز عميل.' +
        '</div>' +
        '<div class="hlm-field"><label>رابط تطبيق ويب Apps Script للمكتب</label>' +
          '<input type="url" id="hlmRemoteUrl" placeholder="https://script.google.com/macros/s/.../exec"></div>' +
        '<div class="hlm-field"><label>المفتاح الإداري (لن يُحفظ بعد إغلاق هذه النافذة)</label>' +
          '<input type="password" id="hlmRemoteSecret" autocomplete="off"></div>' +
        '<div class="hlm-field-hint" id="hlmRemoteSyncStatus" style="margin-top:8px;"></div>',
      footer: '<button class="hlm-btn" id="hlmRemoteSyncCancel">تراجع</button>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmRemoteSyncConfirm">تنفيذ المزامنة</button>',
      onMount: function () {
        document.getElementById('hlmRemoteSyncCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmRemoteSyncConfirm').addEventListener('click', async function () {
          var confirmBtn = document.getElementById('hlmRemoteSyncConfirm');
          var statusEl = document.getElementById('hlmRemoteSyncStatus');
          var urlInput = document.getElementById('hlmRemoteUrl');
          var secretInput = document.getElementById('hlmRemoteSecret');
          var baseUrl = urlInput.value.trim();
          var adminSecret = secretInput.value; // held only in this local var, never elsewhere

          if (!baseUrl || !adminSecret) {
            statusEl.textContent = 'يرجى إدخال رابط السيرفر والمفتاح الإداري.';
            return;
          }

          confirmBtn.disabled = true;
          statusEl.textContent = 'جارٍ الاتصال بالسيرفر...';

          var payload = window.HLMLicensesRepository.buildLicenseStatusRequest(licenseRecord, status, note);
          var result = await window.HLMApiClient.setLicenseStatus(baseUrl, {
            licenseId: payload.licenseId,
            status: payload.status,
            note: payload.note,
            adminSecret: adminSecret
          });

          // Clear the secret input and the local reference immediately
          // after the call returns, regardless of outcome (F.2 mandate §20/§25).
          secretInput.value = '';
          adminSecret = null;

          if (result.networkError) {
            confirmBtn.disabled = false;
            statusEl.textContent = 'تعذّر الاتصال بالسيرفر (فشل شبكة أو مهلة). لم يتغيّر شيء على السيرفر بالضرورة — يمكنك المحاولة مجددًا، أو استخدام اللصق اليدوي كما هو معتاد.';
            return;
          }

          var data = result.data || {};
          if (data.success) {
            statusEl.textContent = data.idempotent
              ? 'تم التأكيد: الترخيص على السيرفر بالفعل بحالة "' + data.status + '".'
              : 'تم تحديث السيرفر بنجاح — الحالة الآن: "' + data.status + '".';
            confirmBtn.disabled = true;
            window.HLMToast.success('تمت مزامنة حالة الترخيص مع السيرفر');
          } else {
            confirmBtn.disabled = false;
            var errorMessages = {
              UNAUTHORIZED: 'المفتاح الإداري غير صحيح.',
              SERVER_NOT_CONFIGURED: 'السيرفر غير مُهيَّأ لهذه العملية بعد (لم يُضبَط المفتاح الإداري على الخادم).',
              MALFORMED_REQUEST: 'بيانات الطلب ناقصة.',
              INVALID_STATUS: 'قيمة الحالة غير مقبولة.',
              NOT_FOUND: 'لم يُعثر على هذا الترخيص في ورقة "التراخيص" على هذا السيرفر.',
              AMBIGUOUS_LICENSE_ID: 'يوجد أكثر من صف بنفس رقم الترخيص على السيرفر — لم يُغيَّر شيء، يلزم تصحيح الشيت يدويًا أولًا.',
              LOCK_TIMEOUT: 'السيرفر مشغول حاليًا، حاول مجددًا.',
              INTERNAL_ERROR: 'حدث خطأ داخلي على السيرفر.'
            };
            statusEl.textContent = errorMessages[data.errorCode] || ('فشلت العملية: ' + (data.errorCode || 'غير معروف'));
            window.HLMToast.error('فشلت المزامنة التلقائية — يمكنك استخدام اللصق اليدوي كما هو معتاد');
          }
        });
      }
    });
  }

  /**
   * PHASE F.3.2 — Installation Credential Recovery (Model 3).
   *
   * Wholly separate from openRevoke()/_openRemoteSync_() above: this
   * recovers a customer's SERVER-SIDE installation credential (Config/
   * 11_Auth.gs, "التثبيتات") — it has nothing to do with license status
   * ("التراخيص") and does not touch, call, or reuse F.2's revocation
   * secret/endpoint/UI in any way, per F.3.1's Invariant 10.
   *
   * @param {string} localDbId  the LMP-local license record id (same
   *   convention as data-revoke/data-download elsewhere in this file —
   *   the actual licenseId STRING is looked up from the record itself).
   */
  function openRecover(localDbId) {
    window.HLMModal.open({
      title: 'استرجاع بيانات اعتماد تثبيت',
      body:
        '<div class="hlm-field-hint" style="margin-bottom:12px;">' +
          'هذا يُصدر بيانات اعتماد تثبيت جديدة لعميل فقد بياناته المحلية ' +
          '(مثل مسح بيانات المتصفح بالكامل) على نفس الترخيص — ولا علاقة له ' +
          'بإلغاء أو تعديل حالة الترخيص نفسه. لا يُنشئ تثبيتًا جديدًا ولا ' +
          'يُغيّر ملف ".hsm" بأي شكل.' +
        '</div>' +
        '<div class="hlm-field"><label>رابط تطبيق ويب Apps Script للمكتب</label>' +
          '<input type="url" id="hlmRecoverUrl" placeholder="https://script.google.com/macros/s/.../exec"></div>' +
        '<div class="hlm-field"><label>معرّف الجهاز الحالي (machineId) كما يظهر للعميل الآن</label>' +
          '<input type="text" id="hlmRecoverMachineId" placeholder="HSM-XXXX-XXXX-XXXX"></div>' +
        '<div class="hlm-field"><label>مفتاح الاسترجاع الإداري (منفصل عن مفتاح إلغاء الترخيص، لن يُحفظ)</label>' +
          '<input type="password" id="hlmRecoverSecret" autocomplete="off"></div>' +
        '<div class="hlm-field-hint" id="hlmRecoverStatus" style="margin-top:8px;"></div>',
      footer: '<button class="hlm-btn" id="hlmRecoverCancel">تراجع</button>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmRecoverConfirm">تنفيذ الاسترجاع</button>',
      onMount: function () {
        document.getElementById('hlmRecoverCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmRecoverConfirm').addEventListener('click', async function () {
          var confirmBtn = document.getElementById('hlmRecoverConfirm');
          var statusEl = document.getElementById('hlmRecoverStatus');
          var baseUrl = document.getElementById('hlmRecoverUrl').value.trim();
          var machineId = document.getElementById('hlmRecoverMachineId').value.trim();
          var secretInput = document.getElementById('hlmRecoverSecret');
          var recoveryAuth = secretInput.value; // held only in this local var

          if (!baseUrl || !machineId || !recoveryAuth) {
            statusEl.textContent = 'يرجى تعبئة رابط السيرفر ومعرّف الجهاز ومفتاح الاسترجاع.';
            return;
          }

          var lic;
          try {
            lic = await window.HLMLicensesRepository.getById(localDbId);
          } catch (e) {
            statusEl.textContent = 'تعذّر قراءة سجل الترخيص محليًا.';
            return;
          }
          if (!lic || !lic.licenseId) {
            statusEl.textContent = 'سجل الترخيص غير موجود.';
            return;
          }

          confirmBtn.disabled = true;
          statusEl.textContent = 'جارٍ الاتصال بالسيرفر...';

          var requestId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);

          var result = await window.HLMApiClient.recoverInstallationCredential(baseUrl, {
            licenseId: lic.licenseId,
            machineId: machineId,
            recoveryAuth: recoveryAuth,
            requestId: requestId
          });

          // Clear the secret immediately after the call returns, regardless
          // of outcome — mirrors the exact discipline used in
          // _openRemoteSync_() above (F.2 mandate §20/§25, applied here
          // identically for the new, separate recovery secret).
          secretInput.value = '';
          recoveryAuth = null;

          if (result.networkError) {
            confirmBtn.disabled = false;
            statusEl.textContent = 'تعذّر الاتصال بالسيرفر (فشل شبكة أو مهلة). لم يتغيّر شيء على السيرفر بالضرورة — يمكنك المحاولة مجددًا.';
            return;
          }

          var data = result.data || {};
          if (data.success) {
            confirmBtn.disabled = true;
            statusEl.innerHTML =
              '<div style="margin-bottom:6px;">تم الاسترجاع بنجاح. سلّم بيانات الاعتماد التالية للعميل ليُدخلها فى التطبيق (لن تظهر مرة أخرى):</div>' +
              '<div class="hlm-license-file">installationId: ' + esc(data.installationId) + '\ncredential: ' + esc(data.credential) + '</div>';
            window.HLMToast.success('تم استرجاع بيانات اعتماد التثبيت');
          } else {
            confirmBtn.disabled = false;
            var errorMessages = {
              UNAUTHORIZED: 'مفتاح الاسترجاع غير صحيح.',
              SERVER_NOT_CONFIGURED: 'السيرفر غير مُهيَّأ لهذه العملية بعد (لم يُضبَط مفتاح الاسترجاع على الخادم).',
              MALFORMED_REQUEST: 'بيانات الطلب ناقصة.',
              NOT_FOUND: 'لم يُعثر على تثبيت مرتبط بهذا الترخيص على هذا السيرفر.',
              AMBIGUOUS_LICENSE_ID: 'يوجد أكثر من تثبيت بنفس رقم الترخيص على السيرفر — لم يتغيّر شيء، يلزم تصحيح البيانات يدويًا أولًا.',
              INSTALLATION_REVOKED: 'هذا التثبيت مُلغى — لا يمكن استرجاعه.',
              LICENSE_REVOKED: 'هذا الترخيص مُلغى أو مُنقول — لا يمكن استرجاع تثبيت مرتبط به.',
              LOCK_TIMEOUT: 'السيرفر مشغول حاليًا، حاول مجددًا.',
              UNKNOWN_ERROR: 'حدث خطأ داخلي على السيرفر.'
            };
            statusEl.textContent = errorMessages[data.status] || ('فشلت العملية: ' + (data.status || 'غير معروف'));
            window.HLMToast.error('فشل استرجاع بيانات اعتماد التثبيت');
          }
        });
      }
    });
  }

  /**
   * PHASE F.4-PREP-IMPL-A — Activation-Code Backfill (LMP UI wiring only).
   *
   * Generates a NEW activation code for an EXISTING, already-issued
   * license via the exact same generation pipeline used everywhere else
   * in this file (window.HLMLicenseIssuer.issueActivationCode() /
   * buildActivationCodeSheetRow() — see LicenseIssuer.js /
   * ActivationCodesRepository.js). This does NOT call issue(): no new
   * license/.hsm file is produced, no ECDSA signing happens, and the
   * existing license's licenseId/edition/expiry/etc. are all left
   * untouched — only a fresh Activation Code row is created for it.
   *
   * This does NOT touch Apps Script and does NOT determine whether an
   * installation row already exists for this license on the server —
   * see the confirmation copy below (recovery-first rule, per the
   * F.4-PREP forensic design report). That determination remains an
   * operator procedure for this phase, same as F.3.2's openRecover()
   * above being the correct tool when a prior installation is known.
   *
   * @param {string} localDbId  the LMP-local license record id, same
   *   convention as data-revoke/data-recover/data-download elsewhere in
   *   this file — the actual licenseId STRING is read from the record
   *   itself, never typed manually by the operator.
   */
  function openBackfillActivationCode(localDbId) {
    window.HLMModal.open({
      title: 'إنشاء كود تفعيل جديد لهذه الرخصة',
      body:
        '<div class="hlm-field-hint" style="margin-bottom:12px;">' +
          'هذا الإجراء مخصص لإعادة تسجيل تثبيت لرخصة موجودة بعد التأكد ' +
          'أولًا من عدم وجود سجل تثبيت لها. إذا كان للرخصة سجل تثبيت ' +
          'موجود، استخدم "استرجاع تثبيت" بدلًا من إنشاء كود جديد — ' +
          'تسجيل كود جديد على تثبيت له سجل بالفعل قد يُنشئ سجل تثبيت ' +
          'مكرر على السيرفر.' +
        '</div>' +
        '<div id="hlmBackfillCodeError" class="hlm-field-error hlm-hidden"></div>',
      footer: '<button class="hlm-btn" id="hlmBackfillCancel">تراجع</button>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmBackfillConfirm">تأكيد — إنشاء كود جديد</button>',
      onMount: function () {
        document.getElementById('hlmBackfillCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmBackfillConfirm').addEventListener('click', async function () {
          var confirmBtn = this;
          var errEl = document.getElementById('hlmBackfillCodeError');
          confirmBtn.disabled = true; // PHASE F.4-PREP-IMPL-A — same in-flight/double-click
                                       // guard convention as openRenew()/openTransfer() above:
                                       // set before any async work in this handler.
          var lic;
          try {
            lic = await window.HLMLicensesRepository.getById(localDbId);
          } catch (e) {
            lic = null;
          }
          // Identity safety (F.4-PREP-IMPL-A §8): the source of truth is
          // the existing license record only — no manual licenseId entry.
          // Nothing is generated and nothing is persisted if it's missing.
          if (!lic || !lic.licenseId) {
            errEl.textContent = 'تعذّر العثور على معرّف الترخيص لهذا السجل — لم يتم إنشاء أي كود.';
            errEl.classList.remove('hlm-hidden');
            confirmBtn.disabled = false;
            return;
          }
          try {
            var actor = window.HLMAuth.currentUser();
            var activationResult = await window.HLMLicenseIssuer.issueActivationCode({
              licenseId: lic.licenseId,
              customerId: lic.customerId
            }, actor);
            var row = window.HLMLicenseIssuer.buildActivationCodeSheetRow(activationResult.record);
            window.HLMModal.close();
            _showBackfillActivationCodeResult_(lic.licenseId, activationResult.plaintextCode, row);
          } catch (e) {
            errEl.textContent = 'حدث خطأ أثناء إنشاء كود التفعيل.';
            errEl.classList.remove('hlm-hidden');
            confirmBtn.disabled = false;
          }
        });
      }
    });
  }

  /** Displays the freshly generated backfill code + the existing
   *  buildActivationCodeSheetRow() row, using the exact same
   *  manual-transfer copy/paste pattern as openRevoke()'s result step
   *  above (this tool has no server — see ActivationCodesRepository.js). */
  function _showBackfillActivationCodeResult_(licenseId, plaintextCode, row) {
    window.HLMModal.open({
      title: 'كود تفعيل جديد — ' + licenseId,
      body:
        '<div class="hlm-field" style="margin-bottom:16px;padding:12px;border:1px dashed #999;border-radius:8px;">' +
          '<label style="font-weight:800;">كود التفعيل</label>' +
          '<div id="hlmBackfillCodeValue" style="font-family:monospace;font-size:15px;font-weight:800;letter-spacing:1px;margin:6px 0;">' + esc(plaintextCode) + '</div>' +
        '</div>' +
        '<div class="hlm-license-file">' + esc(JSON.stringify(row, null, 2)) + '</div>' +
        '<div class="hlm-field-hint" style="margin-top:10px;">انسخ هذا الصف والصقه في تبويب "أكواد_التفعيل" بجدول جوجل شيتس الخاص بالحسام لإكمال العملية، حسب طريقة العمل الحالية.</div>',
      footer: '<button class="hlm-btn" id="hlmBackfillCopyCode">نسخ كود التفعيل</button>' +
        '<button class="hlm-btn" id="hlmBackfillCopyRow">نسخ الصف</button>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmBackfillDone">تم</button>',
      onMount: function () {
        document.getElementById('hlmBackfillDone').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmBackfillCopyCode').addEventListener('click', function () {
          navigator.clipboard.writeText(plaintextCode).then(function () {
            window.HLMToast.success('تم نسخ كود التفعيل');
          }).catch(function () { window.HLMToast.error('تعذّر نسخ كود التفعيل'); });
        });
        document.getElementById('hlmBackfillCopyRow').addEventListener('click', function () {
          // PHASE G.4 — was navigator.clipboard.writeText(JSON.stringify(row)),
          // which copies one JSON-blob string. Google Sheets only splits
          // pasted clipboard text into separate columns when the values are
          // separated by literal Tab characters — a JSON string has none,
          // so the whole blob always landed in a single cell and
          // activationCodeHash never reached its own column, making every
          // registerInstallation() lookup against "أكواد_التفعيل" fail with
          // INVALID_ACTIVATION even when the operator pasted exactly as
          // instructed. Field order below is pinned explicitly to match
          // ACTIVATION_CODES_HEADERS in elhossam/Config/11_Auth.gs — see
          // ActivationCodesRepository.js buildActivationCodeSheetRow() for
          // the authoritative source of these eight field names, which is
          // left completely unchanged by this fix.
          var ACTIVATION_ROW_FIELD_ORDER = ['id', 'licenseId', 'activationCodeHash', 'status', 'createdAt', 'expiresAt', 'usedAt', 'installationId'];
          var tsvRow = ACTIVATION_ROW_FIELD_ORDER.map(function (fieldName) {
            var v = row[fieldName];
            return (v === undefined || v === null) ? '' : String(v);
          }).join('\t');
          navigator.clipboard.writeText(tsvRow).then(function () {
            window.HLMToast.success('تم نسخ الصف');
          }).catch(function () { window.HLMToast.error('تعذّر نسخ الصف'); });
        });
      }
    });
  }

  window.HLMLicenseModals = { openRenew: openRenew, openTransfer: openTransfer, openRevoke: openRevoke, openRecover: openRecover, openBackfillActivationCode: openBackfillActivationCode };
})(typeof window !== 'undefined' ? window : globalThis);
