/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/SettingsRepository.js
 * Simple key-value settings store. Holds only non-sensitive configuration:
 * the PUBLIC signing key (safe to store — it's already embedded in the
 * main app), default grace days, module catalogue, branding. The PRIVATE
 * key is never written here (see js/crypto/LicenseCrypto.js header).
 */
(function (window) {
  'use strict';

  function SettingsRepository() {
    this.storeName = 'settings';
  }

  SettingsRepository.prototype.get = async function (key, fallback) {
    var row = await window.HLMDb.get('settings', key);
    return row ? row.value : fallback;
  };

  SettingsRepository.prototype.set = async function (key, value) {
    await window.HLMDb.put('settings', { key: key, value: value, updatedAt: window.HLMUtils.nowIso() });
    window.HLMBus.emit('settings:changed', { key: key, value: value });
    return value;
  };

  SettingsRepository.prototype.getAllAsMap = async function () {
    var rows = await window.HLMDb.getAll('settings');
    var map = {};
    rows.forEach(function (r) { map[r.key] = r.value; });
    return map;
  };

  window.HLMSettingsRepository = new SettingsRepository();

  // Sensible defaults, applied once on first boot (settings.js seeds these).
  window.HLM_DEFAULT_SETTINGS = {
    officeName: 'مكتب الحسام للمحاماة',
    defaultGraceDays: 15,
    defaultMaxTransfers: 2,
    modulesCatalogue: ['AI', 'OCR', 'Google Drive', 'Backup', 'WhatsApp', 'Teams', 'Accounting'],
    editions: ['Starter', 'Professional', 'Enterprise', 'Network', 'Cloud'],
    subscriptionTypes: [
      { value: 'trial', label: 'تجريبي (14 يوم)' },
      { value: 'monthly', label: 'شهري' },
      { value: 'quarterly', label: '٣ أشهر' },
      { value: 'semiannual', label: '٦ أشهر' },
      { value: 'yearly', label: 'سنوي' },
      { value: 'triennial', label: '٣ سنوات' },
      { value: 'lifetime', label: 'دائم (Lifetime)' }
    ],
    userTiers: [1, 5, 10, -1] // -1 = Unlimited
  };
})(typeof window !== 'undefined' ? window : globalThis);
