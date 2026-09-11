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

  window.HLMLicenseModals = { openRenew: openRenew, openTransfer: openTransfer, openRevoke: openRevoke };
})(typeof window !== 'undefined' ? window : globalThis);
