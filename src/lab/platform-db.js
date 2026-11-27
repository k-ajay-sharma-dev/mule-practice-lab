// SQL Server and Oracle databases for the Platform Lab: tables with a few rows, logins and users, indexes, sessions,
// locks and blocking chains, deadlock reports, execution plans and the connection pools of the Mule apps.
// Pure and import free. Lives in state.databases. A console action takes a state and returns a new one; the ctx API
// that packages use (dbCtx, ctx.db) changes the draft state the engine hands it.
//
// Facts this file follows:
// SQL Server: user sessions have session_id above 50; READ COMMITTED takes shared locks while it reads unless
// READ_COMMITTED_SNAPSHOT is on; a writer takes X key locks and keeps them to the end of the transaction; KILL rolls the
// transaction of the session back; the lock monitor ends a deadlock by rolling back the cheapest transaction (error 1205)
// and system_health keeps an xml_deadlock_report; a scan with a sargable predicate on a column with no index shows a
// Missing Index hint; CAST(col AS date) is still sargable (a dynamic seek), CONVERT to a string is not.
// Oracle: readers never wait for writers (multiversion reads from undo); a writer waits on enq: TX - row lock
// contention; DML starts a transaction that lasts to COMMIT or ROLLBACK; ORA-00060 rolls back the statement that found
// the deadlock; ROWNUM is applied before ORDER BY; ALTER SYSTEM KILL SESSION 'sid,serial#'.
// Mule Database connector: pooling-profile maxPoolSize default 5, maxWait 0 means wait with no limit, queryTimeout 0
// means no timeout, Oracle JDBC fetch size default 10. Error types DB:CONNECTIVITY, DB:QUERY_EXECUTION, DB:BAD_SQL_SYNTAX.
// Everything marked "lab-made" is a simplification of the lab and not how a real server behaves.

const MINUTE = 60000
export const SQLSERVER = 'sqlserver'
export const ORACLE = 'oracle'
const SCAN_MS_PER_ROW = 0.004 // lab-made: a scan reads 250,000 rows a second
const LOOKUP_MS = 0.02 // lab-made: one key lookup or one row by ROWID
const MAX_SESSIONS = 80
const MAX_KEEP = 30

const iso = (t) => new Date(Date.UTC(2026, 10, 2) + t).toISOString() // the lab day 0 is 2026-11-02
const sqlTime = (t) => iso(t).replace('T', ' ').replace('Z', '')
const day = (t) => iso(t).slice(0, 10)
const hash = (text, n = 12) => {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  let out = ''
  while (out.length < n) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}
const sum = (list) => list.reduce((n, x) => n + x, 0)

// ---------- seed ----------

const col = (name, type, extra = {}) => ({ name, type, nullable: true, ...extra })
const key = (name, type) => col(name, type, { nullable: false })
const table = (schema, name, def) => ({ schema, name, columns: [], pk: [], fks: [], indexes: [], rows: [], count: 0, distinct: {}, spread: {}, changed: 0, ...def })

function sqlTables() {
  return {
    'dbo.customers': table('dbo', 'customers', {
      columns: [key('customer_id', 'varchar(12)'), key('name', 'nvarchar(120)'), col('country', 'char(2)'), col('created_at', 'datetime2')],
      pk: ['customer_id'], pkName: 'PK_customers', clustered: true, count: 1200, distinct: { country: 14 },
      rows: [
        { customer_id: 'C-100', name: 'Harbor Foods', country: 'NL', created_at: '2024-03-02 10:12:00' },
        { customer_id: 'C-101', name: 'Bluefin Traders', country: 'DE', created_at: '2024-06-18 08:40:00' },
        { customer_id: 'C-102', name: 'Quayside Market', country: 'GB', created_at: '2025-01-09 15:05:00' },
        { customer_id: 'C-103', name: 'Lantern Outdoor', country: 'US', created_at: '2025-09-30 11:21:00' },
      ],
    }),
    'dbo.orders': table('dbo', 'orders', {
      columns: [key('order_id', 'varchar(12)'), key('customer_id', 'varchar(12)'), key('status', 'varchar(20)'), col('total', 'decimal(12,2)'), col('created_at', 'datetime2'), col('shipped_at', 'datetime2')],
      pk: ['order_id'], pkName: 'PK_orders', clustered: true, count: 480000, distinct: { customer_id: 1200, status: 6 },
      fks: [{ name: 'FK_orders_customers', column: 'customer_id', table: 'dbo.customers', ref: 'customer_id' }],
      rows: [
        { order_id: 'O-1001', customer_id: 'C-100', status: 'SHIPPED', total: 64.9, created_at: '2026-11-01 09:14:00', shipped_at: '2026-11-02 07:30:00' },
        { order_id: 'O-1002', customer_id: 'C-101', status: 'OPEN', total: 120.0, created_at: '2026-11-02 10:02:00', shipped_at: null },
        { order_id: 'O-1003', customer_id: 'C-100', status: 'PAID', total: 18.5, created_at: '2026-11-02 11:45:00', shipped_at: null },
        { order_id: 'O-1004', customer_id: 'C-102', status: 'OPEN', total: 342.1, created_at: '2026-11-02 16:20:00', shipped_at: null },
        { order_id: 'O-1005', customer_id: 'C-103', status: 'SHIPPED', total: 77.0, created_at: '2026-10-30 08:00:00', shipped_at: '2026-11-02 12:10:00' },
        { order_id: 'O-1006', customer_id: 'C-101', status: 'PAID', total: 55.25, created_at: '2026-11-02 18:31:00', shipped_at: null },
        { order_id: 'O-1007', customer_id: 'C-100', status: 'PAID', total: 210.0, created_at: '2026-11-02 19:05:00', shipped_at: null },
      ],
    }),
    'dbo.order_lines': table('dbo', 'order_lines', {
      columns: [key('line_id', 'bigint'), key('order_id', 'varchar(12)'), key('sku', 'varchar(16)'), key('qty', 'int'), col('amount', 'decimal(12,2)'), col('shipped_at', 'datetime2')],
      pk: ['line_id'], pkName: 'PK_order_lines', clustered: true, count: 540000, distinct: { order_id: 480000, sku: 5400, shipped_at: 915 },
      spread: { shipped_at: ['2024-05-01', '2026-11-03'] },
      fks: [{ name: 'FK_order_lines_orders', column: 'order_id', table: 'dbo.orders', ref: 'order_id' }],
      indexes: [{ name: 'IX_order_lines_order_id', columns: ['order_id'], include: [], unique: false, created: 0 }],
      rows: [
        { line_id: 9001, order_id: 'O-1001', sku: 'SKU-22', qty: 2, amount: 39.9, shipped_at: '2026-11-02 07:30:00' },
        { line_id: 9002, order_id: 'O-1001', sku: 'SKU-31', qty: 1, amount: 25.0, shipped_at: '2026-11-02 07:30:00' },
        { line_id: 9003, order_id: 'O-1005', sku: 'SKU-22', qty: 3, amount: 59.85, shipped_at: '2026-11-02 12:10:00' },
        { line_id: 9004, order_id: 'O-1005', sku: 'SKU-48', qty: 1, amount: 17.15, shipped_at: '2026-11-02 12:10:00' },
        { line_id: 9005, order_id: 'O-1002', sku: 'SKU-31', qty: 4, amount: 100.0, shipped_at: null },
        { line_id: 9006, order_id: 'O-1007', sku: 'SKU-22', qty: 10, amount: 199.5, shipped_at: null },
      ],
    }),
    'dbo.stock': table('dbo', 'stock', {
      columns: [key('sku', 'varchar(16)'), key('warehouse', 'varchar(8)'), key('qty', 'int'), key('reserved', 'int')],
      pk: ['sku'], pkName: 'PK_stock', clustered: true, count: 5400, distinct: { warehouse: 3 },
      rows: [
        { sku: 'SKU-22', warehouse: 'W1', qty: 140, reserved: 12 },
        { sku: 'SKU-31', warehouse: 'W1', qty: 61, reserved: 4 },
        { sku: 'SKU-48', warehouse: 'W2', qty: 18, reserved: 0 },
        { sku: 'SKU-55', warehouse: 'W1', qty: 230, reserved: 9 },
        { sku: 'SKU-60', warehouse: 'W3', qty: 7, reserved: 1 },
      ],
    }),
    'dbo.payments': table('dbo', 'payments', {
      columns: [key('payment_id', 'varchar(12)'), key('order_id', 'varchar(12)'), key('amount', 'decimal(12,2)'), key('status', 'varchar(20)')],
      pk: ['payment_id'], pkName: 'PK_payments', clustered: true, count: 452000, distinct: { order_id: 452000, status: 4 },
      fks: [{ name: 'FK_payments_orders', column: 'order_id', table: 'dbo.orders', ref: 'order_id' }],
      rows: [
        { payment_id: 'P-7001', order_id: 'O-1001', amount: 64.9, status: 'CAPTURED' },
        { payment_id: 'P-7003', order_id: 'O-1003', amount: 18.5, status: 'CAPTURED' },
        { payment_id: 'P-7006', order_id: 'O-1006', amount: 55.25, status: 'CAPTURED' },
        { payment_id: 'P-7007', order_id: 'O-1007', amount: 210.0, status: 'CAPTURED' },
      ],
    }),
  }
}

function oracleTables() {
  return {
    'HARBOR.CARRIERS': table('HARBOR', 'CARRIERS', {
      columns: [key('CARRIER_ID', 'VARCHAR2(10)'), key('NAME', 'VARCHAR2(80)'), col('MODE_CODE', 'VARCHAR2(8)')],
      pk: ['CARRIER_ID'], pkName: 'PK_CARRIERS', count: 24,
      rows: [
        { CARRIER_ID: 'CR-1', NAME: 'Tidewater Freight', MODE_CODE: 'ROAD' },
        { CARRIER_ID: 'CR-2', NAME: 'Gull Air Cargo', MODE_CODE: 'AIR' },
        { CARRIER_ID: 'CR-3', NAME: 'Pier Nine Shipping', MODE_CODE: 'SEA' },
      ],
    }),
    'HARBOR.SHIPMENTS': table('HARBOR', 'SHIPMENTS', {
      columns: [key('SHIPMENT_ID', 'NUMBER(12)'), key('ORDER_ID', 'VARCHAR2(12)'), key('CARRIER_ID', 'VARCHAR2(10)'), key('STATUS', 'VARCHAR2(16)'), col('CREATED_AT', 'DATE'), col('WEIGHT_KG', 'NUMBER(8,2)')],
      pk: ['SHIPMENT_ID'], pkName: 'PK_SHIPMENTS', count: 3200000, distinct: { ORDER_ID: 3000000, CARRIER_ID: 24, STATUS: 5 },
      spread: { CREATED_AT: ['2022-01-01', '2026-11-03'] },
      fks: [{ name: 'FK_SHIPMENTS_CARRIER', column: 'CARRIER_ID', table: 'HARBOR.CARRIERS', ref: 'CARRIER_ID' }],
      indexes: [{ name: 'SHIPMENTS_STATUS_IX', columns: ['STATUS'], include: [], unique: false, created: 0 }],
      rows: [
        { SHIPMENT_ID: 500101, ORDER_ID: 'O-1001', CARRIER_ID: 'CR-1', STATUS: 'DELIVERED', CREATED_AT: '2026-11-02 07:31:00', WEIGHT_KG: 4.2 },
        { SHIPMENT_ID: 500102, ORDER_ID: 'O-1005', CARRIER_ID: 'CR-2', STATUS: 'IN_TRANSIT', CREATED_AT: '2026-11-02 12:11:00', WEIGHT_KG: 1.8 },
        { SHIPMENT_ID: 500103, ORDER_ID: 'O-1004', CARRIER_ID: 'CR-1', STATUS: 'BOOKED', CREATED_AT: '2026-11-02 16:40:00', WEIGHT_KG: 12.5 },
        { SHIPMENT_ID: 500104, ORDER_ID: 'O-1006', CARRIER_ID: 'CR-3', STATUS: 'BOOKED', CREATED_AT: '2026-11-02 19:02:00', WEIGHT_KG: 310.0 },
      ],
    }),
    'HARBOR.INVOICES': table('HARBOR', 'INVOICES', {
      columns: [key('INVOICE_ID', 'VARCHAR2(14)'), key('SHIPMENT_ID', 'NUMBER(12)'), key('AMOUNT', 'NUMBER(12,2)'), key('STATUS', 'VARCHAR2(12)'), col('ISSUED_AT', 'DATE')],
      pk: ['INVOICE_ID'], pkName: 'PK_INVOICES', count: 2900000, distinct: { SHIPMENT_ID: 2900000, STATUS: 3 },
      fks: [{ name: 'FK_INVOICES_SHIPMENT', column: 'SHIPMENT_ID', table: 'HARBOR.SHIPMENTS', ref: 'SHIPMENT_ID' }],
      rows: [
        { INVOICE_ID: 'INV-26-0001', SHIPMENT_ID: 500101, AMOUNT: 12.4, STATUS: 'PAID', ISSUED_AT: '2026-11-02 08:00:00' },
        { INVOICE_ID: 'INV-26-0002', SHIPMENT_ID: 500102, AMOUNT: 31.0, STATUS: 'OPEN', ISSUED_AT: '2026-11-02 13:00:00' },
      ],
    }),
  }
}

// the session of the query window: SSMS or SQL Developer on the desk of the DBA
const consoleSession = (id, serial, vendor, now = 0) => ({
  id, serial, ...(vendor === SQLSERVER ? { login: 'HARBOR\\dba', host: 'HARBOR-DBA-PC', program: 'Microsoft SQL Server Management Studio - Query', isolation: 'read committed' } : { login: 'HARBOR_DBA', host: 'HARBOR-DBA-PC', program: 'SQL Developer', isolation: 'READ COMMITTED' }),
  app: null, env: null, config: null, kind: 'console', status: 'sleeping', openTran: 0, tranStarted: null, undo: [], loginTime: now, lastBatch: now, sql: '', wait: null, blockedBy: null, hold: null, pending: null, reads: 0, cpu: 0,
})
// Passwords here are made-up lab values for the made-up apps of the lab
export function newSqlServer(name = 'harbor-sql', extra = {}) {
  return {
    name, vendor: SQLSERVER, version: 'Microsoft SQL Server 2022 (RTM-CU16) 16.0.4165.4 Developer Edition (64-bit)', host: 'sql.harbor.lab', port: 1433, database: 'HarborOrders', dbid: 7, up: true,
    rcsi: false, // READ_COMMITTED_SNAPSHOT of HarborOrders
    logins: [
      { name: 'sa', type: 'SQL login', password: 'lab-sa-disabled', disabled: true, defaultDb: 'master', policy: true, failed: 0 },
      { name: 'HARBOR\\dba', type: 'Windows login', password: null, disabled: false, defaultDb: 'HarborOrders', policy: false, failed: 0, sysadmin: true },
      { name: 'mule_orders', type: 'SQL login', password: 'Orders-Lab-2026', disabled: false, defaultDb: 'HarborOrders', policy: true, failed: 0 },
      { name: 'mule_reports', type: 'SQL login', password: 'Reports-Lab-2026', disabled: false, defaultDb: 'HarborOrders', policy: true, failed: 0 },
      { name: 'mule_etl', type: 'SQL login', password: 'Etl-Lab-2026', disabled: false, defaultDb: 'HarborOrders', policy: true, failed: 0 },
    ],
    users: [
      { name: 'dbo', login: 'HARBOR\\dba', schema: 'dbo', roles: ['db_owner'] },
      { name: 'mule_orders', login: 'mule_orders', schema: 'dbo', roles: ['db_datareader', 'db_datawriter'] },
      { name: 'mule_reports', login: 'mule_reports', schema: 'dbo', roles: ['db_datareader'] },
      { name: 'mule_etl', login: 'mule_etl', schema: 'dbo', roles: ['db_datareader', 'db_datawriter', 'db_ddladmin'] },
    ],
    tables: sqlTables(),
    sessions: [consoleSession(51, null, SQLSERVER)], locks: [], pools: {}, deadlocks: [], kills: [], plans: [], errorlog: [],
    nextSpid: 52, console: 51,
    ...extra,
  }
}
export function newOracle(name = 'harbor-ora', extra = {}) {
  return {
    name, vendor: ORACLE, version: 'Oracle Database 19c Enterprise Edition Release 19.0.0.0.0, Version 19.24.0.0.0', host: 'ora.harbor.lab', port: 1521, service: 'HARBORPDB', database: 'HARBORPDB', up: true,
    undoRetention: 900, // seconds, the default of UNDO_RETENTION
    logins: [
      { name: 'HARBOR', type: 'Schema owner', password: 'Harbor-Lab-2026', status: 'OPEN', profile: 'DEFAULT', failed: 0 },
      { name: 'HARBOR_DBA', type: 'DBA', password: null, status: 'OPEN', profile: 'DEFAULT', failed: 0, sysadmin: true },
      { name: 'MULE_SHIP', type: 'App user', password: 'Ship-Lab-2026', status: 'OPEN', profile: 'APP_USERS', failed: 0 },
      { name: 'MULE_REPORT', type: 'App user', password: 'Report-Lab-2026', status: 'OPEN', profile: 'APP_USERS', failed: 0 },
    ],
    users: [
      { name: 'HARBOR', login: 'HARBOR', schema: 'HARBOR', roles: ['RESOURCE', 'CONNECT'] },
      { name: 'HARBOR_DBA', login: 'HARBOR_DBA', schema: 'HARBOR', roles: ['DBA'] },
      { name: 'MULE_SHIP', login: 'MULE_SHIP', schema: 'HARBOR', roles: ['HARBOR_RW'] },
      { name: 'MULE_REPORT', login: 'MULE_REPORT', schema: 'HARBOR', roles: ['HARBOR_RO'] },
    ],
    tables: oracleTables(),
    sessions: [consoleSession(17, 4711, ORACLE)], locks: [], pools: {}, deadlocks: [], kills: [], plans: [], errorlog: [],
    nextSpid: 23, console: 17,
    ...extra,
  }
}

// The schema, the rows, the logins and the users are the same seed on every console, so a lean server leaves them out
// of the saved state until a statement or an app first touches the server (ensureSeed). Reads go through tablesOf,
// loginsOf and usersOf, which fall back to the seed.
const SEED_KEYS = ['tables', 'logins', 'users']
const seedOf = (vendor) => (vendor === ORACLE ? newOracle() : newSqlServer())
const SEEDS = {}
const seedRead = (srv, key) => srv[key] ?? (SEEDS[srv.vendor] ??= seedOf(srv.vendor))[key]
export const tablesOf = (srv) => seedRead(srv, 'tables')
export const loginsOf = (srv) => seedRead(srv, 'logins')
export const usersOf = (srv) => seedRead(srv, 'users')
export function ensureSeed(srv) {
  if (srv && SEED_KEYS.some((k) => !srv[k])) {
    const seed = seedOf(srv.vendor)
    for (const k of SEED_KEYS) srv[k] ??= seed[k]
  }
  return srv
}
const lean = (srv) => Object.fromEntries(Object.entries(srv).filter(([k]) => !SEED_KEYS.includes(k)))
// `full` keeps the seed in the state, for a lab that changes a table before it starts
export const defaultDatabases = (now = 0, { full = false } = {}) => ({ created: now, servers: { 'harbor-sql': full ? newSqlServer() : lean(newSqlServer()), 'harbor-ora': full ? newOracle() : lean(newOracle()) } })

