// The sample application of the wd-raas-paging lab. Imports only platform-log.js and the import free Workday engine, so
// the engine can load it without a cycle. It copies the workers of Workday to the staff directory every night.
import { info, line, muleError, needs } from '../platform-log.js'
import { parseWd, wdConfig, wdTime } from '../platform-workday.js'

export const DIRECTORY = 'brightmart-wd-directory-sync'
export const DIR_FLOW = 'directory-sync-flow'
const HOUR = 3600000
const el = { flow: DIR_FLOW, at: 1, name: 'Get worker report', dsl: '<http:request method="GET" doc:name="Get worker report" config-ref="Workday_RaaS_Config" path="/${raas.owner}/${raas.report}">' }
const err = (r) => muleError({ ...el, file: DIRECTORY, type: r.type, message: r.error })

export const PACKAGES = {
  [DIRECTORY]: {
    note: `Copies the active workers of Workday to the staff directory. The flow ${DIR_FLOW} calls the custom report raas.report of raas.owner as RaaS (GET /ccx/service/customreport2/{tenant}/{owner}/{report}?format=json) with the HTTP Request operation, whose response timeout is workday.responseTimeout. With raas.mode full it reads the whole report. With raas.mode delta it sends the prompts Updated_From and Updated_To, one window of raas.windowHours after the other, from the watermark in the object store up to now, and moves the watermark after each window. The Basic credentials are workday.username and the secure property workday.password.`,
    boot: needs('workday.host', 'workday.tenant', 'workday.username', 'workday.password', 'raas.owner', 'raas.report'),
    schedules: [{ flow: DIR_FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [DIR_FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const cfg = wdConfig(p)
        const report = p['raas.report']
        if (String(p['raas.mode'] ?? 'full').trim() !== 'delta') {
          const r = ctx.workday.raas(cfg, report, {})
          if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [err(r)] }
          return { ok: true, ms: r.ms + 200, store: { watermark: now, count: r.rows.length, last: { mode: 'full', rows: r.rows.length, t: now } }, log: [info(`Full load of ${report}: ${r.rows.length} workers written to the directory`)] }
        }
        const from = store.watermark ?? parseWd(p['raas.since'])
        if (!Number.isFinite(from)) return { ok: false, ms: 5, errorType: 'MULE:EXPRESSION', log: [line('ERROR', 'No watermark in the object store and no raas.since to start from')] }
        const hours = Number(p['raas.windowHours'])
        const step = hours > 0 ? hours * HOUR : Math.max(1, now - from)
        let a = from
        let rows = 0
        let ms = 0
        let windows = 0
        while (a < now && windows < 200) {
          const b = Math.min(a + step, now)
          const r = ctx.workday.raas(cfg, report, { Updated_From: wdTime(a), Updated_To: wdTime(b) })
          ms += r.ms
          windows++
          if (!r.ok) return { ok: false, ms, errorType: r.type, store: { watermark: a, catchUp: { from, to: a, rows, windows } }, log: [info(`Delta of ${report}: ${rows} workers in ${windows - 1} windows up to ${wdTime(a)}`), err(r)] }
          rows += r.rows.length
          a = b
        }
        return { ok: true, ms: ms + 100, store: { watermark: a, catchUp: { from, to: a, rows, windows } }, log: [info(`Delta of ${report} from ${wdTime(from)} to ${wdTime(a)}: ${rows} workers in ${windows} window${windows === 1 ? '' : 's'} written to the directory`)] }
      },
    },
  },
}
