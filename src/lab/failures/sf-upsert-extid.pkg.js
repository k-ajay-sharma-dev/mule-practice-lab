// The sample application of the sf-upsert-extid lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'sf-account-master-sync'
export const FLOW = 'account-master-sync'
const word = (v) => String(v ?? '').trim()

// the customer master: [id, name, renamed to, city, country (old field), countryCode (new field)]
export const MASTER = [
  ['HC-10001', 'Quay Deli', 'Quay Deli AS', 'Harborview', 'Norway', 'Norway'],
  ['HC-10002', 'Pier Cafe', 'Pier Cafe Ltd', 'Harborview', 'Norway', 'Norway'],
  ['HC-10003', 'Dock Bakery', 'Dock Bakery and Co', 'Saltmere', 'Denmark', 'Denmark'],
  ['HC-10004', 'Maple Bistro', 'Maple Bistro', 'Harborview', 'Norway', 'Norway'],
  ['HC-10005', 'Lantern Books', 'Lantern Books Saltmere', 'Saltmere', 'Denmark', 'Denmark'],
  ['HC-10006', 'Seaglass Florist', 'Seaglass Florist', 'Brightwater', 'Sweden', 'Sweden'],
  ['HC-10007', 'Tidewater Grocer', 'Tidewater Grocer', 'Brightwater', 'Sweden', 'Sweden'],
  ['HC-10008', 'Rope and Anchor', 'Rope and Anchor Pub', 'Harborview', 'Norway', 'Norway'],
  ['HC-20001', 'Larkspur Store Nordkai', 'Larkspur Store Nordkai', 'Nordkai', null, 'Norway'],
  ['HC-20002', 'Larkspur Store Vik', 'Larkspur Store Vik', 'Vik', null, 'Norway'],
]
// the changes of one run: four customers in turn; every third round the master sends the renamed names
export function batchOf(n) {
  return [0, 1, 2, 3].map((k) => {
    const [id, a, b, city, country, countryCode] = MASTER[(n * 4 + k) % MASTER.length]
    return { id, name: Math.floor(n / 3) % 2 ? b : a, city, country, countryCode }
  })
}
const toAccount = (c, props) => ({ Name: c.name, Brightmart_Customer_Id__c: c.id, Type: 'Customer', BillingCity: c.city, BillingCountry: c[word(props['map.billingCountry']) || 'country'] ?? null })
const q = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const el = {
  query: { at: 1, name: 'Find account by name', dsl: '<salesforce:query doc:name="Find account by name" config-ref="Salesforce_Config">' },
  create: { at: 3, name: 'Create account', dsl: '<salesforce:create doc:name="Create account" config-ref="Salesforce_Config" type="Account">' },
  update: { at: 3, name: 'Update account', dsl: '<salesforce:update doc:name="Update account" config-ref="Salesforce_Config" type="Account">' },
  bulk: { at: 2, name: 'Create job bulk api v2', dsl: '<salesforce:create-job-bulk-api-v2 doc:name="Create job bulk api v2" config-ref="Salesforce_Config" objectType="Account" operation="upsert" externalIdFieldName="Brightmart_Customer_Id__c">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 10 minutes sends the customers that changed in the customer master to Salesforce Accounts. sync.operation create-query looks each customer up with SELECT Id FROM Account WHERE Name = the customer name, then updates the first match or creates a new Account. sync.operation upsert loads the changes in a Bulk API 2.0 upsert job on Brightmart_Customer_Id__c, and at the start of the next run reads the state of the last job. map.billingCountry is the field of the customer master that goes to BillingCountry: country (the old field) or countryCode.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '10', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store } = ctx
        const sf = ctx.salesforce
        const n = (store.n ?? 0) + 1
        const batch = batchOf(n)
        const log = []
        if (word(props['sync.operation']) === 'upsert') {
          if (store.lastJob) {
            const st = sf.jobStatus(store.lastJob)
            if (st.ok && st.job.state === 'JobComplete') log.push((st.job.numberRecordsFailed ? warn : info)(`Bulk job ${st.job.id}: JobComplete, ${st.job.numberRecordsProcessed} processed, ${st.job.numberRecordsFailed} failed.${st.job.numberRecordsFailed ? ' Read its failedResults in Bulk Data Load Jobs.' : ''}`))
          }
          const j = sf.bulkCreateJob({ object: 'Account', operation: 'upsert', externalIdFieldName: 'Brightmart_Customer_Id__c' })
          if (!j.ok) return { ok: false, ms: 500, errorType: j.type, log: [...log, block('bulk', j.type, j.error)], store: { n } }
          sf.uploadData(j.job.id, batch.map((c) => toAccount(c, props)))
          sf.closeJob(j.job.id)
          log.push(info(`Bulk API 2.0 upsert job ${j.job.id} on Brightmart_Customer_Id__c with ${batch.length} customers: ${batch.map((c) => c.id).join(', ')}`))
          return { ok: true, ms: 1500, log, store: { n, lastJob: j.job.id } }
        }
        const errors = []
        for (const c of batch) {
          const found = sf.query(`SELECT Id, Name FROM Account WHERE Name = '${q(c.name)}'`)
          if (!found.ok) {
            errors.push(found.type)
            log.push(block('query', found.type, found.error))
            continue
          }
          const rec = toAccount(c, props)
          const r = found.records.length ? sf.update('Account', [{ ...rec, Id: found.records[0].Id }]) : sf.create('Account', [rec])
          if (!r.ok) {
            errors.push(r.type)
            log.push(block(found.records.length ? 'update' : 'create', r.type, r.error))
            continue
          }
          const it = r.items[0]
          if (!it.success) log.push(warn(`${c.id} ${c.name}: ${it.errors.map((e) => `${e.statusCode}: ${e.message}`).join('; ')}`))
          else log.push(info(found.records.length ? `${c.id}: query by Name found ${found.records[0].Id}, updated` : `${c.id}: no Account named '${c.name}', created ${it.id}`))
        }
        return { ok: errors.length === 0, ms: 2400, errorType: errors[0] ?? null, errors: errors.length, log, store: { n } }
      },
    },
  },
}
