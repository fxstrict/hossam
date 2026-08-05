/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/PaymentModals.js
 * "+ فاتورة جديدة" modal used from the customer detail Payments tab.
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  function openCreate(customer, onSaved) {
    window.HLMModal.open({
      title: 'فاتورة جديدة — ' + customer.officeName,
      body:
        '<div class="hlm-form-grid">' +
          '<div class="hlm-field"><label>المبلغ (ج.م) *</label><input type="number" min="0" step="0.01" id="hlmPayAmount"></div>' +
          '<div class="hlm-field"><label>طريقة الدفع</label><select id="hlmPayMethod">' +
            '<option value="transfer">تحويل بنكي</option>' +
            '<option value="vodafone_cash">فودافون كاش</option>' +
            '<option value="cash">كاش</option>' +
            '<option value="check">شيك</option>' +
          '</select></div>' +
          '<div class="hlm-field"><label>الحالة</label><select id="hlmPayStatus">' +
            '<option value="paid">مدفوعة</option><option value="unpaid" selected>غير مدفوعة</option>' +
          '</select></div>' +
          '<div class="hlm-field"><label>التاريخ</label><input type="date" id="hlmPayDate" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
        '</div>' +
        '<div class="hlm-field"><label>ملاحظات</label><textarea id="hlmPayNotes" rows="2"></textarea></div>',
      footer: '<button class="hlm-btn" id="hlmModalCancel">إلغاء</button><button class="hlm-btn hlm-btn--primary" id="hlmPaySave">حفظ الفاتورة</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmPaySave').addEventListener('click', async function () {
          var amount = parseFloat(document.getElementById('hlmPayAmount').value);
          if (!amount || amount <= 0) { window.HLMToast.error('أدخل مبلغًا صحيحًا'); return; }
          var actor = window.HLMAuth.currentUser();
          await window.HLMPaymentsRepository.create({
            customerId: customer.id,
            amount: amount,
            method: document.getElementById('hlmPayMethod').value,
            status: document.getElementById('hlmPayStatus').value,
            date: new Date(document.getElementById('hlmPayDate').value || Date.now()).toISOString(),
            notes: document.getElementById('hlmPayNotes').value.trim()
          }, actor);
          window.HLMToast.success('تم حفظ الفاتورة');
          window.HLMModal.close();
          if (onSaved) onSaved();
        });
      }
    });
  }

  window.HLMPaymentModals = { openCreate: openCreate };
})(typeof window !== 'undefined' ? window : globalThis);
