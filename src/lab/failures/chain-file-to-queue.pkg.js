// The sample applications of the chain-file-to-queue lab. Imports only platform-log.js and the import free JMS engine.
//
// The chain: the warehouse system drops a stock file on sftp.harbor.lab every night. wms-stock-importer reads it and
// publishes one message per SKU to STOCK.UPDATES on harbor-amq. shop-availability-api takes them and keeps the
// availability that the web shop reads. stock-queue-watch reads queue sizes over Jolokia and mails when one is too big.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf, parseUrl } from '../platform-jms.js'

export const HOST = 'sftp.harbor.lab'
export const IMPORTER = 'wms-stock-importer'
export const API = 'shop-availability-api'
export const WATCH = 'stock-queue-watch'
export const QUEUE = 'STOCK.UPDATES'
export const IMPORT_FLOW = 'stock-file-import-flow'
export const LISTEN_FLOW = 'stock-updates-flow'
export const WATCH_FLOW = 'queue-size-watch-flow'
// lab-made: a stock message counts as 64 KB on the broker (the full SKU record with its warehouse lines), so the small
// lab store fills with a few hundred messages
export const MSG_BYTES = 64 * 1024
// lab-made: one consumer updates 8 SKUs a minute, because each update writes the availability table and the search index
export const RATE = 8
// lab-made: a transacted batch of the importer
export const BATCH = 50
const HOUR = 3600000

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)
const intOf = (v, fallback) => (clean(v) !== '' && Number.isInteger(Number(v)) ? Number(v) : fallback)

export const modeOf = (props) => {
  const m = clean(props['import.mode']).toLowerCase()
  return ['resume', 'transacted'].includes(m) ? m : 'restart'
}
export const prefetchOf = (props) => {
  const p = parseUrl(props['jms.url']).params
  return intOf(p['jms.prefetchPolicy.queuePrefetch'] ?? p['jms.prefetchPolicy.all'], 1000)
}
export const consumersOf = (props) => Math.max(1, Math.min(8, intOf(props['jms.consumers'], 1)))
export const idempotent = (props) => clean(props['stock.idempotent']).toLowerCase() === 'true'
export const alertSize = (props) => {
  const v = intOf(props['queue.alertSize'], null)
  return v !== null && v > 0 ? v : null
}

