// The sample application of the sf-cdc lab. Imports only platform-log.js and the import free Salesforce engine.
import { info, muleError, needs, warn } from '../platform-log.js'
import { BASE, iso, timeOf } from '../platform-salesforce.js'

export const NAME = 'sf-loyalty-cdc-listener'
export const FLOW = 'account-change-listener'
export const CHANNEL = '/data/AccountChangeEvent'
const word = (v) => String(v ?? '').trim()
const yes = (v) => word(v).toLowerCase() === 'true'

const el = {
  source: { at: 0, name: 'Replay channel listener', dsl: '<salesforce:replay-channel-listener doc:name="Replay channel listener" config-ref="Salesforce_Config" streamingChannel="/data/AccountChangeEvent" replayOption="${sf.replayOption}" autoReplay="${sf.resumeFromLastReplayId}">' },
  resync: { at: 1, name: 'Query changed accounts', dsl: '<salesforce:query doc:name="Query changed accounts" config-ref="Salesforce_Config">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

// applies one account state to the loyalty store; a changed tier sends the member a tier mail
function apply(store, id, fields, at, log, idempotent) {
  const cur = store.accounts[id] ?? {}
  if (idempotent && cur.at !== undefined && at <= cur.at) return false
  if (fields.Loyalty_Tier__c !== undefined && fields.Loyalty_Tier__c !== cur.tier) {
    store.mails = (store.mails ?? 0) + 1
    if (cur.at !== undefined && at <= cur.at) {
      store.dupMails = (store.dupMails ?? 0) + 1
      log.push(warn(`Tier mail for ${id} sent again: the change of ${iso(at)} was already applied`))
    }
  }
  store.accounts[id] = { tier: fields.Loyalty_Tier__c !== undefined ? fields.Loyalty_Tier__c : cur.tier, phone: fields.Phone !== undefined ? fields.Phone : cur.phone, at: Math.max(at, cur.at ?? at) }
  return true
}

export const PACKAGES = {
  [NAME]: {
    note:
      'Listens to the Change Data Capture channel /data/AccountChangeEvent and keeps the tier of each Account in the loyalty store. On start the Replay channel listener subscribes: with sf.resumeFromLastReplayId true it resumes after the last replay ID it processed, kept in a persistent Object Store; otherwise it uses sf.replayOption: ONLY_NEW (replay ID -1) or ALL (-2, every retained event). resync.enabled true first queries the Accounts changed since resync.since (SystemModstamp) and loads them. loyalty.idempotent true skips an event whose commitTimestamp is not newer than what the store has for that Account.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken', 'sf.replayOption'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store } = ctx
        const sf = ctx.salesforce
        store.accounts ??= {}
        const log = []
        const idem = yes(props['loyalty.idempotent'])
        const fresh = store.cfg !== ctx.app.config
        if (fresh && yes(props['resync.enabled'])) {
          const since = timeOf(props['resync.since'])
          if (Number.isNaN(since)) return { ok: false, ms: 200, errorType: 'MULE:EXPRESSION', log: [block('resync', 'MULE:EXPRESSION', `resync.since '${word(props['resync.since'])}' is not a date time such as 2026-11-02T08:00:00Z`)] }
          const r = sf.query(`SELECT Id, Name, Loyalty_Tier__c, Phone, SystemModstamp FROM Account WHERE SystemModstamp > ${new Date(BASE + since).toISOString()}`)
          if (!r.ok) return { ok: false, ms: 600, errorType: r.type, log: [block('resync', r.type, r.error)] }
          for (const a of r.records) apply(store, a.Id, { Loyalty_Tier__c: a.Loyalty_Tier__c ?? null, Phone: a.Phone ?? null }, timeOf(a.SystemModstamp), log, idem)
          store.resync = { since, n: r.records.length, t: ctx.now }
          log.push(info(`Resync: ${r.records.length} Accounts changed since ${iso(since)} loaded into the loyalty store`))
        }
        let from
        if (fresh) {
          const resume = yes(props['sf.resumeFromLastReplayId']) && store.replayId
          const opt = word(props['sf.replayOption']).toUpperCase()
          from = resume ? store.replayId : opt === 'ALL' ? -2 : opt === 'ONLY_NEW' ? -1 : Number(props['sf.replayId'] ?? -1)
        } else from = store.replayId
        const r = sf.subscribe(CHANNEL, from)
        if (!r.ok) return { ok: false, ms: 1000, errorType: r.type, log: [block('source', r.type, `Subscription to ${CHANNEL} failed: ${r.error}`)] }
        if (fresh) log.push(info(`Subscribed to ${CHANNEL} with replay ID ${from}`))
        for (const e of r.events) {
          const h = e.payload.ChangeEventHeader
          const id = h.recordIds[0]
          if (h.changeType === 'DELETE') delete store.accounts[id]
          else if (apply(store, id, e.payload, h.commitTimestamp, log, idem)) log.push(info(`${h.changeType} ${id} replayId ${e.replayId} commitTimestamp ${iso(h.commitTimestamp)}: ${h.changedFields.join(', ') || 'new record'}`))
          else log.push(info(`replayId ${e.replayId} for ${id} skipped: the store already has this change`))
          store.lastEventAt = Math.max(store.lastEventAt ?? 0, h.commitTimestamp)
        }
        return { ok: true, ms: 300, log, store: { ...store, replayId: r.lastReplayId, cfg: ctx.app.config } }
      },
    },
  },
}
