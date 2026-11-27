// The sample application of the end to end lab of Salesforce. Imports only platform-log.js, so the engine can load it
// without a cycle. The app reads loyalty members from SQL Server through ctx.db (platform-db.js) and upserts them into
// Salesforce as Accounts through ctx.salesforce (platform-salesforce.js), so both sides show in their own screens.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'loyalty-sfdc-sync'
export const ASSET = 'loyalty-sync-api'
export const FLOW = 'loyalty-sync-flow'
export const MAIN = 'loyalty-sync-api-main'
export const DB = 'brightmart-sql' // Sandbox: sql.brightmart.lab
export const DB_PRD = 'brightmart-sql-prd' // Production: sql-prd.brightmart.lab
export const DATABASE = 'BrightmartLoyalty'
export const TABLE = 'dbo.loyalty_members'
export const BATCH = 200 // the most records one SOAP upsert call takes

// the Database config of the app, read from its properties. The lab has one server per environment, picked by host.
export const cfgOf = (p) => ({ host: p['db.host'], port: p['db.port'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '10' })
const serverFor = (p) => (/sql-prd\./i.test(String(p['db.host'] ?? '')) ? DB_PRD : DB)
// the DataWeave of the lab: a row of dbo.loyalty_members as a Salesforce Account
export const toAccount = (r) => ({ Name: r.name, Brightmart_Customer_Id__c: r.customer_id, Loyalty_Tier__c: r.tier, BillingCity: r.city, BillingCountry: r.country, Type: 'Customer' })
// lab made: a correlation ID per run, in the shape of a Mule event ID
const cid = (now, name) => `${((Math.floor(now / 1000) * 2654435761) >>> 0).toString(16).padStart(8, '0')}-${(name.length * 7919).toString(16).slice(0, 4)}-11f1-a7c2-0050568f1d2e`

const el = {
  select: { at: 1, name: 'Select pending members', dsl: '<db:select doc:name="Select pending members" config-ref="Database_Config">' },
  upsert: { at: 3, name: 'Upsert accounts', dsl: '<salesforce:upsert doc:name="Upsert accounts" config-ref="Salesforce_Config" objectType="Account" externalIdFieldName="Brightmart_Customer_Id__c">' },
  mark: { at: 4, name: 'Mark synced rows', dsl: '<db:update doc:name="Mark synced rows" config-ref="Database_Config">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note: `Loyalty Sync API, built in Studio on the spec of Exchange. ${FLOW} runs every 5 minutes: it selects the rows of ${TABLE} with sync_status PENDING (TOP ${BATCH}), maps them to Accounts in DataWeave and upserts them in Salesforce on Brightmart_Customer_Id__c. Each row then gets SYNCED with the Salesforce ID, or FAILED with the Salesforce error in sync_error; a failed row stays in the table until someone fixes it and sets it to PENDING again. GET /members/{customerId} answers the sync status of one member. Properties: db.host, db.port, db.database, db.user, db.password (protected), salesforce.url, salesforce.username, salesforce.password and salesforce.securityToken (both protected), api.id and the environment client ID and secret.`,
    sample: { method: 'GET', path: '/members/HC-40001' },
    boot: needs('db.host', 'db.port', 'db.database', 'db.user', 'db.password', 'salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/members\/([\w-]+)$/)
      if (req.method !== 'GET' || !m) return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: MAIN, body: '{"message":"Resource not found"}' }
      const r = ctx.db.select(serverFor(ctx.props), cfgOf(ctx.props), `SELECT customer_id, sync_status, sf_id, sync_error FROM ${TABLE} WHERE customer_id = :id`, { id: m[1] })
      if (!r.ok) return { status: 503, ms: 30, error: r.errorType, flow: 'get:\\members\\(customerId)', body: '{"message":"Database unavailable"}' }
      return r.rows.length ? { status: 200, ms: r.ms + 8, flow: 'get:\\members\\(customerId)', body: JSON.stringify(r.rows[0]) } : { status: 404, ms: r.ms + 8, flow: 'get:\\members\\(customerId)', body: JSON.stringify({ message: `No member ${m[1]}` }) }
    },
    run: {
      [FLOW]: (ctx) => {
        const p = ctx.props
        const db = serverFor(p)
        const cfg = cfgOf(p)
        const id = cid(ctx.now, ctx.app.name)
        const tag = (text) => `correlationId=${id} ${text}`
        const rows = ctx.db.select(db, cfg, `SELECT TOP ${BATCH} customer_id, name, tier, city, country FROM ${TABLE} WHERE sync_status = 'PENDING' ORDER BY customer_id`)
        if (!rows.ok) return { ok: false, ms: rows.ms ?? 900, errorType: rows.errorType, log: [info(tag(`Starting ${FLOW}`)), block('select', rows.errorType, rows.text)] }
        if (!rows.rows.length) return { ok: true, ms: rows.ms + 5, log: [info(tag(`No pending loyalty members in ${TABLE}.`))] }
        const accounts = rows.rows.map(toAccount)
        const r = ctx.salesforce.upsert('Account', 'Brightmart_Customer_Id__c', accounts)
        const open = [info(tag(`Starting ${FLOW}. Read ${rows.rows.length} pending members from ${TABLE}.`))]
        if (!r.ok) return { ok: false, ms: 900, errorType: r.type, log: [...open, block('upsert', r.type, r.error)] }
        const out = [...open]
        let bad = 0
        const failed = []
        r.items.forEach((it, i) => {
          const row = rows.rows[i]
          if (it.success) {
            ctx.db.update(db, cfg, `UPDATE ${TABLE} SET sync_status = 'SYNCED', sf_id = :sf, sync_error = NULL WHERE customer_id = :id`, { sf: it.id, id: row.customer_id })
            out.push(info(tag(`customer_id=${row.customer_id} upserted as Account ${it.id} (${it.created ? 'created' : 'updated'}): Name=${row.name}, Loyalty_Tier__c=${row.tier}, BillingCountry=${row.country}`)))
          } else {
            bad++
            failed.push({ id: row.customer_id, code: it.errors[0]?.statusCode, t: ctx.now })
            const text = it.errors.map((e) => `${e.statusCode}: ${e.message}`).join('; ')
            ctx.db.update(db, cfg, `UPDATE ${TABLE} SET sync_status = 'FAILED', sync_error = :err WHERE customer_id = :id`, { err: text.slice(0, 200), id: row.customer_id })
            out.push(warn(tag(`customer_id=${row.customer_id} was not saved. ${text}. The row is FAILED in ${TABLE} with the error in sync_error.`)))
          }
        })
        out.push(info(tag(`${FLOW} finished. ${rows.rows.length - bad} synced, ${bad} failed.`)))
        // the failures of the runs, kept in the object store for the status API and for the lab
        return { ok: true, ms: 1400, errors: bad, log: out, ...(bad && { store: { failed: [...(ctx.store.failed ?? []), ...failed].slice(-20) } }) }
      },
    },
  },
}
