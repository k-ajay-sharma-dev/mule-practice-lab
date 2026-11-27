// The sample application of the files-sftp-rights lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

export const HOST = 'sftp.brightmart.lab'
export const NAME = 'north-orders-intake'
export const FLOW = 'north-orders-flow'
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`

// Lab made: the known_hosts file of the app is a property here. In a project it is a file in src/main/resources that
// knownHostsFile names, so a new key means a new build:
// <sftp:connection host="${sftp.host}" port="${sftp.port}" username="${sftp.user}" password="${secure::sftp.password}" knownHostsFile="known_hosts" />
const el = {
  list: { at: 1, name: 'List order files', dsl: '<sftp:list config-ref="SFTP_Config" directoryPath="${sftp.inDir}">' },
  read: { at: 2, name: 'Read order file', dsl: '<sftp:read config-ref="SFTP_Config" path="#[attributes.path]">' },
  move: { at: 4, name: 'Move to done', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${sftp.doneDir}">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 20000, errorType: type, log: [...log, muleError({ flow: FLOW, file: NAME, ...el[where], type, message })] })

export const PACKAGES = {
  [NAME]: {
    note: 'Every 15 minutes it lists sftp.inDir on the SFTP server of Brightmart, where the partner Brightmart North uploads its order files. It loads the orders of each JSON file into the order system and moves the file to sftp.doneDir. The SFTP connection checks the host key against the known_hosts of the app (sftp.knownHosts in the lab).',
    boot: needs('sftp.host', 'sftp.port', 'sftp.user', 'sftp.password', 'sftp.inDir', 'sftp.doneDir', 'sftp.knownHosts'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const host = props['sftp.host']
        const log = [info(`Starting ${FLOW}, SFTP ${host}:${props['sftp.port']}`)]
        const f = ctx.systems.files(host, { user: props['sftp.user'], password: props['sftp.password'], port: Number(props['sftp.port']), knownHosts: props['sftp.knownHosts'] })
        const dir = dirOf(props['sftp.inDir'])
        const listed = f.list(dir, { sizeCheck: 2000 })
        if (!listed.ok) return fail(log, 'list', listed.type ?? 'SFTP:CONNECTIVITY', listed.error)
        const files = listed.files.filter((x) => !x.dir && x.name.endsWith('.json'))
        if (!files.length) return { ok: true, ms: 300, log: [...log, info(`No order files in ${dir}`)] }
        store.loaded ??= []
        for (const file of files) {
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok) return fail(log, 'read', r.type ?? 'SFTP:CONNECTIVITY', r.error)
          let orders = 0
          try {
            const v = JSON.parse(r.content || '[]')
            orders = Array.isArray(v) ? v.length : 1
          } catch {
            return fail(log, 'read', 'MULE:EXPRESSION', `"Unexpected character in ${file.name}, the file is not JSON"`)
          }
          log.push(info(`Loaded ${orders} orders of Brightmart North from ${file.name}`))
          const m = f.move(file.path, `${dirOf(props['sftp.doneDir'])}/`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', m.type ?? 'SFTP:CONNECTIVITY', m.error)
          store.loaded = [...store.loaded, { name: file.name, t: now, orders }].slice(-20)
          log.push(info(`Moved ${file.path} to ${m.path}`))
        }
        return { ok: true, ms: 900, log, store }
      },
    },
  },
}
