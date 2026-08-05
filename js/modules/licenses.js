/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/licenses.js
 * Global "كل التراخيص" list (route /licenses) — every license ever
 * issued, across all customers, newest first, with quick status filter.
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  async function render(container) {
    container.innerHTML = '<div class="hlm-page-header"><h1>التراخيص</h1></div><div class="hlm-skeleton" style="height:300px;"></div>';

    var licenses = await window.HLMLicensesRepository.getAll();
    var customers = await window.HLMCustomersRepository.getAll();
    var customersById = {};
    customers.forEach(function (c) { customersById[c.id] = c; });
    licenses.sort(function (a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); });

    var statusFilter = 'all';

    container.innerHTML =
      '<div class="hlm-page-header"><h1>التراخيص</h1>' +
      (window.HLMAuth.hasPermission('licenses.issue') ? '<a href="#/licenses/new" class="hlm-btn hlm-btn--primary">+ إصدار ترخيص جديد</a>' : '') +
      '</div>' +
      '<div class="hlm-flex hlm-flex-wrap" style="margin-bottom:12px;">' +
        chip('all', 'الكل') + chip('issued', 'ساري') + chip('revoked', 'ملغي') +
      '</div>' +
      '<div id="hlmLicensesTableWrap"></div>';

    function chip(key, label) { return '<span class="hlm-chip' + (key === 'all' ? ' is-active' : '') + '" data-key="' + key + '">' + label + '</span>'; }

    function draw() {
      var rows = licenses.filter(function (l) { return statusFilter === 'all' || l.status === statusFilter; });
      var wrap = document.getElementById('hlmLicensesTableWrap');
      wrap.innerHTML = rows.length ? (
        '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr>' +
        '<th>معرّف الترخيص</th><th>العميل</th><th>النسخة</th><th>النوع</th><th>الجهاز</th><th>تاريخ الإصدار</th><th>الحالة</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (l) {
          var customer = customersById[l.customerId];
          return '<tr data-cust="' + l.customerId + '">' +
            '<td class="hlm-nowrap">' + esc(l.licenseId) + '</td>' +
            '<td>' + (customer ? esc(customer.officeName) : '—') + '</td>' +
            '<td>' + esc(l.edition) + '</td><td>' + esc(l.type) + '</td>' +
            '<td class="hlm-nowrap">' + esc(l.machineId) + '</td>' +
            '<td class="hlm-nowrap">' + l.issuedAt.slice(0, 10) + '</td>' +
            '<td>' + (l.status === 'revoked' ? '<span class="hlm-badge hlm-badge--danger">ملغي</span>' : '<span class="hlm-badge hlm-badge--success">ساري</span>') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>'
      ) : '<div class="hlm-empty">لا توجد تراخيص مطابقة</div>';
      wrap.querySelectorAll('tr[data-cust]').forEach(function (row) {
        row.addEventListener('click', function () { window.HLMRouter.navigate('/customers/' + row.getAttribute('data-cust')); });
      });
    }

    container.querySelectorAll('.hlm-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        container.querySelectorAll('.hlm-chip').forEach(function (x) { x.classList.remove('is-active'); });
        c.classList.add('is-active');
        statusFilter = c.getAttribute('data-key');
        draw();
      });
    });

    draw();
  }

  window.HLMLicensesScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
