/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/UsersRepository.js
 * Local multi-account RBAC, per the spec's "نظام المستخدمين والصلاحيات":
 *   super_admin      — everything.
 *   license_manager  — issue/renew/transfer licenses.
 *   accountant       — view customers/invoices only, cannot issue licenses.
 *   support          — view customer data, resend activation files only.
 *   sales            — add customers, create quotes; no key/security access.
 *
 * Passwords are NEVER stored in plain text (Security & Authentication
 * standards): only a PBKDF2-SHA256 hash + random per-user salt, computed
 * with Web Crypto. There is no password recovery — a Super Admin resets
 * the account by setting a new password, which re-hashes it.
 */
(function (window) {
  'use strict';

  var ROLES = {
    super_admin: { label: 'مدير النظام (Super Admin)', permissions: ['*'] },
    license_manager: {
      label: 'مدير التراخيص',
      permissions: ['customers.view', 'customers.edit', 'devices.view', 'devices.edit',
        'licenses.view', 'licenses.issue', 'licenses.renew', 'licenses.transfer', 'licenses.revoke',
        'subscriptions.view', 'payments.view', 'reports.view', 'notifications.view', 'search.use']
    },
    accountant: {
      label: 'المحاسب',
      permissions: ['customers.view', 'payments.view', 'payments.edit', 'reports.view', 'search.use']
    },
    support: {
      label: 'موظف الدعم',
      permissions: ['customers.view', 'devices.view', 'licenses.view', 'licenses.resend', 'search.use']
    },
    sales: {
      label: 'موظف المبيعات',
      permissions: ['customers.view', 'customers.create', 'payments.view', 'search.use']
    }
  };

  var PBKDF2_ITERATIONS = 150000;

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }
  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  async function hashPassword(plainPassword, saltHex) {
    var salt = saltHex ? hexToBytes(saltHex) : window.crypto.getRandomValues(new Uint8Array(16));
    var keyMaterial = await window.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(plainPassword), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    var bits = await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial, 256
    );
    return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt), iterations: PBKDF2_ITERATIONS };
  }

  async function verifyPassword(plainPassword, record) {
    var computed = await hashPassword(plainPassword, record.passwordSalt);
    return computed.hash === record.passwordHash;
  }

  function hasPermission(role, permission) {
    var def = ROLES[role];
    if (!def) return false;
    return def.permissions.indexOf('*') !== -1 || def.permissions.indexOf(permission) !== -1;
  }

  function UsersRepository() {
    window.HLMRepository.call(this, 'users', 'المستخدمون');
  }
  UsersRepository.prototype = Object.create(window.HLMRepository.prototype);

  UsersRepository.prototype.findByUsername = async function (username) {
    var rows = await this.getByIndex('username', String(username || '').trim().toLowerCase());
    return rows[0] || null;
  };

  UsersRepository.prototype.createUser = async function (data, actor) {
    if (!ROLES[data.role]) throw new Error('invalid_role');
    var existing = await this.findByUsername(data.username);
    if (existing) throw new Error('username_taken');
    var hashed = await hashPassword(data.password);
    var payload = Object.assign({}, data, {
      username: String(data.username).trim().toLowerCase(),
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      active: data.active !== false
    });
    delete payload.password;
    return this.create(payload, actor);
  };

  UsersRepository.prototype.setPassword = async function (userId, newPassword, actor) {
    var hashed = await hashPassword(newPassword);
    return this.update(userId, { passwordHash: hashed.hash, passwordSalt: hashed.salt }, actor);
  };

  UsersRepository.prototype.authenticate = async function (username, password) {
    var user = await this.findByUsername(username);
    if (!user || user.active === false) return null;
    var ok = await verifyPassword(password, user);
    return ok ? user : null;
  };

  UsersRepository.prototype.ROLES = ROLES;
  UsersRepository.prototype.hasPermission = hasPermission;

  window.HLMUsersRepository = new UsersRepository();
  window.HLMRoles = ROLES;
})(typeof window !== 'undefined' ? window : globalThis);
