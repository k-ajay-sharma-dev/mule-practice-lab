// The sample application of the snowflake-load-history lab. Imports only platform-log.js and the import free
// Snowflake engine, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'
import { cfgOf } from '../platform-snowflake.js'

export const NIGHTLY = 'orders-dw-nightly-copy'
export const NIGHTLY_FLOW = 'orders-nightly-copy-flow'
const el = { flow: NIGHTLY_FLOW, at: 1, name: 'COPY INTO ORDERS', dsl: '<snowflake:execute-script doc:name="COPY INTO ORDERS" config-ref="Snowflake_Config">' }

export const PACKAGES = {
  [NIGHTLY]: {
    note: "Every night at 02:00 UTC it runs COPY INTO ORDERS FROM @ORDERS_STAGE PATTERN = '.*orders_.*[.]csv' FORCE = the property snowflake.copy.force (FALSE when it is empty). The order system puts one file per day in the stage at 01:00. The load metadata of ORDERS decides which files are new.",
    boot: needs('snowflake.account', 'snowflake.user', 'snowflake.privateKey', 'snowflake.warehouse', 'snowflake.database', 'snowflake.schema'),
    schedules: [{ flow: NIGHTLY_FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [NIGHTLY_FLOW]: (ctx) => {
        const force = String(ctx.props['snowflake.copy.force'] ?? '').trim().toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
        const r = ctx.snowflake.execute(cfgOf(ctx.props), `COPY INTO ORDERS FROM @ORDERS_STAGE PATTERN = '.*orders_.*[.]csv' FORCE = ${force}`)
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el, file: NIGHTLY, type: r.type, message: `net.snowflake.client.jdbc.SnowflakeSQLException: ${r.text}` })] }
        const files = r.stats?.files ?? []
        const log = files.length ? files.map((f) => info(`${f.file}: ${f.status}, ${f.loaded} rows`)) : [info(r.message)]
        log.push((force === 'TRUE' ? warn : info)(`COPY INTO ORDERS FORCE = ${force} (query ${r.qid}): ${files.length} files, ${r.stats?.loaded ?? 0} rows loaded`))
        return { ok: true, ms: r.ms, log }
      },
    },
  },
}
