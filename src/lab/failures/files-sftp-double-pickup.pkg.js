// The sample application of the files-sftp-double-pickup lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const APP = 'stock-receipts-poll'
export const FLOW = 'stock-receipts-flow'
const SUFFIXES = ['x2k9p', 'm7q4d', 'c8v1n', 'r3t6w', 'h5j2s', 'p9b4k', 'f1z8g', 'w6y3e']
// the first name is the one the platform writes when the replica starts
export const replicaOf = (app, i) => `${app.name.slice(0, 18)}-${(app.name.length * 7919 + app.config * 31).toString(16).slice(0, 5)}-${SUFFIXES[i % SUFFIXES.length]}`
const keep = (list, items) => [...(list ?? []), ...items].slice(-30)
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'
const dirOf = (props, key) => String(props[key] ?? '').trim()
export const settingsOf = (props) => ({ dir: dirOf(props, 'sftp.directory') || '/in', moveTo: dirOf(props, 'sftp.moveToDirectory'), autoDelete: yes(props['sftp.autoDelete']), claim: dirOf(props, 'pickup.claimDir') })

// goods receipts: each row adds the received quantity to the stock on hand, so a second load books it twice
const rowsOf = (content) =>
  String(content ?? '')
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => c.length === 3 && c[0] && Number.isFinite(Number(c[2])))
    .map(([sku, warehouse, received]) => ({ sku, warehouse, received: Number(received) }))

const sftpError = (type, message, at = 1, name = 'On New or Updated File') => ({
  flow: FLOW,
  file: APP,
  at,
  name,
  dsl: '<sftp:listener doc:name="On New or Updated File" config-ref="SFTP_Config" directory="${sftp.directory}" watermarkEnabled="true">',
  type,
  message,
})

export const PACKAGES = {
  [APP]: {
    note: 'Polls sftp.directory on the SFTP server every 5 minutes with an SFTP On New or Updated File listener (watermarkEnabled true, *.csv) and books each goods receipt row into the stock on hand. sftp.moveToDirectory and sftp.autoDelete are what the listener does with a file after the flow. pickup.claimDir, when set, makes each replica first move the file into that folder: only the replica whose move works reads it.',
    boot: needs('sftp.host', 'sftp.user', 'sftp.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: 5, unit: 'minutes', enabled: true }],
    run: {
      // The engine calls a schedule once. Without clustering every replica runs its own listener on the same folder at
      // the same moment, so the lab writes the poll of each replica into this one result.
      [FLOW]: ({ app, props, now, store, systems }) => {
        const copies = app.cluster || app.replicas < 2 ? 1 : app.replicas
        const replicas = Array.from({ length: copies }, (_, i) => replicaOf(app, i))
        const set = settingsOf(props)
        const f = systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'] })
        const listed = f.list(set.dir)
        if (!listed.ok) return { ok: false, ms: 300, errorType: listed.type ?? 'SFTP:CONNECTIVITY', log: [muleError(sftpError(listed.type ?? 'SFTP:CONNECTIVITY', listed.error))] }
        const mark = store.watermark ?? -1
        const found = listed.files.filter((x) => !x.dir && /\.csv$/i.test(x.name) && x.t > mark)
        if (!found.length) return { ok: true, ms: 200, log: [] }
        const log = []
        const loads = []
        const onHand = { ...store.onHand }
        let errors = 0
        let errorType = null
        const fail = (replica, type, message, at, name) => {
          errors++
          errorType ??= type
          log.push(muleError({ ...sftpError(type, `[${replica}] ${message}`, at, name) }))
        }
        const isDir = (p) => {
          const r = f.stat(p)
          return r.ok && r.file.dir
        }
        // the watermark moves past a file only once a replica has booked it, so a file that failed is read again
        const handled = []
        for (const file of found) {
          // 1. who reads the file
          let readers = replicas.map((r) => ({ replica: r, path: file.path }))
          if (set.claim) {
            if (!isDir(set.claim)) {
              fail(replicas[0], 'SFTP:ILLEGAL_PATH', `Path '${set.claim}' of pickup.claimDir doesn't exist, so ${file.name} cannot be claimed`, 2, 'Claim the file')
              continue
            }
            readers = []
            for (const r of replicas) {
              const m = f.move(file.path, set.claim)
              if (m.ok) readers.push({ replica: r, path: m.path })
              else if (m.kind === 'not-found' && readers.length) log.push(info(`[${r}] ${file.name} is no longer in ${set.dir}: another replica claimed it first. Skipped.`))
              else fail(r, m.type ?? 'SFTP:CONNECTIVITY', m.error, 2, 'Claim the file')
            }
            for (const x of readers) log.push(info(`[${x.replica}] Claimed ${file.name}: moved it to ${x.path}`))
          }
          // 2. every reader reads and books the rows (the replicas poll in the same second, so they all see the file)
          const booked = []
          for (const x of readers) {
            const rd = f.read(x.path)
            if (!rd.ok) {
              fail(x.replica, rd.type ?? 'SFTP:CONNECTIVITY', rd.error, 3, 'Read receipts')
              continue
            }
            const rows = rowsOf(rd.content)
            for (const row of rows) onHand[row.sku] = (onHand[row.sku] ?? 0) + row.received
            const units = rows.reduce((n, row) => n + row.received, 0)
            log.push(info(`[${x.replica}] Read ${x.path}. Booked ${rows.length} goods receipts, ${units} units, into the stock on hand.`))
            loads.push({ name: file.name, replica: x.replica, t: now, rows: rows.length, units })
            booked.push(x)
          }
          // 3. what the listener does with the file after the flow
          for (const x of booked) {
            if (set.moveTo) {
              if (!isDir(set.moveTo)) {
                fail(x.replica, 'SFTP:ILLEGAL_PATH', `Path '${set.moveTo}' of moveToDirectory doesn't exist`, 4, 'Move to directory')
                continue
              }
              const m = f.move(x.path, set.moveTo)
              if (m.ok) log.push(info(`[${x.replica}] Moved ${file.name} to ${m.path}`))
              else fail(x.replica, m.type ?? 'SFTP:CONNECTIVITY', `Could not move ${x.path} to ${set.moveTo}: ${m.error}`, 4, 'Move to directory')
            } else if (set.autoDelete) {
              const m = f.remove(x.path)
              if (m.ok) log.push(info(`[${x.replica}] Deleted ${x.path} after processing (autoDelete)`))
              else fail(x.replica, m.type ?? 'SFTP:CONNECTIVITY', `Could not delete ${x.path}: ${m.error}`, 4, 'Auto delete')
            }
          }
          if (booked.length) handled.push(file.t)
          if (booked.length > 1) log.push(warn(`${file.name} was booked ${booked.length} times in the same poll, once by each replica.`))
        }
        const watermark = Math.max(mark, ...handled)
        return { ok: errors === 0, ms: 900, log, errors, errorType, store: { watermark, onHand, loads: keep(store.loads, loads) } }
      },
    },
  },
}
