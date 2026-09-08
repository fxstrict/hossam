/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/licenseResultModal.js
 * Shown right after a license is signed: the spec's "فينتج License ثم
 * تظهر أزرار: إرسال واتساب / إرسال بريد / حفظ / طباعة / نسخ / QR".
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  function show(licenseRecord, customer, plaintextCode) {
    var licenseFile = licenseRecord.licenseFile;
    var payload = licenseFile.payload;
    var qr = window.qrcode(0, 'M');
    qr.addData(payload.licenseId);
    qr.make();
    var qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4 });

    window.HLMModal.open({
      title: 'تم إصدار الترخيص بنجاح',
      large: true,
      body:
        '<div class="hlm-flex-between" style="align-items:flex-start;gap:20px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:240px;">' +
            '<div class="hlm-field"><label>معرّف الترخيص</label><div style="font-weight:800;font-size:16px;">' + esc(payload.licenseId) + '</div></div>' +
            '<div class="hlm-form-grid">' +
              '<div class="hlm-field"><label>النسخة</label><div>' + esc(payload.edition) + '</div></div>' +
              '<div class="hlm-field"><label>المدة</label><div>' + esc(payload.type) + '</div></div>' +
              '<div class="hlm-field"><label>ينتهي في</label><div>' + (payload.expiresAt ? payload.expiresAt.slice(0, 10) : 'دائم') + '</div></div>' +
              '<div class="hlm-field"><label>رقم الجهاز</label><div class="hlm-nowrap">' + esc(payload.machineId) + '</div></div>' +
            '</div>' +
            '<div class="hlm-license-file">' + esc(JSON.stringify(licenseFile, null, 2)) + '</div>' +
            (plaintextCode ?
              '<div class="hlm-field" style="margin-top:16px;padding:12px;border:1px dashed #999;border-radius:8px;">' +
                '<label style="font-weight:800;">كود التفعيل</label>' +
                '<div id="hlmActivationCodeValue" style="font-family:monospace;font-size:15px;font-weight:800;letter-spacing:1px;margin:6px 0;">' + esc(plaintextCode) + '</div>' +
              '</div>'
              : '') +
          '</div>' +
          '<div style="text-align:center;">' + qrSvg + '<div class="hlm-muted" style="font-size:11px;">QR لمعرّف الترخيص</div></div>' +
        '</div>',
      footer:
        '<a class="hlm-btn" target="_blank" rel="noopener" href="' + window.HLMLicenseIssuer.whatsappShareLink(customer.whatsapp || customer.phone, licenseFile, customer.officeName) + '">إرسال واتساب</a>' +
        '<a class="hlm-btn" href="' + window.HLMLicenseIssuer.mailtoLink(customer.email, licenseFile, customer.officeName) + '">إرسال بريد</a>' +
        '<button class="hlm-btn" id="hlmCopyLicenseBtn">نسخ</button>' +
        (plaintextCode ? '<button class="hlm-btn" id="hlmCopyActivationCodeBtn">نسخ كود التفعيل</button>' : '') +
        '<button class="hlm-btn" id="hlmPrintLicenseBtn">طباعة</button>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmDownloadLicenseBtn">حفظ الملف (.hsm)</button>',
      onMount: function () {
        document.getElementById('hlmDownloadLicenseBtn').addEventListener('click', function () {
          window.HLMLicenseIssuer.downloadLicenseFile(licenseFile, customer.officeName);
        });
        document.getElementById('hlmCopyLicenseBtn').addEventListener('click', function () {
          navigator.clipboard.writeText(JSON.stringify(licenseFile)).then(function () {
            window.HLMToast.success('تم نسخ ملف الترخيص');
          });
        });
        if (plaintextCode) {
          var copyActivationBtn = document.getElementById('hlmCopyActivationCodeBtn');
          if (copyActivationBtn) {
            copyActivationBtn.addEventListener('click', function () {
              navigator.clipboard.writeText(plaintextCode).then(function () {
                window.HLMToast.success('تم نسخ كود التفعيل');
              }).catch(function () {
                window.HLMToast.error('تعذّر نسخ كود التفعيل');
              });
            });
          }
        }
        document.getElementById('hlmPrintLicenseBtn').addEventListener('click', function () { window.print(); });
      }
    });
  }

  window.HLMLicenseResultModal = { show: show };
})(typeof window !== 'undefined' ? window : globalThis);
