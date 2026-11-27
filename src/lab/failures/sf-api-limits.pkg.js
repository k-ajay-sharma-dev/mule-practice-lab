// The sample application of the sf-api-limits lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'sf-customer-nightly-sync'
export const NIGHT = 'nightly-customer-sync'
export const DELTA = 'customer-delta-sync'
const word = (v) => String(v ?? '').trim().toLowerCase()
const yes = (v) => word(v) === 'true'
const HOUR = 3600000

// changed customers per run of the delta sync: about 1.9 percent of the customers in office hours, few at night
export const deltasPerRun = (customers, now) => {
  const h = Math.floor((now % 86400000) / HOUR)
  return Math.max(1, Math.round(customers * (h >= 8 && h < 18 ? 0.019 : 0.00075)))
}
const customer = (i) => ({ Name: `Harbor customer ${i}`, Harbor_Customer_Id__c: `HC-${20000 + i}`, Type: 'Customer', BillingCountry: 'Norway' })

const el = {
  limits: { at: 1, name: 'Check API limits', dsl: '<salesforce:get-limits doc:name="Check API limits" config-ref="Salesforce_Config">' },
  upsert: { at: 3, name: 'Upsert customer', dsl: '<salesforce:upsert doc:name="Upsert customer" config-ref="Salesforce_Config" objectType="Account" externalIdFieldName="Harbor_Customer_Id__c">' },
  bulk: { at: 3, name: 'Create job bulk api v2', dsl: '<salesforce:create-job-bulk-api-v2 doc:name="Create job bulk api v2" config-ref="Salesforce_Config" objectType="Account" operation="upsert" externalIdFieldName="Harbor_Customer_Id__c">' },
  composite: { at: 3, name: 'Upsert changed customers', dsl: '<salesforce:composite-upsert doc:name="Upsert changed customers" config-ref="Salesforce_Config" sObjectType="Account" externalIdFieldName="Harbor_Customer_Id__c">' },
}
const block = (flow, where, type, message) => muleError({ flow, file: NAME, ...el[where], type, message })

// the limits check: true when the run may go on
function reserveOk(ctx, flow, need) {
  const p = ctx.props
  if (!yes(p['sync.limits.check'])) return { go: true }
  const l = ctx.salesforce.limits()
  if (!l.ok) return { go: false, out: { ok: false, ms: 400, errorType: l.type, log: [block(flow, 'limits', l.type, l.error)] } }
  const rem = l.limits.DailyApiRequests.Remaining
  const keep = Number(p['sync.limits.minRemaining']) || 0
  if (rem - need >= keep) return { go: true, note: info(`Limits check: DailyApiRequests Remaining ${rem} of ${l.limits.DailyApiRequests.Max}. This run needs about ${need}.`) }
  return { go: false, out: { ok: true, ms: 300, log: [warn(`Limits check: DailyApiRequests Remaining ${rem}. This run needs about ${need} and must leave ${keep} for the other integrations, so it waits for the next run.`)] } }
}

export const PACKAGES = {
  [NAME]: {
    note:
      'Syncs the customer master to Salesforce Accounts with the Salesforce connector. nightly-customer-sync runs at 01:00 UTC for all sync.customers customers. sync.nightly.mode rest calls Upsert once per customer; bulk uploads all of them in one Bulk API 2.0 upsert job on Harbor_Customer_Id__c. customer-delta-sync runs every 15 minutes for the customers changed since the last run. sync.delta.mode rest makes one call per changed customer; composite sends them 200 at a time with the sObject Collections upsert. sync.limits.check true reads /limits before each run and skips the run when DailyApiRequests Remaining, minus what the run needs, would fall below sync.limits.minRemaining.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken', 'sync.customers'),
    schedules: [
      { flow: NIGHT, type: 'cron', value: '0 0 1 * * ?', tz: 'UTC', enabled: true },
      { flow: DELTA, type: 'fixed', value: '15', unit: 'minutes', enabled: true },
    ],
    run: {
      [NIGHT]: (ctx) => {
        const p = ctx.props
        const n = Number(p['sync.customers']) || 0
        const bulk = word(p['sync.nightly.mode']) === 'bulk'
        const check = reserveOk(ctx, NIGHT, bulk ? 5 : n)
        if (!check.go) return check.out
        const log = check.note ? [check.note] : []
        const sf = ctx.salesforce
        if (bulk) {
          const j = sf.bulkCreateJob({ object: 'Account', operation: 'upsert', externalIdFieldName: 'Harbor_Customer_Id__c' })
          if (!j.ok) return { ok: false, ms: 600, errorType: j.type, log: [...log, block(NIGHT, 'bulk', j.type, j.error)] }
          const up = sf.uploadData(j.job.id, [1, 2, 3, 4, 5].map(customer), { total: n })
          const done = up.ok && sf.closeJob(j.job.id)
          if (!up.ok || !done.ok) return { ok: false, ms: 900, errorType: (up.ok ? done : up).type, log: [...log, block(NIGHT, 'bulk', (up.ok ? done : up).type, (up.ok ? done : up).error)] }
          log.push(info(`Bulk API 2.0 job ${j.job.id} for ${n} customers: data uploaded, state UploadComplete. Salesforce processes it in the background.`))
          return { ok: true, ms: 4000, log, store: { lastJob: j.job.id } }
        }
        const r = sf.upsert('Account', 'Harbor_Customer_Id__c', [customer(1)], { times: n })
        if (!r.ok) return { ok: false, ms: (r.made ?? 0) * 140, errorType: r.type, errors: n - (r.made ?? 0), log: [...log, info(`Upserted ${r.made ?? 0} of ${n} customers, one call each`), block(NIGHT, 'upsert', r.type, r.error)] }
        log.push(info(`Upserted ${n} customers to Account, one Upsert call each (${n} API requests)`))
        return { ok: true, ms: n * 140, log }
      },
      [DELTA]: (ctx) => {
        const p = ctx.props
        const k = deltasPerRun(Number(p['sync.customers']) || 0, ctx.now)
        const composite = word(p['sync.delta.mode']) === 'composite'
        const calls = composite ? Math.ceil(k / 200) : k
        const check = reserveOk(ctx, DELTA, calls)
        if (!check.go) return check.out
        const sf = ctx.salesforce
        const log = check.note ? [check.note] : []
        if (composite) {
          for (let i = 0; i < calls; i++) {
            const r = sf.composite('Account', [customer(100 + i), customer(300 + i)], { operation: 'upsert', externalIdFieldName: 'Harbor_Customer_Id__c' })
            if (!r.ok) return { ok: false, ms: 800, errorType: r.type, log: [...log, block(DELTA, 'composite', r.type, r.error)] }
          }
          log.push(info(`${k} changed customers sent in ${calls} sObject Collections call${calls > 1 ? 's' : ''} of up to 200 records`))
          return { ok: true, ms: 600 * calls, log }
        }
        const r = sf.upsert('Account', 'Harbor_Customer_Id__c', [customer(100)], { times: k })
        if (!r.ok) return { ok: false, ms: 900, errorType: r.type, errors: k - (r.made ?? 0), log: [...log, info(`${r.made ?? 0} of ${k} changed customers upserted`), block(DELTA, 'upsert', r.type, r.error)] }
        log.push(info(`${k} changed customers upserted, one call each`))
        return { ok: true, ms: k * 140, log }
      },
    },
  },
}
