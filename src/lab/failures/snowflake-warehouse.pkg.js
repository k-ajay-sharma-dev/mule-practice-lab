// The sample application of the snowflake-warehouse lab. Imports only platform-log.js and the import free Snowflake
// engine, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'
import { cfgOf, fileStamp, ordersCsv, tsText } from '../platform-snowflake.js'

export const LOADER = 'orders-dw-loader'
export const LOADER_FLOW = 'orders-to-snowflake-flow'
export const PER_RUN = 5
const el = {
  put: { flow: LOADER_FLOW, at: 2, name: 'PUT orders file', dsl: '<snowflake:execute-script doc:name="PUT orders file" config-ref="Snowflake_Config">' },
  copy: { flow: LOADER_FLOW, at: 3, name: 'COPY INTO ORDERS', dsl: '<snowflake:execute-script doc:name="COPY INTO ORDERS" config-ref="Snowflake_Config">' },
}
const failed = (r, e, store) => ({ ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...e, file: LOADER, type: r.type, message: `net.snowflake.client.jdbc.SnowflakeSQLException: ${r.text}` })], store })

export const PACKAGES = {
  [LOADER]: {
    note: `Every 15 minutes it takes the new web shop orders, writes them as a CSV file, PUTs the file to the internal stage @ORDERS_STAGE (the driver compresses it to .csv.gz) and runs COPY INTO ORDERS FROM @ORDERS_STAGE FILE_FORMAT = (FORMAT_NAME = 'CSV_ORDERS'). PUT needs no warehouse; COPY runs on the session warehouse snowflake.warehouse. A file that did not load stays in the stage, and the next COPY takes it, because the load metadata knows which files are loaded. Key pair authentication: snowflake.user with the protected property snowflake.privateKey.`,
    boot: needs('snowflake.account', 'snowflake.user', 'snowflake.privateKey', 'snowflake.warehouse', 'snowflake.database', 'snowflake.schema'),
    schedules: [{ flow: LOADER_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [LOADER_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const cfg = cfgOf(props)
        const first = store.next ?? 71001
        const name = `orders_${fileStamp(now)}.csv`
        const put = ctx.snowflake.put(cfg, '@ORDERS_STAGE', { name, content: ordersCsv(first, tsText(now).slice(0, 10), PER_RUN) })
        if (!put.ok) return failed(put, el.put, store)
        store.next = first + PER_RUN
        store.made = (store.made ?? 0) + PER_RUN
        const log = [info(`PUT ${name} to @ORDERS_STAGE: ${put.status}, ${PER_RUN} orders`)]
        const r = ctx.snowflake.execute(cfg, "COPY INTO ORDERS FROM @ORDERS_STAGE FILE_FORMAT = (FORMAT_NAME = 'CSV_ORDERS')")
        if (!r.ok) {
          const f = failed(r, el.copy, store)
          return { ...f, log: [...log, ...f.log], ms: f.ms + put.ms }
        }
        const files = r.stats?.files ?? []
        log.push(info(files.length ? `COPY INTO ORDERS (query ${r.qid}): ${files.length} file${files.length > 1 ? 's' : ''}, ${r.stats.loaded} rows loaded` : `COPY INTO ORDERS (query ${r.qid}): ${r.message}`))
        return { ok: true, ms: r.ms + put.ms, log, store }
      },
    },
  },
}
