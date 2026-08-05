/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/users.js
 * Route /users (super_admin only) — the spec's "نظام المستخدمين
 * والصلاحيات": create/deactivate accounts, assign one of the 5 roles,
 * reset passwords. No account ever exposes another user's password.
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  async function render(container) {
    container.innerHTML = '<div class="hlm-page-header"><h1>المستخدمون والصلاحيات</h1></div><div class="hlm-skeleton" style="height:260px;"></div>';

    async function draw() {
      var users = await window.HLMUsersRepository.getAll();
      container.innerHTML =
        '<div class="hlm-page-header"><h1>المستخدمون والصلاحيات</h1>' +
        '<button class="hlm-btn hlm-btn--primary" id="hlmAddUserBtn">+ مستخدم جديد</button></div>' +
        '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr>' +
        '<th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>الحالة</th><th></th>' +
        '</tr></thead><tbody>' +
        users.map(function (u) {
          return '<tr>' +
            '<td>' + esc(u.name) + '</td><td class="hlm-nowrap">' + esc(u.username) + '</td>' +
            '<td>' + esc(window.HLMUsersRepository.ROLES[u.role].label) + '</td>' +
            '<td>' + (u.active === false ? '<span class="hlm-badge hlm-badge--muted">معطّل</span>' : '<span class="hlm-badge hlm-badge--success">نشط</span>') + '</td>' +
            '<td class="hlm-nowrap">' +
              '<button class="hlm-btn hlm-btn--sm" data-pass="' + u.id + '">كلمة مرور جديدة</button> ' +
              '<button class="hlm-btn hlm-btn--sm" data-toggle="' + u.id + '">' + (u.active === false ? 'تفعيل' : 'تعطيل') + '</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';

      document.getElementById('hlmAddUserBtn').addEventListener('click', function () { openUserFormModal(draw); });
      container.querySelectorAll('[data-pass]').forEach(function (btn) {
        btn.addEventListener('click', function () { openResetPasswordModal(btn.getAttribute('data-pass')); });
      });
      container.querySelectorAll('[data-toggle]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-toggle');
          var u = await window.HLMUsersRepository.getById(id);
          if (u.id === window.HLMAuth.currentUser().id) { window.HLMToast.error('لا يمكنك تعطيل حسابك الحالي'); return; }
          await window.HLMUsersRepository.update(id, { active: u.active === false }, window.HLMAuth.currentUser());
          window.HLMToast.success('تم التحديث');
          draw();
        });
      });
    }

    await draw();
  }

  function openUserFormModal(onSaved) {
    window.HLMModal.open({
      title: 'مستخدم جديد',
      body:
        '<div class="hlm-field"><label>الاسم</label><input type="text" id="hlmUserName"></div>' +
        '<div class="hlm-field"><label>اسم المستخدم</label><input type="text" id="hlmUserUsername"></div>' +
        '<div class="hlm-field"><label>كلمة المرور</label><input type="password" id="hlmUserPassword" minlength="8"></div>' +
        '<div class="hlm-field"><label>الدور</label><select id="hlmUserRole">' +
          Object.keys(window.HLMRoles).map(function (r) { return '<option value="' + r + '">' + window.HLMRoles[r].label + '</option>'; }).join('') +
        '</select></div>',
      footer: '<button class="hlm-btn" id="hlmModalCancel">إلغاء</button><button class="hlm-btn hlm-btn--primary" id="hlmUserSave">إنشاء</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmUserSave').addEventListener('click', async function () {
          var name = document.getElementById('hlmUserName').value.trim();
          var username = document.getElementById('hlmUserUsername').value.trim();
          var password = document.getElementById('hlmUserPassword').value;
          var role = document.getElementById('hlmUserRole').value;
          if (!name || !username || password.length < 8) { window.HLMToast.error('تأكد من تعبئة الاسم واسم المستخدم وكلمة مرور 8 أحرف على الأقل'); return; }
          try {
            await window.HLMUsersRepository.createUser({ name: name, username: username, password: password, role: role }, window.HLMAuth.currentUser());
            window.HLMToast.success('تم إنشاء المستخدم');
            window.HLMModal.close();
            onSaved();
          } catch (e) {
            window.HLMToast.error(e.message === 'username_taken' ? 'اسم المستخدم مستخدم بالفعل' : 'حدث خطأ');
          }
        });
      }
    });
  }

  function openResetPasswordModal(userId) {
    window.HLMModal.open({
      title: 'تعيين كلمة مرور جديدة',
      body: '<div class="hlm-field"><label>كلمة المرور الجديدة</label><input type="password" id="hlmNewPass" minlength="8"></div>',
      footer: '<button class="hlm-btn" id="hlmModalCancel">إلغاء</button><button class="hlm-btn hlm-btn--primary" id="hlmPassSave">حفظ</button>',
      onMount: function () {
        document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
        document.getElementById('hlmPassSave').addEventListener('click', async function () {
          var pass = document.getElementById('hlmNewPass').value;
          if (pass.length < 8) { window.HLMToast.error('8 أحرف على الأقل'); return; }
          await window.HLMUsersRepository.setPassword(userId, pass, window.HLMAuth.currentUser());
          window.HLMToast.success('تم تحديث كلمة المرور');
          window.HLMModal.close();
        });
      }
    });
  }

  window.HLMUsersScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