// A console saved while this module was a placeholder has state.databases without servers. The tick, ctx.db and the
// console actions write the default servers into their draft.
export function upgradeDatabases(s) {
  if (s?.databases && !s.databases.servers) s.databases.servers = defaultDatabases(s.databases.created ?? s.clock ?? 0).servers
  return s
}
export const serverOf = (s, name) => s?.databases?.servers?.[name] ?? null
export const serverNames = (s) => Object.keys(s?.databases?.servers ?? {})
const isSql = (srv) => srv.vendor === SQLSERVER

// ---------- errors ----------

const fail = (errorType, text, extra = {}) => ({ ok: false, errorType, text, ...extra })
const sqlEx = (text) => `com.microsoft.sqlserver.jdbc.SQLServerException: ${text}`
const oraEx = (text) => `java.sql.SQLException: ${text}`
const ERR = {
  down: (srv) =>
    isSql(srv)
      ? fail('DB:CONNECTIVITY', sqlEx(`The TCP/IP connection to the host ${srv.host}, port ${srv.port} has failed. Error: "Connection refused. Verify the connection properties."`), { code: 0 })
      : fail('DB:CONNECTIVITY', oraEx(`IO Error: The Network Adapter could not establish the connection (CONNECTION_ID=${hash(srv.host, 16)})`), { code: 17002 }),
  login: (srv, user) =>
    isSql(srv)
      ? fail('DB:CONNECTIVITY', sqlEx(`Login failed for user '${user}'. ClientConnectionId:${hash(user, 8)}-${hash(user + 1, 4)}-4c1e-9a2b-${hash(user + 2, 12)}`), { code: 18456 })
      : fail('DB:CONNECTIVITY', oraEx('ORA-01017: invalid username/password; logon denied'), { code: 1017 }),
  locked: (srv, user) => (isSql(srv) ? fail('DB:CONNECTIVITY', sqlEx(`Login failed for user '${user}'. Reason: The account is disabled.`), { code: 18470 }) : fail('DB:CONNECTIVITY', oraEx('ORA-28000: The account is locked.'), { code: 28000 })),
  service: (srv, name) => fail('DB:CONNECTIVITY', oraEx(`Listener refused the connection with the following error:\nORA-12514, TNS:listener does not currently know of service requested in connect descriptor (CONNECTION_ID=${hash(name, 16)})`), { code: 12514 }),
  database: (srv, name, user) => fail('DB:CONNECTIVITY', sqlEx(`Cannot open database "${name}" requested by the login. The login failed. ClientConnectionId:${hash(user, 8)}`), { code: 4060 }),
  pool: () => fail('DB:CONNECTIVITY', 'Could not obtain connection from data source. Caused by: java.sql.SQLException: An attempt by a client to checkout a Connection has timed out.', { code: 0, pool: true }),
  timeout: (srv) => (isSql(srv) ? fail('DB:QUERY_EXECUTION', sqlEx('The query has timed out.'), { code: 0, timedOut: true }) : fail('DB:QUERY_EXECUTION', oraEx('ORA-01013: user requested cancel of current operation'), { code: 1013, timedOut: true })),
  deadlock: (srv, spid) =>
    isSql(srv)
      ? fail('DB:QUERY_EXECUTION', sqlEx(`Transaction (Process ID ${spid}) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.`), { code: 1205, deadlock: true })
      : fail('DB:QUERY_EXECUTION', oraEx('ORA-00060: deadlock detected while waiting for resource'), { code: 60, deadlock: true }),
  killed: (srv) => (isSql(srv) ? fail('DB:CONNECTIVITY', sqlEx('A severe error occurred on the current command.  The results, if any, should be discarded.'), { code: 0 }) : fail('DB:CONNECTIVITY', oraEx('ORA-00028: your session has been killed'), { code: 28 })),
  snapshot: () => fail('DB:QUERY_EXECUTION', oraEx('ORA-01555: snapshot too old: rollback segment number 12 with name "_SYSSMU12_1849275342$" too small'), { code: 1555 }),
  // a host or port in the Mule config that is not the server's: no TCP connection
  unreachable: (srv, host, port, refused) =>
    isSql(srv)
      ? fail('DB:CONNECTIVITY', sqlEx(`The TCP/IP connection to the host ${host}, port ${port} has failed. Error: "${refused ? 'Connection refused: connect' : host}. Verify the connection properties. Make sure that an instance of SQL Server is running on the host and accepting TCP/IP connections at the port. Make sure that TCP connections to the port are not blocked by a firewall.".`), { code: 0 })
      : fail('DB:CONNECTIVITY', oraEx(`IO Error: The Network Adapter could not establish the connection (CONNECTION_ID=${hash(`${host}:${port}`, 16)})`), { code: 17002 }),
  sid: (srv, sid) => fail('DB:CONNECTIVITY', oraEx(`Listener refused the connection with the following error:\nORA-12505, TNS:listener does not currently know of SID given in connect descriptor (CONNECTION_ID=${hash(sid, 16)})`), { code: 12505 }),
  noSession: (srv, user) => fail('DB:CONNECTIVITY', oraEx(`ORA-01045: user ${user} lacks CREATE SESSION privilege; logon denied`), { code: 1045 }),
}

// Messages as the query window shows them, with the code the app sees
function vendorError(srv, kind, a = {}) {
  const sql = isSql(srv)
  const msg = (n, level, state, text) => ({ code: n, text, window: `Msg ${n}, Level ${level}, State ${state}, Line 1\n${text}` })
  const ora = (n, text) => ({ code: n, text: `ORA-${String(n).padStart(5, '0')}: ${text}`, window: `ORA-${String(n).padStart(5, '0')}: ${text}` })
  const map = {
    syntax: () => (sql ? msg(102, 15, 1, `Incorrect syntax near '${a.near}'.`) : ora(a.code ?? 933, { 923: 'FROM keyword not found where expected', 900: 'invalid SQL statement', 901: 'invalid CREATE command', 922: 'missing or invalid option', 990: 'missing or invalid privilege' }[a.code] ?? 'SQL command not properly ended')),
    object: () => (sql ? msg(208, 16, 1, `Invalid object name '${a.name}'.`) : ora(942, 'table or view does not exist')),
    column: () => (sql ? msg(207, 16, 1, `Invalid column name '${a.name}'.`) : ora(904, `"${String(a.name).toUpperCase()}": invalid identifier`)),
    func: () => (sql ? msg(195, 15, 10, `'${a.name}' is not a recognized built-in function name.`) : ora(904, `"${String(a.name).toUpperCase()}": invalid identifier`)),
    bind: () => (sql ? msg(137, 15, 2, `Must declare the scalar variable "${a.name}".`) : ora(1008, 'not all variables bound')),
    pk: () => (sql ? msg(2627, 14, 1, `Violation of PRIMARY KEY constraint '${a.constraint}'. Cannot insert duplicate key in object '${a.table}'. The duplicate key value is (${a.value}).`) : ora(1, `unique constraint (${a.constraint}) violated`)),
    unique: () => (sql ? msg(2601, 14, 1, `Cannot insert duplicate key row in object '${a.table}' with unique index '${a.index}'. The duplicate key value is (${a.value}).`) : ora(1, `unique constraint (${a.constraint}) violated`)),
    fk: () =>
      sql
        ? msg(547, 16, 0, `The ${a.verb} statement conflicted with the ${a.verb === 'DELETE' ? 'REFERENCE' : 'FOREIGN KEY'} constraint "${a.constraint}". The conflict occurred in database "${srv.database}", table "${a.table}", column '${a.column}'.`)
        : ora(a.verb === 'DELETE' ? 2292 : 2291, `integrity constraint (${a.constraint}) violated - ${a.verb === 'DELETE' ? 'child record found' : 'parent key not found'}`),
    notNull: () => (sql ? msg(515, 16, 2, `Cannot insert the value NULL into column '${a.column}', table '${srv.database}.${a.table}'; column does not allow nulls. ${a.verb} fails.`) : ora(1400, `cannot insert NULL into ("${a.table.split('.')[0]}"."${a.table.split('.')[1]}"."${a.column}")`)),
    denied: () => (sql ? msg(229, 14, 5, `The ${a.verb} permission was denied on the object '${a.table.split('.')[1]}', database '${srv.database}', schema '${a.table.split('.')[0]}'.`) : ora(1031, 'insufficient privileges')),
    indexExists: () => (sql ? msg(1913, 16, 1, `The operation failed because an index or statistics with name '${a.name}' already exists on table '${a.table}'.`) : ora(955, 'name is already used by an existing object')),
    indexDup: () => (sql ? msg(1505, 16, 1, `The CREATE UNIQUE INDEX statement terminated because a duplicate key was found for the object name '${a.table}' and the index name '${a.name}'. The duplicate key value is (${a.value}).`) : ora(1452, 'cannot CREATE UNIQUE INDEX; duplicate keys found')),
    indexColumn: () => (sql ? msg(1911, 16, 1, `Column name '${a.name}' does not exist in the target table or view.`) : ora(904, `"${String(a.name).toUpperCase()}": invalid identifier`)),
    lockTimeout: () => (sql ? msg(1222, 16, 51, 'Lock request time out period exceeded.') : ora(30006, 'resource busy; acquire with WAIT timeout expired')),
    isolation: () => (sql ? msg(102, 15, 1, `Incorrect syntax near '${a.near}'.`) : ora(2179, 'valid options: ISOLATION LEVEL { SERIALIZABLE | READ COMMITTED }')),
    noTran: () => (sql ? msg(3902, 16, 1, 'The COMMIT TRANSACTION request has no corresponding BEGIN TRANSACTION.') : null),
    noRollback: () => (sql ? msg(3903, 16, 1, 'The ROLLBACK TRANSACTION request has no corresponding BEGIN TRANSACTION.') : null),
    killMissing: () => (sql ? msg(6106, 16, 2, `Process ID ${a.id} is not an active process ID.`) : ora(30, 'User session ID does not exist.')),
    killSelf: () => (sql ? msg(6104, 16, 1, 'Cannot use KILL to kill your own process.') : ora(27, 'cannot kill current session')),
    killSystem: () => (sql ? msg(6107, 14, 1, 'Only user processes can be killed.') : ora(29, 'session is not a user session')),
    notSupported: () => (sql ? msg(102, 15, 1, `Incorrect syntax near '${a.near}'.`) : ora(900, 'invalid SQL statement')),
  }
  return map[kind]()
}

// ---------- names, values and conditions ----------

const clean = (name) => String(name).replace(/[[\]"]/g, '')
function tableKeyOf(srv, raw, schemaHint) {
  const parts = clean(raw).split('.')
  const name = parts.at(-1)
  const schema = parts.length > 1 ? parts.at(-2) : schemaHint ?? (isSql(srv) ? 'dbo' : 'HARBOR')
  return Object.keys(srv.tables).find((k) => k.toLowerCase() === `${schema}.${name}`.toLowerCase()) ?? null
}
const colOf = (t, name) => t.columns.find((c) => c.name.toLowerCase() === clean(name).split('.').at(-1).toLowerCase())?.name ?? null
// a table made with no primary key (a heap) has no key, so the whole row stands for it
const rowKey = (t, row) => (t.pk.length ? t.pk.map((c) => row[c]).join('|') : JSON.stringify(row))

// splits text on a separator at depth 0 and outside quotes; `sep` is a regex that must match at the cursor
function splitTop(text, sep) {
  const out = []
  let depth = 0
  let quote = false
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") quote = !quote
    if (quote) continue
    if (c === '(') depth++
    if (c === ')') depth--
    if (depth === 0) {
      const m = text.slice(i).match(sep)
      if (m && m.index === 0 && (!/^\^\w/.test(sep.source) || i === 0 || /[\s)]/.test(text[i - 1]))) {
        out.push(text.slice(start, i))
        i += m[0].length - 1
        start = i + 1
      }
    }
  }
  out.push(text.slice(start))
  return out.map((x) => x.trim()).filter((x) => x !== '')
}

const NOW_WORDS = /^(getdate\(\)|sysdatetime\(\)|current_timestamp|sysdate|systimestamp)$/i
// A literal or a parameter. `ctx.params` is an object (:name, @name) or an array (?).
function valueOf(raw, ctx) {
  const v = raw.trim()
  let m
  if ((m = v.match(/^N?'((?:[^']|'')*)'$/s))) return { v: m[1].replace(/''/g, "'") }
  if (/^-?\d+(\.\d+)?$/.test(v)) return { v: Number(v) }
  if (/^null$/i.test(v)) return { v: null }
  if ((m = v.match(/^date\s*'([^']*)'$/i))) return { v: m[1] }
  if ((m = v.match(/^to_date\(\s*'([^']*)'\s*(,\s*'[^']*'\s*)?\)$/i))) return { v: m[1] }
  if ((m = v.match(/^timestamp\s*'([^']*)'$/i))) return { v: m[1] }
  if (NOW_WORDS.test(v)) return { v: sqlTime(ctx.now) }
  if ((m = v.match(/^[:@](\w+)$/))) {
    const p = ctx.params
    if (p && !Array.isArray(p) && m[1] in p) return { v: p[m[1]] }
    return { error: 'bind', name: v }
  }
  if (v === '?') {
    const p = Array.isArray(ctx.params) ? ctx.params : []
    if (ctx.q < p.length) return { v: p[ctx.q++] }
    return { error: 'bind', name: '?' }
  }
  return { error: 'syntax', near: v.split(/\s/)[0] }
}

