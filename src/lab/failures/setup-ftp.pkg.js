// The sample application of the setup-ftp lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const HOST = 'ftp.legacy.harbor.lab'
export const NAME = 'pos-export-intake'
export const FLOW = 'pos-export-flow'
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`
// passive="true" and transferMode="BINARY" are the defaults of the FTP connection, so only another text changes them
const passiveOf = (props) => String(props['ftp.passive'] ?? 'true').trim().toLowerCase() !== 'false'
const modeOf = (props) => String(props['ftp.transferMode'] ?? 'BINARY').trim().toUpperCase() || 'BINARY'

// <ftp:connection host="${ftp.host}" port="${ftp.port}" username="${ftp.user}" password="${secure::ftp.password}" passive="${ftp.passive}" transferMode="${ftp.transferMode}" />
const el = {
  list: { at: 1, name: 'On new POS export', dsl: '<ftp:listener config-ref="FTP_Config" directory="${ftp.inDir}">' },
  read: { at: 2, name: 'Read POS export', dsl: '<ftp:read config-ref="FTP_Config" path="#[attributes.path]">' },
  move: { at: 5, name: 'Move to done', dsl: '<ftp:move config-ref="FTP_Config" sourcePath="#[attributes.path]" targetPath="${ftp.doneDir}">' },
  reject: { at: 7, name: 'Move to error', dsl: '<ftp:move config-ref="FTP_Config" sourcePath="#[attributes.path]" targetPath="${ftp.errorDir}">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 30000, errorType: type, log: [...log, muleError({ flow: FLOW, file: NAME, ...el[where], type, message })] })

export const PACKAGES = {
  [NAME]: {
    note: 'Every 5 minutes it lists ftp.inDir on the legacy POS server. It extracts the receipts of each sales zip into the sales system and moves the zip to ftp.doneDir. A zip that does not open goes to ftp.errorDir. ftp.passive and ftp.transferMode set the FTP connection.',
    boot: needs('ftp.host', 'ftp.port', 'ftp.user', 'ftp.password', 'ftp.passive', 'ftp.transferMode', 'ftp.inDir', 'ftp.doneDir', 'ftp.errorDir'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const passive = passiveOf(props)
        const transferMode = modeOf(props)
        const log = [info(`Polling ${dirOf(props['ftp.inDir'])} on ${props['ftp.host']}:${props['ftp.port']}, passive ${passive}, transferMode ${transferMode}`)]
        const f = ctx.systems.files(props['ftp.host'], { user: props['ftp.user'], password: props['ftp.password'], port: Number(props['ftp.port']), passive, transferMode, protocol: 'FTP' })
        const listed = f.list(dirOf(props['ftp.inDir']), { sizeCheck: 2000 })
        if (!listed.ok) return fail(log, 'list', listed.type ?? 'FTP:CONNECTIVITY', listed.error)
        const files = listed.files.filter((x) => !x.dir && x.name.toLowerCase().endsWith('.zip'))
        if (!files.length) return { ok: true, ms: 400, log: [...log, info('No new POS exports')] }
        store.loaded ??= []
        store.rejected ??= []
        for (const file of files) {
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok && r.kind === 'being-written') continue
          if (!r.ok) return fail(log, 'read', r.type ?? 'FTP:CONNECTIVITY', r.error)
          if (r.corrupt) {
            // on-error-continue around the extract: the damaged zip is kept in the error folder for the POS team
            const m = f.move(file.path, `${dirOf(props['ftp.errorDir'])}/`, { overwrite: true })
            if (!m.ok) return fail(log, 'reject', m.type ?? 'FTP:CONNECTIVITY', m.error)
            log.push(warn(`COMPRESSION:INVALID_ARCHIVE on ${file.name} (${r.size} bytes): ${r.parseError}. Moved it to ${m.path}`))
            store.rejected = [...store.rejected, { name: file.name, t: now }].slice(-20)
            continue
          }
          // lab made: the number of receipts comes from the size of the zip
          const receipts = Math.max(1, Math.round(r.size / 600))
          log.push(info(`Extracted ${receipts} receipts from ${file.name}, ${r.size} bytes, into the sales system`))
          const m = f.move(file.path, `${dirOf(props['ftp.doneDir'])}/`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', m.type ?? 'FTP:CONNECTIVITY', m.error)
          store.loaded = [...store.loaded, { name: file.name, t: now, receipts, size: r.size }].slice(-20)
          log.push(info(`Moved ${file.path} to ${m.path}`))
        }
        return { ok: true, ms: 1500, log, store }
      },
    },
  },
}
