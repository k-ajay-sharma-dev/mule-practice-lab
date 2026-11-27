// The sample application of the sf-lock-row lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'sf-contact-bulk-load'
export const FLOW = 'contact-bulk-load'
export const ACCOUNTS = 12
export const PER_ACCOUNT = 24
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'

// the contact file of the CRM export: the export lists the contacts in the order they were changed, so the contacts of
// one account are spread over the whole file
export function contactFile(accountIds) {
  const rows = []
  for (let k = 0; k < PER_ACCOUNT; k++)
    accountIds.forEach((id, a) => {
      const n = a * PER_ACCOUNT + k + 1
      rows.push({ Harbor_Contact_Id__c: `HCT-${String(n).padStart(4, '0')}`, LastName: `Contact ${n}`, Email: `contact${n}@larkspur-stores.example`, AccountId: id })
    })
  return rows
}
const strip = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('sf__')))

const el = {
  job: { at: 2, name: 'Create job bulk api v2', dsl: '<salesforce:create-job-bulk-api-v2 doc:name="Create job bulk api v2" config-ref="Salesforce_Config" objectType="Contact" operation="upsert" externalIdFieldName="Harbor_Contact_Id__c">' },
  failed: { at: 1, name: 'Get failed results', dsl: '<salesforce:get-failed-results-bulk-api-v2 doc:name="Get failed results" config-ref="Salesforce_Config">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 20 minutes loads the contact file of the CRM export into Salesforce with a Bulk API 2.0 upsert job on Harbor_Contact_Id__c. The file is in the order of the export. load.sortByParent true sorts the rows by AccountId first, so the contacts of one account travel together. load.retryFailed true makes the next run read the failedResults of the last job and load only the rows that failed, instead of the whole file. The account IDs of the file are in contacts.accounts.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken', 'contacts.accounts'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '20', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store } = ctx
        const sf = ctx.salesforce
        const log = []
        let rows = contactFile(String(props['contacts.accounts']).split(',').map((x) => x.trim()))
        let what = `the contact file, ${rows.length} rows`
        if (store.lastJob) {
          const st = sf.jobStatus(store.lastJob)
          if (st.ok && st.job.state === 'JobComplete') {
            log.push((st.job.numberRecordsFailed ? warn : info)(`Bulk job ${st.job.id}: JobComplete, ${st.job.numberRecordsProcessed} processed, ${st.job.numberRecordsFailed} failed`))
            if (st.job.numberRecordsFailed && yes(props['load.retryFailed'])) {
              const f = sf.failedResults(st.job.id)
              if (!f.ok) return { ok: false, ms: 500, errorType: f.type, log: [...log, block('failed', f.type, f.error)] }
              rows = f.rows.map(strip)
              what = `the ${rows.length} failed rows of job ${st.job.id}`
            }
          } else if (st.ok && st.job.state !== 'Failed' && st.job.state !== 'Aborted') {
            log.push(info(`Bulk job ${st.job.id} is ${st.job.state}. This run waits for it.`))
            return { ok: true, ms: 200, log }
          }
        }
        if (yes(props['load.sortByParent'])) rows = [...rows].sort((a, b) => (a.AccountId < b.AccountId ? -1 : a.AccountId > b.AccountId ? 1 : 0))
        const j = sf.bulkCreateJob({ object: 'Contact', operation: 'upsert', externalIdFieldName: 'Harbor_Contact_Id__c' })
        if (!j.ok) return { ok: false, ms: 500, errorType: j.type, log: [...log, block('job', j.type, j.error)] }
        sf.uploadData(j.job.id, rows)
        sf.closeJob(j.job.id)
        log.push(info(`Bulk API 2.0 upsert job ${j.job.id} on Contact with ${what}${yes(props['load.sortByParent']) ? ', sorted by AccountId' : ''}`))
        return { ok: true, ms: 1500, log, store: { lastJob: j.job.id, jobs: (store.jobs ?? 0) + 1 } }
      },
    },
  },
}
