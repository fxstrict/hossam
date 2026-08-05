/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/backup.js
 * Route /backup (super_admin only). Exports/imports every store as one
 * JSON snapshot. Note: user passwords export only as their salted
 * PBKDF2 hash (never plaintext) — restoring a backup restores hashed
 * credentials, not recoverable passwords, consistent with the Security
 * Engineering Standard.
 */
(function (window) {
  'use strict';

  async function render(container) {
    container.innerHTML =
      '<div class="hlm-page-header"><h1>النسخ الاحتياطي والاستعادة</h1></div>' +
      '<div class="hlm-card">' +
        '<div class="hlm-card__title">تصدير نسخة احتياطية</div>' +
        '<p class="hlm-muted">يشمل كل العملاء والأجهزة والاشتراكات والتراخيص والفواتير والمستخدمين (بكلمات مرور مشفّرة فقط) وسجل العمليات.</p>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmExportBackupBtn">تنزيل نسخة احتياطية (JSON)</button>' +
      '</div>' +
      '<div class="hlm-card">' +
        '<div class="hlm-card__title">استعادة من نسخة احتياطية</div>' +
        '<p class="hlm-muted">اختر ملف JSON تم تصديره سابقًا من هذا التطبيق. "استبدال" يمسح البيانات الحالية بالكامل قبل الاستيراد.</p>' +
        '<input type="file" id="hlmRestoreFile" accept="application/json" style="margin-bottom:10px;">' +
        '<div class="hlm-flex">' +
          '<label class="hlm-checkbox"><input type="radio" name="hlmRestoreMode" value="merge" checked> دمج مع البيانات الحالية</label>' +
          '<label class="hlm-checkbox"><input type="radio" name="hlmRestoreMode" value="replace"> استبدال كامل</label>' +
        '</div>' +
        '<button class="hlm-btn hlm-btn--danger" id="hlmRestoreBtn" style="margin-top:12px;">استعادة الآن</button>' +
      '</div>';

    document.getElementById('hlmExportBackupBtn').addEventListener('click', async function () {
      var snapshot = await window.HLMDb.exportAll();
      var content = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'hlm_license_manager_pro', data: snapshot }, null, 2);
      window.HLMReportsEngine.downloadBlob(content, 'hlm-backup-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
      await window.HLMAuditLogRepository.log({ entity: 'النسخ الاحتياطي', action: 'export', actorId: window.HLMAuth.currentUser().id, actorName: window.HLMAuth.currentUser().name });
    });

    document.getElementById('hlmRestoreBtn').addEventListener('click', async function () {
      var fileInput = document.getElementById('hlmRestoreFile');
      var mode = container.querySelector('input[name="hlmRestoreMode"]:checked').value;
      if (!fileInput.files.length) { window.HLMToast.error('اختر ملف النسخة الاحتياطية أولًا'); return; }
      try {
        var text = await fileInput.files[0].text();
        var parsed = JSON.parse(text);
        var snapshot = parsed.data || parsed;
        await window.HLMDb.importAll(snapshot, mode);
        await window.HLMAuditLogRepository.log({ entity: 'النسخ الاحتياطي', action: 'update', actorId: window.HLMAuth.currentUser().id, actorName: window.HLMAuth.currentUser().name, detail: { mode: mode } });
        window.HLMToast.success('تمت الاستعادة بنجاح — سيتم إعادة تحميل الصفحة');
        setTimeout(function () { window.location.reload(); }, 1200);
      } catch (e) {
        window.HLMToast.error('ملف غير صالح أو تالف');
      }
    });
  }

  window.HLMBackupScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
