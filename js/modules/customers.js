/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/customers.js
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  var FILTER_CHIPS = [
    { key: 'expired', label: 'المنتهية' },
    { key: 'expiring_soon', label: 'المنتهية قريبًا' },
    { key: 'lifetime', label: 'Lifetime' },
    { key: 'enterprise', label: 'Enterprise' },
    { key: 'professional', label: 'Professional' },
    { key: 'unpaid', label: 'غير مدفوعة' },
    { key: 'grace', label: 'فترة السماح' },
    { key: 'read_only', label: 'قراءة فقط' }
  ];

  // ------------------------------------------------------------------
  // LIST
  // ------------------------------------------------------------------
  async function renderList(container) {
    var activeFilters = [];
    var searchTerm = '';

    container.innerHTML =
      '<div class="hlm-page-header"><h1>العملاء</h1>' +
      (window.HLMAuth.hasPermission('customers.create') ? '<button class="hlm-btn hlm-btn--primary" id="hlmAddCustomerBtn">+ عميل جديد</button>' : '') +
      '</div>' +
      '<div class="hlm-card" style="margin-bottom:14px;">' +
        '<input type="text" id="hlmCustomerSearch" placeholder="بحث بالاسم أو الهاتف أو المحافظة..." style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;">' +
        '<div class="hlm-flex hlm-flex-wrap">' + FILTER_CHIPS.map(function (f) {
          return '<span class="hlm-chip" data-key="' + f.key + '">' + f.label + '</span>';
        }).join('') + '</div>' +
      '</div>' +
      '<div id="hlmCustomerListBody"></div>';

    async function refresh() {
      var listEl = document.getElementById('hlmCustomerListBody');
      listEl.innerHTML = '<div class="hlm-skeleton" style="height:220px;"></div>';
      var customers;
      if (activeFilters.length) {
        customers = await window.HLMSearchEngine.applyFilters(activeFilters);
        if (searchTerm) {
          var matched = new Set((await window.HLMSearchEngine.globalSearch(searchTerm)).map(function (r) { return r.customer.id; }));
          customers = customers.filter(function (c) { return matched.has(c.id); });
        }
      } else if (searchTerm) {
        customers = (await window.HLMSearchEngine.globalSearch(searchTerm)).map(function (r) { return r.customer; });
      } else {
        customers = await window.HLMCustomersRepository.getAll();
        customers.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      }
      var subs = await window.HLMSubscriptionsRepository.getAll();
      var subsByCustomer = {};
      subs.forEach(function (s) { subsByCustomer[s.customerId] = s; });

      listEl.innerHTML = customers.length ? (
        '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr>' +
        '<th>رقم العميل</th><th>المكتب</th><th>المحامي</th><th>الهاتف</th><th>النسخة</th><th>الحالة</th><th>ينتهي</th>' +
        '</tr></thead><tbody>' +
        customers.map(function (c) { return customerRow(c, subsByCustomer[c.id]); }).join('') +
        '</tbody></table></div>'
      ) : '<div class="hlm-empty">لا يوجد عملاء مطابقون</div>';

      listEl.querySelectorAll('tr[data-id]').forEach(function (row) {
        row.addEventListener('click', function () { window.HLMRouter.navigate('/customers/' + row.getAttribute('data-id')); });
      });
    }

    document.getElementById('hlmCustomerSearch').addEventListener('input', function (ev) {
      searchTerm = ev.target.value.trim();
      refresh();
    });
    container.querySelectorAll('.hlm-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var key = chip.getAttribute('data-key');
        var idx = activeFilters.indexOf(key);
        if (idx === -1) activeFilters.push(key); else activeFilters.splice(idx, 1);
        chip.classList.toggle('is-active');
        refresh();
      });
    });
    if (window.HLMAuth.hasPermission('customers.create')) {
      document.getElementById('hlmAddCustomerBtn').addEventListener('click', function () { openCustomerFormModal(null, refresh); });
    }

    await refresh();
  }

  function customerRow(c, sub) {
    var state = sub ? window.HLMSubscriptionsRepository.computeState(sub) : null;
    return '<tr data-id="' + c.id + '">' +
      '<td class="hlm-nowrap">' + esc(c.clientNumber) + '</td>' +
      '<td>' + esc(c.officeName) + '</td>' +
      '<td>' + esc(c.lawyerName || '—') + '</td>' +
      '<td class="hlm-nowrap">' + esc(c.phone || '—') + '</td>' +
      '<td>' + (sub ? esc(sub.edition) : '—') + '</td>' +
      '<td>' + stateBadge(state) + '</td>' +
      '<td class="hlm-nowrap">' + (sub && sub.endDate ? sub.endDate.slice(0, 10) : (sub ? 'دائم' : '—')) + '</td>' +
      '</tr>';
  }

  function stateBadge(state) {
    if (!state) return '<span class="hlm-badge hlm-badge--muted">بدون اشتراك</span>';
    var map = {
      active: ['success', 'نشط'], grace: ['warning', 'فترة سماح'],
      read_only: ['danger', 'قراءة فقط'], lifetime: ['gold', 'Lifetime']
    };
    var m = map[state.state] || ['muted', state.state];
    return '<span class="hlm-badge hlm-badge--' + m[0] + '">' + m[1] + '</span>';
  }

  // ------------------------------------------------------------------
  // DETAIL
  // ------------------------------------------------------------------
  var TABS = [
    { key: 'office', label: 'بيانات المكتب' },
    { key: 'devices', label: 'الأجهزة' },
    { key: 'subscription', label: 'الاشتراك' },
    { key: 'payments', label: 'المدفوعات' },
    { key: 'licenses', label: 'التراخيص' }
  ];

  async function renderDetail(container, params) {
    var customer = await window.HLMCustomersRepository.getById(params.id);
    if (!customer) { container.innerHTML = '<div class="hlm-empty">العميل غير موجود</div>'; return; }
    var sub = await window.HLMSubscriptionsRepository.forCustomer(customer.id);
    var state = sub ? window.HLMSubscriptionsRepository.computeState(sub) : null;
    var activeTab = 'office';

    container.innerHTML =
      '<div class="hlm-breadcrumbs"><a href="#/customers">العملاء</a> / ' + esc(customer.officeName) + '</div>' +
      '<div class="hlm-page-header">' +
        '<div><h1>' + esc(customer.officeName) + ' ' + stateBadge(state) + '</h1>' +
        '<div class="hlm-muted">' + esc(customer.clientNumber) + (customer.lawyerName ? ' · ' + esc(customer.lawyerName) : '') + '</div></div>' +
        '<div class="hlm-flex hlm-flex-wrap" id="hlmCustomerActions"></div>' +
      '</div>' +
      '<div class="hlm-tabs" id="hlmCustomerTabs">' +
        TABS.map(function (t) { return '<div class="hlm-tab' + (t.key === activeTab ? ' is-active' : '') + '" data-tab="' + t.key + '">' + t.label + '</div>'; }).join('') +
      '</div>' +
      '<div id="hlmCustomerTabBody"></div>';

    renderActions(document.getElementById('hlmCustomerActions'), customer);

    async function showTab(key) {
      container.querySelectorAll('.hlm-tab').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-tab') === key); });
      var body = document.getElementById('hlmCustomerTabBody');
      body.innerHTML = '<div class="hlm-skeleton" style="height:180px;"></div>';
      if (key === 'office') body.innerHTML = officeTabHtml(customer);
      else if (key === 'devices') body.innerHTML = await devicesTabHtml(customer);
      else if (key === 'subscription') body.innerHTML = subscriptionTabHtml(sub, state);
      else if (key === 'payments') body.innerHTML = await paymentsTabHtml(customer);
      else if (key === 'licenses') body.innerHTML = await licensesTabHtml(customer);
      wireTabActions(body, customer, function () { renderDetail(container, params); });
    }

    container.querySelectorAll('.hlm-tab').forEach(function (t) {
      t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    });

    await showTab('office');
  }

  function renderActions(el, customer) {
    var html = '';
    if (window.HLMAuth.hasPermission('licenses.issue')) {
      html += '<a href="#/licenses/new/' + customer.id + '" class="hlm-btn hlm-btn--primary">+ إصدار ترخيص</a>';
    }
    if (window.HLMAuth.hasPermission('licenses.renew')) {
      html += '<button class="hlm-btn" id="hlmRenewBtn">تجديد الاشتراك</button>';
    }
    if (window.HLMAuth.hasPermission('licenses.transfer')) {
      html += '<button class="hlm-btn" id="hlmTransferBtn">نقل جهاز</button>';
    }
    if (window.HLMAuth.hasPermission('customers.edit')) {
      html += '<button class="hlm-btn" id="hlmEditCustomerBtn">تعديل البيانات</button>';
    }
    el.innerHTML = html;
    if (document.getElementById('hlmRenewBtn')) document.getElementById('hlmRenewBtn').addEventListener('click', function () { window.HLMLicenseModals.openRenew(customer); });
    if (document.getElementById('hlmTransferBtn')) document.getElementById('hlmTransferBtn').addEventListener('click', function () { window.HLMLicenseModals.openTransfer(customer); });
    if (document.getElementById('hlmEditCustomerBtn')) document.getElementById('hlmEditCustomerBtn').addEventListener('click', function () {
      openCustomerFormModal(customer, function () { window.HLMRouter.resolve(); });
    });
  }

  function officeTabHtml(c) {
    var rows = [
      ['اسم المكتب', c.officeName], ['اسم المحامي', c.lawyerName], ['الهاتف', c.phone],
      ['واتساب', c.whatsapp], ['البريد الإلكتروني', c.email], ['العنوان', c.address],
      ['المحافظة', c.governorate], ['رقم التسجيل', c.registrationNumber], ['ملاحظات', c.notes]
    ];
    return '<div class="hlm-card"><div class="hlm-form-grid">' + rows.map(function (r) {
      return '<div class="hlm-field"><label>' + r[0] + '</label><div>' + esc(r[1] || '—') + '</div></div>';
    }).join('') + '</div></div>';
  }

  async function devicesTabHtml(c) {
    var devices = await window.HLMDevicesRepository.forCustomer(c.id);
    devices.sort(function (a, b) { return (b.activatedAt || '').localeCompare(a.activatedAt || ''); });
    if (!devices.length) return '<div class="hlm-empty">لا توجد أجهزة مسجّلة بعد</div>';
    return '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr><th>رقم الجهاز</th><th>الحالة</th><th>تاريخ التفعيل</th><th>ملاحظات</th></tr></thead><tbody>' +
      devices.map(function (d) {
        return '<tr><td class="hlm-nowrap">' + esc(d.machineId) + '</td><td>' +
          (d.status === 'active' ? '<span class="hlm-badge hlm-badge--success">نشط</span>' : '<span class="hlm-badge hlm-badge--muted">غير نشط</span>') +
          '</td><td class="hlm-nowrap">' + (d.activatedAt ? d.activatedAt.slice(0, 10) : '—') + '</td>' +
          '<td class="wrap hlm-muted">' + (d.transferredFrom ? 'تم النقل من جهاز سابق' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function subscriptionTabHtml(sub, state) {
    if (!sub) return '<div class="hlm-empty">لا يوجد اشتراك مُصدر بعد لهذا العميل</div>';
    var rows = [
      ['نوع النسخة', sub.edition],
      ['مدة الاشتراك', sub.type],
      ['تاريخ البداية', sub.startDate ? sub.startDate.slice(0, 10) : '—'],
      ['تاريخ النهاية', sub.endDate ? sub.endDate.slice(0, 10) : 'دائم'],
      ['عدد الأيام المتبقية', state.daysRemaining === null ? 'غير محدود' : state.daysRemaining],
      ['فترة السماح', sub.graceDays + ' يوم'],
      ['حالة القراءة فقط', state.state === 'read_only' ? 'نعم' : 'لا'],
      ['المميزات المفعّلة', (sub.modules || []).join('، ') || '—']
    ];
    return '<div class="hlm-card"><div class="hlm-form-grid">' + rows.map(function (r) {
      return '<div class="hlm-field"><label>' + r[0] + '</label><div>' + esc(r[1]) + '</div></div>';
    }).join('') + '</div></div>';
  }

  async function paymentsTabHtml(c) {
    var payments = await window.HLMPaymentsRepository.forCustomer(c.id);
    var addBtn = window.HLMAuth.hasPermission('payments.edit')
      ? '<button class="hlm-btn hlm-btn--sm hlm-btn--primary" id="hlmAddPaymentBtn">+ فاتورة جديدة</button>' : '';
    var table = payments.length
      ? '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>الحالة</th></tr></thead><tbody>' +
        payments.map(function (p) {
          return '<tr><td class="hlm-nowrap">' + esc(p.invoiceNumber) + '</td><td class="hlm-nowrap">' + p.date.slice(0, 10) + '</td>' +
            '<td>' + Number(p.amount).toLocaleString('ar-EG') + ' ج.م</td><td>' + methodLabel(p.method) + '</td>' +
            '<td>' + (p.status === 'paid' ? '<span class="hlm-badge hlm-badge--success">مدفوعة</span>' : '<span class="hlm-badge hlm-badge--warning">غير مدفوعة</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="hlm-empty">لا توجد فواتير بعد</div>';
    return '<div class="hlm-flex-between" style="margin-bottom:10px;"><div></div>' + addBtn + '</div>' + table;
  }

  function methodLabel(m) {
    return { transfer: 'تحويل بنكي', vodafone_cash: 'فودافون كاش', cash: 'كاش', check: 'شيك' }[m] || (m || '—');
  }

  async function licensesTabHtml(c) {
    var licenses = await window.HLMLicensesRepository.forCustomer(c.id);
    if (!licenses.length) return '<div class="hlm-empty">لا توجد تراخيص صادرة بعد</div>';
    return '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr><th>معرّف الترخيص</th><th>النسخة</th><th>النوع</th><th>تاريخ الإصدار</th><th>الحالة</th><th></th></tr></thead><tbody>' +
      licenses.map(function (l) {
        return '<tr><td class="hlm-nowrap">' + esc(l.licenseId) + '</td><td>' + esc(l.edition) + '</td><td>' + esc(l.type) + '</td>' +
          '<td class="hlm-nowrap">' + l.issuedAt.slice(0, 10) + '</td>' +
          '<td>' + (l.status === 'revoked' ? '<span class="hlm-badge hlm-badge--danger">ملغي</span>' : '<span class="hlm-badge hlm-badge--success">ساري</span>') + '</td>' +
          '<td class="hlm-nowrap">' +
            '<button class="hlm-btn hlm-btn--sm" data-download="' + l.id + '">تنزيل</button> ' +
            (l.status !== 'revoked' && window.HLMAuth.hasPermission('licenses.revoke') ? '<button class="hlm-btn hlm-btn--sm hlm-btn--danger" data-revoke="' + l.id + '">إلغاء</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function wireTabActions(body, customer, onChanged) {
    var addPaymentBtn = body.querySelector('#hlmAddPaymentBtn');
    if (addPaymentBtn) addPaymentBtn.addEventListener('click', function () { window.HLMPaymentModals.openCreate(customer, onChanged); });

    body.querySelectorAll('[data-download]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var lic = await window.HLMLicensesRepository.getById(btn.getAttribute('data-download'));
        window.HLMLicenseIssuer.downloadLicenseFile(lic.licenseFile, customer.officeName);
      });
    });
    body.querySelectorAll('[data-revoke]').forEach(function (btn) {
      btn.addEventListener('click', function () { window.HLMLicenseModals.openRevoke(btn.getAttribute('data-revoke'), onChanged); });
    });
  }

  // ------------------------------------------------------------------
  // Create / edit customer modal
  // ------------------------------------------------------------------
  function openCustomerFormModal(existing, onSaved) {
    var c = existing || {};
    var body =
      '<form id="hlmCustomerForm" class="hlm-form-grid">' +
        field('officeName', 'اسم المكتب *', c.officeName, true) +
        field('lawyerName', 'اسم المحامي', c.lawyerName) +
        field('phone', 'الهاتف', c.phone) +
        field('whatsapp', 'واتساب', c.whatsapp) +
        field('email', 'البريد الإلكتروني', c.email, false, 'email') +
        field('governorate', 'المحافظة', c.governorate) +
        field('address', 'العنوان', c.address) +
        field('registrationNumber', 'رقم التسجيل', c.registrationNumber) +
      '</form>' +
      '<div class="hlm-field"><label>ملاحظات</label><textarea id="hlmFieldNotes" rows="3">' + esc(c.notes || '') + '</textarea></div>';

    window.HLMModal.open({
      title: existing ? 'تعديل بيانات العميل' : 'عميل جديد',
      body: body,
      footer: '<button class="hlm-btn" id="hlmModalCancel">إلغاء</button><button class="hlm-btn hlm-btn--primary" id="hlmModalSave">حفظ</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmModalSave').addEventListener('click', async function () {
          var data = {
            officeName: document.getElementById('hlmField_officeName').value.trim(),
            lawyerName: document.getElementById('hlmField_lawyerName').value.trim(),
            phone: document.getElementById('hlmField_phone').value.trim(),
            whatsapp: document.getElementById('hlmField_whatsapp').value.trim(),
            email: document.getElementById('hlmField_email').value.trim(),
            governorate: document.getElementById('hlmField_governorate').value.trim(),
            address: document.getElementById('hlmField_address').value.trim(),
            registrationNumber: document.getElementById('hlmField_registrationNumber').value.trim(),
            notes: document.getElementById('hlmFieldNotes').value.trim()
          };
          if (!data.officeName) { window.HLMToast.error('اسم المكتب مطلوب'); return; }
          var actor = window.HLMAuth.currentUser();
          if (existing) await window.HLMCustomersRepository.update(existing.id, data, actor);
          else await window.HLMCustomersRepository.create(data, actor);
          window.HLMToast.success('تم الحفظ بنجاح');
          window.HLMModal.close();
          if (onSaved) onSaved();
        });
      }
    });
  }

  function field(name, label, value, required, type) {
    return '<div class="hlm-field"><label>' + label + '</label><input type="' + (type || 'text') + '" id="hlmField_' + name + '" value="' + esc(value || '') + '"' + (required ? ' required' : '') + '></div>';
  }

  window.HLMCustomersScreen = { renderList: renderList, renderDetail: renderDetail, stateBadge: stateBadge, openCustomerFormModal: openCustomerFormModal };
})(typeof window !== 'undefined' ? window : globalThis);
