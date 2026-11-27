// The sample application of the wd-effective-date lab. Imports only platform-log.js and the import free Workday engine,
// so the engine can load it without a cycle. It opens and closes the accounts of workers (badge, mail, store till) from
// the hire and termination events of Workday.
import { info, muleError, needs, warn } from '../platform-log.js'
import { parseWd, wdConfig, wdDate, wdTime } from '../platform-workday.js'

export const ACCESS = 'brightmart-wd-access-sync'
export const ACCESS_FLOW = 'access-delta-flow'
const el = { flow: ACCESS_FLOW, at: 1, name: 'Get worker events', dsl: '<http:request method="GET" doc:name="Get worker events" config-ref="Workday_RaaS_Config" path="/${raas.owner}/${raas.report}">' }
const keep = (list, item, n = 80) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  [ACCESS]: {
    note: `Opens and closes the accounts of workers. The flow ${ACCESS_FLOW} runs every 15 minutes and reads the report raas.report of raas.owner as RaaS. With delta.mode entry it asks for the events completed since the watermark (prompts Entry_From and Entry_To). With delta.mode effective it asks for the events whose effective date passed since the watermark (Effective_From and Effective_To). With delta.mode both it sends both windows and the report returns an event that matches either. An event that is not effective yet is not applied. delta.replayFrom, a date such as 2026-11-02, makes the next run start there once instead of at the watermark. Applied events are remembered by Event_ID, so a replay applies nothing twice.`,
    boot: needs('workday.host', 'workday.tenant', 'workday.username', 'workday.password', 'raas.owner', 'raas.report'),
    schedules: [{ flow: ACCESS_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [ACCESS_FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const mode = String(p['delta.mode'] ?? 'entry').trim()
        const replay = String(p['delta.replayFrom'] ?? '').trim()
        const replaying = replay && store.replayedFrom !== replay && Number.isFinite(parseWd(replay))
        const from = replaying ? parseWd(replay) : (store.watermark ?? now - 15 * 60000)
        const win = [wdTime(from), wdTime(now)]
        const params = mode === 'effective' ? { Effective_From: win[0], Effective_To: win[1] } : mode === 'both' ? { Entry_From: win[0], Entry_To: win[1], Effective_From: win[0], Effective_To: win[1] } : { Entry_From: win[0], Entry_To: win[1] }
        const r = ctx.workday.raas(wdConfig(p), p['raas.report'], params)
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el, file: ACCESS, type: r.type, message: r.error })] }
        const accounts = { ...store.accounts }
        let applied = store.applied ?? []
        const log = replaying ? [info(`Replay from ${replay}: ${r.rows.length} events`)] : []
        for (const row of r.rows) {
          if (applied.includes(row.Event_ID)) continue
          const eff = parseWd(row.Effective_Date)
          if (eff > now) {
            // the bug of the entry mode: the event is never asked for again once its entry window has passed
            log.push(mode === 'entry' ? warn(`Event ${row.Event_ID} ${row.Business_Process} of ${row.Worker_ID} is effective ${row.Effective_Date}, after today ${wdDate(now)}. Skipped.`) : info(`Event ${row.Event_ID} ${row.Business_Process} of ${row.Worker_ID} waits for its effective date ${row.Effective_Date}`))
            continue
          }
          if (row.Business_Process === 'Hire') accounts[row.Worker_ID] = 'active'
          else if (row.Business_Process === 'Terminate') accounts[row.Worker_ID] = 'disabled'
          else continue
          applied = keep(applied, row.Event_ID)
          log.push(info(`Event ${row.Event_ID} ${row.Business_Process} of ${row.Worker_ID} (${row.Worker}), effective ${row.Effective_Date}: account ${accounts[row.Worker_ID]}`))
        }
        return { ok: true, ms: r.ms + 30, store: { watermark: now, accounts, applied, ...(replaying && { replayedFrom: replay }) }, log }
      },
    },
  },
}
