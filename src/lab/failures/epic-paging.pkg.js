// The sample application of the epic-paging lab. Imports only platform-log.js and the import free Epic engine, so the
// engine can load it without a cycle. It copies the vital signs of the Harbor Care patients from Epic.
import { info, line, muleError, warn } from '../platform-log.js'
import { bearer, epicConfig, httpErrorType, httpFailText, searchAll, tokenFailure } from '../platform-epic.js'

export const VITALS = 'bayview-vitals-sync'
export const VITALS_FLOW = 'vitals-sync-flow'
const el = {
  token: { flow: VITALS_FLOW, at: 1, name: 'Request access token', dsl: '<http:request doc:name="Request access token" method="POST" config-ref="Epic_Token_Config" path="/oauth2/token">' },
  patient: { flow: VITALS_FLOW, at: 3, name: 'Search Patient', dsl: '<http:request doc:name="Search Patient" method="GET" config-ref="Epic_FHIR_Config" path="/Patient">' },
  vitals: { flow: VITALS_FLOW, at: 4, name: 'Search vital signs', dsl: '<http:request doc:name="Search vital signs" method="GET" config-ref="Epic_FHIR_Config" path="/Observation">' },
}
const on = (v) => String(v ?? '').trim().toLowerCase() === 'true'

export const PACKAGES = {
  [VITALS]: {
    note: `The vital signs sync of Harbor Care. The flow ${VITALS_FLOW} runs every 15 minutes. For each MRN in sync.mrns it finds the patient in Epic at Bayview Health and searches its Observations of category vital-signs with _count sync.pageSize. With sync.followNext true it reads every page through link next; otherwise only the first page. With sync.retryOn429 true it waits the Retry-After of a 429 and tries again, up to 3 times. The access token stays in the object store until a minute before it expires.`,
    schedules: [{ flow: VITALS_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [VITALS_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const b = bearer(ctx.epic, epicConfig(props), store.token, now)
        if (!b.ok) {
          const f = tokenFailure(b.r)
          return { ok: false, ms: 200, errorType: f.type, log: [muleError({ ...el.token, file: VITALS, type: f.type, message: f.message })] }
        }
        const opts = { follow: on(props['sync.followNext']), retry429: on(props['sync.retryOn429']) }
        const patients = { ...(store.patients ?? {}) }
        const log = []
        const failed = (step, r) => {
          const type = httpErrorType(r.status)
          log.push(muleError({ ...step, file: VITALS, type, message: httpFailText('GET', r.url, r.status) }))
          if (r.status === 429) log.push(line('ERROR', `Epic answered 429 with Retry-After: ${r.retryAfter ?? '?'}`))
          return { ok: false, ms: 300 + ctx.epic.elapsed(), errorType: type, log, store: { token: b.keep, patients } }
        }
        for (const mrn of String(props['sync.mrns'] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
          const p = searchAll(ctx.epic, b.token, 'Patient', { identifier: `MRN|${mrn}` }, { ...opts, follow: false })
          if (!p.ok) return failed(el.patient, p)
          const pt = p.entries[0]
          if (!pt) {
            log.push(warn(`Patient ${mrn}: no patient with this MRN at Bayview Health`))
            continue
          }
          const o = searchAll(ctx.epic, b.token, 'Observation', { patient: pt.id, category: 'vital-signs', _count: props['sync.pageSize'] || '10' }, opts)
          if (!o.ok) return failed(el.vitals, o)
          patients[mrn] = { id: pt.id, stored: o.entries.length, pages: o.pages, t: now }
          log.push(info(`Patient ${mrn}: ${o.entries.length} vital signs stored${o.retries ? ` after ${o.retries} ${o.retries === 1 ? 'retry' : 'retries'} (waited ${o.waited} s)` : ''}`))
        }
        return { ok: true, ms: 400 + ctx.epic.elapsed(), log, store: { token: b.keep, patients, lastOk: now } }
      },
    },
  },
}
