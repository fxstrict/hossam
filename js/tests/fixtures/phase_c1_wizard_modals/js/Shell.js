/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/Shell.js
 * Renders the persistent chrome (sidebar + topbar) once the user is
 * authenticated. The router mounts individual screens into #hlmContent
 * inside this shell.
 */
(function (window) {
  'use strict';

  var NAV_ITEMS = [
    { path: '/dashboard', label: 'Dashboard', icon: '&#128202;', roles: ['*'] },
    { path: '/customers', label: 'العملاء', icon: '&#128100;', roles: ['*'] },
    { path: '/licenses', label: 'التراخيص', icon: '&#128273;', roles: ['*'] },
    { path: '/licenses/new', label: 'إصدار ترخيص جديد', icon: '&#10133;', roles: ['super_admin', 'license_manager'] },
    { path: '/payments', label: 'الفواتير', icon: '&#128179;', roles: ['*'] },
    { path: '/reports', label: 'التقارير', icon: '&#128196;', roles: ['*'] },
    { path: '/auditlog', label: 'سجل العمليات', icon: '&#128220;', roles: ['super_admin', 'license_manager'] },
    { path: '/users', label: 'المستخدمون', icon: '&#128101;', roles: ['super_admin'] },
    { path: '/backup', label: 'نسخ احتياطي', icon: '&#128190;', roles: ['super_admin'] },
    { path: '/settings', label: 'الإعدادات', icon: '&#9881;', roles: ['super_admin'] }
  ];

  function visibleFor(user) {
    return NAV_ITEMS.filter(function (item) {
      return item.roles.indexOf('*') !== -1 || item.roles.indexOf(user.role) !== -1;
    });
  }

  function renderShell(rootEl) {
    var user = window.HLMAuth.currentUser();
    var items = visibleFor(user);

    rootEl.innerHTML =
      '<div class="hlm-shell">' +
        '<header class="hlm-topbar">' +
          '<button class="hlm-btn hlm-btn--icon hlm-no-print" id="hlmSidebarToggle" aria-label="القائمة">&#9776;</button>' +
          '<div class="hlm-topbar__search">' +
            '<input type="text" id="hlmGlobalSearch" placeholder="بحث بالاسم، الهاتف، رقم الجهاز، رقم الترخيص، رقم الفاتورة...">' +
            '<span class="hlm-topbar__search-icon">&#128269;</span>' +
            '<div id="hlmSearchResults" class="hlm-notif-panel hlm-hidden"></div>' +
          '</div>' +
          '<div class="hlm-grow"></div>' +
          '<div class="hlm-bell" id="hlmBell">&#128276;<span id="hlmBellDot" class="hlm-bell__dot hlm-hidden"></span>' +
            '<div id="hlmNotifPanel" class="hlm-notif-panel hlm-hidden"></div>' +
          '</div>' +
          '<div class="hlm-flex">' +
            '<div class="hlm-text-center">' +
              '<div style="font-weight:700;font-size:13px;">' + escapeHtml(user.name) + '</div>' +
              '<div class="hlm-muted" style="font-size:11px;">' + escapeHtml(window.HLMUsersRepository.ROLES[user.role].label) + '</div>' +
            '</div>' +
            '<button class="hlm-btn hlm-btn--sm" id="hlmLogoutBtn">خروج</button>' +
          '</div>' +
        '</header>' +
        '<main class="hlm-content" id="hlmContent"></main>' +
        '<div class="hlm-sidebar-backdrop" id="hlmSidebarBackdrop"></div>' +
        '<aside class="hlm-sidebar" id="hlmSidebar">' +
          '<div class="hlm-sidebar__brand">' +
            '<div class="hlm-sidebar__brand-mark">H</div>' +
            '<div><div class="hlm-sidebar__brand-text">Hossam License Manager</div><div class="hlm-sidebar__brand-sub">PRO</div></div>' +
          '</div>' +
          '<ul class="hlm-nav" id="hlmNav">' +
            items.map(navItemHtml).join('') +
          '</ul>' +
        '</aside>' +
      '</div>';

    function closeSidebar() {
      document.getElementById('hlmSidebar').classList.remove('is-open');
      document.getElementById('hlmSidebarBackdrop').classList.remove('is-open');
    }
    function toggleSidebar() {
      document.getElementById('hlmSidebar').classList.toggle('is-open');
      document.getElementById('hlmSidebarBackdrop').classList.toggle('is-open');
    }

    document.getElementById('hlmSidebarToggle').addEventListener('click', toggleSidebar);
    document.getElementById('hlmSidebarBackdrop').addEventListener('click', closeSidebar);
    document.getElementById('hlmLogoutBtn').addEventListener('click', function () {
      window.HLMAuth.logout();
      window.location.hash = '#/login';
      window.location.reload();
    });

    wireSearch();
    wireNotifications();
    highlightActiveNav();
    window.HLMBus.on('route:after', highlightActiveNav);
    window.HLMBus.on('route:after', closeSidebar);

    refreshNotifBadge();
    window.HLMBus.on('auditlog:new', refreshNotifBadge);
  }

  function navItemHtml(item) {
    return '<li class="hlm-nav__item"><a class="hlm-nav__link" data-path="' + item.path + '" href="#' + item.path + '">' +
      '<span class="hlm-nav__icon">' + item.icon + '</span><span>' + item.label + '</span>' +
      '</a></li>';
  }

  function highlightActiveNav() {
    var current = window.HLMRouter.currentHash();
    document.querySelectorAll('.hlm-nav__link').forEach(function (a) {
      var path = a.getAttribute('data-path');
      a.classList.toggle('is-active', current === path || (path !== '/dashboard' && current.indexOf(path) === 0));
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var searchDebounce = null;
  function wireSearch() {
    var input = document.getElementById('hlmGlobalSearch');
    var panel = document.getElementById('hlmSearchResults');
    input.addEventListener('input', function () {
      clearTimeout(searchDebounce);
      var term = input.value.trim();
      if (!term) { panel.classList.add('hlm-hidden'); return; }
      searchDebounce = setTimeout(async function () {
        var results = await window.HLMSearchEngine.globalSearch(term);
        if (!results.length) {
          panel.innerHTML = '<div class="hlm-notif-item hlm-muted">لا توجد نتائج</div>';
        } else {
          panel.innerHTML = results.slice(0, 12).map(function (r) {
            return '<div class="hlm-notif-item" data-customer-id="' + r.customer.id + '">' +
              '<div style="font-weight:700;">' + escapeHtml(r.customer.officeName) + '</div>' +
              '<div class="hlm-muted" style="font-size:11.5px;">' + escapeHtml(r.reasons.join(' · ')) + '</div>' +
            '</div>';
          }).join('');
        }
        panel.classList.remove('hlm-hidden');
      }, 220);
    });
    panel.addEventListener('click', function (ev) {
      var item = ev.target.closest('[data-customer-id]');
      if (item) {
        window.HLMRouter.navigate('/customers/' + item.getAttribute('data-customer-id'));
        panel.classList.add('hlm-hidden');
        input.value = '';
      }
    });
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('.hlm-topbar__search')) panel.classList.add('hlm-hidden');
    });
  }

  function wireNotifications() {
    var bell = document.getElementById('hlmBell');
    var panel = document.getElementById('hlmNotifPanel');
    bell.addEventListener('click', async function (ev) {
      ev.stopPropagation();
      var open = !panel.classList.contains('hlm-hidden');
      if (open) { panel.classList.add('hlm-hidden'); return; }
      var customers = await window.HLMCustomersRepository.getAll();
      var subs = await window.HLMSubscriptionsRepository.getAll();
      var feed = window.HLMStatsEngine.computeNotifications(customers, subs);
      panel.innerHTML = feed.items.length
        ? feed.items.map(function (i) {
            return '<div class="hlm-notif-item" data-customer-id="' + i.customerId + '">' +
              '<span class="hlm-badge hlm-badge--' + (i.severity === 'danger' ? 'danger' : 'warning') + '" style="margin-inline-end:6px;">' +
              (i.severity === 'danger' ? '!' : '⏱') + '</span>' + escapeHtml(i.message) + '</div>';
          }).join('')
        : '<div class="hlm-notif-item hlm-muted">لا توجد تنبيهات حاليًا</div>';
      panel.classList.remove('hlm-hidden');
    });
    panel.addEventListener('click', function (ev) {
      var item = ev.target.closest('[data-customer-id]');
      if (item) { window.HLMRouter.navigate('/customers/' + item.getAttribute('data-customer-id')); panel.classList.add('hlm-hidden'); }
    });
    document.addEventListener('click', function () { panel.classList.add('hlm-hidden'); });
  }

  async function refreshNotifBadge() {
    var dot = document.getElementById('hlmBellDot');
    if (!dot) return;
    var customers = await window.HLMCustomersRepository.getAll();
    var subs = await window.HLMSubscriptionsRepository.getAll();
    var feed = window.HLMStatsEngine.computeNotifications(customers, subs);
    dot.classList.toggle('hlm-hidden', feed.items.length === 0);
  }

  window.HLMShell = { render: renderShell, escapeHtml: escapeHtml };
})(typeof window !== 'undefined' ? window : globalThis);
