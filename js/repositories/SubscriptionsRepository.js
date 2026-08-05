/**
 * HOSSAM LICENSE MANAGER PRO — js/repositories/SubscriptionsRepository.js
 * One "current subscription" record per customer, kept in sync every time
 * a license is issued/renewed/transferred. State machine mirrors the real
 * app's js/license/LicenseCore.js computeSubscriptionState() exactly, so
 * "days remaining" shown here always matches what the customer's own
 * install will show.
 */
(function (window) {
  'use strict';

  var States = Object.freeze({
    ACTIVE: 'active',
    GRACE: 'grace',
    READ_ONLY: 'read_only',
    LIFETIME: 'lifetime'
  });

  function daysBetween(a, b) { return (b.getTime() - a.getTime()) / 86400000; }

  /** Pure function — identical logic to the main app's LicenseCore. */
  function computeState(subscription, now) {
    now = now || new Date();
    if (!subscription.endDate) {
      return { state: States.LIFETIME, daysRemaining: null, daysIntoGrace: null };
    }
    var expires = new Date(subscription.endDate);
    var daysRemaining = Math.ceil(daysBetween(now, expires));
    if (daysRemaining >= 0) {
      return { state: States.ACTIVE, daysRemaining: daysRemaining, daysIntoGrace: null };
    }
    var graceDays = typeof subscription.graceDays === 'number' ? subscription.graceDays : 15;
    var daysIntoGrace = -daysRemaining;
    if (daysIntoGrace <= graceDays) {
      return { state: States.GRACE, daysRemaining: daysRemaining, daysIntoGrace: daysIntoGrace };
    }
    return { state: States.READ_ONLY, daysRemaining: daysRemaining, daysIntoGrace: daysIntoGrace };
  }

  function SubscriptionsRepository() {
    window.HLMRepository.call(this, 'subscriptions', 'الاشتراكات');
  }
  SubscriptionsRepository.prototype = Object.create(window.HLMRepository.prototype);

  SubscriptionsRepository.prototype.forCustomer = async function (customerId) {
    var rows = await this.getByIndex('customerId', customerId);
    return rows[0] || null;
  };

  /** Called after every license issue/renew/transfer to keep the
   *  customer's subscription snapshot current. */
  SubscriptionsRepository.prototype.syncFromLicense = async function (customerId, licensePayload, actor) {
    var existing = await this.forCustomer(customerId);
    var patch = {
      customerId: customerId,
      edition: licensePayload.edition,
      type: licensePayload.type,
      startDate: licensePayload.issuedAt,
      endDate: licensePayload.expiresAt,
      graceDays: licensePayload.graceDays,
      modules: licensePayload.modules || [],
      maxUsers: licensePayload.maxUsers || null,
      lastLicenseId: licensePayload.licenseId
    };
    if (existing) {
      return this.update(existing.id, patch, actor);
    }
    return this.create(patch, actor);
  };

  SubscriptionsRepository.prototype.computeState = computeState;
  SubscriptionsRepository.prototype.States = States;

  window.HLMSubscriptionsRepository = new SubscriptionsRepository();
})(typeof window !== 'undefined' ? window : globalThis);
