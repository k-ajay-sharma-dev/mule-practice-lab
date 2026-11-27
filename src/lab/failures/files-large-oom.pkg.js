// The sample applications of the files-large-oom lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, line, muleError, needs, warn } from '../platform-log.js'

const NAME = 'pos-sales-nightly'
export const FLOW = 'pos-sales-flow'
export const HOST = 'sftp.harbor.lab'
export const FILE = '/in/pos-sales-2026-11-02.csv'
export const SIZE = 2 * 1024 * 1024 * 1024 // 2 GB of sales lines from every till of Harbor Outfitters
export const LINES = 16200000
const MB = 1024 * 1024
const BASE_MB = 420 // the runtime, the connectors and the app itself
const RECORD_KB = 1 // one sale line as a DataWeave object
const THREADS = 16 // batch threads of a replica in the lab
// heap of each replica size, from the CloudHub 2.0 replica size table
const HEAP = { 0.1: 480, 0.2: 1024, 0.5: 1331, 1: 2048, 1.5: 3072, 2: 4096, 2.5: 4864, 3: 5632, 3.5: 6656, 4: 7680 }
const STRATEGIES = ['repeatable-in-memory', 'repeatable-file-store', 'non-repeatable']
const pick = (value, list, fallback) => (list.includes(String(value ?? '').trim()) ? String(value).trim() : fallback)
const whole = (value, fallback) => (String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback)
const number = (n) => Math.round(n).toLocaleString('en-US')

export function settingsOf(props) {
  return {
    strategy: pick(props['stream.strategy'], STRATEGIES, 'repeatable-file-store'),
    maxBufferMb: whole(props['stream.maxBufferMb'], 1),
    script: pick(props['dw.script'], ['group-all', 'per-record'], 'group-all'),
    mode: pick(props['process.mode'], ['transform', 'batch'], 'transform'),
    blockSize: Math.max(1, whole(props['batch.blockSize'], 100)),
  }
}
// the read goes through the disk, not the heap
export const streams = (set) => set.strategy !== 'repeatable-in-memory'
// what follows the read takes the records one piece at a time
export const piecewise = (set) => (set.mode === 'batch' ? set.blockSize <= 1000 : set.script === 'per-record')

const configOf = (set) =>
  set.strategy === 'repeatable-in-memory'
    ? `<repeatable-in-memory-stream initialBufferSize="512" bufferSizeIncrement="512" maxBufferSize="${set.maxBufferMb}" bufferUnit="MB"/>`
    : set.strategy === 'repeatable-file-store'
      ? '<repeatable-file-store-stream inMemorySize="512" bufferUnit="KB"/>'
      : '<non-repeatable-stream/>'
const scriptOf = (set) =>
  set.mode === 'batch'
    ? `Batch Job pos-sales-load, blockSize ${set.blockSize}: each record is mapped in a Batch Step and written with a Batch Aggregator`
    : set.script === 'group-all'
      ? 'Transform "Sales by store": payload groupBy $.store, then pluck and flatten, output application/json'
      : 'Transform "Sales lines": input payload application/csv streaming=true, output application/json deferred=true, payload map one sale at a time'

