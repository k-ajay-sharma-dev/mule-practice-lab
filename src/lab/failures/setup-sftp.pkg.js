// The sample application of the setup-sftp lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const HOST = 'sftp.harbor.lab'
export const NAME = 'brightline-stock-intake'
export const FLOW = 'stock-listener-flow'
export const HEADER = 'sku,warehouse,available'
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`

// The flow in Studio. Lab made: the known_hosts file and the identity file are properties here. In a project
// knownHostsFile names a file in src/main/resources, and identityFile a key file kept outside the project.
// <sftp:connection host="${sftp.host}" port="${sftp.port}" username="${sftp.user}" identityFile="${secure::sftp.identityFile}" knownHostsFile="known_hosts" />
// <sftp:listener directory="${sftp.inDir}" moveToDirectory="${sftp.moveToDirectory}" timeBetweenSizeCheck="${sftp.timeBetweenSizeCheck}" timeBetweenSizeCheckUnit="SECONDS">
const el = {
  list: { at: 1, name: 'On new stock file', dsl: '<sftp:listener config-ref="SFTP_Config" directory="${sftp.inDir}" moveToDirectory="${sftp.moveToDirectory}" timeBetweenSizeCheck="${sftp.timeBetweenSizeCheck}">' },
  read: { at: 2, name: 'Read stock file', dsl: '<sftp:read config-ref="SFTP_Config" path="#[attributes.path]">' },
  move: { at: 5, name: 'Move to archive', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${sftp.moveToDirectory}">' },
  reject: { at: 7, name: 'Move to error', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${sftp.errorDir}">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 20000, errorType: type, log: [...log, muleError({ flow: FLOW, file: NAME, ...el[where], type, message })] })

// The first problem of a stock file, or null. The supplier sends sku,warehouse,available with a whole number.
export function problemOf(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines[0] !== HEADER) return `the header is '${lines[0] ?? ''}', expected '${HEADER}'`
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    if (cells.length !== 3) return `line ${i + 1} has ${cells.length} fields, expected 3`
    if (!/^\d+$/.test(cells[2].trim())) return `line ${i + 1}: available '${cells[2].trim()}' is not a whole number`
  }
  return lines.length > 1 ? null : 'the file has no stock lines'
}
export const rowsOf = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length - 1

export const PACKAGES = {
  [NAME]: {
    note: 'An SFTP listener on the folder of the supplier Brightline Supply. It reads each stock CSV, loads the stock lines into the warehouse system and moves the file to sftp.moveToDirectory. A file that does not parse goes to sftp.errorDir. It logs in with a key (sftp.identityFile) and checks the host key against sftp.knownHosts.',
    boot: needs('sftp.host', 'sftp.port', 'sftp.user', 'sftp.identityFile', 'sftp.knownHosts', 'sftp.inDir', 'sftp.moveToDirectory', 'sftp.errorDir', 'sftp.timeBetweenSizeCheck'),
    // the listener polls once a minute (fixed-frequency 60000 ms)
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const host = props['sftp.host']
        const wait = Number(props['sftp.timeBetweenSizeCheck']) || 0
        const opts = wait > 0 ? { sizeCheck: wait * 1000 } : {}
        const log = [info(`Polling ${dirOf(props['sftp.inDir'])} on ${host}:${props['sftp.port']} as ${props['sftp.user']}`)]
        const f = ctx.systems.files(host, { user: props['sftp.user'], key: props['sftp.identityFile'], port: Number(props['sftp.port']), knownHosts: props['sftp.knownHosts'] })
        const listed = f.list(dirOf(props['sftp.inDir']), opts)
        if (!listed.ok) return fail(log, 'list', listed.type ?? 'SFTP:CONNECTIVITY', listed.error)
        const files = listed.files.filter((x) => !x.dir && x.name.toLowerCase().endsWith('.csv'))
        if (!files.length) return { ok: true, ms: 200, log: [...log, info('No new stock files')] }
        store.loaded ??= []
        store.rejected ??= []
        for (const file of files) {
          const r = f.read(file.path, opts)
          if (!r.ok && r.kind === 'being-written') {
            log.push(info(`Skipped ${file.name}: its size changed within ${wait} seconds, so the upload is still running`))
            continue
          }
          if (!r.ok) return fail(log, 'read', r.type ?? 'SFTP:CONNECTIVITY', r.error)
          const problem = problemOf(r.content)
          if (problem) {
            // on-error-continue in the flow: the file is kept for the supplier in the error folder, never deleted
            const m = f.move(file.path, `${dirOf(props['sftp.errorDir'])}/`, { overwrite: true })
            if (!m.ok) return fail(log, 'reject', m.type ?? 'SFTP:CONNECTIVITY', m.error)
            log.push(warn(`Rejected ${file.name}: ${problem}. Moved it to ${m.path}`))
            store.rejected = [...store.rejected, { name: file.name, t: now, problem }].slice(-20)
            continue
          }
          const rows = rowsOf(r.content)
          log.push(info(`Loaded ${rows} stock lines of Brightline Supply from ${file.name}`))
          const m = f.move(file.path, `${dirOf(props['sftp.moveToDirectory'])}/`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', m.type ?? 'SFTP:CONNECTIVITY', m.error)
          store.loaded = [...store.loaded, { name: file.name, t: now, rows }].slice(-20)
          log.push(info(`Moved ${file.path} to ${m.path}`))
        }
        return { ok: true, ms: 700, log, store }
      },
    },
  },
}