const FN = /^(convert|cast|year|month|upper|lower|trunc|isnull|coalesce|datediff|to_char|nvl)\s*\((.*)\)$/i
// One condition of a WHERE: { col, fn, op, value, values, sargable }
function atomOf(t, raw, ctx) {
  const text = raw.trim().replace(/^\((.*)\)$/s, '$1').trim()
  let m
  if ((m = text.match(/^([\w.[\]"]+)\s+is\s+(not\s+)?null$/i))) {
    const c = colOf(t, m[1])
    return c ? { col: c, op: m[2] ? 'not null' : 'null', sargable: true } : { error: 'column', name: m[1] }
  }
  if ((m = text.match(/^([\w.[\]"]+)\s+(not\s+)?in\s*\((.*)\)$/is))) {
    const c = colOf(t, m[1])
    if (!c) return { error: 'column', name: m[1] }
    const values = []
    for (const part of splitTop(m[3], /^,/)) {
      const v = valueOf(part, ctx)
      if (v.error) return v
      values.push(v.v)
    }
    return { col: c, op: m[2] ? 'not in' : 'in', values, sargable: !m[2] }
  }
  if ((m = text.match(/^(.+?)\s+(not\s+)?like\s+(.+)$/is))) {
    const c = colOf(t, m[1])
    if (!c) return { error: 'column', name: m[1] }
    const v = valueOf(m[3], ctx)
    if (v.error) return v
    return { col: c, op: m[2] ? 'not like' : 'like', value: v.v, sargable: !m[2] && typeof v.v === 'string' && !/^[%_]/.test(v.v) }
  }
  m = text.match(/^(.+?)\s*(<=|>=|<>|!=|=|<|>)\s*(.+)$/s)
  if (!m) return { error: 'syntax', near: text.split(/\s/)[0] || text }
  const [, left, op, right] = m
  const v = valueOf(right, ctx)
  if (v.error) return v
  const f = left.trim().match(FN)
  if (f) {
    const name = f[1].toLowerCase()
    const args = splitTop(f[2], /^,/)
    // CONVERT(type, col [, style]) and CAST(col AS type)
    let c, type
    if (name === 'convert') [type, c] = [args[0], args[1]]
    else if (name === 'cast') [c, type] = (args[0] ?? '').split(/\s+as\s+/i)
    else if (name === 'datediff') c = args[1]
    else c = args[0]
    const column = c && colOf(t, c.trim())
    if (!column) return { error: 'column', name: (c ?? left).trim() }
    // SQL Server turns CAST(col AS date) into a range seek, so it stays sargable. Other functions on the column do not.
    const dateCast = /^date$/i.test(String(type ?? '').trim()) && (name === 'cast' || name === 'convert')
    return { col: column, fn: name, type: String(type ?? '').trim().toLowerCase(), args, op, value: v.v, sargable: dateCast && ctx.sql, text: left.trim() }
  }
  if (/^\w+\s*\(/.test(left.trim())) return { error: 'func', name: left.trim().split('(')[0] }
  if (/^rownum$/i.test(left.trim())) return { rownum: true, op, value: Number(v.v) }
  const c = colOf(t, left)
  if (!c) return { error: 'column', name: left.trim() }
  return { col: c, op, value: v.v, sargable: true }
}

// the WHERE as OR groups of AND conditions
function whereOf(t, text, ctx) {
  if (!text) return { groups: [] }
  const flat = text.replace(/([\w.[\]"]+)\s+between\s+(.+?)\s+and\s+(.+?)(?=\s+and\s+|\s+or\s+|$)/gis, '$1 >= $2 AND $1 <= $3')
  const groups = []
  for (const g of splitTop(flat, /^or\s/i)) {
    const atoms = []
    for (const a of splitTop(g, /^and\s/i)) {
      const atom = atomOf(t, a, ctx)
      if (atom.error) return { error: atom }
      atoms.push(atom)
    }
    groups.push(atoms)
  }
  return { groups }
}

const fnValue = (a, raw) => {
  if (raw === null || raw === undefined) return null
  const text = String(raw)
  switch (a.fn) {
    case 'convert':
    case 'cast':
      return /date/.test(a.type) || /varchar\(10\)/.test(a.type) ? text.slice(0, 10) : text
    case 'year':
      return Number(text.slice(0, 4))
    case 'month':
      return Number(text.slice(5, 7))
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'trunc':
      return text.slice(0, 10)
    case 'to_char':
      return text.slice(0, 10)
    default:
      return text
  }
}
const cmp = (a, b) => {
  if (a === null || b === null || a === undefined || b === undefined) return null
  const na = Number(a)
  const nb = Number(b)
  if (typeof a === 'number' || typeof b === 'number') return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : String(a).localeCompare(String(b))
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}
const like = (value, pattern) => value !== null && value !== undefined && new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'is').test(String(value))
function atomTrue(a, row) {
  if (a.rownum) return true
  const raw = row[a.col]
  if (a.op === 'null') return raw === null || raw === undefined
  if (a.op === 'not null') return raw !== null && raw !== undefined
  const v = a.fn ? fnValue(a, raw) : raw
  if (a.op === 'in') return a.values.some((x) => cmp(v, x) === 0)
  if (a.op === 'not in') return v !== null && a.values.every((x) => cmp(v, x) !== 0)
  if (a.op === 'like') return like(v, a.value)
  if (a.op === 'not like') return v !== null && !like(v, a.value)
  const c = cmp(v, a.value)
  if (c === null) return false
  return { '=': c === 0, '<>': c !== 0, '!=': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[a.op]
}
const rowMatches = (where, row) => where.groups.length === 0 || where.groups.some((g) => g.every((a) => atomTrue(a, row)))

// ---------- execution plans ----------

const indexesOf = (t) => [...(t.pk.length ? [{ name: t.pkName, columns: t.pk, include: [], unique: true, pk: true, clustered: t.clustered }] : []), ...t.indexes]
function estimate(t, atoms, index) {
  const n = t.count
  const lead = index.columns[0]
  const eq = atoms.find((a) => a.op === '=')
  if (eq) return index.unique && index.columns.length === 1 ? 1 : Math.max(1, Math.round(n / (t.distinct[lead] ?? 100)))
  const inn = atoms.find((a) => a.op === 'in')
  if (inn) return Math.max(1, Math.round((inn.values.length * n) / (t.distinct[lead] ?? 100)))
  const lower = atoms.find((a) => a.op === '>=' || a.op === '>')
  const upper = atoms.find((a) => a.op === '<=' || a.op === '<')
  const spread = t.spread[lead]
  if (lower && upper && spread) {
    const span = (x) => Date.parse(String(x).slice(0, 10)) || Number(x)
    const [lo, hi] = spread.map(span)
    const part = (span(upper.value) - span(lower.value)) / Math.max(1, hi - lo)
    return Math.max(1, Math.round(n * Math.min(1, Math.max(0, part))))
  }
  if (atoms.some((a) => a.op === 'like')) return Math.max(1, Math.round(n * 0.05))
  return Math.max(1, Math.round(n * (lower && upper ? 0.09 : 0.3)))
}
const selectivity = (t, atoms) =>
  atoms.reduce((f, a) => f * (a.rownum ? 1 : a.op === '=' ? 1 / (t.distinct[a.col] ?? (t.pk.includes(a.col) ? t.count : 100)) : a.op === 'in' ? (a.values.length || 1) / (t.distinct[a.col] ?? 100) : a.op === 'null' ? 0.1 : 0.3), 1)

// How the server reads the table for a query. `q` is a parsed SELECT, UPDATE or DELETE.
function planOf(srv, tk, q) {
  const t = srv.tables[tk]
  const n = t.count
  const atoms = q.where.groups.length === 1 ? q.where.groups[0] : []
  const usable = atoms.filter((a) => a.sargable && !a.rownum && ['=', '<', '>', '<=', '>=', 'in', 'like'].includes(a.op))
  let best = null
  for (const ix of indexesOf(t)) {
    const on = usable.filter((a) => a.col === ix.columns[0])
    if (!on.length) continue
    const est = estimate(t, on, ix)
    if (!best || est < best.est) best = { ix, est, on }
  }
  const cols = q.cols?.includes('*') || !q.cols ? t.columns.map((c) => c.name) : q.cols.filter((c) => c !== 'COUNT(*)')
  const allCols = [...new Set([...cols, ...atoms.filter((a) => a.col).map((a) => a.col), ...(q.order ?? []).map((o) => o.col)])]
  const nonSargable = q.where.groups.flat().filter((a) => a.fn && !a.sargable)
  const outRows = Math.max(q.where.groups.length ? 1 : 0, Math.round(n * Math.min(1, selectivity(t, atoms.length ? atoms : []))))
  const clusteredTable = isSql(srv) && t.clustered
  let access
  if (best && (best.est <= n * 0.2 || (best.ix.unique && best.on.some((a) => a.op === '=')))) {
    const covered = best.ix.clustered || allCols.every((c) => best.ix.columns.includes(c) || best.ix.include.includes(c) || (clusteredTable && t.pk.includes(c)))
    const rows = Math.min(best.est, Math.max(outRows, 1))
    access = { kind: 'seek', index: best.ix.name, clustered: Boolean(best.ix.clustered), unique: best.ix.unique && best.on.some((a) => a.op === '='), lookup: !covered, est: best.est, rowsRead: best.est, seekCol: best.ix.columns[0], seek: best.on, out: rows, ms: 1 + best.est * (covered ? 0.002 : LOOKUP_MS) }
  } else {
    access = { kind: 'scan', index: clusteredTable ? t.pkName : null, est: outRows, rowsRead: n, out: outRows, ms: n * SCAN_MS_PER_ROW }
  }
  // a sargable condition on a column that leads no index: SQL Server shows a Missing Index hint on a scan
  let missing = null
  if (access.kind === 'scan') {
    const want = usable.filter((a) => !indexesOf(t).some((ix) => ix.columns[0] === a.col))
    if (want.length) {
      const eqs = [...new Set(want.filter((a) => a.op === '=' || a.op === 'in').map((a) => a.col))]
      const ranges = [...new Set(want.filter((a) => a.op !== '=' && a.op !== 'in').map((a) => a.col))].filter((c) => !eqs.includes(c))
      const keys = [...eqs, ...ranges.slice(0, 1)]
      const include = allCols.filter((c) => !keys.includes(c) && !(clusteredTable && t.pk.includes(c)))
      missing = { table: tk, columns: keys, include, impact: Math.min(99.9, Math.round((1 - Math.min(1, (estimate(t, want.filter((a) => a.col === keys[0]), { columns: keys, unique: false }) * LOOKUP_MS + 1) / Math.max(1, access.ms))) * 1000) / 10) }
    }
  }
  const sortNeeded = Boolean(q.order?.length) && !(access.kind === 'seek' && q.order.length === 1 && q.order[0].col === access.seekCol) && !(clusteredTable && access.kind === 'scan' && q.order.length === 1 && q.order[0].col === t.pk[0])
  const sortMs = sortNeeded ? (access.out * Math.log2(Math.max(2, access.out))) / 20000 : 0
  const fetchMs = !isSql(srv) && q.fetchSize ? (Math.min(access.out, q.limit ?? Infinity) / q.fetchSize) * 0.4 : 0
  const ms = Math.round(access.ms + sortMs + fetchMs)
  return {
    vendor: srv.vendor, table: tk, access, missing, nonSargable: nonSargable.map((a) => a.text), sort: sortNeeded, top: q.top ?? null, offset: q.offset ?? null, fetch: q.fetch ?? null, rownum: q.rownumLimit ?? null, count: Boolean(q.count),
    est: access.out, ms, kind: q.kind ?? 'select', predicate: q.whereText ?? '', ops: opsOf(srv, tk, q, access, sortNeeded, missing),
  }
}

// the operators of the plan, root first, the way SSMS and DBMS_XPLAN list them
function opsOf(srv, tk, q, access, sortNeeded, missing) {
  const t = srv.tables[tk]
  const ops = []
  const add = (op, extra) => ops.push({ op, ...extra })
  const where = q.whereText ? q.whereText : ''
  if (isSql(srv)) {
    add(q.kind === 'update' ? 'UPDATE' : q.kind === 'delete' ? 'DELETE' : 'SELECT', { rows: access.out })
    if (q.count) add('Stream Aggregate', { rows: 1, note: 'Aggregate' })
    if (q.top !== null && q.top !== undefined) add('Top', { rows: Math.min(q.top, access.out) })
    if (q.fetch !== null && q.fetch !== undefined) add('Top', { rows: Math.min(q.fetch, access.out), note: 'OFFSET FETCH' })
    if (sortNeeded) add('Sort', { rows: access.out, note: `ORDER BY ${q.order.map((o) => `${o.col} ${o.dir}`).join(', ')}` })
    if (access.kind === 'seek' && access.lookup) {
      add('Nested Loops', { rows: access.out, note: 'Inner Join' })
      add('Index Seek', { object: `[${t.schema}].[${t.name}].[${access.index}]`, rows: access.est, read: access.rowsRead, seek: access.seek.map((a) => `${a.col} ${a.op} ${fmt(a.value ?? a.values)}`).join(' AND ') })
      add('Key Lookup', { object: `[${t.schema}].[${t.name}].[${t.pkName}]`, rows: 1, execs: access.est, note: 'Clustered' })
    } else if (access.kind === 'seek') {
      add(access.clustered ? 'Clustered Index Seek' : 'Index Seek', { object: `[${t.schema}].[${t.name}].[${access.index}]`, rows: access.est, read: access.rowsRead, seek: access.seek.map((a) => `${a.col} ${a.op} ${fmt(a.value ?? a.values)}`).join(' AND ') })
    } else {
      add(t.clustered ? 'Clustered Index Scan' : 'Table Scan', { object: t.clustered ? `[${t.schema}].[${t.name}].[${t.pkName}]` : `[${t.schema}].[${t.name}]`, rows: access.out, read: access.rowsRead, predicate: where, warn: Boolean(missing) })
    }
  } else {
    add(q.kind === 'update' ? 'UPDATE STATEMENT' : q.kind === 'delete' ? 'DELETE STATEMENT' : 'SELECT STATEMENT', { rows: access.out })
    if (q.kind === 'update' || q.kind === 'delete') add(q.kind.toUpperCase(), { object: t.name })
    if (q.count) add('SORT AGGREGATE', { rows: 1 })
    if (q.rownumLimit) add('COUNT STOPKEY', { rows: Math.min(q.rownumLimit, access.out), predicate: `ROWNUM<=${q.rownumLimit}` })
    if (q.fetch !== null && q.fetch !== undefined) add('VIEW', { rows: Math.min(q.fetch, access.out), predicate: `"from$_subquery$_002"."rowlimit_$$_rownumber"<=${(q.offset ?? 0) + q.fetch}` })
    if (sortNeeded) add(q.fetch !== null && q.fetch !== undefined ? 'WINDOW SORT PUSHED RANK' : 'SORT ORDER BY', { rows: access.out })
    if (access.kind === 'seek') {
      add('TABLE ACCESS BY INDEX ROWID' + (access.unique ? '' : ' BATCHED'), { object: t.name, rows: access.est })
      add(access.unique ? 'INDEX UNIQUE SCAN' : 'INDEX RANGE SCAN', { object: access.index, rows: access.est, access: access.seek.map((a) => `"${a.col}"${a.op}${fmt(a.value ?? a.values)}`).join(' AND ') })
    } else add('TABLE ACCESS FULL', { object: t.name, rows: access.out, predicate: where })
  }
  return ops
}
const fmt = (v) => (Array.isArray(v) ? `(${v.map(fmt).join(',')})` : typeof v === 'number' ? String(v) : v === null || v === undefined ? 'NULL' : `'${v}'`)

// ---------- statements ----------

const norm = (sql) => String(sql ?? '').replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().replace(/;$/, '').trim()
const ISOLATIONS = { 'read uncommitted': 'read uncommitted', 'read committed': 'read committed', 'repeatable read': 'repeatable read', snapshot: 'snapshot', serializable: 'serializable' }

// Reads one statement into a plain object. The lab reads a safe subset with patterns, not a full grammar.
export function parseSql(text, vendor = SQLSERVER) {
  const sql = norm(text)
  const head = (sql.match(/^\w+/) ?? [''])[0].toLowerCase()
  let m
  if (!sql) return { kind: 'empty' }
  if (head === 'select') {
    if (/\bjoin\b/i.test(sql)) return { kind: 'unsupported', near: 'JOIN' }
    if (/\bgroup by\b/i.test(sql)) return { kind: 'unsupported', near: 'GROUP' }
    if (/\bunion\b/i.test(sql)) return { kind: 'unsupported', near: 'UNION' }
    if ((m = sql.match(/^select \* from table\s*\(\s*dbms_xplan\.display(?:_cursor)?\s*(\(.*\))?\s*\)$/i))) return { kind: 'xplan' }
    m = sql.match(
      /^select\s+(distinct\s+)?(?:top\s*\(?\s*(\d+)\s*\)?\s+)?(.+?)\s+from\s+([\w.[\]"$]+)(?:\s+(?:as\s+)?(?!where\b|order\b|offset\b|fetch\b|with\b)(\w+))?(\s+with\s*\(\s*nolock\s*\))?(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+(.+?))?(?:\s+offset\s+(\S+)\s+rows?(?:\s+fetch\s+(?:next|first)\s+(\S+)\s+rows?\s+only)?)?(?:\s+fetch\s+first\s+(\S+)\s+rows?\s+only)?$/i,
    )
    if (!m) return { kind: 'error', near: vendor === ORACLE ? null : (sql.match(/\bfrom\b/i) ? 'FROM' : sql.split(' ')[1] ?? 'SELECT'), oraCode: /\bfrom\b/i.test(sql) ? 933 : 923 }
    const [, distinct, top, cols, from, , nolock, where, order, offset, fetch, first] = m
    return { kind: 'select', distinct: Boolean(distinct), top: top ? Number(top) : null, colsText: cols, from, nolock: Boolean(nolock), whereText: where ?? '', orderText: order ?? '', offsetText: offset ?? null, fetchText: fetch ?? first ?? null }
  }
  if (head === 'insert') {
    m = sql.match(/^insert into ([\w.[\]"]+)\s*(?:\(([^)]*)\))?\s*values\s*(.+)$/i)
    if (!m) return { kind: 'error', near: 'INSERT', oraCode: 933 }
    return { kind: 'insert', from: m[1], colsText: m[2] ?? null, valuesText: m[3] }
  }
  if (head === 'update') {
    m = sql.match(/^update ([\w.[\]"]+)(?:\s+\w+)?\s+set\s+(.+?)(?:\s+where\s+(.+))?$/i)
    if (!m) return { kind: 'error', near: 'UPDATE', oraCode: 971 }
    return { kind: 'update', from: m[1], setText: m[2], whereText: m[3] ?? '' }
  }
  if (head === 'delete') {
    m = sql.match(/^delete (?:from )?([\w.[\]"]+)(?:\s+where\s+(.+))?$/i)
    if (!m) return { kind: 'error', near: 'DELETE', oraCode: 933 }
    return { kind: 'delete', from: m[1], whereText: m[2] ?? '' }
  }
  if (/^(begin (tran|transaction)\b|begin$)/i.test(sql)) return vendor === ORACLE ? { kind: 'error', near: 'BEGIN', oraCode: 900 } : { kind: 'begin' }
  if (/^commit( (tran|transaction|work))?( \w+)?$/i.test(sql)) return { kind: 'commit' }
  if (/^rollback( (tran|transaction|work))?( \w+)?$/i.test(sql)) return { kind: 'rollback' }
  if ((m = sql.match(/^set transaction isolation level (.+)$/i))) {
    const level = m[1].toLowerCase()
    if (vendor === ORACLE) return ['read committed', 'serializable'].includes(level) ? { kind: 'isolation', level: level.toUpperCase() } : { kind: 'badIsolation', near: m[1] }
    return ISOLATIONS[level] ? { kind: 'isolation', level: ISOLATIONS[level] } : { kind: 'badIsolation', near: m[1].split(' ')[0] }
  }
  if ((m = sql.match(/^create (unique )?(?:(clustered|nonclustered) )?index ([\w[\]"]+) on ([\w.[\]"]+)\s*\(([^)]*)\)(?:\s*include\s*\(([^)]*)\))?(.*)$/i)))
    return { kind: 'createIndex', unique: Boolean(m[1]), clustered: /^clustered$/i.test(m[2] ?? ''), name: clean(m[3]), from: m[4], colsText: m[5], includeText: m[6] ?? '', online: /online\s*=\s*on|\bonline\b/i.test(m[7] ?? '') }
  if ((m = sql.match(/^kill (\d+)$/i))) return vendor === ORACLE ? { kind: 'error', near: 'KILL', oraCode: 900 } : { kind: 'kill', id: Number(m[1]) }
  if ((m = sql.match(/^alter system (?:kill|disconnect) session '(\d+),\s*(\d+)(?:,@\d+)?'(?: (immediate|post_transaction))?$/i))) return vendor === ORACLE ? { kind: 'kill', id: Number(m[1]), serial: Number(m[2]) } : { kind: 'error', near: 'system' }
  if ((m = sql.match(/^explain plan (?:set statement_id\s*=\s*'[^']*' )?for (.+)$/i))) return vendor === ORACLE ? { kind: 'explain', inner: m[1] } : { kind: 'error', near: 'plan' }
  if (/^(exec(ute)? )?sp_who2?$/i.test(sql)) return vendor === ORACLE ? { kind: 'error', near: 'sp_who2', oraCode: 900 } : { kind: 'spwho' }
  if ((m = sql.match(/^alter (login|user) ([\w\\[\]"]+) (enable|disable|account unlock|account lock)$/i))) return { kind: 'alterLogin', name: clean(m[2]), action: m[3].toLowerCase() }
  if ((m = sql.match(/^alter database (\w+) set read_committed_snapshot (on|off)(?: with rollback immediate)?$/i))) return vendor === ORACLE ? { kind: 'error', near: 'database', oraCode: 2231 } : { kind: 'rcsi', on: m[2].toLowerCase() === 'on' }
  // logins, users, grants and new tables: what a DBA runs to set up an integration
  const ora = vendor === ORACLE
  const oraName = (x) => (/^".*"$/.test(x) ? x.slice(1, -1) : x.toUpperCase())
  const quoted = (x) => x.replace(/^N?'((?:[^']|'')*)'$/s, '$1').replace(/''/g, "'")
  if ((m = sql.match(/^create login ([\w\\[\]"]+) with password\s*=\s*(N?'(?:[^']|'')*')(.*)$/i))) return ora ? { kind: 'error', near: 'LOGIN', oraCode: 901 } : { kind: 'createLogin', name: clean(m[1]), password: quoted(m[2]), opts: m[3] }
  if (!ora && (m = sql.match(/^create user ([\w\\[\]"]+)(?: (?:for|from) login ([\w\\[\]"]+))?(?: with default_schema\s*=\s*([\w[\]]+))?$/i))) return { kind: 'createUser', name: clean(m[1]), login: clean(m[2] ?? m[1]), schema: clean(m[3] ?? 'dbo') }
  if (ora && /^create user /i.test(sql)) {
    m = sql.match(/^create user ("[^"]+"|[\w$#]+) identified by ("[^"]*"|[\w$#]+)(.*)$/i)
    if (!m) return { kind: 'error', near: 'USER', oraCode: 922 }
    return { kind: 'createUser', name: oraName(m[1]), password: m[2].replace(/^"|"$/g, ''), opts: m[3] }
  }
  if (!ora && (m = sql.match(/^alter login ([\w\\[\]"]+) with password\s*=\s*(N?'(?:[^']|'')*')(.*)$/i))) return { kind: 'setPassword', name: clean(m[1]), password: quoted(m[2]) }
  if (ora && (m = sql.match(/^alter user ("[^"]+"|[\w$#]+) identified by ("[^"]*"|[\w$#]+)$/i))) return { kind: 'setPassword', name: oraName(m[1]), password: m[2].replace(/^"|"$/g, '') }
  if ((m = sql.match(/^(grant|revoke) (.+?) on (?:object::)?([\w.[\]"]+) (?:to|from) ([\w\\[\]"]+)(?: with grant option)?$/i))) return { kind: 'grantObject', revoke: /^revoke$/i.test(m[1]), privs: m[2], from: m[3], grantee: ora ? oraName(m[4]) : clean(m[4]) }
  if ((m = sql.match(/^(grant|revoke) (.+?) (?:to|from) ([\w\\[\]"]+)(?: with (?:admin|grant) option)?$/i))) return { kind: 'grantSystem', revoke: /^revoke$/i.test(m[1]), privs: m[2], grantee: ora ? oraName(m[3]) : clean(m[3]) }
  if (!ora && (m = sql.match(/^alter role ([\w[\]]+) (add|drop) member ([\w\\[\]"]+)$/i))) return { kind: 'roleMember', role: clean(m[1]), drop: /^drop$/i.test(m[2]), name: clean(m[3]) }
  if (!ora && (m = sql.match(/^(?:exec(?:ute)? )?sp_(add|drop)rolemember\s+N?'([\w\\]+)'\s*,\s*N?'([\w\\]+)'$/i))) return { kind: 'roleMember', role: m[2], drop: /^drop$/i.test(m[1]), name: m[3] }
  if ((m = sql.match(/^create table ([\w.[\]"]+)\s*\((.*)\)$/is))) return { kind: 'createTable', from: m[1], body: m[2] }
  if (/^(create|drop|alter|truncate|merge|exec|execute|declare|with|grant|revoke)\b/i.test(sql)) return { kind: 'unsupported', near: sql.split(' ').slice(0, head === 'create' || head === 'drop' || head === 'alter' ? 2 : 1).join(' ') }
  return { kind: 'error', near: sql.split(' ')[0], oraCode: 900 }
}

// ---------- sessions and locks ----------

function newSession(srv, now, fields) {
  if (srv.sessions.length >= MAX_SESSIONS) {
    // lab-made: the oldest idle connection goes, so a saved console stays small
    const old = srv.sessions.find((x) => x.kind === 'app' && !x.inUse && !x.openTran)
    if (old) {
      srv.sessions = srv.sessions.filter((x) => x !== old)
      for (const p of Object.values(srv.pools)) p.sessions = p.sessions.filter((id) => id !== old.id)
    }
  }
  const id = srv.nextSpid++
  const sess = {
    id, serial: isSql(srv) ? null : (id * 7919 + 31) % 60000 + 1000, login: '', host: '', program: '', app: null, env: null, config: null, kind: 'app',
    status: 'sleeping', isolation: isSql(srv) ? 'read committed' : 'READ COMMITTED', openTran: 0, tranStarted: null, undo: [], loginTime: now, lastBatch: now, sql: '', wait: null, blockedBy: null, hold: null, pending: null, reads: 0, cpu: 0, ...fields,
  }
  srv.sessions.push(sess)
  return sess
}
const sessionOf = (srv, id) => srv.sessions.find((x) => x.id === id)
const CONFLICT = { S: ['X', 'U'], U: ['X', 'U'], X: ['X', 'U', 'S'] }
const holderOf = (srv, sess, tk, k, mode) => srv.locks.find((l) => l.s !== sess.id && l.t === tk && l.k === k && CONFLICT[mode].includes(l.m))
function lock(srv, sess, tk, k, mode) {
  const have = srv.locks.find((l) => l.s === sess.id && l.t === tk && l.k === k)
  if (have) {
    if (mode === 'X') have.m = 'X'
    return
  }
  srv.locks.push({ s: sess.id, t: tk, k, m: mode })
}
const release = (srv, sess) => void (srv.locks = srv.locks.filter((l) => l.s !== sess.id))

function rollback(srv, sess) {
  for (const u of [...sess.undo].reverse()) {
    const t = srv.tables[u.t]
    if (!t) continue
    if (u.op === 'insert') {
      t.rows = t.rows.filter((r) => rowKey(t, r) !== u.k)
      t.count = Math.max(0, t.count - 1)
    } else if (u.op === 'update') t.rows = t.rows.map((r) => (rowKey(t, r) === u.k ? u.before : r))
    else if (u.op === 'delete') {
      t.rows.push(u.before)
      t.count++
    }
  }
  endTran(srv, sess)
}
function commit(srv, sess) {
  endTran(srv, sess)
}
function endTran(srv, sess) {
  sess.undo = []
  sess.openTran = 0
  sess.tranStarted = null
  sess.hold = null
  release(srv, sess)
}

// A row that another open transaction changed: its committed version from that transaction's undo, for a reader that
// reads versions (Oracle, SNAPSHOT, READ_COMMITTED_SNAPSHOT). undefined means the row did not exist before.
function committedRows(srv, sess, tk) {
  const t = srv.tables[tk]
  const others = srv.sessions.filter((x) => x.id !== sess.id && x.undo.length)
  const before = new Map()
  for (const o of others) for (const u of o.undo) if (u.t === tk && !before.has(u.k)) before.set(u.k, u.op === 'insert' ? undefined : u.before)
  const rows = t.rows.filter((r) => !before.has(rowKey(t, r)) || before.get(rowKey(t, r)) !== undefined).map((r) => (before.has(rowKey(t, r)) ? before.get(rowKey(t, r)) : r))
  for (const [k, row] of before) if (row && !t.rows.some((r) => rowKey(t, r) === k)) rows.push(row)
  return rows
}
const readsVersions = (srv, sess, nolock) => !isSql(srv) || sess.isolation === 'snapshot' || (srv.rcsi && sess.isolation === 'read committed' && !nolock)
const takesReadLocks = (srv, sess, nolock) => isSql(srv) && !nolock && sess.isolation !== 'read uncommitted' && !readsVersions(srv, sess, nolock)

// the rows a plan touches: a seek reads the rows of its seek predicate, a scan reads them all
const touched = (t, rows, plan) => (plan.access.kind === 'seek' ? rows.filter((r) => plan.access.seek.every((a) => atomTrue(a, r))) : rows)

const waitResource = (srv, tk, k) => {
  const t = tablesOf(srv)[tk]
  if (!isSql(srv)) return `TX-000${(hash(k, 3) + '').toUpperCase()}000E-0000${hash(tk + k, 4).toUpperCase()}`
  return `KEY: ${srv.dbid}:7205759404${String(Object.keys(tablesOf(srv)).indexOf(tk) + 1).padStart(2, '0')}57792 (${hash(`${t.name}${k}`)})`
}
const waitType = (srv, mode) => (isSql(srv) ? `LCK_M_${mode}` : 'enq: TX - row lock contention')

// ---------- running a statement ----------

const parseCols = (t, text) => {
  if (text.trim() === '*') return { cols: ['*'] }
  const cols = []
  const names = []
  for (const part of splitTop(text, /^,/)) {
    const m = part.match(/^(.+?)(?:\s+as\s+([\w"[\]]+)|\s+([\w"[\]]+))?$/i)
    const expr = m[1].trim()
    const alias = clean(m[2] ?? m[3] ?? '')
    if (/^count\s*\(\s*(\*|1)\s*\)$/i.test(expr)) {
      cols.push('COUNT(*)')
      names.push(alias)
      continue
    }
    if (/^\w+\s*\(/.test(expr)) return { error: { error: 'func', name: expr.split('(')[0] } }
    const c = colOf(t, expr)
    if (!c) return { error: { error: 'column', name: expr } }
    cols.push(c)
    names.push(alias || c)
  }
  return { cols, names }
}
const parseOrder = (t, text) => {
  const out = []
  for (const part of splitTop(text, /^,/)) {
    const [c, dir] = part.split(/\s+/)
    const name = colOf(t, c)
    if (!name) return { error: { error: 'column', name: c } }
    out.push({ col: name, dir: /^desc$/i.test(dir ?? '') ? 'DESC' : 'ASC' })
  }
  return { order: out }
}

// virtual tables: the views a DBA reads in the query window
function virtualRows(srv, name, now) {
  const n = name.toLowerCase().replace(/[[\]"]/g, '')
  const blocked = (x) => x.blockedBy ?? 0
  if (isSql(srv)) {
    if (/sys\.dm_exec_sessions$/.test(n))
      return srv.sessions.map((x) => ({ session_id: x.id, login_time: sqlTime(x.loginTime), host_name: x.host, program_name: x.program, login_name: x.login, status: x.status, last_request_start_time: sqlTime(x.lastBatch), open_transaction_count: x.openTran, transaction_isolation_level: { 'read uncommitted': 1, 'read committed': 2, 'repeatable read': 3, serializable: 4, snapshot: 5 }[x.isolation], is_user_process: 1, database_id: srv.dbid }))
    if (/sys\.dm_exec_requests$/.test(n))
      return srv.sessions.filter((x) => x.status === 'running' || x.status === 'suspended').map((x) => ({ session_id: x.id, status: x.status, command: x.pending ? x.pending.kind.toUpperCase() : 'SELECT', blocking_session_id: blocked(x), wait_type: x.wait?.type ?? null, wait_time: x.wait ? now - x.wait.since : 0, wait_resource: x.wait?.resource ?? '', open_transaction_count: x.openTran, database_id: srv.dbid }))
    if (/sys\.dm_tran_locks$/.test(n))
      return srv.locks.map((l) => ({ request_session_id: l.s, resource_type: 'KEY', resource_database_id: srv.dbid, resource_description: `(${hash(`${srv.tables[l.t]?.name}${l.k}`)})`, request_mode: l.m, request_status: 'GRANT', object: l.t, key_value: l.k })).concat(srv.sessions.filter((x) => x.wait).map((x) => ({ request_session_id: x.id, resource_type: 'KEY', resource_database_id: srv.dbid, resource_description: x.wait.resource.replace(/^KEY: \S+ /, ''), request_mode: x.wait.mode, request_status: 'WAIT', object: x.wait.t, key_value: x.wait.k })))
    return null
  }
  if (/v\$session$/.test(n))
    return srv.sessions.map((x) => ({ SID: x.id, 'SERIAL#': x.serial, USERNAME: x.login, STATUS: x.status === 'killed' ? 'KILLED' : x.status === 'suspended' || x.status === 'running' ? 'ACTIVE' : 'INACTIVE', MACHINE: x.host, PROGRAM: x.program, EVENT: x.wait ? x.wait.type : 'SQL*Net message from client', WAIT_CLASS: x.wait ? 'Application' : 'Idle', SECONDS_IN_WAIT: Math.round((now - (x.wait?.since ?? x.lastBatch)) / 1000), BLOCKING_SESSION: x.blockedBy ?? null, BLOCKING_SESSION_STATUS: x.blockedBy ? 'VALID' : 'NO HOLDER', SQL_ID: x.sql ? hash(x.sql, 13) : null }))
  if (/v\$lock$/.test(n))
    return srv.sessions.filter((x) => x.openTran).map((x) => ({ SID: x.id, TYPE: 'TX', LMODE: 6, REQUEST: 0, BLOCK: srv.sessions.some((y) => y.blockedBy === x.id) ? 1 : 0, CTIME: Math.round((now - (x.tranStarted ?? now)) / 1000) })).concat(srv.sessions.filter((x) => x.wait).map((x) => ({ SID: x.id, TYPE: 'TX', LMODE: 0, REQUEST: 6, BLOCK: 0, CTIME: Math.round((now - x.wait.since) / 1000) })))
  if (/dba_users$/.test(n)) return srv.logins.map((l) => ({ USERNAME: l.name, ACCOUNT_STATUS: l.status, PROFILE: l.profile, DEFAULT_TABLESPACE: 'USERS', CREATED: l.created !== undefined ? sqlTime(l.created).slice(0, 10) : '2024-02-12' }))
  const cols = (list, columns) => Object.assign(list, { columns })
  if (/dba_tab_privs$/.test(n)) return cols(srv.users.flatMap((u) => Object.entries(u.grants ?? {}).flatMap(([tk, ps]) => ps.map((p) => ({ GRANTEE: u.name, OWNER: tk.split('.')[0], TABLE_NAME: tk.split('.')[1], PRIVILEGE: p, GRANTABLE: 'NO' })))), ['GRANTEE', 'OWNER', 'TABLE_NAME', 'PRIVILEGE', 'GRANTABLE'])
  if (/dba_sys_privs$/.test(n)) return cols(srv.logins.flatMap((l) => (l.privs ?? []).map((p) => ({ GRANTEE: l.name, PRIVILEGE: p, ADMIN_OPTION: 'NO' }))), ['GRANTEE', 'PRIVILEGE', 'ADMIN_OPTION'])
  if (/dba_role_privs$/.test(n)) return cols(srv.users.flatMap((u) => u.roles.map((r) => ({ GRANTEE: u.name, GRANTED_ROLE: r, ADMIN_OPTION: 'NO', DEFAULT_ROLE: 'YES' }))), ['GRANTEE', 'GRANTED_ROLE', 'ADMIN_OPTION', 'DEFAULT_ROLE'])
  return null
}

// Runs one parsed statement on a session. Returns rows, a count, messages and the plan, or an error.
// `opts`: { params, now, wait: 'fail' | 'hang' | 'lockTimeout', queryTimeout (s), fetchSize, maxRows, user }
function execute(srv, sess, st, opts) {
  const now = opts.now
  const ctx = { params: opts.params, now, q: 0, sql: isSql(srv) }
  const err = (kind, a) => ({ ok: false, kind, ...vendorError(srv, kind, a) })
  const fromAtom = (e) => err(e.error, e)
  sess.lastBatch = now
  sess.sql = opts.text ?? sess.sql
  if (st.kind === 'empty') return { ok: true, messages: [] }
  if (st.kind === 'error') return err('syntax', { near: st.near ?? 'SELECT', code: st.oraCode })
  if (st.kind === 'unsupported') return { ...err('notSupported', { near: st.near }), lab: `The lab query window runs SELECT, INSERT, UPDATE, DELETE, transactions, CREATE TABLE, CREATE INDEX, ${isSql(srv) ? 'CREATE LOGIN, CREATE USER, ALTER ROLE' : 'CREATE USER, ALTER USER'}, GRANT, REVOKE, SET TRANSACTION ISOLATION LEVEL and ${isSql(srv) ? 'KILL' : 'ALTER SYSTEM KILL SESSION'}. ${st.near} is outside that set.` }
  if (PRINCIPAL_KINDS.includes(st.kind)) return principals(srv, sess, st, now)
  if (st.kind === 'badIsolation') return err('isolation', { near: st.near })
  if (st.kind === 'begin') {
    sess.openTran++
    sess.tranStarted ??= now
    return { ok: true, messages: [] }
  }
  if (st.kind === 'commit') {
    if (!sess.openTran && !sess.undo.length) return isSql(srv) ? err('noTran') : { ok: true, messages: ['Commit complete.'] }
    commit(srv, sess)
    return { ok: true, messages: isSql(srv) ? [] : ['Commit complete.'], ended: true }
  }
  if (st.kind === 'rollback') {
    if (!sess.openTran && !sess.undo.length) return isSql(srv) ? err('noRollback') : { ok: true, messages: ['Rollback complete.'] }
    rollback(srv, sess)
    return { ok: true, messages: isSql(srv) ? [] : ['Rollback complete.'], ended: true }
  }
  if (st.kind === 'isolation') {
    sess.isolation = st.level
    return { ok: true, messages: isSql(srv) ? [] : ['Transaction ISOLATION succeeded.'] }
  }
  if (st.kind === 'rcsi') {
    srv.rcsi = st.on
    return { ok: true, messages: [] }
  }
  if (st.kind === 'alterLogin') {
    const l = srv.logins.find((x) => x.name.toLowerCase() === st.name.toLowerCase())
    if (!l) return isSql(srv) ? { ok: false, code: 15151, text: `Cannot alter the login '${st.name}', because it does not exist or you do not have permission.`, window: `Msg 15151, Level 16, State 1, Line 1\nCannot alter the login '${st.name}', because it does not exist or you do not have permission.` } : err('notSupported', { near: st.name })
    if (st.action === 'enable') l.disabled = false
    if (st.action === 'disable') l.disabled = true
    if (st.action === 'account unlock') Object.assign(l, { status: 'OPEN', failed: 0 })
    if (st.action === 'account lock') l.status = 'LOCKED'
    return { ok: true, messages: isSql(srv) ? [] : ['User altered.'] }
  }
  if (st.kind === 'spwho')
    return {
      ok: true,
      grid: { columns: ['SPID', 'Status', 'Login', 'HostName', 'BlkBy', 'DBName', 'Command', 'CPUTime', 'DiskIO', 'LastBatch', 'ProgramName'], rows: srv.sessions.map((x) => [x.id, x.status === 'sleeping' ? 'sleeping' : x.status === 'suspended' ? 'SUSPENDED' : 'RUNNABLE', x.login, x.host, x.blockedBy ? String(x.blockedBy) : '  .', srv.database, x.status === 'sleeping' ? 'AWAITING COMMAND' : (x.pending?.kind ?? 'SELECT').toUpperCase(), x.cpu, x.reads, sqlTime(x.lastBatch).slice(5, 19), x.program]) },
      messages: [],
    }
  if (st.kind === 'kill') return { ok: true, kill: st }
  if (st.kind === 'xplan') {
    const p = sess.explained
    if (!p) return { ok: true, grid: { columns: ['PLAN_TABLE_OUTPUT'], rows: [['ERROR: an uncaught error in function display has happened'], ['ORA-01403: no data found']] }, messages: [] }
    return { ok: true, grid: { columns: ['PLAN_TABLE_OUTPUT'], rows: xplanText(srv, p).map((l) => [l]) }, messages: [] }
  }
  if (st.kind === 'explain') {
    const inner = parseSql(st.inner, srv.vendor)
    const r = prepare(srv, sess, inner, ctx)
    if (!r.ok) return r.error ? fromAtom(r.error) : r
    sess.explained = { ...planOf(srv, r.tk, r.q), sql: norm(st.inner), t: now }
    return { ok: true, messages: ['Explained.'], plan: sess.explained }
  }

  // tables
  if (st.kind === 'select') {
    const v = virtualRows(srv, st.from, now)
    if (v) return selectVirtual(srv, st, v, err, fromAtom)
  }
  if (st.kind === 'createIndex') return createIndex(srv, sess, st, opts, err)
  const r = prepare(srv, sess, st, ctx)
  if (!r.ok) return r.error ? fromAtom(r.error) : r
  const { tk, q } = r
  const t = srv.tables[tk]
  const user = srv.users.find((u) => u.login.toLowerCase() === String(sess.login).toLowerCase())
  const login = srv.logins.find((l) => l.name.toLowerCase() === String(sess.login).toLowerCase())
  const admin = login?.sysadmin
  const can = (verb) => {
    if (admin || !user || granted(user, tk, verb)) return true
    if (isSql(srv)) return user.roles.includes('db_owner') || user.roles.includes(verb === 'SELECT' ? 'db_datareader' : 'db_datawriter')
    // a user made with CREATE USER has only what was granted to it; the users of the seed keep their roles of old
    if (user.created !== undefined) return user.roles.includes('DBA') || user.roles.includes('HARBOR_RW') || (verb === 'SELECT' && user.roles.includes('HARBOR_RO')) || (login?.privs ?? []).includes(`${verb} ANY TABLE`)
    return verb === 'SELECT' || !user.roles.includes('HARBOR_RO')
  }
  const verb = st.kind.toUpperCase()
  if (!can(verb)) return err('denied', { verb, table: tk })
  const plan = q.kind === 'insert' ? null : planOf(srv, tk, { ...q, fetchSize: opts.fetchSize })

  // the lock a statement needs, and who holds it. A blocked statement waits; the caller decides how.
  const blockedOn = (rows, mode) => {
    for (const row of rows) {
      const k = rowKey(t, row)
      const h = holderOf(srv, sess, tk, k, mode)
      if (h) return { holder: h.s, t: tk, k, mode }
    }
    return null
  }
  const queryMs = plan ? plan.ms : 2
  if (opts.queryTimeout > 0 && queryMs > opts.queryTimeout * 1000) return { ...ERR.timeout(srv), ms: opts.queryTimeout * 1000, plan }

  if (q.kind === 'select') {
    const nolock = st.nolock
    let rows = readsVersions(srv, sess, nolock) ? committedRows(srv, sess, tk) : [...t.rows]
    if (takesReadLocks(srv, sess, nolock)) {
      const b = blockedOn(touched(t, rows, plan), 'S')
      if (b) return { ok: false, blocked: b, plan }
      if (sess.openTran && (sess.isolation === 'repeatable read' || sess.isolation === 'serializable')) for (const row of touched(t, rows, plan).filter((x) => rowMatches(q.where, x))) lock(srv, sess, tk, rowKey(t, row), 'S')
    }
    // Oracle: a long read of a table that others change needs old undo, and undo older than UNDO_RETENTION is gone (lab-made trigger)
    if (!isSql(srv) && plan.ms > srv.undoRetention * 1000 && (t.busy || t.changed > now - plan.ms)) return { ...ERR.snapshot(), ms: srv.undoRetention * 1000 + 30000, plan }
    rows = rows.filter((x) => rowMatches(q.where, x))
    if (q.rownumLimit) rows = rows.slice(0, q.rownumLimit) // before ORDER BY, as Oracle does
    if (q.order.length) rows.sort((a, b) => { for (const o of q.order) { const c = cmp(a[o.col], b[o.col]) ?? (a[o.col] === null ? -1 : 1); if (c) return o.dir === 'DESC' ? -c : c } return 0 })
    if (q.offset) rows = rows.slice(q.offset)
    if (q.fetch !== null && q.fetch !== undefined) rows = rows.slice(0, q.fetch)
    if (q.top !== null && q.top !== undefined) rows = rows.slice(0, q.top)
    if (opts.maxRows) rows = rows.slice(0, opts.maxRows)
    sess.reads += Math.min(plan.access.rowsRead, 1e9)
    if (q.count) {
      const n = q.where.groups.length ? Math.max(rows.length, plan.est) : t.count
      return { ok: true, rows: [{ [q.names[0] || '']: n }], grid: { columns: [q.names[0] || '(No column name)'], rows: [[n]] }, count: 1, ms: queryMs, plan, messages: [isSql(srv) ? '(1 row affected)' : '1 row selected.'] }
    }
    const cols = q.cols.includes('*') ? t.columns.map((c) => c.name) : q.cols
    const names = q.cols.includes('*') ? cols : q.names
    const out = rows.map((x) => Object.fromEntries(cols.map((c, i) => [names[i], x[c] ?? null])))
    // the plan's estimate stands for the real table; the rows are the few the lab keeps
    const count = Math.max(out.length, Math.min(plan.est, q.top ?? q.fetch ?? q.rownumLimit ?? opts.maxRows ?? Infinity))
    return { ok: true, rows: out, grid: { columns: names, rows: out.map((x) => names.map((nm) => x[nm])) }, count, ms: queryMs, plan, messages: [isSql(srv) ? `(${out.length} row${out.length === 1 ? '' : 's'} affected)` : `${out.length} row${out.length === 1 ? '' : 's'} selected.`] }
  }

  // writes take X locks and keep them to the end of the transaction
  const autocommit = !sess.openTran && (isSql(srv) || opts.autocommit)
  if (!autocommit && !sess.openTran) {
    sess.openTran = 1
    sess.tranStarted = now
  }
  const done = (affected, word) => {
    t.changed = now
    if (autocommit) commit(srv, sess)
    else sess.tranStarted ??= now
    return { ok: true, affected, count: affected, ms: queryMs, plan, messages: [isSql(srv) ? `(${affected} row${affected === 1 ? '' : 's'} affected)` : `${affected} row${affected === 1 ? '' : 's'} ${word}.`] }
  }
  const failWrite = (e) => {
    // a failed statement rolls back only itself; an autocommit statement has nothing left open
    if (autocommit) commit(srv, sess)
    else if (!isSql(srv) && !sess.undo.length) endTran(srv, sess)
    return e
  }
  if (q.kind === 'insert') {
    const added = []
    for (const values of q.rows) {
      const row = Object.fromEntries(t.columns.map((c) => [c.name, null]))
      q.cols.forEach((c, i) => (row[c] = values[i]))
      // a column the INSERT leaves out gets its IDENTITY value or its DEFAULT
      for (const c of t.columns.filter((x) => !q.cols.includes(x.name))) {
        if (c.identity) row[c.name] = t.identityNext = (t.identityNext ?? 0) + 1
        else if (c.default !== undefined) row[c.name] = valueOf(c.default, { params: null, now, q: 0 }).v ?? null
      }
      for (const c of t.columns) if (!c.nullable && (row[c.name] === null || row[c.name] === undefined)) return failWrite(err('notNull', { column: c.name, table: tk, verb: 'INSERT' }))
      const k = rowKey(t, row)
      const h = holderOf(srv, sess, tk, k, 'X')
      if (h) return { ok: false, blocked: { holder: h.s, t: tk, k, mode: 'X' }, plan }
      if (t.pk.length && [...t.rows, ...added].some((x) => rowKey(t, x) === k)) return failWrite(err('pk', { constraint: isSql(srv) ? t.pkName : `${t.schema}.${t.pkName}`, table: tk, value: t.pk.map((c) => row[c]).join(', ') }))
      for (const ix of t.indexes.filter((x) => x.unique)) {
        const same = [...t.rows, ...added].find((x) => ix.columns.every((c) => cmp(x[c], row[c]) === 0))
        if (same) return failWrite(err('unique', { table: tk, index: ix.name, constraint: `${t.schema}.${ix.name}`, value: ix.columns.map((c) => row[c]).join(', ') }))
      }
      for (const fk of t.fks) {
        if (row[fk.column] === null) continue
        const parent = srv.tables[fk.table]
        if (!parent?.rows.some((x) => cmp(x[fk.ref], row[fk.column]) === 0)) return failWrite(err('fk', { verb: 'INSERT', constraint: isSql(srv) ? fk.name : `${t.schema}.${fk.name}`, table: fk.table, column: fk.ref }))
      }
      added.push(row)
    }
    for (const row of added) {
      t.rows.push(row)
      t.count++
      lock(srv, sess, tk, rowKey(t, row), 'X')
      sess.undo.push({ t: tk, op: 'insert', k: rowKey(t, row) })
    }
    if (t.rows.length > 40) t.rows.splice(0, t.rows.length - 40) // lab-made: the lab keeps the newest rows only
    return done(added.length, 'inserted')
  }
  const read = touched(t, t.rows, plan)
  const hit = read.filter((x) => rowMatches(q.where, x))
  // the rows a scan reads on the way need a U lock each, the rows it changes an X lock
  const b = blockedOn(hit, 'X') ?? (isSql(srv) ? blockedOn(read, 'U') : null)
  if (b) return { ok: false, blocked: b, plan }
  if (q.kind === 'update') {
    for (const row of hit) {
      const before = { ...row }
      for (const [c, expr] of q.set) {
        if (expr.ref) {
          const base = Number(row[expr.ref]) || 0
          row[c] = Math.round((expr.op === '+' ? base + expr.n : base - expr.n) * 100) / 100
        } else row[c] = expr.v
        const def = t.columns.find((x) => x.name === c)
        if (!def.nullable && row[c] === null) {
          Object.assign(row, before)
          return failWrite(err('notNull', { column: c, table: tk, verb: 'UPDATE' }))
        }
        const fk = t.fks.find((x) => x.column === c)
        if (fk && row[c] !== null && !srv.tables[fk.table]?.rows.some((x) => cmp(x[fk.ref], row[c]) === 0)) {
          Object.assign(row, before)
          return failWrite(err('fk', { verb: 'UPDATE', constraint: isSql(srv) ? fk.name : `${t.schema}.${fk.name}`, table: fk.table, column: fk.ref }))
        }
      }
      lock(srv, sess, tk, rowKey(t, row), 'X')
      if (!sess.undo.some((u) => u.t === tk && u.k === rowKey(t, row))) sess.undo.push({ t: tk, op: 'update', k: rowKey(t, row), before })
    }
    return done(hit.length, 'updated')
  }
  // delete: a child row that points at the row stops it
  for (const row of hit) {
    for (const [ck, child] of Object.entries(srv.tables)) {
      const fk = child.fks.find((x) => x.table === tk)
      if (fk && child.rows.some((x) => cmp(x[fk.column], row[fk.ref]) === 0)) return failWrite(err('fk', { verb: 'DELETE', constraint: isSql(srv) ? fk.name : `${child.schema}.${fk.name}`, table: ck, column: fk.column }))
    }
  }
  for (const row of hit) {
    lock(srv, sess, tk, rowKey(t, row), 'X')
    sess.undo.push({ t: tk, op: 'delete', k: rowKey(t, row), before: { ...row } })
  }
  t.rows = t.rows.filter((x) => !hit.includes(x))
  t.count = Math.max(0, t.count - hit.length)
  return done(hit.length, 'deleted')
}

// Reads the table, the columns and the WHERE of a statement
function prepare(srv, sess, st, ctx) {
  const tk = tableKeyOf(srv, st.from)
  if (!tk) return { ok: false, kind: 'object', ...vendorError(srv, 'object', { name: clean(st.from) }) }
  const t = srv.tables[tk]
  if (st.kind === 'select') {
    const c = parseCols(t, st.colsText)
    if (c.error) return { ok: false, error: c.error }
    const w = whereOf(t, st.whereText, ctx)
    if (w.error) return { ok: false, error: w.error }
    const o = st.orderText ? parseOrder(t, st.orderText) : { order: [] }
    if (o.error) return { ok: false, error: o.error }
    const num = (x) => {
      if (x === null) return { v: null }
      const v = valueOf(x, ctx)
      return v.error ? v : { v: Number(v.v) }
    }
    const off = num(st.offsetText)
    const fet = num(st.fetchText)
    if (off.error || fet.error) return { ok: false, error: off.error ? off : fet }
    const rownum = w.groups.length === 1 ? w.groups[0].find((a) => a.rownum) : null
    const where = { groups: w.groups.map((g) => g.filter((a) => !a.rownum)).filter((g) => g.length) }
    return { ok: true, tk, q: { kind: 'select', cols: c.cols, names: c.names, count: c.cols.includes('COUNT(*)'), where, whereText: st.whereText, order: o.order, top: st.top, offset: off.v, fetch: fet.v, rownumLimit: rownum ? (rownum.op === '<' ? rownum.value - 1 : rownum.value) : null } }
  }
  if (st.kind === 'insert') {
    const cols = st.colsText ? st.colsText.split(',').map((x) => colOf(t, x.trim())) : t.columns.map((c) => c.name)
    const badCol = st.colsText && st.colsText.split(',').find((x) => !colOf(t, x.trim()))
    if (badCol) return { ok: false, error: { error: 'column', name: badCol.trim() } }
    const rows = []
    for (const group of splitTop(st.valuesText, /^,/)) {
      const inner = group.replace(/^\((.*)\)$/s, '$1')
      const values = []
      for (const part of splitTop(inner, /^,/)) {
        const v = valueOf(part, ctx)
        if (v.error) return { ok: false, error: v }
        values.push(v.v)
      }
      if (values.length !== cols.length) return { ok: false, kind: 'syntax', ...(isSql(srv) ? { code: 110, text: 'There are fewer columns in the INSERT statement than values specified in the VALUES clause.', window: 'Msg 110, Level 15, State 1, Line 1\nThere are fewer columns in the INSERT statement than values specified in the VALUES clause.' } : vendorError(srv, 'syntax', { code: values.length > cols.length ? 913 : 947 })) }
      rows.push(values)
    }
    return { ok: true, tk, q: { kind: 'insert', cols, rows } }
  }
  const w = whereOf(t, st.whereText, ctx)
  if (w.error) return { ok: false, error: w.error }
  const q = { kind: st.kind, where: w, whereText: st.whereText, order: [] }
  if (st.kind === 'update') {
    q.set = []
    for (const part of splitTop(st.setText, /^,/)) {
      const m = part.match(/^([\w.[\]"]+)\s*=\s*(.+)$/s)
      if (!m) return { ok: false, error: { error: 'syntax', near: part.split(' ')[0] } }
      const c = colOf(t, m[1])
      if (!c) return { ok: false, error: { error: 'column', name: m[1] } }
      const arith = m[2].trim().match(/^([\w.[\]"]+)\s*([+-])\s*(.+)$/)
      if (arith && colOf(t, arith[1])) {
        const v = valueOf(arith[3], ctx)
        if (v.error) return { ok: false, error: v }
        q.set.push([c, { ref: colOf(t, arith[1]), op: arith[2], n: Number(v.v) }])
        continue
      }
      const v = valueOf(m[2], ctx)
      if (v.error) return { ok: false, error: v }
      q.set.push([c, { v: v.v }])
    }
  }
  return { ok: true, tk, q }
}

function selectVirtual(srv, st, rows, err, fromAtom) {
  const fake = { columns: (rows.columns ?? Object.keys(rows[0] ?? {})).map((n) => ({ name: n })), pk: [], distinct: {}, spread: {} }
  if (!fake.columns.length) fake.columns = [{ name: isSql(srv) ? 'session_id' : 'SID' }]
  const ctx = { params: null, now: 0, q: 0, sql: isSql(srv) }
  const c = parseCols(fake, st.colsText)
  if (c.error) return fromAtom(c.error)
  const w = whereOf(fake, st.whereText, ctx)
  if (w.error) return fromAtom(w.error)
  let out = rows.filter((r) => rowMatches(w, r))
  if (st.orderText) {
    const o = parseOrder(fake, st.orderText)
    if (o.error) return fromAtom(o.error)
    out.sort((a, b) => { for (const x of o.order) { const d = cmp(a[x.col], b[x.col]) ?? 0; if (d) return x.dir === 'DESC' ? -d : d } return 0 })
  }
  if (st.top) out = out.slice(0, st.top)
  const cols = c.cols.includes('*') ? fake.columns.map((x) => x.name) : c.cols
  return { ok: true, grid: { columns: cols, rows: out.map((r) => cols.map((x) => r[x] ?? null)) }, rows: out, messages: [isSql(srv) ? `(${out.length} row${out.length === 1 ? '' : 's'} affected)` : `${out.length} row${out.length === 1 ? '' : 's'} selected.`] }
}

function createIndex(srv, sess, st, opts, err) {
  const tk = tableKeyOf(srv, st.from)
  if (!tk) return { ok: false, ...vendorError(srv, 'object', { name: clean(st.from) }) }
  const t = srv.tables[tk]
  const user = srv.users.find((u) => u.login.toLowerCase() === String(sess.login).toLowerCase())
  const admin = srv.logins.find((l) => l.name.toLowerCase() === String(sess.login).toLowerCase())?.sysadmin
  if (!admin && user && !(user.roles.includes('db_owner') || user.roles.includes('db_ddladmin') || user.roles.includes('RESOURCE'))) return isSql(srv) ? { ok: false, code: 1088, text: `Cannot find the object "${tk}" because it does not exist or you do not have permissions.`, window: `Msg 1088, Level 16, State 12, Line 1\nCannot find the object "${tk}" because it does not exist or you do not have permissions.` } : err('denied', { verb: 'CREATE INDEX', table: tk })
  if (indexesOf(t).some((x) => x.name.toLowerCase() === st.name.toLowerCase()) || (!isSql(srv) && Object.values(srv.tables).some((x) => x.indexes.some((i) => i.name.toLowerCase() === st.name.toLowerCase())))) return err('indexExists', { name: st.name, table: tk })
  const cols = []
  for (const part of st.colsText.split(',')) {
    const c = colOf(t, part.trim().split(/\s+/)[0])
    if (!c) return err('indexColumn', { name: part.trim().split(/\s+/)[0] })
    cols.push(c)
  }
  const include = []
  for (const part of st.includeText.split(',').filter((x) => x.trim())) {
    const c = colOf(t, part.trim())
    if (!c) return err('indexColumn', { name: part.trim() })
    include.push(c)
  }
  if (st.clustered && t.clustered) return { ok: false, code: 1902, text: `Cannot create more than one clustered index on table '${tk}'. Drop the existing clustered index '${t.pkName}' before creating another.`, window: `Msg 1902, Level 16, State 3, Line 1\nCannot create more than one clustered index on table '${tk}'. Drop the existing clustered index '${t.pkName}' before creating another.` }
  if (st.unique) {
    const seen = new Set()
    for (const r of t.rows) {
      const v = cols.map((c) => r[c]).join(', ')
      if (seen.has(v)) return err('indexDup', { table: tk, name: st.name, value: v })
      seen.add(v)
    }
  }
  // an offline build needs the table to itself: an open transaction that changed rows of it makes the build wait
  if (!st.online) {
    const busy = srv.locks.find((l) => l.t === tk && l.s !== sess.id)
    if (busy) return { ok: false, blocked: { holder: busy.s, t: tk, k: busy.k, mode: isSql(srv) ? 'SCH_M' : 'X' } }
  }
  t.indexes.push({ name: st.name, columns: cols, include, unique: st.unique, created: opts.now, online: st.online })
  const ms = Math.round(t.count * 0.0006 + 40) // lab-made: 1.6 million rows a second
  return { ok: true, ms, messages: isSql(srv) ? [] : [`Index ${st.name.toUpperCase()} created.`], index: st.name }
}

// ---------- logins, users, grants and new tables ----------

const PRINCIPAL_KINDS = ['createLogin', 'createUser', 'setPassword', 'grantObject', 'grantSystem', 'roleMember', 'createTable']
export const SQL_ROLES = ['db_owner', 'db_datareader', 'db_datawriter', 'db_ddladmin', 'db_securityadmin', 'db_backupoperator', 'db_denydatareader', 'db_denydatawriter']
export const ORA_ROLES = ['CONNECT', 'RESOURCE', 'DBA', 'HARBOR_RW', 'HARBOR_RO']
const ORA_SYS_PRIVS = ['CREATE SESSION', 'CREATE TABLE', 'CREATE VIEW', 'CREATE SEQUENCE', 'CREATE PROCEDURE', 'UNLIMITED TABLESPACE', 'SELECT ANY TABLE', 'INSERT ANY TABLE', 'UPDATE ANY TABLE', 'DELETE ANY TABLE', 'DROP ANY TABLE']
const SQL_DB_PERMS = ['CONNECT', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'ALTER', 'CONTROL']
const OBJECT_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'ALTER']
const ORA_PROFILES = ['DEFAULT', 'APP_USERS']
// grants on one table, or database wide under '*' (SQL Server GRANT SELECT TO user). CONTROL holds every permission.
export const granted = (user, tk, verb) => [user?.grants?.[tk], user?.grants?.['*']].some((g) => (g ?? []).includes(verb) || (g ?? []).includes('CONTROL'))
// the password policy of Windows that CHECK_POLICY = ON applies: 8 characters and three of upper, lower, digit, symbol
const complexEnough = (pw) => pw.length >= 8 && [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length >= 3
const privsOf = (text) => {
  const t = text.trim().toUpperCase().replace(/\s+/g, ' ')
  return /^ALL( PRIVILEGES)?$/.test(t) ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] : t.split(/\s*,\s*/)
}

// CREATE LOGIN, CREATE USER, GRANT, REVOKE, ALTER ROLE and CREATE TABLE in the query window
function principals(srv, sess, st, now) {
  const sql = isSql(srv)
  const msg = (n, level, state, text) => ({ ok: false, code: n, text, window: `Msg ${n}, Level ${level}, State ${state}, Line 1\n${text}` })
  const ora = (n, text) => {
    const t = `ORA-${String(n).padStart(5, '0')}: ${text}`
    return { ok: false, code: n, text: t, window: t }
  }
  const done = (oraText) => ({ ok: true, messages: sql ? [] : [oraText] })
  const same = (a, b) => (sql ? String(a).toLowerCase() === String(b).toLowerCase() : a === b)
  const loginOf = (name) => srv.logins.find((l) => same(l.name, name))
  const userOf = (name) => srv.users.find((u) => same(u.name, name))
  if (!loginOf(sess.login)?.sysadmin) return sql ? msg(15247, 16, 1, 'User does not have permission to perform this action.') : ora(1031, 'insufficient privileges')
  // Oracle commits the open transaction of the session before and after each DDL statement
  if (!sql && sess.undo.length) commit(srv, sess)
  if (st.kind === 'createTable') return createTable(srv, st, now, msg, ora)

  if (st.kind === 'createLogin') {
    if (loginOf(st.name)) return msg(15025, 16, 2, `The server principal '${st.name}' already exists.`)
    const policy = !/check_policy\s*=\s*off/i.test(st.opts)
    if (policy && !complexEnough(st.password)) return msg(15118, 16, 1, 'Password validation failed. The password does not meet the operating system policy requirements because it is not complex enough.')
    const db = st.opts.match(/default_database\s*=\s*\[?(\w+)\]?/i)?.[1] ?? 'master'
    srv.logins.push({ name: st.name, type: 'SQL login', password: st.password, disabled: false, defaultDb: db, policy, failed: 0, created: now })
    return done('')
  }
  if (st.kind === 'createUser' && sql) {
    if (userOf(st.name)) return msg(15023, 16, 1, `User, group, or role '${st.name}' already exists in the current database.`)
    const login = loginOf(st.login)
    if (!login) return msg(15007, 16, 1, `'${st.login}' is not a valid login or you do not have permission.`)
    if (srv.users.some((u) => same(u.login, login.name))) return msg(15063, 16, 1, 'The login already has an account under a different user name.')
    srv.users.push({ name: st.name, login: login.name, schema: st.schema, roles: [], grants: {}, created: now })
    return done('')
  }
  if (st.kind === 'createUser') {
    if (loginOf(st.name) || userOf(st.name) || ORA_ROLES.includes(st.name)) return ora(1920, `user name '${st.name}' conflicts with another user or role name`)
    const opts = st.opts.trim()
    if (opts && !/^((default|temporary) tablespace \w+|quota (\d+[kmg]?|unlimited) on \w+|profile \w+|account (lock|unlock)|password expire)( ((default|temporary) tablespace \w+|quota (\d+[kmg]?|unlimited) on \w+|profile \w+|account (lock|unlock)|password expire))*$/i.test(opts)) return ora(922, 'missing or invalid option')
    const profile = (opts.match(/profile (\w+)/i)?.[1] ?? 'DEFAULT').toUpperCase()
    if (!ORA_PROFILES.includes(profile)) return ora(2380, `profile ${profile} does not exist`)
    srv.logins.push({ name: st.name, type: 'App user', password: st.password, status: /account lock/i.test(opts) ? 'LOCKED' : 'OPEN', profile, failed: 0, privs: [], created: now })
    srv.users.push({ name: st.name, login: st.name, schema: st.name, roles: [], grants: {}, created: now })
    return done('User created.')
  }
  if (st.kind === 'setPassword') {
    const login = loginOf(st.name)
    if (!login) return sql ? msg(15151, 16, 1, `Cannot alter the login '${st.name}', because it does not exist or you do not have permission.`) : ora(1918, `user '${st.name}' does not exist`)
    if (sql && login.policy && !complexEnough(st.password)) return msg(15118, 16, 1, 'Password validation failed. The password does not meet the operating system policy requirements because it is not complex enough.')
    Object.assign(login, { password: st.password, failed: 0 })
    return done('User altered.')
  }
  if (st.kind === 'roleMember') {
    const role = SQL_ROLES.find((r) => r.toLowerCase() === st.role.toLowerCase())
    if (!role) return msg(15151, 16, 1, `Cannot alter the role '${st.role}', because it does not exist or you do not have permission.`)
    const user = userOf(st.name)
    if (!user) return msg(15151, 16, 1, `Cannot ${st.drop ? 'drop' : 'add'} the principal '${st.name}', because it does not exist or you do not have permission.`)
    user.roles = st.drop ? user.roles.filter((r) => r !== role) : [...new Set([...user.roles, role])]
    return done('')
  }
  const user = userOf(st.grantee)
  const noUser = () => (sql ? msg(15151, 16, 1, `Cannot find the user '${st.grantee}', because it does not exist or you do not have permission.`) : ora(1917, `user or role '${st.grantee}' does not exist`))
  const privs = privsOf(st.privs)
  if (st.kind === 'grantObject') {
    const tk = tableKeyOf(srv, st.from)
    if (!tk) return sql ? msg(15151, 16, 1, `Cannot find the object '${clean(st.from).split('.').at(-1)}', because it does not exist or you do not have permission.`) : ora(942, 'table or view does not exist')
    const bad = privs.find((p) => !OBJECT_PRIVS.includes(p) && !(sql && p === 'CONTROL'))
    if (bad) return sql ? msg(102, 15, 1, `Incorrect syntax near '${bad.split(' ')[0]}'.`) : ora(990, 'missing or invalid privilege')
    if (!user) return noUser()
    const have = user.grants?.[tk] ?? []
    if (!sql && st.revoke && !privs.some((p) => have.includes(p))) return ora(1927, 'cannot REVOKE privileges you did not grant')
    user.grants = { ...user.grants, [tk]: st.revoke ? have.filter((p) => !privs.includes(p)) : [...new Set([...have, ...privs])] }
    if (!user.grants[tk].length) delete user.grants[tk]
    return done(st.revoke ? 'Revoke succeeded.' : 'Grant succeeded.')
  }
  // grantSystem: database permissions on SQL Server; roles and system privileges on Oracle
  if (sql) {
    const bad = privs.find((p) => !SQL_DB_PERMS.includes(p))
    if (bad) return msg(102, 15, 1, `Incorrect syntax near '${bad.split(' ')[0]}'.`)
    if (!user) return noUser()
    const have = user.grants?.['*'] ?? []
    const next = st.revoke ? have.filter((p) => !privs.includes(p)) : [...new Set([...have, ...privs.filter((p) => p !== 'CONNECT')])]
    user.grants = { ...user.grants, '*': next }
    if (!next.length) delete user.grants['*']
    return done('')
  }
  const unknown = privs.find((p) => !ORA_ROLES.includes(p) && !ORA_SYS_PRIVS.includes(p))
  if (unknown) return /\s/.test(unknown) ? ora(990, 'missing or invalid privilege') : ora(1919, `role '${unknown}' does not exist`)
  if (!user) return noUser()
  const login = loginOf(user.login)
  const roles = privs.filter((p) => ORA_ROLES.includes(p))
  const sys = privs.filter((p) => ORA_SYS_PRIVS.includes(p))
  if (st.revoke) {
    const missingRole = roles.find((r) => !user.roles.includes(r))
    if (missingRole) return ora(1951, `ROLE '${missingRole}' not granted to '${user.name}'`)
    if (sys.some((p) => !(login?.privs ?? []).includes(p))) return ora(1952, `system privileges not granted to '${user.name}'`)
  }
  user.roles = st.revoke ? user.roles.filter((r) => !roles.includes(r)) : [...new Set([...user.roles, ...roles])]
  if (login && sys.length) login.privs = st.revoke ? (login.privs ?? []).filter((p) => !sys.includes(p)) : [...new Set([...(login.privs ?? []), ...sys])]
  return done(st.revoke ? 'Revoke succeeded.' : 'Grant succeeded.')
}

const SQL_TYPES = ['int', 'bigint', 'smallint', 'tinyint', 'bit', 'decimal', 'numeric', 'money', 'float', 'real', 'date', 'datetime', 'datetime2', 'datetimeoffset', 'time', 'char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext', 'uniqueidentifier', 'binary', 'varbinary']
const ORA_TYPES = ['number', 'integer', 'float', 'varchar2', 'nvarchar2', 'varchar', 'char', 'nchar', 'date', 'timestamp', 'clob', 'blob', 'raw']
// CREATE TABLE with columns (NULL, NOT NULL, PRIMARY KEY, UNIQUE, DEFAULT, IDENTITY, REFERENCES) and table
// constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY). Lab-made: CHECK constraints and computed columns are not read.
function createTable(srv, st, now, msg, ora) {
  const sql = isSql(srv)
  const parts = clean(st.from).split('.')
  const name = sql ? parts.at(-1) : parts.at(-1).toUpperCase()
  const schema = parts.length > 1 ? (sql ? parts.at(-2) : parts.at(-2).toUpperCase()) : sql ? 'dbo' : 'HARBOR'
  const tk = `${schema}.${name}`
  if (tableKeyOf(srv, tk)) return sql ? msg(2714, 16, 6, `There is already an object named '${name}' in the database.`) : ora(955, 'name is already used by an existing object')
  const syntax = (near) => (sql ? msg(102, 15, 1, `Incorrect syntax near '${near}'.`) : ora(922, 'missing or invalid option'))
  const n = Object.keys(srv.tables).length
  const sysName = (k) => `SYS_C00${7400 + n * 3 + k}`
  const columns = []
  const fks = []
  const indexes = []
  let pk = null
  let pkName = null
  const ident = (x) => (sql ? clean(x) : clean(x).toUpperCase())
  const colsIn = (text) => text.split(',').map((x) => ident(x.trim().split(/\s+/)[0]))
  for (const part of splitTop(st.body, /^,/)) {
    let m
    const cname = part.match(/^constraint ([\w[\]"]+) (.+)$/i)
    const named = cname ? ident(cname[1]) : null
    const body = cname ? cname[2] : part
    if ((m = body.match(/^primary key(?: (?:clustered|nonclustered))?\s*\(([^)]*)\)$/i))) {
      if (pk) return sql ? msg(8110, 16, 0, `Cannot add multiple PRIMARY KEY constraints to table '${name}'.`) : ora(2260, 'table can have only one primary key')
      pk = colsIn(m[1])
      pkName = named
      continue
    }
    if ((m = body.match(/^unique(?: (?:clustered|nonclustered))?\s*\(([^)]*)\)$/i))) {
      indexes.push({ name: named ?? (sql ? `UQ__${name.slice(0, 8)}__${hash(`${tk}u${indexes.length}`, 16).toUpperCase()}` : sysName(indexes.length + 1)), columns: colsIn(m[1]), include: [], unique: true, created: now })
      continue
    }
    if ((m = body.match(/^foreign key\s*\(([^)]*)\)\s*references ([\w.[\]"]+)\s*\(([^)]*)\)$/i))) {
      fks.push({ name: named ?? (sql ? `FK__${name.slice(0, 8)}__${hash(`${tk}f${fks.length}`, 8).toUpperCase()}` : sysName(fks.length + 5)), column: colsIn(m[1])[0], table: m[2], ref: colsIn(m[3])[0] })
      continue
    }
    m = part.match(/^([\w[\]"]+)\s+([a-z]\w*(?:\s*\(\s*(?:\d+|max)\s*(?:,\s*\d+\s*)?\))?)(.*)$/i)
    if (!m) return syntax(part.split(/\s+/)[0])
    const type = m[2].replace(/\s+/g, '')
    const base = type.split('(')[0].toLowerCase()
    if (!(sql ? SQL_TYPES : ORA_TYPES).includes(base)) return sql ? msg(2715, 16, 6, `Column, parameter, or variable #${columns.length + 1}: Cannot find data type ${type.split('(')[0]}.`) : ora(902, 'invalid datatype')
    const c = { name: ident(m[1]), type: sql ? type : type.toUpperCase(), nullable: true }
    let rest = m[3].trim()
    // the options of one column, read one at a time
    const OPTS = [
      [/^not null\b/i, () => (c.nullable = false)],
      [/^null\b/i, () => (c.nullable = true)],
      [/^(?:constraint [\w[\]"]+ )?primary key(?: (?:clustered|nonclustered))?/i, () => (pk ? 'twice' : ((pk = [c.name]), (c.nullable = false)))],
      [/^(?:constraint [\w[\]"]+ )?unique\b/i, () => indexes.push({ name: sql ? `UQ__${name.slice(0, 8)}__${hash(`${tk}${c.name}`, 16).toUpperCase()}` : sysName(indexes.length + 1), columns: [c.name], include: [], unique: true, created: now })],
      [/^identity(?:\s*\(\s*\d+\s*,\s*\d+\s*\))?/i, () => (sql ? (c.identity = true) : 'bad')],
      [/^generated (?:always|by default) as identity/i, () => (sql ? 'bad' : (c.identity = true))],
      [/^default\s+(N?'(?:[^']|'')*'|-?\d+(?:\.\d+)?|\w+\(\)|sysdate|systimestamp|current_timestamp)/i, (x) => (c.default = x[1])],
      [/^(?:constraint [\w[\]"]+ )?references ([\w.[\]"]+)\s*\(([^)]*)\)/i, (x) => fks.push({ name: sql ? `FK__${name.slice(0, 8)}__${hash(`${tk}${c.name}f`, 8).toUpperCase()}` : sysName(fks.length + 5), column: c.name, table: x[1], ref: colsIn(x[2])[0] })],
      [/^with (?:local )?time zone/i, () => null],
    ]
    while (rest) {
      const hit = OPTS.map(([re, fn]) => [rest.match(re), fn]).find(([x]) => x)
      if (!hit) return syntax(rest.split(/\s+/)[0])
      const r = hit[1](hit[0])
      if (r === 'twice') return sql ? msg(8110, 16, 0, `Cannot add multiple PRIMARY KEY constraints to table '${name}'.`) : ora(2260, 'table can have only one primary key')
      if (r === 'bad') return syntax(hit[0][0].split(/\s+/)[0])
      rest = rest.slice(hit[0][0].length).trim()
    }
    columns.push(c)
  }
  if (!columns.length) return syntax(')')
  for (const k of [...(pk ?? []), ...indexes.flatMap((x) => x.columns), ...fks.map((f) => f.column)]) if (!columns.some((c) => c.name === k)) return sql ? msg(1911, 16, 1, `Column name '${k}' does not exist in the target table or view.`) : ora(904, `"${k}": invalid identifier`)
  for (const f of fks) {
    const ref = tableKeyOf(srv, f.table)
    if (!ref) return sql ? msg(1767, 16, 0, `Foreign key '${f.name}' references invalid table '${clean(f.table)}'.`) : ora(942, 'table or view does not exist')
    f.table = ref
  }
  for (const c of columns) if (pk?.includes(c.name)) c.nullable = false
  srv.tables[tk] = table(schema, name, { columns, pk: pk ?? [], pkName: pk ? (pkName ?? (sql ? `PK__${name.slice(0, 8)}__${hash(tk, 16).toUpperCase()}` : sysName(0))) : null, clustered: sql && Boolean(pk), fks, indexes, created: now })
  return { ok: true, messages: sql ? [] : ['Table created.'] }
}

function xplanText(srv, p) {
  const t = srv.tables[p.table]
  const width = (x) => String(x)
  const rows = p.ops.map((o, i) => {
    const bytes = Math.round((o.rows ?? 1) * 48)
    const cost = Math.max(1, Math.round((p.ms / 10) * (i === p.ops.length - 1 ? 1 : 0.9 + i * 0.01)))
    const time = new Date(Math.max(1000, p.ms)).toISOString().slice(11, 19)
    return { id: i, op: `${' '.repeat(Math.min(i, 6))}${o.op}`, name: o.object ?? '', rows: o.rows ?? 1, bytes, cost, time }
  })
  const fmtN = (n) => (n >= 1e6 ? `${Math.round(n / 1e6)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : String(n))
  const line = '-'.repeat(86)
  const out = [`Plan hash value: ${parseInt(hash(p.sql, 8), 16)}`, '', line, '| Id  | Operation                             | Name                | Rows  | Bytes | Cost (%CPU)| Time     |', line]
  for (const r of rows) out.push(`|${(r.id === 0 ? '   0' : `${String(r.id).padStart(4)}`)} | ${r.op.padEnd(37)} | ${width(r.name).padEnd(19)} | ${fmtN(r.rows).padStart(5)} | ${fmtN(r.bytes).padStart(5)} | ${String(r.cost).padStart(6)}   (2)| ${r.time} |`)
  out.push(line, '', 'Predicate Information (identified by operation id):', '---------------------------------------------------', '')
  p.ops.forEach((o, i) => {
    if (o.access) out.push(`   ${i} - access(${o.access})`)
    if (o.predicate) out.push(`   ${i} - filter(${o.predicate.toUpperCase().replace(/\b([A-Z_]+)\b(?=\s*(=|<|>|IS|LIKE))/g, '"$1"')})`)
  })
  if (p.nonSargable.length) out.push('', 'Note', '-----', `   - a function on the column (${p.nonSargable.join(', ')}) stops the use of an index on it`)
  void t
  return out
}

// ---------- deadlocks ----------

// Finds a cycle through the waits that starts at `from` waiting on `to`
function cycle(srv, from, to) {
  const path = [from]
  let cur = to
  const seen = new Set()
  while (cur && !seen.has(cur)) {
    if (cur === from) return path
    seen.add(cur)
    path.push(cur)
    cur = sessionOf(srv, cur)?.blockedBy ?? null
  }
  return null
}
function recordDeadlock(srv, now, ids, victim, wanted) {
  const waitOf = (id) => (id === wanted.s ? wanted : sessionOf(srv, id)?.wait)
  const procs = ids.map((id) => {
    const x = sessionOf(srv, id)
    const w = waitOf(id)
    const owns = srv.locks.find((l) => l.s === id && ids.some((o) => o !== id && waitOf(o)?.t === l.t && waitOf(o)?.k === l.k))
    return { spid: id, serial: x.serial, login: x.login, host: x.host, app: x.app, program: x.program, sql: id === wanted.s ? wanted.sql : x.pending?.text ?? x.sql, isolation: x.isolation, logused: x.undo.length * 232 + 100, tranStarted: x.tranStarted ?? now, waits: w ? { t: w.t, k: w.k, mode: w.mode } : null, owns: owns ? { t: owns.t, k: owns.k, mode: owns.m } : null }
  })
  const d = { id: `dl-${srv.deadlocks.length + 1}-${now}`, t: now, victim, processes: procs }
  srv.deadlocks.push(d)
  if (srv.deadlocks.length > MAX_KEEP) srv.deadlocks.shift()
  if (srv.errorlog.length >= 60) srv.errorlog.shift()
  srv.errorlog.push({ t: now, text: isSql(srv) ? `Deadlock encountered .... Printing deadlock information. Victim session ${victim}.` : `ORA-00060: Deadlock detected. See Note 60.1 at My Oracle Support for Troubleshooting ORA-60 Errors. More info in file /u01/app/oracle/diag/rdbms/harborcdb/HARBORCDB/trace/HARBORCDB_ora_${victim * 101}.trc.` })
  return d
}
// A deadlock report added by a lab, for the deadlock graph view
export function addDeadlock(state, name, d) {
  const s = upgradeDatabases(structuredClone(state))
  const srv = ensureSeed(serverOf(s, name))
  if (!srv) return s
  srv.deadlocks.push({ id: `dl-${srv.deadlocks.length + 1}-${d.t}`, ...d })
  if (srv.deadlocks.length > MAX_KEEP) srv.deadlocks.shift()
  return s
}

// The xml_deadlock_report of system_health, or the deadlock graph of an Oracle trace file
export function deadlockXml(srv, d) {
  const pid = (x) => `process${hash(`p${x.spid}${d.t}`, 10)}`
  const t = (x) => tablesOf(srv)[x?.t]
  if (!isSql(srv)) {
    const res = (x) => `TX-${hash(x.k ?? '', 8).toUpperCase()}-${hash(x.t ?? '', 8).toUpperCase()}`
    return [
      `*** ${sqlTime(d.t)}`,
      'DEADLOCK DETECTED ( ORA-00060 )',
      '[Transaction Deadlock]',
      'The following deadlock is not an ORACLE error. It is a',
      'deadlock due to user error in the design of an application',
      'or from issuing incorrect ad-hoc SQL. The following',
      'information may aid in determining the deadlock:',
      '',
      'Deadlock graph:',
      '                                          ------------Blocker(s)-----------  ------------Waiter(s)------------',
      'Resource Name                             process session holds waits serial  process session holds waits serial',
      ...d.processes.filter((x) => x.owns).map((x) => {
        const waiter = d.processes.find((y) => y.waits?.k === x.owns.k && y.spid !== x.spid)
        return `${res(x.owns).padEnd(42)}${String(40 + x.spid).padStart(7)} ${String(x.spid).padStart(7)}     X       ${String(x.serial).padStart(6)}  ${String(40 + (waiter?.spid ?? 0)).padStart(7)} ${String(waiter?.spid ?? '').padStart(7)}           X ${String(waiter?.serial ?? '').padStart(6)}`
      }),
      '',
      ...d.processes.map((x) => `Rows waited on:\n  Session ${x.spid}: obj - rowid = ${hash(x.waits?.t ?? '', 8).toUpperCase()} - AAAS${hash(x.waits?.k ?? '', 10)}\n  (dictionary objn - ${parseInt(hash(x.waits?.t ?? '', 4), 16)}, file - 12, block - ${parseInt(hash(x.waits?.k ?? '', 4), 16)}, slot - 3)`),
      '',
      ...d.processes.map((x) => `----- Information for waiting session ${x.spid} -----\nsession ${x.spid}: DID 0001-${String(40 + x.spid).padStart(4, '0')}-00000A2B session serial # ${x.serial}\n  pid ${40 + x.spid} O/S info: user: oracle, term: UNKNOWN, ospid: ${x.spid * 113}\n    image: oracle@ora.harbor.lab\n  client details:\n    O/S info: user: mule, term: unknown, ospid: 1234\n    machine: ${x.host} program: ${x.program}\n  current SQL:\n  ${x.sql}`),
      '',
      `Session ${d.victim} was rolled back to the start of its statement (ORA-00060). Its transaction stays open.`,
    ].join('\n')
  }
  const lines = ['<deadlock>', ' <victim-list>', `  <victimProcess id="${pid(d.processes.find((x) => x.spid === d.victim) ?? d.processes[0])}" />`, ' </victim-list>', ' <process-list>']
  for (const x of d.processes)
    lines.push(
      `  <process id="${pid(x)}" taskpriority="0" logused="${x.logused}" waitresource="${x.waits ? waitResource(srv, x.waits.t, x.waits.k) : ''}" waittime="${4000 + x.spid}" ownerId="${parseInt(hash(`o${x.spid}`, 6), 16)}" transactionname="user_transaction" lasttranstarted="${iso(x.tranStarted).slice(0, 23)}" XDES="0x${hash(`x${x.spid}`, 12)}" lockMode="${x.waits?.mode ?? 'X'}" schedulerid="${(x.spid % 4) + 1}" kpid="${x.spid * 97}" status="suspended" spid="${x.spid}" sbid="0" ecid="0" priority="0" trancount="2" lastbatchstarted="${iso(d.t - 4000).slice(0, 23)}" clientapp="${x.program}" hostname="${x.host}" loginname="${x.login}" isolationlevel="${x.isolation} (${{ 'read uncommitted': 1, 'read committed': 2, 'repeatable read': 3, serializable: 4, snapshot: 5 }[x.isolation] ?? 2})" xactid="${parseInt(hash(`t${x.spid}`, 6), 16)}" currentdb="${srv.dbid}" currentdbname="${srv.database}" lockTimeout="4294967295">`,
      '   <executionStack>',
      `    <frame procname="adhoc" line="1" stmtstart="58" sqlhandle="0x02000000${hash(x.sql, 32)}">`,
      `${escapeXml(x.sql)}    </frame>`,
      '   </executionStack>',
      `   <inputbuf>\n${escapeXml(x.sql)}   </inputbuf>`,
      '  </process>',
    )
  lines.push(' </process-list>', ' <resource-list>')
  for (const x of d.processes.filter((p) => p.owns)) {
    const waiter = d.processes.find((y) => y.waits?.k === x.owns.k && y.waits?.t === x.owns.t && y.spid !== x.spid)
    lines.push(
      `  <keylock hobtid="7205759404${String(Object.keys(tablesOf(srv)).indexOf(x.owns.t) + 1).padStart(2, '0')}57792" dbid="${srv.dbid}" objectname="${srv.database}.${x.owns.t}" indexname="${t(x.owns)?.pkName ?? 'PK'}" id="lock${hash(x.owns.k, 12)}" mode="${x.owns.mode}" associatedObjectId="7205759404${String(Object.keys(tablesOf(srv)).indexOf(x.owns.t) + 1).padStart(2, '0')}57792">`,
      '   <owner-list>',
      `    <owner id="${pid(x)}" mode="${x.owns.mode}" />`,
      '   </owner-list>',
      '   <waiter-list>',
      waiter ? `    <waiter id="${pid(waiter)}" mode="${waiter.waits.mode}" requestType="wait" />` : '',
      '   </waiter-list>',
      '  </keylock>',
    )
  }
  lines.push(' </resource-list>', '</deadlock>')
  return lines.filter((l) => l !== '').join('\n')
}
const escapeXml = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ---------- blocked statements ----------

// What a statement does when it meets a lock: SSMS and SQL Developer wait with no end, a Mule app waits for its query
// timeout, or with none for as long as the lock stays. The lab query window stops a wait after 5 seconds (lab-made)
// so the page never hangs: SET LOCK_TIMEOUT 5000 on SQL Server, a WAIT 5 on Oracle.
function onBlocked(srv, sess, st, r, opts) {
  const b = r.blocked
  const ids = cycle(srv, sess.id, b.holder)
  if (ids) {
    // the lock monitor: the transaction that is cheapest to roll back is the victim
    const cost = (id) => sessionOf(srv, id).undo.length
    const victim = [...ids].sort((a, c) => cost(a) - cost(c) || c - a)[0]
    const d = recordDeadlock(srv, opts.now, ids, victim, { s: sess.id, t: b.t, k: b.k, mode: b.mode, sql: opts.text })
    if (victim === sess.id) {
      if (isSql(srv)) rollback(srv, sess)
      return { ...ERR.deadlock(srv, sess.id), ms: 4000, deadlockId: d.id }
    }
    const v = sessionOf(srv, victim)
    victimOut(srv, v, opts.now, opts.s)
    const again = execute(srv, sess, st, opts)
    // Oracle rolls back only the statement of the victim, so its row locks stay and this statement waits on. The
    // victim no longer waits, so there is no cycle now and the wait ends as any other wait (lock timeout or hang).
    return again.blocked ? onBlocked(srv, sess, st, again, opts) : again
  }
  if (opts.wait === 'lockTimeout') return { ok: false, ...vendorError(srv, 'lockTimeout'), ms: 5000, blockedBy: b.holder }
  if (opts.queryTimeout > 0) {
    // the driver cancels the statement after the query timeout; the transaction it was in stays open
    return { ...ERR.timeout(srv), ms: opts.queryTimeout * 1000, blockedBy: b.holder }
  }
  sess.status = 'suspended'
  sess.wait = { type: waitType(srv, b.mode), resource: isSql(srv) ? waitResource(srv, b.t, b.k) : `${waitResource(srv, b.t, b.k)}`, mode: b.mode, t: b.t, k: b.k, since: opts.now }
  sess.blockedBy = b.holder
  sess.pending = { st, text: opts.text, params: opts.params, kind: st.kind }
  return { ok: false, hung: true, blockedBy: b.holder, text: `The statement waits for a lock that session ${b.holder} holds (${sess.wait.type}).` }
}
// The deadlock victim that was waiting: SQL Server rolls back its transaction; Oracle rolls back its statement
function victimOut(srv, v, now, s) {
  const e = ERR.deadlock(srv, v.id)
  if (isSql(srv)) rollback(srv, v)
  v.status = 'sleeping'
  v.wait = null
  v.blockedBy = null
  v.pending = null
  v.lastError = { t: now, ...e }
  if (v.app && s) appLog(s, v.app, v.env, 'ERROR', `DB:QUERY_EXECUTION ${e.text}`)
  // a Mule app rolls the transaction back after the error and returns the connection to its pool
  if (v.kind === 'app') {
    if (!isSql(srv)) rollback(srv, v)
    v.inUse = false
  }
}

// ---------- the apps: pools and ctx.db ----------

// A Mule Database config as the lab reads it. Field names follow the connector: user, password, maxPoolSize,
// maxWait (seconds), queryTimeout (seconds), fetchSize, transactionIsolation, and for this lab transactionTimeout (s).
export function configOf(cfg = {}) {
  const n = (v, d) => (v === undefined || v === null || String(v).trim() === '' || Number.isNaN(Number(v)) ? d : Number(v))
  return {
    user: String(cfg.user ?? ''),
    password: String(cfg.password ?? ''),
    database: cfg.database ?? null,
    service: cfg.service ?? null,
    // host and port of the connection, and an Oracle SID instead of a service name; left out, the lab does not check them
    host: String(cfg.host ?? '').trim() || null,
    port: String(cfg.port ?? '').trim() || null,
    sid: String(cfg.sid ?? '').trim() || null,
    maxPoolSize: Math.max(1, n(cfg.maxPoolSize ?? cfg.poolSize, 5)),
    maxWait: Math.max(0, n(cfg.maxWait, 0)),
    queryTimeout: Math.max(0, n(cfg.queryTimeout, 0)),
    fetchSize: Math.max(1, n(cfg.fetchSize, 10)),
    maxRows: n(cfg.maxRows, 0) || null,
    isolation: String(cfg.transactionIsolation ?? cfg.isolation ?? 'NOT_CONFIGURED').toUpperCase(),
    transactionTimeout: Math.max(0, n(cfg.transactionTimeout, 0)),
  }
}
const ISO_OF = { READ_UNCOMMITTED: 'read uncommitted', READ_COMMITTED: 'read committed', REPEATABLE_READ: 'repeatable read', SERIALIZABLE: 'serializable' }
const replicaOf = (app) => `${String(app?.name ?? 'mule').slice(0, 18)}-${hash(`${app?.name}${app?.config}`, 5)}-x2k9p`

function appLog(s, name, env, level, text) {
  const a = s?.apps?.find((x) => x.name === name && x.env === env)
  if (!a) return
  a.logs.push({ t: s.clock, level, text, logger: 'org.mule.extension.db.internal.DbConnector', config: a.config })
  if (a.logs.length > 120) a.logs.splice(0, a.logs.length - 120)
}

// Checks the login and takes a connection from the pool of the app. A free connection is reused; a new one is opened
// up to maxPoolSize; a full pool waits maxWait seconds (0: with no end).
function checkout(s, srv, app, c) {
  if (c.host && c.host.toLowerCase() !== srv.host.toLowerCase()) return ERR.unreachable(srv, c.host, c.port ?? srv.port, false)
  if (c.port && Number(c.port) !== srv.port) return ERR.unreachable(srv, c.host ?? srv.host, c.port, true)
  if (!srv.up) return ERR.down(srv)
  // lab-made: the SID of the container database leads to CDB$ROOT, where the local user of the PDB does not exist
  if (!isSql(srv) && c.sid) return c.sid.toUpperCase() === (srv.sid ?? 'HARBORCDB') ? ERR.login(srv, c.user) : ERR.sid(srv, c.sid)
  if (!isSql(srv) && c.service && c.service.toUpperCase() !== srv.service.toUpperCase()) return ERR.service(srv, c.service)
  if (isSql(srv) && c.database && c.database.toLowerCase() !== srv.database.toLowerCase()) return ERR.database(srv, c.database, c.user)
  const login = srv.logins.find((l) => (isSql(srv) ? l.name.toLowerCase() === c.user.toLowerCase() : l.name === c.user.toUpperCase()))
  if (!login || login.password === null) return ERR.login(srv, c.user)
  if (login.disabled || login.status === 'LOCKED') return ERR.locked(srv, c.user)
  if (login.password !== c.password) {
    login.failed = (login.failed ?? 0) + 1
    // the APP_USERS profile of the lab locks an account after 10 failed logins, as FAILED_LOGIN_ATTEMPTS 10 does
    if (!isSql(srv) && login.failed >= 10) login.status = 'LOCKED'
    srv.errorlog.push({ t: s.clock, text: isSql(srv) ? `Login failed for user '${c.user}'. Reason: Password did not match that for the login provided. [CLIENT: 10.40.${app ? 12 : 1}.${(hash(app?.name ?? 'x', 2).charCodeAt(0) % 200) + 20}]` : `ORA-01017 for user ${c.user.toUpperCase()} from ${replicaOf(app)}` })
    if (srv.errorlog.length > 60) srv.errorlog.shift()
    return ERR.login(srv, c.user)
  }
  login.failed = 0
  // SQL Server: a login with no user in the database cannot open it. Oracle: a new user needs CREATE SESSION.
  if (isSql(srv) && !login.sysadmin && !srv.users.some((u) => u.login.toLowerCase() === login.name.toLowerCase())) return ERR.database(srv, c.database ?? srv.database, c.user)
  if (!isSql(srv) && login.created !== undefined && !login.sysadmin && !(login.privs ?? []).includes('CREATE SESSION') && !srv.users.find((u) => u.login === login.name)?.roles.some((r) => r === 'CONNECT' || r === 'DBA')) return ERR.noSession(srv, login.name)
  const name = app?.name ?? 'unknown'
  const pool = (srv.pools[name] ??= { app: name, env: app?.env ?? 'Sandbox', sessions: [], timeouts: 0, waits: 0, lastError: null, cfg: null })
  pool.cfg = { ...c, password: c.password ? '********' : '' }
  pool.max = c.maxPoolSize
  pool.sessions = pool.sessions.filter((id) => sessionOf(srv, id))
  const free = pool.sessions.map((id) => sessionOf(srv, id)).find((x) => !x.inUse)
  if (free) {
    free.inUse = true
    return { ok: true, sess: free, pool }
  }
  if (pool.sessions.length < c.maxPoolSize) {
    const sess = newSession(srv, s.clock, { login: isSql(srv) ? c.user : c.user.toUpperCase(), host: replicaOf(app), program: isSql(srv) ? 'Microsoft JDBC Driver for SQL Server' : 'JDBC Thin Client', app: name, env: app?.env ?? 'Sandbox', config: app?.config ?? null, inUse: true })
    pool.sessions.push(sess.id)
    return { ok: true, sess, pool }
  }
  pool.waits++
  if (c.maxWait > 0) {
    pool.timeouts++
    pool.lastError = { t: s.clock, text: ERR.pool().text }
    return { ...ERR.pool(), ms: c.maxWait * 1000 }
  }
  pool.lastError = { t: s.clock, text: 'A flow waits for a free connection. maxWait is 0, so it waits with no limit.' }
  return { ok: false, hung: true, pool: true, text: `All ${c.maxPoolSize} connections of the pool are in use and maxWait is 0, so the flow waits for a free one with no limit.` }
}
const checkin = (sess) => {
  sess.inUse = false
  sess.status = 'sleeping'
}

const OPERATION = { select: ['select'], insert: ['insert'], update: ['update'], delete: ['delete'], ddl: ['createIndex'] }
const typeName = (k) => ({ select: 'SELECT', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE', createIndex: 'DDL' })[k] ?? 'UNKNOWN'

// One operation of the connector on a session. Errors carry the Mule error type.
function runOn(s, srv, sess, op, sql, params, c) {
  const st = parseSql(sql, srv.vendor)
  if (st.kind === 'error' || st.kind === 'unsupported' || st.kind === 'empty') {
    const e = vendorError(srv, 'syntax', { near: st.near ?? '', code: st.oraCode })
    return isSql(srv) ? fail('DB:QUERY_EXECUTION', sqlEx(e.text), { code: e.code, ms: 5 }) : fail('DB:BAD_SQL_SYNTAX', `java.sql.SQLSyntaxErrorException: ${e.text}`, { code: e.code, ms: 5 })
  }
  if (!OPERATION[op].includes(st.kind)) return fail('DB:BAD_SQL_SYNTAX', `Query type must be one of '[${op === 'ddl' ? 'DDL' : op.toUpperCase()}, STORE_PROCEDURE_CALL]' but query '${norm(sql)}' is of type '${typeName(st.kind)}'`, { ms: 2 })
  if (c.isolation in ISO_OF && !sess.openTran) sess.isolation = isSql(srv) ? ISO_OF[c.isolation] : c.isolation === 'SERIALIZABLE' ? 'SERIALIZABLE' : 'READ COMMITTED'
  sess.status = 'running'
  const opts = { params, now: s.clock, text: norm(sql), queryTimeout: c.queryTimeout, fetchSize: c.fetchSize, maxRows: c.maxRows, wait: 'hang', autocommit: !sess.openTran, s }
  let r = execute(srv, sess, st, opts)
  if (r.blocked) r = onBlocked(srv, sess, st, r, opts)
  if (r.hung) return r
  sess.status = 'sleeping'
  if (r.ok) return { ok: true, rows: r.rows ?? [], count: r.count ?? 0, affected: r.affected ?? 0, ms: Math.round(r.ms ?? 2), plan: r.plan ? planSummary(r.plan) : null }
  if (r.errorType) return r
  // Oracle raises a syntax or name error as java.sql.SQLSyntaxErrorException; the SQL Server driver uses SQLServerException for all
  if (!isSql(srv) && ['syntax', 'object', 'column', 'func', 'notSupported'].includes(r.kind)) return fail('DB:BAD_SQL_SYNTAX', `java.sql.SQLSyntaxErrorException: ${r.text}`, { code: r.code, ms: 5 })
  return fail('DB:QUERY_EXECUTION', isSql(srv) ? sqlEx(r.text) : oraEx(r.text), { code: r.code, ms: 5, plan: r.plan ? planSummary(r.plan) : null })
}
const planSummary = (p) => ({ access: p.access.kind, op: p.ops.at(-1).op, index: p.access.index, est: p.est, rowsRead: p.access.rowsRead, ms: p.ms, missing: p.missing, nonSargable: p.nonSargable })

// ctx.db for the sample apps. Each call names a database and gives the Mule config of the app.
export function dbCtx(s, app) {
  const on = (name, fn) => {
    const srv = ensureSeed(serverOf(upgradeDatabases(s), name))
    if (!srv) return fail('DB:CONNECTIVITY', `Could not obtain connection from data source. Caused by: java.net.UnknownHostException: ${name}`, { ms: 30 })
    return fn(srv)
  }
  const single = (op) => (name, cfg, sql, params) =>
    on(name, (srv) => {
      const c = configOf(cfg)
      const got = checkout(s, srv, app, c)
      if (!got.ok) return got
      const r = runOn(s, srv, got.sess, op, sql, params, c)
      if (!r.hung) checkin(got.sess)
      if (!r.ok && !r.hung && got.pool) got.pool.lastError = { t: s.clock, text: r.text }
      return r
    })
  return {
    select: single('select'),
    insert: single('insert'),
    update: single('update'),
    delete: single('delete'),
    executeDdl: (name, cfg, sql) => single('ddl')(name, cfg, sql, null),
    // one statement for many rows in one batch; with autocommit the rows before a failure stay
    bulkInsert: (name, cfg, sql, list) =>
      on(name, (srv) => {
        const c = configOf(cfg)
        const got = checkout(s, srv, app, c)
        if (!got.ok) return got
        let affected = 0
        let ms = 5
        for (const params of list ?? []) {
          const r = runOn(s, srv, got.sess, 'insert', sql, params, c)
          if (r.hung) return r
          if (!r.ok) {
            checkin(got.sess)
            return { ...r, affected, text: `java.sql.BatchUpdateException: ${r.text.replace(/^[\w.]+Exception: /, '')}`, failedAt: affected }
          }
          affected += r.affected
          ms += 0.4
        }
        checkin(got.sess)
        return { ok: true, affected, ms: Math.round(ms) }
      }),
    // A transaction on one connection: fn(tx) runs the operations; an error rolls everything back. tx.hold(reason)
    // keeps the transaction open after fn returns, as a flow does while it waits inside the Try scope for a remote call
    // that does not answer. It ends when cfg.transactionTimeout passes (rolled back), or when the session is killed.
    transaction: (name, cfg, fn) =>
      on(name, (srv) => {
        const c = configOf(cfg)
        const got = checkout(s, srv, app, c)
        if (!got.ok) return got
        const sess = got.sess
        if (isSql(srv) && c.isolation in ISO_OF) sess.isolation = ISO_OF[c.isolation]
        sess.openTran = 1
        sess.tranStarted = s.clock
        let held = null
        let failed = null
        let ms = 0
        const step = (op) => (sql, params) => {
          if (failed) return failed
          const r = runOn(s, srv, sess, op, sql, params, c)
          if (!r.ok) failed = r
          else ms += r.ms
          return r
        }
        const tx = { select: step('select'), insert: step('insert'), update: step('update'), delete: step('delete'), executeDdl: (sql) => step('ddl')(sql), hold: (reason) => void (held = reason ?? 'The flow waits inside the transaction.') }
        const out = fn(tx)
        if (failed?.hung) {
          // lab-made: the caller of the flow has given up; the statement still waits and the lab rolls the
          // transaction back once the lock comes free
          sess.pending = { ...sess.pending, rollbackAfter: true }
          return { ...failed, ms }
        }
        if (failed) {
          if (sessionOf(srv, sess.id)) {
            rollback(srv, sess)
            checkin(sess)
          }
          return { ...failed, rolledBack: true, value: out }
        }
        if (out?.rollback) {
          rollback(srv, sess)
          checkin(sess)
          return { ok: true, rolledBack: true, ms, value: out }
        }
        if (held) {
          sess.openTran = 1
          sess.hold = { reason: held, since: s.clock, until: c.transactionTimeout > 0 ? s.clock + c.transactionTimeout * 1000 : null }
          sess.status = 'sleeping'
          return { ok: true, held: true, ms, value: out, session: sess.id }
        }
        commit(srv, sess)
        checkin(sess)
        return { ok: true, ms, value: out }
      }),
    pool: (name) => serverOf(s, name)?.pools[app?.name] ?? null,
  }
}

// ---------- the clock ----------

// Ends a session: its transaction is rolled back and its locks go, and waiting sessions may go on
function endSession(s, srv, sess, why) {
  rollback(srv, sess)
  srv.sessions = srv.sessions.filter((x) => x !== sess)
  for (const p of Object.values(srv.pools)) p.sessions = p.sessions.filter((id) => id !== sess.id)
  void why
}

// Statements that wait go on once their lock is free. Runs until nothing changes.
function resolveWaits(s, srv) {
  for (let round = 0; round < 10; round++) {
    let moved = false
    for (const sess of srv.sessions.filter((x) => x.pending)) {
      if (sessionOf(srv, sess.blockedBy)?.id && srv.locks.some((l) => l.s === sess.blockedBy && l.t === sess.wait?.t && l.k === sess.wait?.k)) continue
      const p = sess.pending
      sess.pending = null
      sess.wait = null
      sess.blockedBy = null
      const o = { params: p.params, now: s.clock, text: p.text, queryTimeout: 0, wait: 'hang', autocommit: !sess.openTran, s }
      const r = execute(srv, sess, p.st, o)
      if (r.blocked) {
        onBlocked(srv, sess, p.st, r, o)
        if (sess.pending) sess.pending.rollbackAfter = p.rollbackAfter
        continue
      }
      moved = true
      if (p.rollbackAfter || sess.openTran) rollback(srv, sess)
      if (sess.kind === 'app') checkin(sess)
      else sess.status = 'sleeping'
    }
    if (!moved) break
  }
}

export function dbTick(s) {
  upgradeDatabases(s)
  for (const srv of Object.values(s.databases?.servers ?? {})) {
    for (const sess of [...srv.sessions]) {
      if (sess.kind !== 'app') continue
      const a = s.apps?.find((x) => x.name === sess.app && x.env === sess.env)
      // a stopped or redeployed app closes its connections, and the server rolls back what they had open
      if (!a || a.status === 'Stopped' || a.status === 'Failed' || (a.status === 'Running' && sess.config !== null && a.config !== sess.config)) {
        if (sess.openTran) srv.kills.push({ t: s.clock, id: sess.id, serial: sess.serial, app: sess.app, env: sess.env, login: sess.login, openTran: sess.openTran, undo: sess.undo.length, blocked: srv.sessions.filter((x) => x.blockedBy === sess.id).length, held: Boolean(sess.hold), by: 'restart' })
        endSession(s, srv, sess, 'app')
        continue
      }
      if (sess.hold?.until && s.clock >= sess.hold.until) {
        appLog(s, sess.app, sess.env, 'ERROR', `Transaction timeout: the transaction of the flow was open longer than ${Math.round((sess.hold.until - sess.hold.since) / 1000)} s and was rolled back.`)
        rollback(srv, sess)
        checkin(sess)
      }
    }
    resolveWaits(s, srv)
    if (srv.plans.length > MAX_KEEP) srv.plans.splice(0, srv.plans.length - MAX_KEEP)
    if (srv.kills.length > MAX_KEEP) srv.kills.splice(0, srv.kills.length - MAX_KEEP)
  }
  return s
}

// ---------- console actions (state in, new state out) ----------

const consoleOf = (srv, now) => {
  let c = srv.console && sessionOf(srv, srv.console)
  if (!c) {
    // a killed query window connects again with a new session
    c = consoleSession(srv.nextSpid++, null, srv.vendor, now)
    if (!isSql(srv)) c.serial = ((c.id * 7919 + 31) % 60000) + 1000
    srv.sessions.push(c)
    srv.console = c.id
  }
  return c
}
// splits a script into batches: GO on its own line, or ; between statements
export const splitScript = (text) =>
  String(text ?? '')
    .split(/^\s*go\s*$/im)
    .flatMap((batch) => splitTop(batch.replace(/\n/g, ' \n'), /^;/))
    .map((x) => x.trim())
    .filter(Boolean)

// The query window: runs each statement of the script on the console session. Returns grids, messages and plans.
export function runSql(state, name, text, { actualPlan = false } = {}) {
  const s = upgradeDatabases(structuredClone(state))
  const srv = ensureSeed(serverOf(s, name))
  if (!srv) return { state, out: { grids: [], messages: [`Cannot connect to ${name}.`], error: true } }
  const out = { grids: [], messages: [], plans: [], error: false, ms: 0 }
  const sess = consoleOf(srv, s.clock)
  for (const part of splitScript(text)) {
    const st = parseSql(part, srv.vendor)
    if (st.kind === 'kill') {
      const k = kill(s, srv, st.id, sess.id, st.serial)
      if (!k.ok) {
        out.messages.push(k.window)
        out.error = true
        break
      }
      out.messages.push(isSql(srv) ? 'Commands completed successfully.' : 'System altered.')
      continue
    }
    const opts = { params: null, now: s.clock, text: norm(part), queryTimeout: 0, wait: 'lockTimeout', s }
    let r = execute(srv, sess, st, opts)
    if (r.blocked) r = onBlocked(srv, sess, st, r, opts)
    if (!r.ok) {
      out.messages.push(r.window ?? r.text)
      if (r.lab) out.messages.push(`(Lab) ${r.lab}`)
      out.error = true
      break
    }
    if (r.grid) out.grids.push(r.grid)
    // when a table was last read in the query window, for a lab that asks the learner to look at what an app wrote
    const read = st.kind === 'select' && !virtualRows(srv, st.from, s.clock) && tableKeyOf(srv, st.from)
    if (read) s.seen = { ...s.seen, [`db-select:${name}:${read}`]: s.clock }
    if (r.index) out.messages.push(isSql(srv) ? `Index ${r.index} created on ${clean(st.from)} in ${(r.ms / 1000).toFixed(1)} s.` : '')
    out.messages.push(...r.messages.filter(Boolean))
    if (isSql(srv) && !r.grid && !r.messages.length && !r.index) out.messages.push('Commands completed successfully.')
    out.ms += r.ms ?? 1
    if (r.plan && (actualPlan || st.kind === 'explain')) {
      const p = { ...r.plan, sql: norm(part), t: s.clock, actual: st.kind !== 'explain' }
      srv.plans.push(p)
      out.plans.push(p)
    }
  }
  if (isSql(srv)) out.messages.push('', `Completion time: ${iso(s.clock).replace('Z', '+00:00')}`)
  return { state: s, out }
}

// Display Estimated Execution Plan (SSMS) or Explain Plan (SQL Developer) for the first statement of the script
export function showPlan(state, name, text) {
  const s = upgradeDatabases(structuredClone(state))
  const srv = ensureSeed(serverOf(s, name))
  if (!srv) return { ok: false, state, text: `Cannot connect to ${name}.` }
  const sess = consoleOf(srv, s.clock)
  const part = splitScript(text).find((x) => /^(select|update|delete)\b/i.test(x))
  if (!part) return { ok: false, state, text: isSql(srv) ? 'Msg 0: The script has no SELECT, UPDATE or DELETE to show a plan for.' : 'Explain Plan needs a SELECT, UPDATE or DELETE.' }
  const st = parseSql(part, srv.vendor)
  if (virtualRows(srv, st.from ?? '', s.clock)) return { ok: false, state, text: 'The plan of a dynamic management view is not shown in the lab.' }
  const r = prepare(srv, sess, st, { params: null, now: s.clock, q: 0, sql: isSql(srv) })
  if (!r.ok) {
    const e = r.error ? vendorError(srv, r.error.error, r.error) : r
    return { ok: false, state, text: e.window ?? e.text }
  }
  const plan = { ...planOf(srv, r.tk, r.q), sql: norm(part), t: s.clock, actual: false }
  srv.plans.push(plan)
  if (srv.plans.length > MAX_KEEP) srv.plans.shift()
  return { ok: true, state: s, plan }
}

// The plan the app's own query gets, for a lab that wants to show it (parameters as the app binds them)
export function planForApp(state, name, sql, params) {
  const found = serverOf(state, name)
  if (!found) return null
  const srv = { ...found, tables: tablesOf(found), logins: loginsOf(found), users: usersOf(found) }
  const st = parseSql(sql, srv.vendor)
  const r = prepare(srv, { login: '' }, st, { params, now: state.clock, q: 0, sql: isSql(srv) })
  return r.ok ? planOf(srv, r.tk, r.q) : null
}

function kill(s, srv, id, by, serial) {
  const target = sessionOf(srv, id)
  if (id === by) return { ok: false, ...vendorError(srv, 'killSelf') }
  if (isSql(srv) && id <= 50) return { ok: false, ...vendorError(srv, 'killSystem') }
  if (!target || (serial !== undefined && target.serial !== serial)) return { ok: false, ...vendorError(srv, 'killMissing', { id }) }
  srv.kills.push({ t: s.clock, id, serial: target.serial, app: target.app, env: target.env, login: target.login, openTran: target.openTran, undo: target.undo.length, blocked: srv.sessions.filter((x) => x.blockedBy === id).length, held: Boolean(target.hold), by: 'kill' })
  if (target.app && target.inUse) appLog(s, target.app, target.env, 'WARN', isSql(srv) ? `Session ${id} on ${srv.host} was killed. The connection is closed and its transaction was rolled back.` : `ORA-00028: your session has been killed (SID ${id}, SERIAL# ${target.serial}). The transaction was rolled back.`)
  endSession(s, srv, target, 'kill')
  if (srv.console === id) srv.console = null
  resolveWaits(s, srv)
  return { ok: true, serial: target.serial }
}
// Activity Monitor, Kill Process
export function killSession(state, name, id) {
  const s = upgradeDatabases(structuredClone(state))
  const srv = ensureSeed(serverOf(s, name))
  if (!srv) return { ok: false, state, text: `Cannot connect to ${name}.` }
  const me = consoleOf(srv, s.clock)
  const r = kill(s, srv, Number(id), me.id)
  if (!r.ok) return { ok: false, state, text: r.window }
  return { ok: true, state: s, text: isSql(srv) ? `KILL ${id}: Commands completed successfully.` : `ALTER SYSTEM KILL SESSION '${id},${r.serial ?? ''}': System altered.` }
}

// ---------- views for the screen ----------

// The sessions with what Activity Monitor computes: the head blocker of each chain and how long each waits
export function activityOf(srv, now) {
  const blocking = new Set(srv.sessions.map((x) => x.blockedBy).filter(Boolean))
  const head = (x) => {
    let cur = x
    const seen = new Set()
    while (cur?.blockedBy && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = sessionOf(srv, cur.blockedBy)
    }
    return cur?.id ?? null
  }
  return srv.sessions.map((x) => ({
    ...x,
    waitMs: x.wait ? now - x.wait.since : 0,
    headBlocker: blocking.has(x.id) && !x.blockedBy,
    head: x.blockedBy ? head(x) : null,
    blocks: srv.sessions.filter((y) => y.blockedBy === x.id).length,
    locks: srv.locks.filter((l) => l.s === x.id),
    tranMs: x.tranStarted !== null && x.tranStarted !== undefined ? now - x.tranStarted : 0,
  }))
}
export const poolsOf = (srv) =>
  Object.values(srv.pools).map((p) => {
    const list = p.sessions.map((id) => sessionOf(srv, id)).filter(Boolean)
    return { ...p, open: list.length, inUse: list.filter((x) => x.inUse).length, idle: list.filter((x) => !x.inUse).length, waiting: list.filter((x) => x.wait).length, held: list.filter((x) => x.hold).length }
  })
export const tableKeys = (srv) => Object.keys(tablesOf(srv))
export const indexList = (t) => indexesOf(t)
export { sqlTime, waitResource }
// how long a plan takes, as text
export const msText = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`)
export const MINUTE_MS = MINUTE
