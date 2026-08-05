/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/dashboard.js
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  async function render(container) {
    container.innerHTML = '<div class="hlm-skeleton" style="height:120px;margin-bottom:14px;"></div>'.repeat(2);

    var customers = await window.HLMCustomersRepository.getAll();
    var subs = await window.HLMSubscriptionsRepository.getAll();
    var licenses = await window.HLMLicensesRepository.getAll();
    var payments = await window.HLMPaymentsRepository.getAll();
    var stats = window.HLMStatsEngine.computeDashboardStats(customers, subs, licenses, payments);
    var feed = window.HLMStatsEngine.computeNotifications(customers, subs);

    container.innerHTML =
      '<div class="hlm-page-header"><h1>لوحة التحكم</h1>' +
      '<a href="#/licenses/new" class="hlm-btn hlm-btn--primary">+ إصدار ترخيص جديد</a></div>' +

      '<div class="hlm-stats-grid">' +
        stat('إجمالي العملاء', stats.totalCustomers, '') +
        stat('نسخ نشطة', stats.activeSubscriptions, 'success') +
        stat('انتهى الاشتراك', stats.expiredSubscriptions, 'danger') +
        stat('ينتهي خلال أسبوع', stats.expiringWithinWeek, 'warning') +
        stat('ينتهي اليوم', stats.expiringToday, 'danger') +
        stat('تراخيص Lifetime', stats.lifetimeCount, '') +
        stat('عملاء جدد هذا الشهر', stats.newCustomersThisMonth, '') +
        stat('إيرادات هذا العام', formatMoney(stats.revenueThisYear), 'success') +
      '</div>' +

      '<div class="hlm-card">' +
        '<div class="hlm-card__title">توزيع النسخ (Editions)</div>' +
        editionBars(stats.byEdition, stats.totalCustomers) +
      '</div>' +

      '<div class="hlm-card">' +
        '<div class="hlm-flex-between"><div class="hlm-card__title" style="margin:0;">أحدث التنبيهات</div>' +
        '<span class="hlm-muted" style="font-size:12px;">' + feed.items.length + ' تنبيه</span></div>' +
        (feed.items.length
          ? '<div class="hlm-table-wrap" style="margin-top:10px;border:none;"><table class="hlm-table">' +
              feed.items.slice(0, 8).map(function (i) {
                return '<tr data-customer-id="' + i.customerId + '"><td><span class="hlm-badge hlm-badge--' + (i.severity === 'danger' ? 'danger' : 'warning') + '">' + labelFor(i.type) + '</span></td>' +
                  '<td class="wrap">' + esc(i.message) + '</td></tr>';
              }).join('') + '</table></div>'
          : '<div class="hlm-empty">لا توجد تنبيهات — كل الاشتراكات في وضع جيد ✅</div>') +
      '</div>';

    container.querySelectorAll('[data-customer-id]').forEach(function (row) {
      row.addEventListener('click', function () { window.HLMRouter.navigate('/customers/' + row.getAttribute('data-customer-id')); });
    });
  }

  function labelFor(type) {
    return { expiring_today: 'ينتهي اليوم', expiring_soon: 'قريب الانتهاء', grace_period: 'فترة سماح', read_only: 'قراءة فقط' }[type] || type;
  }

  function stat(label, value, tone) {
    return '<div class="hlm-stat hlm-stat--accent' + (tone ? ' hlm-stat--' + tone : '') + '">' +
      '<div class="hlm-stat__value">' + value + '</div><div class="hlm-stat__label">' + label + '</div></div>';
  }

  function editionBars(byEdition, total) {
    var keys = Object.keys(byEdition);
    if (!keys.length) return '<div class="hlm-empty">لا توجد بيانات بعد</div>';
    return keys.map(function (edition) {
      var count = byEdition[edition];
      var pct = total ? Math.round((count / total) * 100) : 0;
      return '<div style="margin-bottom:10px;">' +
        '<div class="hlm-flex-between" style="font-size:12.5px;margin-bottom:4px;"><span>' + esc(edition) + '</span><span class="hlm-muted">' + count + '</span></div>' +
        '<div style="background:var(--cream-md);border-radius:6px;height:8px;overflow:hidden;">' +
          '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,var(--gold-lt),var(--gold));"></div>' +
        '</div></div>';
    }).join('');
  }

  function formatMoney(n) { return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'; }

  window.HLMDashboardScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