// The stock rows of a file: sku,warehouse,available
export function rowsOf(content) {
  return String(content ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(1)
    .map((l) => {
      const [sku, wh, n] = l.split(',')
      return { sku, wh, n: Number(n) }
    })
}
export const fileDateOf = (name) => (String(name).match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? ''

const el = {
  read: { at: 1, name: 'Read stock file', dsl: '<sftp:read config-ref="SFTP_Config" path="#[attributes.path]">' },
  publish: { at: 3, name: 'Publish stock update', dsl: `<jms:publish config-ref="AMQ_Config" destination="${QUEUE}" doc:name="Publish stock update">` },
  archive: { at: 5, name: 'Archive file', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${archive.dir}">' },
}
const block = (where, type, message) => muleError({ flow: IMPORT_FLOW, file: IMPORTER, ...el[where], type, message })
const timedOut = 'javax.jms.JMSException: org.apache.activemq.transport.RequestTimedOutIOException. The send waited 30000 ms (jms.sendTimeout=30000 on the broker URL) and the broker did not take it'

export const PACKAGES = {
  [IMPORTER]: {
    note: `The SFTP listener polls sftp.inDir every 15 minutes, with no watermark, so a file that is still there is read again. For each line of a stock file it publishes one PERSISTENT message to ${QUEUE}, then moves the file to archive.dir. import.mode restart (the default) starts each read from line 1; resume keeps the line of the last sent message in the object store and goes on from there; transacted sends ${BATCH} lines per transacted JMS session and keeps the line of the last commit.`,
    boot: needs('sftp.host', 'sftp.user', 'sftp.password', 'sftp.inDir', 'archive.dir', 'jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: IMPORT_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [IMPORT_FLOW]: ({ props, store, now, jms, systems }) => {
        const f = systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'] })
        const inDir = clean(props['sftp.inDir']) || '/in'
        const listed = f.list(inDir, { sizeCheck: 2000 })
        if (!listed.ok) return { ok: false, ms: 1500, errorType: listed.type, log: [block('read', listed.type ?? 'SFTP:CONNECTIVITY', listed.error)], store }
        const files = listed.files.filter((x) => !x.dir && /\.csv$/i.test(x.name))
        if (!files.length) return { ok: true, ms: 200, log: [], store }
        const mode = modeOf(props)
        const cfg = connOf(props)
        const log = []
        let errorType = null
        for (const file of files) {
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok) {
            errorType ??= r.type
            log.push(block('read', r.type ?? 'SFTP:CONNECTIVITY', r.error))
            continue
          }
          const rows = rowsOf(r.content)
          const date = fileDateOf(file.name)
          store.reads = { ...(store.reads ?? {}), [file.name]: (store.reads?.[file.name] ?? 0) + 1 }
          const reads = store.reads[file.name]
          const saved = mode !== 'restart' && store.progress?.file === file.name ? store.progress.sent : 0
          let sent = saved
          let failure = null
          const body = (i) => ({ sku: rows[i].sku, warehouse: rows[i].wh, available: rows[i].n, fileDate: date, line: i + 1 })
          const opts = (i) => ({ correlationId: `${date}:${rows[i].sku}`, size: MSG_BYTES, props: { fileDate: date, line: i + 1 } })
          if (mode === 'transacted') {
            while (sent < rows.length && !failure) {
              const to = Math.min(rows.length, sent + BATCH)
              const tx = jms.transaction(cfg, (t) => {
                for (let i = sent; i < to; i++) {
                  const p = t.publish(QUEUE, body(i), opts(i))
                  if (!p.ok) return { ok: false, muleType: p.muleType, text: p.text, blocked: p.blocked }
                }
                return { ok: true }
              })
              if (tx.ok) sent = to
              else failure = { ...tx, ...tx.value, rolled: to - sent }
            }
          } else {
            for (let i = sent; i < rows.length; i++) {
              const p = jms.publish(cfg, QUEUE, body(i), opts(i))
              if (!p.ok) {
                failure = p
                break
              }
              sent = i + 1
            }
          }
          const from = saved + 1
          const lines = sent >= from ? `lines ${from} to ${sent}` : 'no lines'
          const again = reads > 1 && mode === 'restart' ? `. This file was read from line 1 for the ${reads}${reads === 2 ? 'nd' : reads === 3 ? 'rd' : 'th'} time` : ''
          log.push((again ? warn : info)(`Published ${sent - saved} stock updates from ${file.name} to ${QUEUE}, ${lines} of ${rows.length}${again}`))
          if (failure) {
            errorType ??= failure.muleType ?? 'JMS:PUBLISHING'
            if (failure.blocked) log.push(warn(`${failure.text}`, 'org.apache.activemq.ActiveMQSession'))
            const text = failure.blocked ? timedOut : failure.text
            if (mode === 'restart') log.push(block('publish', errorType, `${text}. Line ${sent + 1} of ${file.name} was not sent. ${file.path} stays in ${inDir}, so the next poll reads it again from line 1.`))
            else {
              store.progress = { file: file.name, sent, t: now }
              log.push(block('publish', errorType, `${text}.${mode === 'transacted' ? ` The transaction of lines ${sent + 1} to ${sent + failure.rolled} was rolled back.` : ''} Checkpoint: line ${sent} of ${file.name} is saved in the object store, and the next poll goes on from line ${sent + 1}.`))
            }
            continue
          }
          const dir = clean(props['archive.dir']) || '/archive'
          const m = f.move(file.path, `${dir}/${file.name}`, { overwrite: false })
          if (!m.ok) {
            errorType ??= m.type
            log.push(block('archive', m.type, `${m.error}. ${file.path} stays in ${inDir}.`))
            continue
          }
          store.progress = null
          store.done = keep(store.done, { file: file.name, t: now, lines: rows.length, mode })
          log.push(info(`All ${rows.length} lines of ${file.name} are sent. Archived it as ${m.path}`))
        }
        return { ok: !errorType, ms: errorType ? 31000 : 4000, errorType, log, store }
      },
    },
  },
  [API]: {
    note: `GET /availability/{sku} answers what the web shop shows. POST /reservations reserves one unit for a web order. A JMS listener on ${QUEUE} (numberOfConsumers from jms.consumers, default 1) sets the availability of a SKU from each stock message. The prefetch of the ActiveMQ client comes from jms.url, for example ?jms.prefetchPolicy.queuePrefetch=1; the default is 1000. With stock.idempotent true, the update keeps the file date per SKU and applies a message only when its file date is newer than the one stored.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: LISTEN_FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    handle({ store }, req) {
      const avail = store.avail ?? {}
      const m = req.path.match(/^\/availability\/([A-Za-z0-9-]+)$/)
      if (req.method === 'GET' && m) {
        const a = avail[m[1]]
        if (!a) return { status: 404, ms: 6, body: `{"error":"Unknown SKU ${m[1]}"}` }
        return { status: 200, ms: 9, body: JSON.stringify({ sku: m[1], available: a[0], asOf: a[1], reservedSinceUpdate: a[2] }) }
      }
      if (req.method === 'POST' && req.path === '/reservations') {
        // the web shop reserves the busy SKUs H-1001 to H-1060 in turn (lab-made traffic)
        store.n = (store.n ?? 0) + 1
        const sku = `H-${1001 + (store.n % 60)}`
        const a = avail[sku]
        if (!a || a[0] <= 0) return { status: 409, ms: 12, body: `{"error":"${sku} is out of stock"}` }
        avail[sku] = [a[0] - 1, a[1], a[2] + 1]
        store.avail = avail
        return { status: 201, ms: 14, body: `{"sku":"${sku}","reserved":1}` }
      }
      return { status: 404, ms: 3, body: '' }
    },
    run: {
      [LISTEN_FLOW]: ({ props, store, now, jms }) => {
        const avail = store.avail ?? {}
        const safe = idempotent(props)
        const log = []
        let applied = 0
        let skipped = 0
        const reset = []
        for (let k = 1; k <= consumersOf(props); k++) {
          const res = jms.listen(connOf(props), QUEUE, { ackMode: 'AUTO', max: RATE, consumer: k }, (msg) => {
            const b = JSON.parse(msg.body)
            const a = avail[b.sku]
            if (safe && a && a[1] >= b.fileDate) {
              skipped++
              return { ok: true }
            }
            if (a && a[1] === b.fileDate && a[2] > 0) reset.push(`${b.sku} (${a[2]})`)
            avail[b.sku] = [b.available, b.fileDate, 0]
            applied++
            return { ok: true }
          })
          if (!res.ok) {
            log.push(muleError({ flow: LISTEN_FLOW, file: API, at: 0, name: 'Listener', dsl: `<jms:listener config-ref="AMQ_Config" destination="${QUEUE}" numberOfConsumers="\${jms.consumers}">`, type: res.muleType, message: res.text }))
            break
          }
        }
        store.avail = avail
        store.applied = (store.applied ?? 0) + applied
        store.skipped = (store.skipped ?? 0) + skipped
        if (applied || skipped) log.push(info(`Stock updates: ${applied} applied${skipped ? `, ${skipped} skipped as already applied for that file date` : ''}`))
        if (reset.length) {
          store.oversold = keep(store.oversold, { t: now, n: reset.length })
          log.push(warn(`A repeated stock message set ${reset.length} SKUs back to the file count, so units reserved since the first update count as free again: ${reset.slice(0, 6).join(', ')}${reset.length > 6 ? ' ...' : ''}`))
        }
        return { ok: true, ms: 60000, log, store }
      },
    },
  },
  [WATCH]: {
    note: 'Every minute it reads QueueSize of the queues in watch.queues over Jolokia and mails alert.to when one has more than queue.alertSize messages. Empty queue.alertSize means no alert. It mails at most once an hour per queue.',
    boot: needs('jms.url', 'watch.queues', 'alert.to'),
    schedules: [{ flow: WATCH_FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      [WATCH_FLOW]: ({ props, store, now, jms }) => {
        const limit = alertSize(props)
        const mail = []
        const log = []
        for (const q of clean(props['watch.queues']).split(',').map((x) => x.trim()).filter(Boolean)) {
          const st = jms.stats(connOf(props), q)
          if (!st.ok || limit === null || st.QueueSize <= limit || now - (store.mailed?.[q] ?? -Infinity) < HOUR) continue
          store.mailed = { ...(store.mailed ?? {}), [q]: now }
          mail.push({ to: clean(props['alert.to']), subject: `ActiveMQ: ${q} has ${st.QueueSize} messages`, body: `${q} on harbor-amq has ${st.QueueSize} messages and ${st.ConsumerCount} consumers, above the limit of ${limit}. The store is ${st.storePercentUsage}% used. When it reaches 100% producer flow control stops the senders.` })
          log.push(warn(`${q} has ${st.QueueSize} messages, above ${limit}. Alert mailed.`))
        }
        return { ok: true, ms: 100, log, store, ...(mail.length && { mail }) }
      },
    },
  },
}
