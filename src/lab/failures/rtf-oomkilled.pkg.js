// The sample application of the rtf-oomkilled lab. Imports only platform-log.js and the import free Runtime Fabric engine.
import { info, line, warn } from '../platform-log.js'
import { MULE_BASE_MI } from '../platform-rtf.js'

export const EXPORT = 'brightmart-inventory-export'
export const FILE = 'inventory-full-20261127.csv'
export const FILE_MB = 412
// a SKU and price cache the app keeps in memory all the time
export const RESIDENT_MI = 460
// lab-made: what one export run adds to the container memory. Read into memory, the 412 MB file becomes Java strings
// and DataWeave objects of about four times its size. Streamed, only a window of rows and the write buffers are held.
export const FULL_MI = 1750
export const STREAM_MI = 230
const DW = 'org.mule.weave.v2.interpreter'

export const streamingOn = (props) => String(props?.['export.streaming'] ?? '').trim().toLowerCase() === 'true'
export const needMi = (props) => MULE_BASE_MI + RESIDENT_MI + (streamingOn(props) ? STREAM_MI : FULL_MI)

export const PACKAGES = {
  [EXPORT]: {
    note: `Every 5 minutes it exports the full inventory file ${FILE} (${FILE_MB} MB) to the marketplace feed. With export.streaming=false the flow reads the whole file into memory and maps it in one go. With export.streaming=true it reads it as a repeatable file store stream and writes it out in chunks.`,
    schedules: [{ flow: 'inventory-export-flow', type: 'cron', value: '0 */5 * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'inventory-export-flow': ({ app, props, store, now }) => {
        const stream = streamingOn(props)
        const limit = Math.round((app.rtf?.memory ?? 1) * 1024)
        const need = needMi(props)
        const extra = stream ? STREAM_MI : FULL_MI
        const log = [info(stream ? `Streaming ${FILE} (${FILE_MB} MB) from the warehouse share, repeatable file store stream, 512 KB in memory` : `Reading ${FILE} (${FILE_MB} MB) from the warehouse share into memory`)]
        if (need > limit) {
          log.push(
            warn(`Heap usage at 96% after a full GC. The payload of ${FILE} is held in memory by the transform.`, 'org.mule.runtime.core.internal.management.stats'),
            line(
              'ERROR',
              `Exception in thread "[MuleRuntime].uber.03: [${EXPORT}].inventory-export-flow.CPU_INTENSIVE" java.lang.OutOfMemoryError: Java heap space\n\tat java.base/java.util.Arrays.copyOf(Arrays.java:3537)\n\tat java.base/java.lang.AbstractStringBuilder.ensureCapacityInternal(AbstractStringBuilder.java:228)\n\tat ${DW}.module.reader.CSVReader.readAll(CSVReader.scala:118)\n\tat ${DW}.ExecutionContext.materialize(ExecutionContext.scala:402)`,
              'org.mule.runtime.core.privileged.exception',
            ),
          )
          return { ok: false, ms: 70000, heap: 99, log, store: { ...store, rtfPeakMi: extra } }
        }
        log.push(info(`Exported 1184220 inventory rows to the marketplace feed in ${stream ? 'chunks of 5000' : 'one batch'}`))
        const exports = [...(store.exports ?? []), { t: now, config: app.config }].slice(-12)
        return { ok: true, ms: stream ? 95000 : 60000, heap: Math.round((need / limit) * 100), log, store: { ...store, rtfPeakMi: extra, exports } }
      },
    },
  },
}
