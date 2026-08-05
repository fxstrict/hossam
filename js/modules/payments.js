/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/payments.js
 * Global "الفواتير" list (route /payments) across all customers.
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  function methodLabel(m) {
    return { transfer: 'تحويل بنكي', vodafone_cash: 'فودافون كاش', cash: 'كاش', check: 'شيك' }[m] || (m || '—');
  }

  async function render(container) {
    container.innerHTML = '<div class="hlm-page-header"><h1>الفواتير</h1></div><div class="hlm-skeleton" style="height:300px;"></div>';

    var payments = await window.HLMPaymentsRepository.getAll();
    var customers = await window.HLMCustomersRepository.getAll();
    var customersById = {};
    customers.forEach(function (c) { customersById[c.id] = c; });
    payments.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var totalPaid = payments.filter(function (p) { return p.status === 'paid'; }).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
    var totalUnpaid = payments.filter(function (p) { return p.status === 'unpaid'; }).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);

    container.innerHTML =
      '<div class="hlm-page-header"><h1>الفواتير</h1></div>' +
      '<div class="hlm-stats-grid">' +
        '<div class="hlm-stat hlm-stat--accent hlm-stat--success"><div class="hlm-stat__value">' + totalPaid.toLocaleString('ar-EG') + '</div><div class="hlm-stat__label">إجمالي المحصّل (ج.م)</div></div>' +
        '<div class="hlm-stat hlm-stat--accent hlm-stat--warning"><div class="hlm-stat__value">' + totalUnpaid.toLocaleString('ar-EG') + '</div><div class="hlm-stat__label">مستحقات غير محصّلة (ج.م)</div></div>' +
        '<div class="hlm-stat hlm-stat--accent"><div class="hlm-stat__value">' + payments.length + '</div><div class="hlm-stat__label">إجمالي عدد الفواتير</div></div>' +
      '</div>' +
      (payments.length ? (
        '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr>' +
        '<th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>الحالة</th>' +
        '</tr></thead><tbody>' +
        payments.map(function (p) {
          var customer = customersById[p.customerId];
          return '<tr data-cust="' + p.customerId + '">' +
            '<td class="hlm-nowrap">' + esc(p.invoiceNumber) + '</td>' +
            '<td>' + (customer ? esc(customer.officeName) : '—') + '</td>' +
            '<td class="hlm-nowrap">' + p.date.slice(0, 10) + '</td>' +
            '<td>' + Number(p.amount).toLocaleString('ar-EG') + ' ج.م</td>' +
            '<td>' + methodLabel(p.method) + '</td>' +
            '<td>' + (p.status === 'paid' ? '<span class="hlm-badge hlm-badge--success">مدفوعة</span>' : '<span class="hlm-badge hlm-badge--warning">غير مدفوعة</span>') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>'
      ) : '<div class="hlm-empty">لا توجد فواتير بعد</div>');

    container.querySelectorAll('tr[data-cust]').forEach(function (row) {
      row.addEventListener('click', function () { window.HLMRouter.navigate('/customers/' + row.getAttribute('data-cust')); });
    });
  }

  window.HLMPaymentsScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