export const PACKAGES = {
  [NAME]: {
    note: 'Reads the nightly sales file of every till from /in on sftp.harbor.lab at 02:00, turns each sale line into JSON for the data warehouse, writes it to /out and moves the file to /archive. stream.strategy is the streaming strategy of the SFTP Read (repeatable-in-memory, repeatable-file-store or non-repeatable), stream.maxBufferMb the maxBufferSize of the in-memory stream. dw.script is group-all (groupBy over the whole file) or per-record (a streamed and deferred map). process.mode transform or batch, with batch.blockSize.',
    boot: needs('sftp.host', 'sftp.user', 'sftp.password', 'stream.strategy', 'dw.script', 'process.mode'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: ({ props, app, systems }) => {
        const set = settingsOf(props)
        const heapMb = HEAP[app.vCores] ?? 480
        const log = [info(`Starting ${FLOW} on a ${app.vCores} vCore replica, heap ${number(heapMb)} MB. stream.strategy ${set.strategy}, dw.script ${set.script}, process.mode ${set.mode}${set.mode === 'batch' ? `, batch.blockSize ${set.blockSize}` : ''}`)]
        const sftp = systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'] })
        const listed = sftp.list('/in')
        if (!listed.ok) {
          const error = { flow: FLOW, file: NAME, at: 1, name: 'List sales files', dsl: '<sftp:list doc:name="List sales files" config-ref="SFTP_Config" directoryPath="/in">', type: listed.type ?? 'SFTP:CONNECTIVITY', message: listed.error }
          log.push(muleError(error))
          return { ok: false, ms: 3000, errorType: error.type, log }
        }
        const files = listed.files.filter((f) => !f.dir && /^pos-sales-.*\.csv$/.test(f.name)).sort((a, b) => a.path.localeCompare(b.path))
        if (!files.length) {
          log.push(info('No sales file in /in. Job finished.'))
          return { ok: true, ms: 2000, log }
        }
        const file = files[0]
        const read = sftp.read(file.path)
        if (!read.ok) {
          const error = { flow: FLOW, file: NAME, at: 2, name: 'Read sales file', dsl: '<sftp:read doc:name="Read sales file" config-ref="SFTP_Config">', type: read.type ?? 'SFTP:CONNECTIVITY', message: read.error }
          log.push(muleError(error))
          return { ok: false, ms: 3000, errorType: error.type, log }
        }
        const fileMb = read.size / MB
        const tried = streams(set) ? { streamRun: true } : {}
        log.push(info(`Read ${file.path}, ${number(fileMb)} MB, with ${configOf(set)}`))
        log.push(info(scriptOf(set)))

        // an in-memory stream that may not grow past its limit fails at once, before the heap fills up
        if (set.strategy === 'repeatable-in-memory' && fileMb > set.maxBufferMb) {
          const error = {
            flow: FLOW, file: NAME, at: 2, name: 'Read sales file', dsl: '<sftp:read doc:name="Read sales file" config-ref="SFTP_Config">', type: 'MULE:STREAM_MAXIMUM_SIZE_EXCEEDED',
            message: `Tried to buffer a stream with a size larger than the configured maximum of ${set.maxBufferMb} MB. ${file.path} is ${number(fileMb)} MB.`,
          }
          log.push(muleError(error))
          return { ok: false, ms: 9000, heap: 45, errorType: error.type, log, store: { ...tried, last: { ...set, ok: false, vCores: app.vCores, heap: 45, error: error.type } } }
        }

        const readMb = set.strategy === 'repeatable-in-memory' ? fileMb : 1
        const workMb = set.mode === 'batch' ? (THREADS * set.blockSize * RECORD_KB) / 1024 : set.script === 'group-all' ? fileMb * 1.5 : 60
        const heap = Math.round(((BASE_MB + readMb + workMb) / heapMb) * 100)
        if (heap >= 98) {
          const where = set.strategy === 'repeatable-in-memory'
            ? 'org.mule.runtime.core.internal.streaming.bytes.InMemoryStreamBuffer.expandBuffer'
            : set.mode === 'batch'
              ? 'com.mulesoft.mule.runtime.module.batch.internal.engine.BatchBlock.<init>'
              : 'org.mule.weave.v2.model.values.ArrayValue.groupBy'
          log.push(warn(`Memory pool G1 Old Gen is at 97 percent after GC. The flow needs about ${number(BASE_MB + readMb + workMb)} MB and the heap has ${number(heapMb)} MB.`, 'com.mulesoft.agent.services.gc'))
          log.push(line('ERROR', `Exception in thread "[MuleRuntime].uber.07: [${NAME}].${FLOW}" java.lang.OutOfMemoryError: Java heap space\n\tat ${where}\n\tat org.mule.weave.v2.module.reader.SourceReader.read`, 'java.lang.Thread'))
          return { ok: false, ms: 11 * 60000, heap: 100, restart: true, errorType: 'java.lang.OutOfMemoryError', log, store: { ...tried, last: { ...set, ok: false, vCores: app.vCores, heap: 100, error: 'java.lang.OutOfMemoryError' } } }
        }

        const out = `/out/${file.name.replace(/\.csv$/, '.json')}`
        const wrote = sftp.write(out, '[{"store":"014","till":3,"sku":"H-100","qty":2,"amount":19.8}]', { mode: 'OVERWRITE', size: Math.round(read.size * 1.3) })
        const moved = wrote.ok && sftp.move(file.path, `/archive/${file.name}`, { overwrite: true })
        if (!wrote.ok || !moved.ok) {
          const r = wrote.ok ? moved : wrote
          const error = { flow: FLOW, file: NAME, at: 5, name: wrote.ok ? 'Archive sales file' : 'Write warehouse file', dsl: wrote.ok ? '<sftp:move doc:name="Archive sales file" config-ref="SFTP_Config">' : '<sftp:write doc:name="Write warehouse file" config-ref="SFTP_Config">', type: r.type ?? 'SFTP:CONNECTIVITY', message: r.error }
          log.push(muleError(error))
          return { ok: false, ms: 20 * 60000, heap, errorType: error.type, log, store: { ...tried, last: { ...set, ok: false, vCores: app.vCores, heap } } }
        }
        const ms = (set.mode === 'batch' ? 26 : 19) * 60000
        log.push(info(`Wrote ${number(LINES)} sale lines to ${out} and moved ${file.path} to /archive. Heap peaked at ${heap} percent. Job finished in ${Math.round(ms / 60000)} min.`))
        if (heap > 80) log.push(warn(`Heap peaked at ${heap} percent of ${number(heapMb)} MB. The sales file grows about 4 percent a month, and a large sale day makes it larger still.`, 'com.mulesoft.agent.services.gc'))
        return { ok: true, ms, heap, log, store: { ...tried, last: { ...set, ok: true, vCores: app.vCores, heap } } }
      },
    },
  },
}
