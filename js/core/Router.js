/**
 * HOSSAM LICENSE MANAGER PRO — js/core/Router.js
 * Simple hash router: #/dashboard, #/customers, #/customers/:id, etc.
 * Each registered screen has: { path, roles, render(container, params) }.
 */
(function (window) {
  'use strict';

  var routes = [];
  var mountEl = null;
  var currentCleanup = null;
  var notFoundHandler = null;

  function register(path, def) {
    // path like '/customers/:id' -> regex with named group
    var paramNames = [];
    var pattern = path.replace(/:[^/]+/g, function (m) {
      paramNames.push(m.slice(1));
      return '([^/]+)';
    });
    routes.push({
      path: path,
      regex: new RegExp('^' + pattern + '$'),
      paramNames: paramNames,
      def: def
    });
  }

  function setNotFound(handler) { notFoundHandler = handler; }

  function init(container) {
    mountEl = container;
    window.addEventListener('hashchange', resolve);
    resolve();
  }

  function currentHash() {
    var h = window.location.hash || '#/dashboard';
    return h.replace(/^#/, '') || '/dashboard';
  }

  function navigate(path) {
    window.location.hash = '#' + path;
  }

  async function resolve() {
    var path = currentHash().split('?')[0];
    var match = null;
    var params = {};
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      var m = path.match(r.regex);
      if (m) {
        match = r;
        r.paramNames.forEach(function (name, idx) { params[name] = decodeURIComponent(m[idx + 1]); });
        break;
      }
    }

    if (typeof currentCleanup === 'function') {
      try { currentCleanup(); } catch (e) {}
      currentCleanup = null;
    }

    if (!match) {
      if (notFoundHandler) notFoundHandler(mountEl);
      return;
    }

    if (match.def.roles && window.HLMAuth && !window.HLMAuth.hasAnyRole(match.def.roles)) {
      window.HLMBus.emit('route:forbidden', { path: path });
      navigate('/forbidden');
      return;
    }

    window.HLMBus.emit('route:before', { path: path, params: params });
    var result = await match.def.render(mountEl, params);
    if (typeof result === 'function') currentCleanup = result;
    window.HLMBus.emit('route:after', { path: path, params: params });
  }

  window.HLMRouter = {
    register: register,
    setNotFound: setNotFound,
    init: init,
    navigate: navigate,
    resolve: resolve,
    currentHash: currentHash
  };
})(typeof window !== 'undefined' ? window : globalThis);
