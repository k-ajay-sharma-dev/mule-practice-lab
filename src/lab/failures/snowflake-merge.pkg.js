// The sample application of the snowflake-merge lab. Imports only platform-log.js and the import free Snowflake engine,
// so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'
import { cfgOf, fileStamp, tsText } from '../platform-snowflake.js'

export const CRM_MERGE = 'crm-customer-dw-merge'
export const MERGE_FLOW = 'customer-merge-flow'
export const MERGE_SQL =
  'MERGE INTO CUSTOMERS t USING CUSTOMER_CHANGES_V s ON t.CUSTOMER_ID = s.CUSTOMER_ID WHEN MATCHED THEN UPDATE SET t.NAME = s.NAME, t.EMAIL = s.EMAIL, t.TIER = s.TIER, t.UPDATED_AT = s.UPDATED_AT WHEN NOT MATCHED THEN INSERT (CUSTOMER_ID, NAME, EMAIL, TIER, UPDATED_AT) VALUES (s.CUSTOMER_ID, s.NAME, s.EMAIL, s.TIER, s.UPDATED_AT)'
const el = {
  put: { flow: MERGE_FLOW, at: 2, name: 'PUT changes file', dsl: '<snowflake:execute-script doc:name="PUT changes file" config-ref="Snowflake_Config">' },
  copy: { flow: MERGE_FLOW, at: 3, name: 'COPY INTO CUSTOMER_CHANGES', dsl: '<snowflake:execute-script doc:name="COPY INTO CUSTOMER_CHANGES" config-ref="Snowflake_Config">' },
  merge: { flow: MERGE_FLOW, at: 4, name: 'MERGE INTO CUSTOMERS', dsl: '<snowflake:execute-script doc:name="MERGE INTO CUSTOMERS" config-ref="Snowflake_Config">' },
}

// lab-made: the changes the CRM sends in each run, [id, name, email, tier, updated at]
export const CHANGES = {
  1: [
    ['C-5003', 'New Pier Bakery', 'orders@newpier.example', 'SILVER', '2026-11-03 08:41:00'],
    ['C-1001', 'Quay Deli', 'buying@quaydeli.example', 'GOLD', '2026-11-03 08:47:00'],
    ['C-5003', 'New Pier Bakery', 'orders@newpier.example', 'GOLD', '2026-11-03 08:52:00'],
  ],
  2: [
    ['C-1002', 'Pier Cafe', 'hello@piercafe.example', 'SILVER', '2026-11-03 09:05:00'],
    ['C-1002', 'Pier Cafe', 'hello@piercafe.example', 'GOLD', '2026-11-03 09:20:00'],
  ],
}
const TIERS = ['BRONZE', 'SILVER', 'GOLD']
const ID = (run) => `C-100${3 + (run % 4)}`
const changesOf = (run, now) => CHANGES[run] ?? [[ID(run), `Brightmart customer ${ID(run)}`, `${ID(run).toLowerCase()}@customers.example`, TIERS[run % 3], tsText(now)]]
const csv = (rows) => `CUSTOMER_ID,NAME,EMAIL,TIER,UPDATED_AT\n${rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')}\n`
const failed = (r, e, log) => ({ ok: false, ms: r.ms, errorType: r.type, log: [...log, muleError({ ...e, file: CRM_MERGE, type: r.type, message: `net.snowflake.client.jdbc.SnowflakeSQLException: ${r.text}` })] })

export const PACKAGES = {
  [CRM_MERGE]: {
    note: `Every 30 minutes it takes the customer changes from the CRM, PUTs them as a CSV file to @CUSTOMER_STAGE, loads them into the staging table CUSTOMER_CHANGES with COPY ... PURGE = TRUE, and runs ${MERGE_SQL}. The source of the MERGE is the view CUSTOMER_CHANGES_V on the staging table. After a MERGE that worked it runs TRUNCATE TABLE CUSTOMER_CHANGES; after one that failed the rows stay, and the next run tries them again with the new ones.`,
    boot: needs('snowflake.account', 'snowflake.user', 'snowflake.privateKey', 'snowflake.warehouse', 'snowflake.database', 'snowflake.schema'),
    schedules: [{ flow: MERGE_FLOW, type: 'fixed', value: '30', unit: 'minutes', enabled: true }],
    run: {
      [MERGE_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const cfg = cfgOf(props)
        const run = (store.run ?? 0) + 1
        const rows = changesOf(run, now)
        const name = `changes_${fileStamp(now)}.csv`
        const put = ctx.snowflake.put(cfg, '@CUSTOMER_STAGE', { name, content: csv(rows) })
        if (!put.ok) return failed(put, el.put, [])
        store.run = run
        const log = [info(`PUT ${name}: ${put.status}, ${rows.length} customer changes`)]
        const copy = ctx.snowflake.execute(cfg, 'COPY INTO CUSTOMER_CHANGES FROM @CUSTOMER_STAGE PURGE = TRUE')
        if (!copy.ok) return { ...failed(copy, el.copy, log), store }
        const merge = ctx.snowflake.execute(cfg, MERGE_SQL)
        if (!merge.ok) return { ...failed(merge, el.merge, log), store }
        const st = merge.stats ?? {}
        log.push(info(`MERGE INTO CUSTOMERS (query ${merge.qid}): ${st.inserted ?? 0} inserted, ${st.updated ?? 0} updated`))
        const t = ctx.snowflake.execute(cfg, 'TRUNCATE TABLE CUSTOMER_CHANGES')
        if (!t.ok) return { ...failed(t, el.merge, log), store }
        return { ok: true, ms: put.ms + copy.ms + merge.ms + t.ms, log, store }
      },
    },
  },
}
