// The sample application of the sf-login lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

export const NAME = 'sf-order-status-push'
export const FLOW = 'order-status-push'
const STATUS = ['Draft', 'Activated']

const el = { query: { at: 1, name: 'Find order', dsl: '<salesforce:query doc:name="Find order" config-ref="Salesforce_Config">' }, update: { at: 2, name: 'Update order status', dsl: '<salesforce:update doc:name="Update order status" config-ref="Salesforce_Config" type="Order">' } }
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 5 minutes pushes the status of the open orders of the order system to Salesforce Orders. The Salesforce connector uses Basic Authentication: salesforce.username, salesforce.password and salesforce.securityToken (the connector sends the password with the token after it) to the authorization URL salesforce.url. A new connection logs in once and then reuses its session.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const sf = ctx.salesforce
        const r = sf.query("SELECT Id, Status FROM Order WHERE Brightmart_Order_Id__c = 'O-1001'")
        if (!r.ok) return { ok: false, ms: 900, errorType: r.type, log: [block('query', r.type, r.error)] }
        const n = (ctx.store.pushed ?? 0) + 1
        const u = r.records[0] && sf.update('Order', [{ Id: r.records[0].Id, Status: STATUS[n % 2] }])
        if (u && !u.ok) return { ok: false, ms: 900, errorType: u.type, log: [block('update', u.type, u.error)] }
        return { ok: true, ms: 400, log: [info(`Order O-1001 status pushed to Salesforce: ${STATUS[n % 2]}`)], store: { pushed: n } }
      },
    },
  },
}
