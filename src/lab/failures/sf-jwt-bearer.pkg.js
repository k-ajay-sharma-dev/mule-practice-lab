// The sample application of the sf-jwt-bearer lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

export const NAME = 'sf-credit-check-jwt'
export const FLOW = 'credit-check-sync'

const el = { query: { at: 1, name: 'Read accounts', dsl: '<salesforce:query doc:name="Read accounts" config-ref="Salesforce_Config">' } }
const block = (type, message) => muleError({ flow: FLOW, file: NAME, ...el.query, type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 5 minutes reads the customer Accounts from Salesforce for the credit check. The Salesforce connector uses the OAuth JWT bearer connection: it signs a JWT with the private key in salesforce.keyStore, with iss salesforce.consumerKey (the consumer key of the connected app), sub salesforce.principal (the username) and aud salesforce.audienceUrl, and posts it to the token endpoint of salesforce.url. In the lab the keystore file name says which certificate it holds.',
    boot: needs('salesforce.url', 'salesforce.consumerKey', 'salesforce.keyStore', 'salesforce.principal', 'salesforce.audienceUrl'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const r = ctx.salesforce.query("SELECT Id, Name FROM Account WHERE Type = 'Customer'")
        if (!r.ok) return { ok: false, ms: 800, errorType: r.type, log: [block(r.type, r.error)] }
        return { ok: true, ms: 500, log: [info(`Read ${r.totalSize} customer accounts for the credit check`)], store: { reads: (ctx.store.reads ?? 0) + 1 } }
      },
    },
  },
}
