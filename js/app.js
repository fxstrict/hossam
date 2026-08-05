/**
 * ============================================================================
 * HOSSAM LICENSE MANAGER PRO — js/app.js
 * ----------------------------------------------------------------------------
 * Entry point. Wires the router to every screen module, drives the
 * login/first-run flow, and boots the authenticated shell.
 * ============================================================================
 */
(function (window) {
  'use strict';

  function registerRoutes() {
    var R = window.HLMRouter;
    R.register('/dashboard', { roles: ['*'], render: window.HLMDashboardScreen.render });
    R.register('/customers', { roles: ['*'], render: window.HLMCustomersScreen.renderList });
    R.register('/customers/:id', { roles: ['*'], render: window.HLMCustomersScreen.renderDetail });
    R.register('/licenses', { roles: ['*'], render: window.HLMLicensesScreen.render });
    R.register('/licenses/new', { roles: ['super_admin', 'license_manager'], render: window.HLMLicenseWizardScreen.render });
    R.register('/licenses/new/:customerId', { roles: ['super_admin', 'license_manager'], render: window.HLMLicenseWizardScreen.render });
    R.register('/payments', { roles: ['*'], render: window.HLMPaymentsScreen.render });
    R.register('/reports', { roles: ['*'], render: window.HLMReportsScreen.render });
    R.register('/auditlog', { roles: ['super_admin', 'license_manager'], render: window.HLMAuditLogScreen.render });
    R.register('/users', { roles: ['super_admin'], render: window.HLMUsersScreen.render });
    R.register('/backup', { roles: ['super_admin'], render: window.HLMBackupScreen.render });
    R.register('/settings', { roles: ['super_admin'], render: window.HLMSettingsScreen.render });
    R.register('/forbidden', { roles: ['*'], render: renderForbidden });
    R.setNotFound(renderNotFound);
  }

  function renderForbidden(container) {
    container.innerHTML =
      '<div class="hlm-empty">' +
        '<h2>لا تملك صلاحية الوصول لهذه الصفحة</h2>' +
        '<p class="hlm-muted">راجع مدير النظام إذا كنت تعتقد أن هذا خطأ.</p>' +
        '<a href="#/dashboard" class="hlm-btn hlm-btn--primary">العودة للوحة التحكم</a>' +
      '</div>';
  }

  function renderNotFound(container) {
    container.innerHTML =
      '<div class="hlm-empty">' +
        '<h2>الصفحة غير موجودة</h2>' +
        '<a href="#/dashboard" class="hlm-btn hlm-btn--primary">العودة للوحة التحكم</a>' +
      '</div>';
  }

  var routesRegistered = false;

  /** Called after a successful login/first-run, and on boot if a valid
   *  session already exists. Renders the persistent shell then mounts
   *  the router inside it. */
  window.HLMBootApp = async function () {
    document.body.innerHTML = '<div id="hlmApp"></div>';
    var appRoot = document.getElementById('hlmApp');
    window.HLMShell.render(appRoot);

    if (!routesRegistered) { registerRoutes(); routesRegistered = true; }

    var content = document.getElementById('hlmContent');
    window.HLMRouter.init(content);
  };

  async function boot() {
    // Merge any persisted setting overrides into the in-memory defaults
    // used across screens (SettingsRepository never holds secrets).
    try {
      var stored = await window.HLMSettingsRepository.getAllAsMap();
      Object.assign(window.HLM_DEFAULT_SETTINGS, stored);
    } catch (e) { /* first run, store not yet populated — fine */ }

    window.HLMAuth.restore();
    if (window.HLMAuth.currentUser()) {
      await window.HLMBootApp();
    } else {
      await window.HLMLoginScreen.render();
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(function () { /* offline-first is best-effort */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
