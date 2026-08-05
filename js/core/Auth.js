/**
 * HOSSAM LICENSE MANAGER PRO — js/core/Auth.js
 * Local session (sessionStorage — cleared when the tab/browser closes;
 * never IndexedDB, never the password itself, only the authenticated
 * user's id/name/role so the UI can restore "who's logged in" on
 * refresh within the same tab session).
 */
(function (window) {
  'use strict';

  var SESSION_KEY = 'hlm_session_v1';
  var _current = null;

  function _persist() {
    try {
      if (_current) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(_current));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = window.sessionStorage.getItem(SESSION_KEY);
      _current = raw ? JSON.parse(raw) : null;
    } catch (e) { _current = null; }
    return _current;
  }

  async function login(username, password) {
    var user = await window.HLMUsersRepository.authenticate(username, password);
    if (!user) return { ok: false, reason: 'invalid_credentials' };
    _current = { id: user.id, name: user.name, username: user.username, role: user.role };
    _persist();
    await window.HLMAuditLogRepository.log({ entity: 'الجلسات', entityId: user.id, action: 'login', actorId: user.id, actorName: user.name });
    window.HLMBus.emit('auth:login', _current);
    return { ok: true, user: _current };
  }

  function logout() {
    var prev = _current;
    _current = null;
    _persist();
    if (prev) {
      window.HLMAuditLogRepository.log({ entity: 'الجلسات', entityId: prev.id, action: 'logout', actorId: prev.id, actorName: prev.name });
    }
    window.HLMBus.emit('auth:logout', null);
  }

  function currentUser() { return _current; }

  function hasPermission(permission) {
    if (!_current) return false;
    return window.HLMUsersRepository.hasPermission(_current.role, permission);
  }

  function hasAnyRole(roles) {
    if (!_current) return false;
    return roles.indexOf(_current.role) !== -1 || roles.indexOf('*') !== -1;
  }

  window.HLMAuth = {
    restore: restore,
    login: login,
    logout: logout,
    currentUser: currentUser,
    hasPermission: hasPermission,
    hasAnyRole: hasAnyRole
  };
})(typeof window !== 'undefined' ? window : globalThis);
