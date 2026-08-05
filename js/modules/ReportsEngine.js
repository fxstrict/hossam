/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/ReportsEngine.js
 * Builds exportable reports. CSV/JSON are generated as plain strings/
 * blobs (no dependency needed). "PDF" export uses the browser's native
 * print-to-PDF via a dedicated print stylesheet (window.print()) — this
 * avoids vendoring a PDF library while still producing a real PDF via
 * the OS print dialog's "Save as PDF" destination.
 */
(function (window) {
  'use strict';

  function csvEscape(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows, columns) {
    var header = columns.map(function (c) { return csvEscape(c.label); }).join(',');
    var body = rows.map(function (row) {
      return columns.map(function (c) { return csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.value]); }).join(',');
    }).join('\n');
    return '\uFEFF' + header + '\n' + body; // BOM so Excel opens Arabic UTF-8 correctly
  }

  function toJson(rows) {
    return JSON.stringify(rows, null, 2);
  }

  // ---- Named report builders -------------------------------------------

  function allCustomersReport(customers, subscriptions) {
    var subsByCustomer = {};
    subscriptions.forEach(function (s) { subsByCustomer[s.customerId] = s; });
    var columns = [
      { label: 'رقم العميل', value: 'clientNumber' },
      { label: 'المكتب', value: 'officeName' },
      { label: 'المحامي', value: 'lawyerName' },
      { label: 'الهاتف', value: 'phone' },
      { label: 'المحافظة', value: 'governorate' },
      { label: 'النسخة', value: function (c) { var s = subsByCustomer[c.id]; return s ? s.edition : ''; } },
      { label: 'تاريخ الانتهاء', value: function (c) { var s = subsByCustomer[c.id]; return s && s.endDate ? s.endDate.slice(0, 10) : 'دائم'; } }
    ];
    return { columns: columns, rows: customers };
  }

  function expiredSubscriptionsReport(customers, subscriptions, now) {
    now = now || new Date();
    var customersById = {};
    customers.forEach(function (c) { customersById[c.id] = c; });
    var expired = subscriptions.filter(function (s) {
      var state = window.HLMSubscriptionsRepository.computeState(s, now);
      return state.state === 'read_only';
    }).map(function (s) { return Object.assign({}, s, { customer: customersById[s.customerId] }); });

    var columns = [
      { label: 'المكتب', value: function (r) { return r.customer ? r.customer.officeName : ''; } },
      { label: 'النسخة', value: 'edition' },
      { label: 'تاريخ الانتهاء', value: function (r) { return r.endDate ? r.endDate.slice(0, 10) : ''; } }
    ];
    return { columns: columns, rows: expired };
  }

  function revenueReport(payments) {
    var columns = [
      { label: 'رقم الفاتورة', value: 'invoiceNumber' },
      { label: 'التاريخ', value: function (p) { return p.date ? p.date.slice(0, 10) : ''; } },
      { label: 'المبلغ', value: 'amount' },
      { label: 'طريقة الدفع', value: 'method' },
      { label: 'الحالة', value: function (p) { return p.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'; } }
    ];
    return { columns: columns, rows: payments };
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  window.HLMReportsEngine = {
    toCsv: toCsv,
    toJson: toJson,
    allCustomersReport: allCustomersReport,
    expiredSubscriptionsReport: expiredSubscriptionsReport,
    revenueReport: revenueReport,
    downloadBlob: downloadBlob
  };
})(typeof window !== 'undefined' ? window : globalThis);
