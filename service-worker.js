/**
 * ============================================================================
 * HOSSAM LICENSE MANAGER PRO — service-worker.js
 * ----------------------------------------------------------------------------
 * This app has no backend — every byte it needs (HTML/CSS/JS/icons) is
 * listed below and precached on install, so once a user has opened it
 * once, it works fully offline forever (all data already lives in
 * IndexedDB on-device). Bump CACHE_VERSION whenever any precached file
 * changes so clients pick up the update.
 * ============================================================================
 */
'use strict';

var CACHE_VERSION = 'hlm-v1';
var PRECACHE = [
  './',
  'index.html',
  'offline.html',
  'manifest.json',

  'css/variables.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/responsive.css',

  'js/vendor/qrcode.js',

  'js/core/EventBus.js',
  'js/core/Db.js',
  'js/core/Repository.js',
  'js/core/KeySession.js',
  'js/core/Toast.js',
  'js/core/Modal.js',
  'js/core/Auth.js',
  'js/core/Router.js',

  'js/crypto/LicenseCrypto.js',

  'js/repositories/AuditLogRepository.js',
  'js/repositories/CustomersRepository.js',
  'js/repositories/DevicesRepository.js',
  'js/repositories/SubscriptionsRepository.js',
  'js/repositories/LicensesRepository.js',
  'js/repositories/PaymentsRepository.js',
  'js/repositories/UsersRepository.js',
  'js/repositories/SettingsRepository.js',

  'js/modules/StatsEngine.js',
  'js/modules/SearchEngine.js',
  'js/modules/ReportsEngine.js',
  'js/modules/LicenseIssuer.js',
  'js/modules/Shell.js',
  'js/modules/login.js',
  'js/modules/dashboard.js',
  'js/modules/customers.js',
  'js/modules/PaymentModals.js',
  'js/modules/licenseModals.js',
  'js/modules/licenseResultModal.js',
  'js/modules/licenseWizard.js',
  'js/modules/licenses.js',
  'js/modules/payments.js',
  'js/modules/reports.js',
  'js/modules/auditlog.js',
  'js/modules/users.js',
  'js/modules/backup.js',
  'js/modules/settings.js',

  'js/app.js',

  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-192.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Cache-first for everything same-origin (this app has no backend API to
// go "network-first" for); falls back to offline.html for navigations
// that miss the cache entirely (e.g. first-ever load with no connection).
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('offline.html');
        return caches.match('index.html');
      });
    })
  );
});
