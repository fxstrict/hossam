/**
 * HOSSAM LICENSE MANAGER PRO — js/modules/auditlog.js
 * Route /auditlog — append-only trail of every create/update/delete/
 * login/logout across the app. Clearing the log requires Super Admin,
 * per the spec: "لا يمكن حذف هذا السجل إلا بصلاحية المدير العام".
 */
(function (window) {
  'use strict';
  var esc = window.HLMShell.escapeHtml;

  function actionLabel(a) {
    return { create: 'إنشاء', update: 'تعديل', delete: 'حذف', login: 'دخول', logout: 'خروج' }[a] || a;
  }
  function actionBadge(a) {
    var tone = { create: 'success', update: 'info', delete: 'danger', login: 'gold', logout: 'muted' }[a] || 'muted';
    return '<span class="hlm-badge hlm-badge--' + tone + '">' + actionLabel(a) + '</span>';
  }

  async function render(container) {
    container.innerHTML = '<div class="hlm-page-header"><h1>سجل العمليات</h1></div><div class="hlm-skeleton" style="height:300px;"></div>';

    var entries = await window.HLMAuditLogRepository.recent();
    var isSuperAdmin = window.HLMAuth.hasAnyRole(['super_admin']);

    container.innerHTML =
      '<div class="hlm-page-header"><h1>سجل العمليات</h1>' +
      (isSuperAdmin ? '<button class="hlm-btn hlm-btn--danger hlm-btn--sm" id="hlmClearAuditBtn">مسح السجل بالكامل</button>' : '') +
      '</div>' +
      (entries.length ? (
        '<div class="hlm-table-wrap"><table class="hlm-table"><thead><tr>' +
        '<th>التاريخ والوقت</th><th>العملية</th><th>الكيان</th><th>بواسطة</th>' +
        '</tr></thead><tbody>' +
        entries.map(function (e) {
          return '<tr><td class="hlm-nowrap">' + new Date(e.at).toLocaleString('ar-EG') + '</td>' +
            '<td>' + actionBadge(e.action) + '</td>' +
            '<td>' + esc(e.entity) + '</td>' +
            '<td>' + esc(e.actorName || 'النظام') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      ) : '<div class="hlm-empty">لا توجد عمليات مسجّلة بعد</div>');

    var clearBtn = document.getElementById('hlmClearAuditBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      window.HLMModal.open({
        title: 'تأكيد مسح سجل العمليات',
        body: '<p>سيتم حذف كل سجلات التدقيق نهائيًا ولا يمكن التراجع عن ذلك. هل أنت متأكد؟</p>',
        footer: '<button class="hlm-btn" id="hlmModalCancel">تراجع</button><button class="hlm-btn hlm-btn--danger" id="hlmClearConfirm">مسح نهائي</button>',
        onMount: function () {
          document.getElementById('hlmModalCancel').addEventListener('click', window.HLMModal.close);
          document.getElementById('hlmClearConfirm').addEventListener('click', async function () {
            await window.HLMAuditLogRepository.clearAll();
            window.HLMModal.close();
            window.HLMToast.success('تم مسح السجل');
            render(container);
          });
        }
      });
    });
  }

  window.HLMAuditLogScreen = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
