/**
 * ============================================================================
 * HOSSAM LICENSE MANAGER PRO — js/core/Db.js
 * ----------------------------------------------------------------------------
 * Single IndexedDB database for the whole app. Plain IndexedDB (no Dexie,
 * no bundler dependency) — mirrors نظام الحسام's own storage philosophy
 * (StorageAdapter -> IndexedDBAdapter -> Repository) at a scope appropriate
 * for this standalone admin tool. All object-store access from the rest of
 * the app MUST go through js/core/Repository.js, never directly here.
 * ============================================================================
 */
(function (window) {
  'use strict';

  var DB_NAME = 'hlm_license_manager_pro';
  var DB_VERSION = 2; // PHASE C v3/v3.1/v3.2 — added `activationCodes` store (1 → 2). Additive only: every existing store/index is created unconditionally on every onupgradeneeded pass regardless of DB_VERSION (see below), so this bump touches ONLY the new store — no existing data is read, moved, or dropped. This DB_VERSION is entirely separate from and unrelated to elhossam's own protected IndexedDBSchema.js/DB_VERSION.

  var STORES = {
    customers: { keyPath: 'id', indexes: ['officeName', 'lawyerName', 'phone', 'email', 'governorate', 'clientNumber', 'status'] },
    devices: { keyPath: 'id', indexes: ['customerId', 'machineId', 'status'] },
    subscriptions: { keyPath: 'id', indexes: ['customerId', 'status', 'endDate', 'edition'] },
    licenses: { keyPath: 'id', indexes: ['customerId', 'deviceId', 'licenseId', 'status', 'issuedAt'] },
    payments: { keyPath: 'id', indexes: ['customerId', 'invoiceNumber', 'status', 'date'] },
    users: { keyPath: 'id', indexes: ['username', 'role'] },
    auditLog: { keyPath: 'id', indexes: ['at', 'actorId', 'entity', 'entityId'] },
    settings: { keyPath: 'key', indexes: [] },
    // PHASE C v3/v3.1/v3.2 — local bookkeeping of activation codes this
    // tool has generated (hash + status only; the plaintext code is
    // NEVER persisted here, same rule as the server side — see
    // js/repositories/ActivationCodesRepository.js).
    activationCodes: { keyPath: 'id', indexes: ['licenseId', 'activationCodeHash', 'status'] }
  };

  var _dbPromise = null;

  function open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      var req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        Object.keys(STORES).forEach(function (storeName) {
          var cfg = STORES[storeName];
          var store;
          if (!db.objectStoreNames.contains(storeName)) {
            store = db.createObjectStore(storeName, { keyPath: cfg.keyPath });
          } else {
            store = ev.target.transaction.objectStore(storeName);
          }
          cfg.indexes.forEach(function (idx) {
            if (!store.indexNames.contains(idx)) {
              store.createIndex(idx, idx, { unique: false });
            }
          });
        });
      };
      req.onsuccess = function (ev) { resolve(ev.target.result); };
      req.onerror = function () { reject(req.error || new Error('indexeddb_open_failed')); };
      req.onblocked = function () { /* another tab holds an old version open */ };
    });
    return _dbPromise;
  }

  function tx(storeName, mode) {
    return open().then(function (db) {
      var t = db.transaction(storeName, mode || 'readonly');
      return t.objectStore(storeName);
    });
  }

  function promisifyRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('request_failed')); };
    });
  }

  function getAll(storeName) {
    return tx(storeName, 'readonly').then(function (store) {
      return promisifyRequest(store.getAll());
    });
  }

  function get(storeName, key) {
    return tx(storeName, 'readonly').then(function (store) {
      return promisifyRequest(store.get(key));
    });
  }

  function put(storeName, value) {
    return tx(storeName, 'readwrite').then(function (store) {
      return promisifyRequest(store.put(value));
    });
  }

  function remove(storeName, key) {
    return tx(storeName, 'readwrite').then(function (store) {
      return promisifyRequest(store.delete(key));
    });
  }

  function clear(storeName) {
    return tx(storeName, 'readwrite').then(function (store) {
      return promisifyRequest(store.clear());
    });
  }

  function getByIndex(storeName, indexName, value) {
    return tx(storeName, 'readonly').then(function (store) {
      return promisifyRequest(store.index(indexName).getAll(value));
    });
  }

  function countAll(storeName) {
    return tx(storeName, 'readonly').then(function (store) {
      return promisifyRequest(store.count());
    });
  }

  /** Exports every store as { storeName: [records...] } for backup. */
  async function exportAll() {
    var out = {};
    for (var name in STORES) {
      out[name] = await getAll(name);
    }
    return out;
  }

  /** Imports a previously exported snapshot. `mode` = 'replace' clears
   *  each store first; 'merge' upserts by primary key only. */
  async function importAll(snapshot, mode) {
    mode = mode || 'merge';
    for (var name in STORES) {
      if (!snapshot[name]) continue;
      if (mode === 'replace') await clear(name);
      for (var i = 0; i < snapshot[name].length; i++) {
        await put(name, snapshot[name][i]);
      }
    }
  }

  window.HLMDb = {
    STORES: STORES,
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    open: open,
    getAll: getAll,
    get: get,
    put: put,
    remove: remove,
    clear: clear,
    getByIndex: getByIndex,
    countAll: countAll,
    exportAll: exportAll,
    importAll: importAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
