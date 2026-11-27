// The sample application of the files-sftp-archive lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const HOST = 'sftp.harbor.lab'
export const NAME = 'stock-archive-poll'
export const FLOW = 'stock-archive-flow'
const BASE = Date.UTC(2026, 10, 2) // the first day of the lab clock
const pad = (n) => String(n).padStart(2, '0')
// 20261103T091500, the time stamp that the archive name gets
export const stampOf = (now) => {
  const d = new Date(BASE + now)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`
export const errorDirOf = (props) => (String(props['error.dir'] ?? '').trim() ? dirOf(props['error.dir']) : '')
export const archiveName = (props, name, now) => {
  if (String(props['archive.rename'] ?? '').trim().toLowerCase() !== 'timestamp') return name
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)}_${stampOf(now)}${name.slice(dot)}` : `${name}_${stampOf(now)}`
}

// The stock rows of a file, or the row that cannot be read
function parse(content) {
  const lines = String(content ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
  if (lines[0] !== 'sku,warehouse,available') return { bad: 1, value: lines[0] ?? '', why: 'the header is not sku,warehouse,available' }
  for (let i = 1; i < lines.length; i++) {
    const [sku, wh, n] = lines[i].split(',')
    if (!sku || !wh || n === undefined || n.trim() === '' || Number.isNaN(Number(n))) return { bad: i + 1, value: n ?? '' }
  }
  return { rows: lines.length - 1 }
}

const el = {
  list: { at: 1, name: 'List new files', dsl: '<sftp:list config-ref="SFTP_Config" directoryPath="${sftp.inDir}" timeBetweenSizeCheck="2" timeBetweenSizeCheckUnit="SECONDS">' },
  parse: { at: 3, name: 'Read stock rows', dsl: '<ee:transform doc:name="Read stock rows">' },
  archive: { at: 5, name: 'Archive file', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${archive.dir}" renameTo="#[vars.archiveName]" overwrite="${archive.overwrite}" createParentDirectories="${move.createParentDirectories}">' },
  error: { at: 7, name: 'Move to error folder', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${error.dir}" createParentDirectories="${move.createParentDirectories}">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

// sftp:move with createParentDirectories creates the folders on the way first
function move(f, props, from, dir, name) {
  if (yes(props['move.createParentDirectories'])) f.mkdir(dir)
  return f.move(from, `${dir === '/' ? '' : dir}/${name}`, { overwrite: yes(props['archive.overwrite']) })
}

export const PACKAGES = {
  [NAME]: {
    note: 'Every 5 minutes it lists the CSV files in sftp.inDir on the SFTP server, posts the stock rows of each file to the stock service, then moves the file to archive.dir. archive.rename timestamp adds the time to the archive name, archive.overwrite true replaces a file of the same name, move.createParentDirectories true creates a missing folder, and error.dir is where a file that cannot be read is moved. An empty error.dir means the flow has no error path for a bad file.',
    boot: needs('sftp.host', 'sftp.port', 'sftp.user', 'sftp.password', 'sftp.inDir', 'archive.dir'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const f = ctx.systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'], port: Number(props['sftp.port']) })
        const inDir = dirOf(props['sftp.inDir'])
        const log = [info(`Polling ${inDir} on ${props['sftp.host']} as ${props['sftp.user']}`)]
        const errors = []
        const listed = f.list(inDir, { sizeCheck: 2000 })
        if (!listed.ok) return { ok: false, ms: 1500, errorType: listed.type, log: [...log, block('list', listed.type ?? 'SFTP:CONNECTIVITY', listed.error)] }
        const files = listed.files.filter((x) => !x.dir && x.name.toLowerCase().endsWith('.csv'))
        if (!files.length) return { ok: true, ms: 300, log: [...log, info(`No files in ${inDir}`)] }
        store.loads ??= {}
        for (const file of files) {
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok) {
            errors.push(r.type)
            log.push(block('list', r.type ?? 'SFTP:CONNECTIVITY', r.error))
            continue
          }
          const p = parse(r.content)
          if (p.bad) {
            const why = p.why ?? `Cannot coerce String (${p.value}) to Number`
            const errDir = errorDirOf(props)
            if (!errDir) {
              errors.push('MULE:EXPRESSION')
              log.push(block('parse', 'MULE:EXPRESSION', `${why}, line ${p.bad} of ${file.name}. The flow has no error path for a bad file, so ${file.path} stays where it is.`))
              continue
            }
            const m = move(f, props, file.path, errDir, archiveName(props, file.name, now))
            if (!m.ok) {
              errors.push(m.type)
              log.push(warn(`${file.name} cannot be read: ${why}, line ${p.bad}. Moving it to ${errDir}.`), block('error', m.type, m.error))
            } else log.push(warn(`${file.name} cannot be read: ${why}, line ${p.bad}. Nothing was posted. on-error-continue moved it to ${m.path} for the warehouse team.`))
            continue
          }
          store.loads[file.name] = (store.loads[file.name] ?? 0) + 1
          const n = store.loads[file.name]
          log.push((n > 1 ? warn : info)(`Posted ${p.rows} stock levels from ${file.name} to the stock service${n > 1 ? `. This file was posted ${n} times now` : ''}`))
          const m = move(f, props, file.path, dirOf(props['archive.dir']), archiveName(props, file.name, now))
          if (!m.ok) {
            errors.push(m.type)
            log.push(block('archive', m.type, `${m.error}. ${file.path} stays in ${inDir}, so the next poll reads it again.`))
          } else {
            store.archived = [...(store.archived ?? []), { name: file.name, to: m.path, t: now }].slice(-20)
            log.push(info(`Archived ${file.path} as ${m.path}`))
          }
        }
        return { ok: errors.length === 0, ms: 2000, errorType: errors[0] ?? null, errors: errors.length, log, store }
      },
    },
  },
}
