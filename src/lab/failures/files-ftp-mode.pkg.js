// The sample application of the files-ftp-mode lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

export const HOST = 'ftp.legacy.brightmart.lab'
export const NAME = 'pos-sales-import'
export const FLOW = 'sales-import-flow'
// what the legacy server speaks. The systems engine does not tell a client which protocol a server speaks, so the
// package knows it for this one host.
const SERVER_PROTOCOL = 'FTP'
const GREETING = '220 Brightmart FTP service ready'

export const protocolOf = (props) => String(props['file.protocol'] ?? '').trim().toUpperCase()
// passive="true" is the default of the FTP connection, so only the text false turns it off
export const passiveOf = (props) => String(props['ftp.passive'] ?? 'true').trim().toLowerCase() !== 'false'
// transferMode="BINARY" is the default of the FTP connection
export const modeOf = (props) => String(props['ftp.transferMode'] ?? 'BINARY').trim().toUpperCase() || 'BINARY'
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`

const el = {
  list: { at: 1, name: 'List sales files', dsl: '<ftp:list config-ref="${file.protocol}_Config" directoryPath="${ftp.workingDir}">' },
  read: { at: 2, name: 'Read sales file', dsl: '<ftp:read config-ref="${file.protocol}_Config" path="#[attributes.path]">' },
  unzip: { at: 4, name: 'Extract receipt scans', dsl: '<compression:extract><compression:extractor><compression:zip-extractor /></compression:extractor></compression:extract>' },
  move: { at: 5, name: 'Move to done', dsl: '<ftp:move config-ref="${file.protocol}_Config" sourcePath="#[attributes.path]" targetPath="${ftp.doneDir}">' },
}
const fail = (log, where, type, message) => {
  const pre = type.split(':')[0]
  const dsl = pre === 'COMPRESSION' ? el[where].dsl : el[where].dsl.replace(/ftp:/g, `${pre.toLowerCase()}:`).replace('${file.protocol}', pre)
  return { ok: false, ms: 30000, errorType: type, log: [...log, muleError({ flow: FLOW, file: NAME, ...el[where], dsl, type, message })] }
}

export const PACKAGES = {
  [NAME]: {
    note: 'Every 15 minutes it lists ftp.workingDir on the legacy POS server. It loads the lines of each sales_*.txt into the sales report, extracts each receipts_*.zip of scanned receipts into the archive, and moves both to ftp.doneDir. file.protocol picks the connector: SFTP, FTP or FTPS. ftp.passive and ftp.transferMode set the FTP connection (defaults true and BINARY).',
    boot: needs('file.protocol', 'ftp.host', 'ftp.port', 'ftp.user', 'ftp.password', 'ftp.workingDir', 'ftp.doneDir'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const p = protocolOf(props)
        const host = props['ftp.host']
        const port = Number(props['ftp.port'])
        const passive = passiveOf(props)
        const transferMode = modeOf(props)
        const log = [info(`Starting ${FLOW} with the ${p} connector, ${host}:${props['ftp.port']}${p === 'SFTP' ? '' : `, passive ${passive}, transferMode ${transferMode}`}`)]
        const auth = { user: props['ftp.user'], password: props['ftp.password'], port, passive, transferMode }
        if (p !== SERVER_PROTOCOL) {
          // a client of another protocol opens the connection and does not understand the answer, before any login
          const probe = ctx.systems.files(host, { port }).stat('/')
          if (probe.kind === 'connection-refused' || probe.kind === 'unknown-system')
            return fail(log, 'list', `${p}:CONNECTIVITY`, `Could not establish ${p} connection with host: '${host}' at port: '${port}': ${probe.kind === 'unknown-system' ? `java.net.UnknownHostException: ${host}` : 'java.net.ConnectException: Connection refused'}`)
          if (p === 'SFTP') return fail(log, 'list', 'SFTP:CONNECTIVITY', `Could not establish SFTP connection with host: '${host}' at port: '${port}': the server answered '${GREETING}', which is an FTP greeting, not an SSH identification string`)
          return fail(log, 'list', `${p}:CONNECTIVITY`, `Could not establish FTPS connection with host: '${host}' at port: '${port}': the server answered AUTH TLS with '502 Command not implemented'. It does not offer TLS`)
        }
        const f = ctx.systems.files(host, auth)
        const dir = dirOf(props['ftp.workingDir'])
        const listed = f.list(dir)
        if (!listed.ok) return fail(log, 'list', listed.type ?? 'FTP:CONNECTIVITY', listed.error)
        const files = listed.files.filter((x) => !x.dir && /^(sales_\d{8}\.txt|receipts_\d{8}\.zip)$/.test(x.name))
        if (!files.length) return { ok: true, ms: 400, log: [...log, info(`No sales files in ${dir}`)] }
        store.loaded ??= []
        // text files first, the way the flow sorts them
        for (const file of [...files].sort((a, b) => Number(a.name.endsWith('.zip')) - Number(b.name.endsWith('.zip')))) {
          const r = f.read(file.path)
          if (!r.ok) return fail(log, 'read', r.type ?? 'FTP:CONNECTIVITY', r.error)
          if (file.name.endsWith('.zip')) {
            // lab made: the extract fails the way java.util.zip does on a damaged archive
            if (r.corrupt) return fail(log, 'unzip', 'COMPRESSION:INVALID_ARCHIVE', `Could not extract the archive ${file.name} (${r.size} bytes, the listing said ${file.size}): ${r.parseError}`)
            log.push(info(`Extracted ${Math.max(1, Math.round(r.size / 24000))} receipt scans from ${file.name}, ${r.size} bytes, into the receipt archive`))
          } else {
            const lines = String(r.content).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(1)
            const total = lines.reduce((n, l) => n + (Number(l.split('|')[2]) || 0), 0)
            log.push(info(`Loaded ${lines.length} store totals from ${file.name} into the sales report, ${total.toFixed(2)} in all`))
            store.loaded = [...store.loaded, { name: file.name, t: now, stores: lines.length }].slice(-20)
          }
          const m = f.move(file.path, `${dirOf(props['ftp.doneDir'])}/${file.name}`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', m.type ?? 'FTP:CONNECTIVITY', m.error)
          log.push(info(`Moved ${file.path} to ${m.path}`))
        }
        return { ok: true, ms: 1800, log, store }
      },
    },
  },
}
