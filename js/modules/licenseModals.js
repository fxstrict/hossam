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
          try {
            var record = await window.HLMLicenseIssuer.issue({
              customerId: customer.id, deviceId: activeDevice.id, machineId: activeDevice.machineId,
              customerName: customer.officeName, customerPhone: customer.phone, customerEmail: customer.email,
              edition: sub ? sub.edition : 'Professional', type: type, modules: sub ? sub.modules : [],
              graceDays: sub ? sub.graceDays : settings.defaultGraceDays
            }, 'renewal', window.HLMAuth.currentUser());
            window.HLMToast.success('تم تجديد الاشتراك بنجاح');
            window.HLMModal.close();
            window.HLMLicenseResultModal.show(record, customer);
          } catch (e) {
            window.HLMToast.error(e.message === 'key_not_loaded' ? 'يجب تحميل مفتاح التوقيع أولًا' : 'حدث خطأ أثناء التجديد');
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
          var newId = document.getElementById('hlmNewMachineId').value.trim().toUpperCase();
          var errEl = document.getElementById('hlmTransferError');
          if (!window.HLMDevicesRepository.isValidMachineId(newId)) {
            errEl.textContent = 'صيغة رقم الجهاز غير صحيحة (المتوقع: HSM-XXXX-XXXX-XXXX)';
            errEl.classList.remove('hlm-hidden');
            return;
          }
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
            window.HLMModal.close();
            window.HLMLicenseResultModal.show(record, customer);
          } catch (e) {
            window.HLMToast.error('حدث خطأ أثناء إصدار الترخيص الجديد');
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
              '<div class="hlm-field-hint" style="margin-top:10px;">انسخ هذا الصف والصقه في تبويب "التراخيص" بجدول جوجل شيتس الخاص بالحسام لإكمال الإلغاء الفعلي، حسب كتالوج استخدام نظام الترخيص §7.</div>',
            footer: '<button class="hlm-btn hlm-btn--primary" id="hlmModalOk">تم</button>',
            onMount: function () { document.getElementById('hlmModalOk').addEventListener('click', window.HLMModal.close); }
          });
          if (onDone) onDone();
        });
      }
    });
  }

  window.HLMLicenseModals = { openRenew: openRenew, openTransfer: openTransfer, openRevoke: openRevoke };
})(typeof window !== 'undefined' ? window : globalThis);
