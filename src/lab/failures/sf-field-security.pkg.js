// The sample application of the sf-field-security lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'sf-credit-limit-sync'
export const SYNC = 'credit-limit-sync'
export const CHECK = 'order-credit-check'
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'

// the credit limits of the ERP for the customers of the Brightmart org
export const LIMITS = { 'HC-10001': 25000, 'HC-10002': 12000, 'HC-10003': 8000, 'HC-10004': 30000, 'HC-10005': 5000, 'HC-10006': 9500 }
// the open order value of each customer in the order hold check (lab made figures)
const OPEN = { 'HC-10001': 4100, 'HC-10002': 13250, 'HC-10003': 2200, 'HC-10004': 7800, 'HC-10005': 900, 'HC-10006': 3300 }
const ids = Object.keys(LIMITS)
const inList = ids.map((x) => `'${x}'`).join(', ')

const el = {
  find: { at: 1, name: 'Find accounts', dsl: '<salesforce:query doc:name="Find accounts" config-ref="Salesforce_Config">' },
  update: { at: 3, name: 'Update credit limits', dsl: '<salesforce:update doc:name="Update credit limits" config-ref="Salesforce_Config" type="Account">' },
  check: { at: 4, name: 'Raise error', dsl: '<raise-error doc:name="Raise error" type="APP:SAVE_FAILED">' },
  credit: { at: 1, name: 'Read credit limits', dsl: '<salesforce:query doc:name="Read credit limits" config-ref="Salesforce_Config">' },
}
const block = (flow, where, type, message) => muleError({ flow, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Two flows. credit-limit-sync runs every 15 minutes: it finds the Accounts of the ERP customers by Brightmart_Customer_Id__c and updates their Credit_Limit__c with the limits of the ERP. The Update operation of the connector returns a SaveResult per record and raises no error when a record fails. sync.checkSaveResults true makes the flow read the SaveResults and raise APP:SAVE_FAILED when any record failed. order-credit-check runs every 15 minutes too: it reads Credit_Limit__c and holds the orders of customers over their limit.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken'),
    schedules: [
      { flow: SYNC, type: 'fixed', value: '15', unit: 'minutes', enabled: true },
      { flow: CHECK, type: 'fixed', value: '15', unit: 'minutes', enabled: true },
    ],
    run: {
      [SYNC]: (ctx) => {
        const { props, store } = ctx
        const sf = ctx.salesforce
        const found = sf.query(`SELECT Id, Brightmart_Customer_Id__c FROM Account WHERE Brightmart_Customer_Id__c IN (${inList})`)
        if (!found.ok) return { ok: false, ms: 300, errorType: found.type, log: [block(SYNC, 'find', found.type, found.error)], store: { syncClean: 0 } }
        const recs = found.records.map((r) => ({ Id: r.Id, Credit_Limit__c: LIMITS[r.Brightmart_Customer_Id__c] }))
        const r = sf.update('Account', recs)
        if (!r.ok) return { ok: false, ms: 400, errorType: r.type, log: [block(SYNC, 'update', r.type, r.error)], store: { syncClean: 0 } }
        const failed = r.items.filter((x) => !x.success)
        const clean = failed.length === 0
        if (!yes(props['sync.checkSaveResults'])) {
          // the flow logs the call, not the outcome: failed records go unnoticed
          return { ok: true, ms: 600, log: [info(`Credit limits sent for ${recs.length} Accounts.`)], store: { syncClean: clean ? (store.syncClean ?? 0) + 1 : 0 } }
        }
        if (clean) return { ok: true, ms: 600, log: [info(`Credit limits saved for ${recs.length} Accounts. Every SaveResult has success true.`)], store: { syncClean: (store.syncClean ?? 0) + 1 } }
        const first = failed[0].errors[0]
        const log = failed.map((x) => warn(`SaveResult of ${recs[r.items.indexOf(x)].Id}: success false, ${x.errors.map((e) => `${e.statusCode}: ${e.message}`).join('; ')}`)).slice(0, 3)
        log.push(block(SYNC, 'check', 'APP:SAVE_FAILED', `${failed.length} of ${recs.length} records were not saved. First error: ${first.statusCode}: ${first.message}`))
        return { ok: false, ms: 600, errorType: 'APP:SAVE_FAILED', log, store: { syncClean: 0 } }
      },
      [CHECK]: (ctx) => {
        const { store } = ctx
        const sf = ctx.salesforce
        const r = sf.query(`SELECT Id, Brightmart_Customer_Id__c, Credit_Limit__c FROM Account WHERE Brightmart_Customer_Id__c IN (${inList})`)
        if (!r.ok) return { ok: false, ms: 300, errorType: r.type, log: [block(CHECK, 'credit', r.type, r.error)], store: { checkClean: 0 } }
        const over = r.records.filter((x) => x.Credit_Limit__c !== null && OPEN[x.Brightmart_Customer_Id__c] > x.Credit_Limit__c).map((x) => x.Brightmart_Customer_Id__c)
        const none = r.records.filter((x) => x.Credit_Limit__c === null).length
        return { ok: true, ms: 400, log: [info(`Credit check of ${r.records.length} customers: ${over.length ? `orders on hold for ${over.join(', ')}` : 'no customer over the limit'}.${none ? ` ${none} have no credit limit yet.` : ''}`)], store: { checkClean: none ? 0 : (store.checkClean ?? 0) + 1 } }
      },
    },
  },
}
