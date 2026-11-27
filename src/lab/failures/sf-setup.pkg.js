// The sample application of the sf-setup lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'sf-loyalty-sync'
export const TEST = 'sf-connection-test'
export const SYNC = 'loyalty-customer-sync'
// the loyalty members of the week: they become Accounts with their tier
export const MEMBERS = [
  { Name: 'Gull Rock Coffee', Brightmart_Customer_Id__c: 'HC-30001', Loyalty_Tier__c: 'Silver' },
  { Name: 'Breakwater Books', Brightmart_Customer_Id__c: 'HC-30002', Loyalty_Tier__c: 'Bronze' },
  { Name: 'Lighthouse Deli', Brightmart_Customer_Id__c: 'HC-30003', Loyalty_Tier__c: 'Gold' },
]

const el = {
  test: { at: 0, name: 'Test connection', dsl: '<salesforce:sfdc-config-jwt name="Salesforce_Config"> (Test Connection)' },
  upsert: { at: 1, name: 'Upsert loyalty members', dsl: '<salesforce:upsert doc:name="Upsert loyalty members" config-ref="Salesforce_Config" objectType="Account" externalIdFieldName="Brightmart_Customer_Id__c">' },
}
const block = (flow, where, type, message) => muleError({ flow, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Sends the loyalty members of Brightmart to Salesforce as Accounts, upserted on Brightmart_Customer_Id__c with Name and Loyalty_Tier__c. The Salesforce connector uses the OAuth JWT bearer connection: salesforce.auth jwt, salesforce.url (the token endpoint, https://login.salesforce.com), salesforce.audienceUrl, salesforce.consumerKey (of the connected app), salesforce.keyStore (the keystore file in the app), salesforce.keyStorePassword (a secure property) and salesforce.principal (the username of the integration user). sf-connection-test is a flow you run by hand from Schedules: it logs in and reports the result, like Test Connection in Anypoint Studio.',
    boot: needs('salesforce.auth', 'salesforce.url', 'salesforce.audienceUrl', 'salesforce.consumerKey', 'salesforce.keyStore', 'salesforce.keyStorePassword', 'salesforce.principal'),
    schedules: [
      { flow: TEST, type: 'fixed', value: '1440', unit: 'minutes', enabled: false },
      { flow: SYNC, type: 'fixed', value: '5', unit: 'minutes', enabled: true },
    ],
    run: {
      [TEST]: (ctx) => {
        const r = ctx.salesforce.login()
        if (!r.ok) return { ok: false, ms: 900, errorType: r.type, log: [block(TEST, 'test', r.type, `Test Connection failed: ${r.error}`)] }
        return { ok: true, ms: 700, log: [info(`Test Connection: connection is valid. Logged in to ${r.org} as ${r.user} with ${r.loginType}.`)] }
      },
      [SYNC]: (ctx) => {
        const r = ctx.salesforce.upsert('Account', 'Brightmart_Customer_Id__c', MEMBERS)
        if (!r.ok) return { ok: false, ms: 900, errorType: r.type, log: [block(SYNC, 'upsert', r.type, r.error)] }
        const bad = r.items.map((it, i) => (it.success ? null : `${MEMBERS[i].Brightmart_Customer_Id__c}: ${it.errors.map((e) => `${e.statusCode}: ${e.message}`).join('; ')}`)).filter(Boolean)
        if (bad.length) return { ok: false, ms: 900, errorType: 'APP:SYNC_FAILED', log: [...bad.map((b) => warn(b)), block(SYNC, 'upsert', 'APP:SYNC_FAILED', `${bad.length} of ${MEMBERS.length} loyalty members were not saved`)] }
        return { ok: true, ms: 600, log: [info(`Upserted ${MEMBERS.length} loyalty members: ${r.items.filter((x) => x.created).length} created, ${r.items.filter((x) => !x.created).length} updated`)] }
      },
    },
  },
}
