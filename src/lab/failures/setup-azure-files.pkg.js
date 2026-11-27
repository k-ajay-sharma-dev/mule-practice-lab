// The sample application of the setup-azure-files lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, line, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'scanner-share-sync'
export const PICKS = 'picks-flow'
export const SCANS = 'scans-flow'
export const SCAN_HEADER = 'bin,sku,counted'
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const stampOf = (now) => new Date(BASE + now).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
const dir = (v) => String(v ?? '').trim().replace(/^\/+|\/+$/g, '')
// Lab made: the pick list of the next wave in DUB-1, as the warehouse system returns it
const PICK_LIST = 'bin,sku,qty\nA-01-03,H-100,4\nA-02-11,H-200,2\nC-07-02,H-300,12\n'

// The first problem of a scan file, or null
export function scanProblem(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines[0] !== SCAN_HEADER) return `the header is '${lines[0] ?? ''}', expected '${SCAN_HEADER}'`
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    if (cells.length !== 3 || !/^\d+$/.test(cells[2].trim())) return `line ${i + 1} '${lines[i]}' has no whole number in counted`
  }
  return lines.length > 1 ? null : 'the file has no scans'
}

// The File REST API through the HTTP connector, with the SAS as the query. CloudHub cannot mount SMB shares.
const el = {
  put: { at: 2, name: 'Create pick list file', dsl: '<http:request method="PUT" config-ref="Files_Config" path="#[vars.filePath]">' },
  list: { at: 1, name: 'List scan files', dsl: '<http:request method="GET" config-ref="Files_Config" path="#[vars.dirPath ++ \'?restype=directory&amp;comp=list\']">' },
  get: { at: 3, name: 'Get scan file', dsl: '<http:request method="GET" config-ref="Files_Config" path="#[vars.filePath]">' },
}
const fail = (flow, log, where, e) => {
  const type = e.status === 403 ? 'HTTP:FORBIDDEN' : e.status === 404 ? 'HTTP:NOT_FOUND' : 'HTTP:CONNECTIVITY'
  return { ok: false, ms: 2000, errorType: type, log: [...log, line('ERROR', `Azure Files answered ${e.error}`), muleError({ flow, file: NAME, ...el[where], type, message: `HTTP request failed: ${e.status ? `(${e.status}) ${e.code}` : e.error}` })] }
}
const share = (ctx) => ctx.systems.files(`share:${ctx.props['share.account']}/${ctx.props['share.name']}`, { sas: ctx.props['share.sas'] })

export const PACKAGES = {
  [NAME]: {
    note: 'Two flows on the Azure File Share share.name of the warehouse. picks-flow writes the next pick list to share.picksDir every 15 minutes for the handheld scanners. scans-flow reads each new scan file in share.scansDir every minute and books the counts. A scan file that does not parse is copied to share.errorDir. It uses the File REST API with the SAS in share.sas.',
    boot: needs('share.account', 'share.name', 'share.sas', 'share.picksDir', 'share.scansDir', 'share.errorDir'),
    schedules: [
      { flow: PICKS, type: 'fixed', value: '15', unit: 'minutes', enabled: true },
      { flow: SCANS, type: 'fixed', value: '1', unit: 'minutes', enabled: true },
    ],
    run: {
      [PICKS]: (ctx) => {
        const name = `${dir(ctx.props['share.picksDir'])}/picks-DUB1-${stampOf(ctx.now)}.csv`
        const log = [info(`Starting ${PICKS}, 3 picks for the next wave in DUB-1`)]
        const w = share(ctx).write(name, PICK_LIST, { overwrite: true })
        if (!w.ok) return fail(PICKS, log, 'put', w)
        return { ok: true, ms: 600, log: [...log, info(`Wrote ${ctx.props['share.name']}/${name}, ${w.size} bytes`)] }
      },
      [SCANS]: (ctx) => {
        const { props, store, now } = ctx
        const f = share(ctx)
        const log = [info(`Polling ${props['share.name']}/${dir(props['share.scansDir'])}`)]
        const listed = f.list(dir(props['share.scansDir']), { sizeCheck: 2000 })
        if (!listed.ok) return fail(SCANS, log, 'list', listed)
        // the SAS has no delete, so the app keeps the names it has handled (an object store in the real flow)
        const seen = new Set([...(store.scans ?? []), ...(store.rejected ?? [])].map((x) => x.name))
        const files = listed.files.filter((x) => !x.dir && x.name.endsWith('.csv') && !seen.has(x.name))
        if (!files.length) return { ok: true, ms: 200, log: [...log, info('No new scan files')] }
        for (const file of files) {
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok && r.kind === 'being-written') continue
          if (!r.ok) return fail(SCANS, log, 'get', r)
          const problem = scanProblem(r.content)
          if (problem) {
            const c = f.write(`${dir(props['share.errorDir'])}/${file.name}`, r.content, { overwrite: true })
            if (!c.ok) return fail(SCANS, log, 'put', c)
            log.push(warn(`Rejected ${file.name}: ${problem}. Copied it to ${dir(props['share.errorDir'])}/${file.name}`))
            store.rejected = [...(store.rejected ?? []), { name: file.name, t: now, problem }].slice(-30)
            continue
          }
          const lines = String(r.content).split(/\r?\n/).filter((l) => l.trim()).length - 1
          log.push(info(`Booked ${lines} bin counts from ${file.name}`))
          store.scans = [...(store.scans ?? []), { name: file.name, t: now, lines }].slice(-30)
        }
        return { ok: true, ms: 500, log, store }
      },
    },
  },
}
