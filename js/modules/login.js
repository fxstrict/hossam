/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/login.js
 * Renders the login screen directly into document.body (outside the
 * router/shell, since an unauthenticated user has no shell to render
 * inside). On first run (no users in the DB) it becomes a "create the
 * first Super Admin account" screen instead of a login form.
 */
(function (window) {
  'use strict';

  var esc = window.HLMShell ? window.HLMShell.escapeHtml : function (s) { return s; };

  async function render() {
    var body = document.body;
    var userCount = await window.HLMUsersRepository.count();
    var isFirstRun = userCount === 0;

    body.innerHTML =
      '<div class="hlm-login-screen">' +
        '<div class="hlm-login-card">' +
          '<div class="hlm-sidebar__brand-mark" style="margin:0 auto 14px;width:56px;height:56px;font-size:26px;">H</div>' +
          '<h1>Hossam License Manager <span style="color:var(--gold-dk);">PRO</span></h1>' +
          '<p class="hlm-muted" style="margin-bottom:20px;">' + (isFirstRun ? 'إعداد أول حساب مدير للنظام' : 'مركز إدارة عملاء وتراخيص الحسام') + '</p>' +
          (isFirstRun ? firstRunFormHtml() : loginFormHtml()) +
          '<div id="hlmLoginError" class="hlm-field-error hlm-hidden" style="margin-top:10px;"></div>' +
        '</div>' +
      '</div>';

    if (isFirstRun) wireFirstRun(); else wireLogin();
  }

  function loginFormHtml() {
    return (
      '<form id="hlmLoginForm">' +
        '<div class="hlm-field"><label>اسم المستخدم</label><input type="text" id="hlmUsername" autocomplete="username" required></div>' +
        '<div class="hlm-field"><label>كلمة المرور</label><input type="password" id="hlmPassword" autocomplete="current-password" required></div>' +
        '<button type="submit" class="hlm-btn hlm-btn--primary hlm-btn--block">دخول</button>' +
      '</form>'
    );
  }

  function firstRunFormHtml() {
    return (
      '<form id="hlmFirstRunForm">' +
        '<div class="hlm-field"><label>اسم المدير</label><input type="text" id="hlmSetupName" required></div>' +
        '<div class="hlm-field"><label>اسم المستخدم</label><input type="text" id="hlmSetupUsername" value="admin" required></div>' +
        '<div class="hlm-field"><label>كلمة المرور</label><input type="password" id="hlmSetupPassword" minlength="8" required></div>' +
        '<div class="hlm-field-hint" style="margin-bottom:14px;">8 أحرف على الأقل. هذا الحساب سيحصل على صلاحية Super Admin الكاملة.</div>' +
        '<button type="submit" class="hlm-btn hlm-btn--primary hlm-btn--block">إنشاء الحساب والدخول</button>' +
      '</form>'
    );
  }

  function showError(msg) {
    var el = document.getElementById('hlmLoginError');
    el.textContent = msg;
    el.classList.remove('hlm-hidden');
  }

  function wireLogin() {
    document.getElementById('hlmLoginForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var username = document.getElementById('hlmUsername').value.trim();
      var password = document.getElementById('hlmPassword').value;
      var result = await window.HLMAuth.login(username, password);
      if (!result.ok) { showError('اسم المستخدم أو كلمة المرور غير صحيحة'); return; }
      window.HLMBootApp();
    });
  }

  function wireFirstRun() {
    document.getElementById('hlmFirstRunForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var name = document.getElementById('hlmSetupName').value.trim();
      var username = document.getElementById('hlmSetupUsername').value.trim();
      var password = document.getElementById('hlmSetupPassword').value;
      if (password.length < 8) { showError('كلمة المرور يجب ألا تقل عن 8 أحرف'); return; }
      try {
        await window.HLMUsersRepository.createUser({ name: name, username: username, role: 'super_admin', password: password });
        var result = await window.HLMAuth.login(username, password);
        if (result.ok) window.HLMBootApp();
      } catch (e) {
        showError(e.message === 'username_taken' ? 'اسم المستخدم مستخدم بالفعل' : 'حدث خطأ أثناء الإنشاء');
      }
    });
  }

  window.HLMLoginScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
