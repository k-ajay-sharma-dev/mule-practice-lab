// The sample application of the files-sftp-partial-file lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const APP = 'partner-stock-poll'
export const FLOW = 'partner-stock-flow'
const keep = (list, items) => [...(list ?? []), ...items].slice(-30)
const text = (props, key) => String(props[key] ?? '').trim()
const ms = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : 0)
export const settingsOf = (props) => ({
  dir: text(props, 'sftp.directory') || '/in',
  moveTo: text(props, 'sftp.moveToDirectory'),
  sizeCheck: ms(props['sftp.timeBetweenSizeCheck']),
  trigger: text(props, 'sftp.triggerSuffix'),
})

// stock levels: each row sets the available quantity, so loading a full file again is safe
const parse = (content) => {
  const lines = String(content ?? '').split('\n').slice(1)
  const rows = []
  const bad = []
  lines.forEach((l, i) => {
    if (!l) return
    const c = l.split(',')
    if (c.length === 3 && c[0] && c[2] !== '' && Number.isFinite(Number(c[2]))) rows.push({ sku: c[0], warehouse: c[1], available: Number(c[2]) })
    else bad.push({ line: i + 2, text: l, columns: c.length })
  })
  return { rows, bad }
}

const sftpError = (type, message, at = 1, name = 'On New or Updated File') => ({
  flow: FLOW,
  file: APP,
  at,
  name,
  dsl: '<sftp:listener doc:name="On New or Updated File" config-ref="SFTP_Config" directory="${sftp.directory}" moveToDirectory="${sftp.moveToDirectory}">',
  type,
  message,
})

export const PACKAGES = {
  [APP]: {
    note: 'Polls sftp.directory every 5 minutes with an SFTP On New or Updated File listener (*.csv), sets the stock level of each row, and moves the file to sftp.moveToDirectory. sftp.timeBetweenSizeCheck (ms) is timeBetweenSizeCheck of the listener: a file whose size changes between two checks is skipped. sftp.triggerSuffix, when set (such as .done), makes the flow read a file only when a trigger file with that suffix is next to it.',
    boot: needs('sftp.host', 'sftp.user', 'sftp.password', 'sftp.moveToDirectory'),
    schedules: [{ flow: FLOW, type: 'fixed', value: 5, unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: ({ props, now, store, systems }) => {
        const set = settingsOf(props)
        const f = systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'] })
        const listed = f.list(set.dir)
        if (!listed.ok) return { ok: false, ms: 300, errorType: listed.type ?? 'SFTP:CONNECTIVITY', log: [muleError(sftpError(listed.type ?? 'SFTP:CONNECTIVITY', listed.error))] }
        const names = listed.files.filter((x) => !x.dir).map((x) => x.name)
        const found = listed.files.filter((x) => !x.dir && /\.csv$/i.test(x.name))
        if (!found.length) return { ok: true, ms: 200, log: [] }
        const log = []
        const loads = []
        const skipped = []
        const levels = { ...store.levels }
        let errors = 0
        let errorType = null
        const fail = (type, message, at, name) => {
          errors++
          errorType ??= type
          log.push(muleError(sftpError(type, message, at, name)))
        }
        for (const file of found) {
          const trigger = set.trigger ? `${file.name}${set.trigger}` : null
          if (trigger && !names.includes(trigger)) {
            log.push(info(`${file.name} has no trigger file ${trigger} yet. Skipped, it is read in a later poll.`))
            skipped.push({ name: file.name, t: now, why: 'no trigger' })
            continue
          }
          const rd = f.read(file.path, set.sizeCheck ? { sizeCheck: set.sizeCheck } : {})
          if (!rd.ok) {
            if (rd.kind === 'being-written') {
              log.push(info(`${file.name} is still being written: its size changed during the size check of ${set.sizeCheck} ms. Skipped, it is read in a later poll.`))
              skipped.push({ name: file.name, t: now, why: 'being written' })
            } else fail(rd.type ?? 'SFTP:CONNECTIVITY', rd.error, 2, 'Read stock file')
            continue
          }
          const { rows, bad } = parse(rd.content)
          for (const b of bad) log.push(warn(`Line ${b.line} of ${file.name} has ${b.columns} of 3 columns: '${b.text}'. Skipped.`))
          for (const row of rows) levels[row.sku] = row.available
          log.push(info(`Loaded ${rows.length} stock levels from ${file.name}, ${rd.size} bytes.`))
          loads.push({ name: file.name, t: now, rows: rows.length, bad: bad.length, partial: rd.partial, size: rd.size })
          const exists = f.stat(set.moveTo)
          if (!exists.ok || !exists.file.dir) {
            fail('SFTP:ILLEGAL_PATH', `Path '${set.moveTo}' of moveToDirectory doesn't exist`, 3, 'Move to directory')
            continue
          }
          const m = f.move(file.path, set.moveTo)
          if (m.ok) log.push(info(`Moved ${file.name} to ${m.path}`))
          else fail(m.type ?? 'SFTP:CONNECTIVITY', `Could not move ${file.path} to ${set.moveTo}: ${m.error}`, 3, 'Move to directory')
          if (trigger) f.remove(`${set.dir}/${trigger}`)
        }
        return { ok: errors === 0, ms: 700, log, errors, errorType, store: { levels, loads: keep(store.loads, loads), skipped: keep(store.skipped, skipped) } }
      },
    },
  },
}
