/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/licenseWizard.js
 * The spec's 7-step "إصدار ترخيص جديد" wizard:
 *   1. اختيار العميل   2. اختيار الجهاز   3. نوع النسخة
 *   4. مدة الاشتراك    5. المميزات        6. عدد المستخدمين
 *   7. إنشاء (Generate)
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  var STEP_LABELS = ['العميل', 'الجهاز', 'النسخة', 'المدة', 'المميزات', 'المستخدمون', 'إنشاء'];

  async function render(container, params) {
    if (!window.HLMKeySession.isLoaded()) {
      container.innerHTML =
        '<div class="hlm-page-header"><h1>إصدار ترخيص جديد</h1></div>' +
        '<div class="hlm-card"><div class="hlm-empty">' +
          'يجب تحميل مفتاح التوقيع (Private Key) أولًا من صفحة الإعدادات قبل إصدار أي ترخيص.' +
          '<div style="margin-top:12px;"><a class="hlm-btn hlm-btn--primary" href="#/settings">الذهاب للإعدادات</a></div>' +
        '</div></div>';
      return;
    }

    var settings = window.HLM_DEFAULT_SETTINGS;
    var state = {
      step: 1,
      customer: null,
      deviceMode: 'existing', // 'existing' | 'new'
      device: null,
      newMachineId: '',
      edition: settings.editions[1] || 'Professional',
      type: 'yearly',
      modules: [],
      maxUsers: 5,
      graceDays: settings.defaultGraceDays
    };

    if (params && params.customerId) {
      state.customer = await window.HLMCustomersRepository.getById(params.customerId);
    }

    container.innerHTML =
      '<div class="hlm-page-header"><h1>إصدار ترخيص جديد</h1></div>' +
      '<div class="hlm-card">' +
        '<div class="hlm-wizard-steps" id="hlmWizardSteps"></div>' +
        '<div id="hlmWizardBody"></div>' +
        '<div class="hlm-wizard-nav">' +
          '<button class="hlm-btn" id="hlmWizardBack">السابق</button>' +
          '<button class="hlm-btn hlm-btn--primary" id="hlmWizardNext">التالي</button>' +
        '</div>' +
      '</div>';

    async function renderStepIndicator() {
      document.getElementById('hlmWizardSteps').innerHTML = STEP_LABELS.map(function (label, idx) {
        var n = idx + 1;
        var cls = n === state.step ? 'is-active' : (n < state.step ? 'is-done' : '');
        return '<div class="hlm-wizard-step ' + cls + '">' + n + '. ' + label + '</div>';
      }).join('');
    }

    async function renderBody() {
      var body = document.getElementById('hlmWizardBody');
      if (state.step === 1) body.innerHTML = await step1Html(state);
      else if (state.step === 2) body.innerHTML = await step2Html(state);
      else if (state.step === 3) body.innerHTML = step3Html(state, settings);
      else if (state.step === 4) body.innerHTML = step4Html(state, settings);
      else if (state.step === 5) body.innerHTML = step5Html(state, settings);
      else if (state.step === 6) body.innerHTML = step6Html(state, settings);
      else if (state.step === 7) body.innerHTML = await step7Html(state);
      wireStep(body, state, renderAll);

      document.getElementById('hlmWizardBack').style.visibility = state.step === 1 ? 'hidden' : 'visible';
      var nextBtn = document.getElementById('hlmWizardNext');
      nextBtn.textContent = state.step === 7 ? 'إنشاء الترخيص' : 'التالي';
    }

    async function renderAll() { await renderStepIndicator(); await renderBody(); }

    document.getElementById('hlmWizardBack').addEventListener('click', function () {
      if (state.step > 1) { state.step--; renderAll(); }
    });
    document.getElementById('hlmWizardNext').addEventListener('click', async function () {
      if (state.step === 7) { await generate(state, container); return; }
      var error = validateStep(state);
      if (error) { window.HLMToast.error(error); return; }
      state.step++;
      renderAll();
    });

    await renderAll();
  }

  function validateStep(state) {
    if (state.step === 1 && !state.customer) return 'اختر عميلًا أولًا';
    if (state.step === 2) {
      if (state.deviceMode === 'existing' && !state.device) return 'اختر جهازًا مسجّلًا أو أدخل جهازًا جديدًا';
      if (state.deviceMode === 'new' && !window.HLMDevicesRepository.isValidMachineId(state.newMachineId)) return 'صيغة رقم الجهاز غير صحيحة';
    }
    return null;
  }

  // ---- Step 1: Customer --------------------------------------------------
  async function step1Html(state) {
    var customers = await window.HLMCustomersRepository.getAll();
    return (
      '<div class="hlm-field"><label>ابحث عن عميل</label><input type="text" id="hlmWizCustSearch" placeholder="اسم المكتب أو الهاتف..."></div>' +
      '<div id="hlmWizCustList" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">' +
        customers.map(function (c) {
          return '<div class="hlm-notif-item" data-cust="' + c.id + '" style="cursor:pointer;' +
            (state.customer && state.customer.id === c.id ? 'background:rgba(201,168,76,.12);' : '') + '">' +
            '<b>' + esc(c.officeName) + '</b> <span class="hlm-muted">' + esc(c.clientNumber) + (c.phone ? ' · ' + esc(c.phone) : '') + '</span></div>';
        }).join('') +
      '</div>' +
      '<button class="hlm-btn hlm-btn--sm" id="hlmWizNewCustomer" style="margin-top:10px;">+ عميل جديد</button>' +
      (state.customer ? '<div class="hlm-field-hint" style="margin-top:10px;">العميل المختار: <b>' + esc(state.customer.officeName) + '</b></div>' : '')
    );
  }

  // ---- Step 2: Device -----------------------------------------------------
  async function step2Html(state) {
    var devices = state.customer ? await window.HLMDevicesRepository.forCustomer(state.customer.id) : [];
    return (
      (devices.length ? (
        '<div class="hlm-field"><label>أجهزة مسجّلة لهذا العميل</label>' +
        devices.map(function (d) {
          return '<label class="hlm-checkbox" style="display:flex;"><input type="radio" name="hlmWizDevice" value="' + d.id + '"' +
            (state.device && state.device.id === d.id ? ' checked' : '') + '> <span>' + esc(d.machineId) +
            (d.status === 'active' ? ' <span class="hlm-badge hlm-badge--success">نشط</span>' : ' <span class="hlm-badge hlm-badge--muted">غير نشط</span>') + '</span></label>';
        }).join('') +
        '</div>'
      ) : '<div class="hlm-field-hint">لا توجد أجهزة مسجّلة لهذا العميل بعد.</div>') +
      '<div class="hlm-field" style="margin-top:14px;"><label><input type="checkbox" id="hlmWizNewDeviceToggle"' + (state.deviceMode === 'new' ? ' checked' : '') + '> تسجيل جهاز جديد بدلًا من ذلك</label></div>' +
      '<div class="hlm-field' + (state.deviceMode === 'new' ? '' : ' hlm-hidden') + '" id="hlmWizNewDeviceField"><label>رقم الجهاز الجديد (Machine ID)</label>' +
        '<input type="text" id="hlmWizNewMachineId" value="' + esc(state.newMachineId) + '" placeholder="HSM-XXXX-XXXX-XXXX"></div>'
    );
  }

  // ---- Step 3: Edition ------------------------------------------------
  function step3Html(state, settings) {
    return '<div class="hlm-radio-cards">' + settings.editions.map(function (ed) {
      return '<label class="hlm-radio-card"><input type="radio" name="hlmWizEdition" value="' + ed + '"' + (state.edition === ed ? ' checked' : '') + '><div>' + ed + '</div></label>';
    }).join('') + '</div>';
  }

  // ---- Step 4: Duration -------------------------------------------------
  function step4Html(state, settings) {
    return '<div class="hlm-radio-cards">' + settings.subscriptionTypes.map(function (t) {
      return '<label class="hlm-radio-card"><input type="radio" name="hlmWizType" value="' + t.value + '"' + (state.type === t.value ? ' checked' : '') + '><div>' + t.label + '</div></label>';
    }).join('') + '</div>';
  }

  // ---- Step 5: Modules ----------------------------------------------------
  function step5Html(state, settings) {
    return '<div class="hlm-checkbox-grid">' + settings.modulesCatalogue.map(function (m) {
      return '<label class="hlm-checkbox"><input type="checkbox" name="hlmWizModule" value="' + m + '"' + (state.modules.indexOf(m) !== -1 ? ' checked' : '') + '> ' + m + '</label>';
    }).join('') + '</div>';
  }

  // ---- Step 6: Users + grace ------------------------------------------
  function step6Html(state, settings) {
    return (
      '<div class="hlm-field"><label>عدد المستخدمين</label><div class="hlm-radio-cards">' +
        settings.userTiers.map(function (n) {
          var label = n === -1 ? 'Unlimited' : String(n);
          return '<label class="hlm-radio-card"><input type="radio" name="hlmWizUsers" value="' + n + '"' + (state.maxUsers === n ? ' checked' : '') + '><div>' + label + '</div></label>';
        }).join('') +
      '</div></div>' +
      '<div class="hlm-field"><label>فترة السماح (أيام)</label><input type="number" id="hlmWizGrace" min="0" max="90" value="' + state.graceDays + '"></div>'
    );
  }

  // ---- Step 7: Review ---------------------------------------------------
  async function step7Html(state) {
    var machineId = state.deviceMode === 'existing' && state.device ? state.device.machineId : state.newMachineId;
    var rows = [
      ['العميل', state.customer.officeName],
      ['الجهاز', machineId],
      ['النسخة', state.edition],
      ['المدة', state.type],
      ['المميزات', state.modules.join('، ') || '—'],
      ['عدد المستخدمين', state.maxUsers === -1 ? 'Unlimited' : state.maxUsers],
      ['فترة السماح', state.graceDays + ' يوم']
    ];
    return '<div class="hlm-form-grid">' + rows.map(function (r) {
      return '<div class="hlm-field"><label>' + r[0] + '</label><div style="font-weight:700;">' + esc(r[1]) + '</div></div>';
    }).join('') + '</div>' +
    '<div class="hlm-field-hint">اضغط "إنشاء الترخيص" لتوقيع الملف وإصداره. سيمكنك بعدها إرساله عبر واتساب أو البريد أو تنزيله مباشرة.</div>';
  }

  function wireStep(body, state, rerender) {
    var custList = body.querySelector('#hlmWizCustList');
    if (custList) {
      var search = body.querySelector('#hlmWizCustSearch');
      search.addEventListener('input', async function () {
        var results = search.value.trim() ? await window.HLMCustomersRepository.search(search.value.trim()) : await window.HLMCustomersRepository.getAll();
        custList.innerHTML = results.map(function (c) {
          return '<div class="hlm-notif-item" data-cust="' + c.id + '" style="cursor:pointer;">' +
            '<b>' + esc(c.officeName) + '</b> <span class="hlm-muted">' + esc(c.clientNumber) + '</span></div>';
        }).join('');
        wireCustList();
      });
      wireCustList();
      function wireCustList() {
        body.querySelectorAll('[data-cust]').forEach(function (el) {
          el.addEventListener('click', async function () {
            state.customer = await window.HLMCustomersRepository.getById(el.getAttribute('data-cust'));
            state.device = null; state.deviceMode = 'existing';
            rerender();
          });
        });
      }
      var newCustBtn = body.querySelector('#hlmWizNewCustomer');
      if (newCustBtn) newCustBtn.addEventListener('click', function () {
        window.HLMCustomersScreen.openCustomerFormModal(null, async function () {
          var all = await window.HLMCustomersRepository.getAll();
          state.customer = all[all.length - 1];
          rerender();
        });
      });
    }

    body.querySelectorAll('input[name="hlmWizDevice"]').forEach(function (r) {
      r.addEventListener('change', async function () {
        state.device = await window.HLMDevicesRepository.getById(r.value);
        state.deviceMode = 'existing';
      });
    });
    var newDeviceToggle = body.querySelector('#hlmWizNewDeviceToggle');
    if (newDeviceToggle) newDeviceToggle.addEventListener('change', function () {
      state.deviceMode = newDeviceToggle.checked ? 'new' : 'existing';
      body.querySelector('#hlmWizNewDeviceField').classList.toggle('hlm-hidden', !newDeviceToggle.checked);
    });
    var newMachineInput = body.querySelector('#hlmWizNewMachineId');
    if (newMachineInput) newMachineInput.addEventListener('input', function () { state.newMachineId = newMachineInput.value.trim().toUpperCase(); });

    body.querySelectorAll('input[name="hlmWizEdition"]').forEach(function (r) { r.addEventListener('change', function () { state.edition = r.value; }); });
    body.querySelectorAll('input[name="hlmWizType"]').forEach(function (r) { r.addEventListener('change', function () { state.type = r.value; }); });
    body.querySelectorAll('input[name="hlmWizModule"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var idx = state.modules.indexOf(cb.value);
        if (cb.checked && idx === -1) state.modules.push(cb.value);
        else if (!cb.checked && idx !== -1) state.modules.splice(idx, 1);
      });
    });
    body.querySelectorAll('input[name="hlmWizUsers"]').forEach(function (r) { r.addEventListener('change', function () { state.maxUsers = parseInt(r.value, 10); }); });
    var graceInput = body.querySelector('#hlmWizGrace');
    if (graceInput) graceInput.addEventListener('input', function () { state.graceDays = parseInt(graceInput.value, 10) || 0; });
  }

  async function generate(state, container) {
    try {
      var actor = window.HLMAuth.currentUser();
      var deviceId, machineId;
      if (state.deviceMode === 'new') {
        var newDevice = await window.HLMDevicesRepository.create({ customerId: state.customer.id, machineId: state.newMachineId }, actor);
        deviceId = newDevice.id; machineId = newDevice.machineId;
      } else {
        deviceId = state.device.id; machineId = state.device.machineId;
      }
      var record = await window.HLMLicenseIssuer.issue({
        customerId: state.customer.id, deviceId: deviceId, machineId: machineId,
        customerName: state.customer.officeName, customerPhone: state.customer.phone, customerEmail: state.customer.email,
        edition: state.edition, type: state.type, modules: state.modules,
        graceDays: state.graceDays, maxUsers: state.maxUsers === -1 ? undefined : state.maxUsers
      }, 'new', actor);
      window.HLMToast.success('تم إصدار الترخيص بنجاح');
      window.HLMLicenseResultModal.show(record, state.customer);
      window.HLMRouter.navigate('/customers/' + state.customer.id);
    } catch (e) {
      window.HLMToast.error(e.message === 'key_not_loaded' ? 'يجب تحميل مفتاح التوقيع أولًا' : 'حدث خطأ أثناء إصدار الترخيص');
    }
  }

  window.HLMLicenseWizardScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
