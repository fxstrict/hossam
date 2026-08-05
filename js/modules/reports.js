/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/reports.js
 * Route /reports — "كل العملاء / الاشتراكات المنتهية / إيرادات السنة"
 * etc. Exports PDF (via window.print(), a real PDF through the OS
 * "Save as PDF" print destination — no PDF library needed), Excel-
 * compatible CSV (UTF-8 BOM), and JSON.
 */
(function (window) {
  'use strict';

  var REPORTS = [
    { key: 'all_customers', label: 'كل العملاء', icon: '&#128100;' },
    { key: 'expired', label: 'الاشتراكات المنتهية', icon: '&#9888;' },
    { key: 'revenue', label: 'إيرادات هذا العام', icon: '&#128176;' }
  ];

  async function buildReport(key) {
    var customers = await window.HLMCustomersRepository.getAll();
    var subs = await window.HLMSubscriptionsRepository.getAll();
    var payments = await window.HLMPaymentsRepository.getAll();
    if (key === 'all_customers') return window.HLMReportsEngine.allCustomersReport(customers, subs);
    if (key === 'expired') return window.HLMReportsEngine.expiredSubscriptionsReport(customers, subs);
    if (key === 'revenue') return window.HLMReportsEngine.revenueReport(payments.filter(function (p) { return p.status === 'paid' && new Date(p.date).getFullYear() === new Date().getFullYear(); }));
    return { columns: [], rows: [] };
  }

  function printReport(report, title) {
    var win = window.open('', '_blank');
    var rowsHtml = report.rows.map(function (row) {
      return '<tr>' + report.columns.map(function (c) {
        var v = typeof c.value === 'function' ? c.value(row) : row[c.value];
        return '<td>' + (v === null || v === undefined ? '' : String(v)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    win.document.write(
      '<html dir="rtl"><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>body{font-family:Tahoma,sans-serif;padding:20px;} h1{font-size:18px;} table{width:100%;border-collapse:collapse;} ' +
      'th,td{border:1px solid #ccc;padding:8px;text-align:right;font-size:12.5px;} th{background:#f2ede0;}</style></head><body>' +
      '<h1>' + title + '</h1><p>مكتب الحسام للمحاماة — تاريخ التقرير: ' + new Date().toLocaleDateString('ar-EG') + '</p>' +
      '<table><thead><tr>' + report.columns.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></body></html>'
    );
    win.document.close();
    setTimeout(function () { win.print(); }, 300);
  }

  async function render(container) {
    container.innerHTML =
      '<div class="hlm-page-header"><h1>التقارير</h1></div>' +
      '<div class="hlm-form-grid">' +
        REPORTS.map(function (r) {
          return '<div class="hlm-card">' +
            '<div class="hlm-card__title">' + r.label + '</div>' +
            '<div class="hlm-flex hlm-flex-wrap">' +
              '<button class="hlm-btn hlm-btn--sm" data-action="csv" data-key="' + r.key + '">CSV / Excel</button>' +
              '<button class="hlm-btn hlm-btn--sm" data-action="json" data-key="' + r.key + '">JSON</button>' +
              '<button class="hlm-btn hlm-btn--sm hlm-btn--primary" data-action="pdf" data-key="' + r.key + '">PDF (طباعة)</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';

    container.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var key = btn.getAttribute('data-key');
        var action = btn.getAttribute('data-action');
        var reportDef = REPORTS.filter(function (r) { return r.key === key; })[0];
        var report = await buildReport(key);
        if (!report.rows.length) { window.HLMToast.warning('لا توجد بيانات لهذا التقرير حاليًا'); return; }
        if (action === 'csv') {
          var csv = window.HLMReportsEngine.toCsv(report.rows, report.columns);
          window.HLMReportsEngine.downloadBlob(csv, key + '.csv', 'text/csv;charset=utf-8');
        } else if (action === 'json') {
          window.HLMReportsEngine.downloadBlob(window.HLMReportsEngine.toJson(report.rows), key + '.json', 'application/json');
        } else if (action === 'pdf') {
          printReport(report, reportDef.label);
        }
      });
    });
  }

  window.HLMReportsScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
