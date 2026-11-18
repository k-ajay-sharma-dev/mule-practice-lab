// Logging Lab exercises, set 14. See ../exercises.js for the format.
// Theme: FTP transfers and SQL Server loads in a retail data hub. Transfers, modes, retries, fixed width exports,
// connection pools, bulk loads, deadlocks, delta extracts and plan merges.
import { corr, errorFacts, labelled, noPayload, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
const noPwd = { not: /password|vars\.connectionString/i, say: 'Do not log a password or a connection string.' }
const noSql = { not: /vars\.sqlText|vars\.params/i, say: 'Do not log the full SQL text or its parameter values. Log the statement name.' }

export const SET_14 = [
  // ---------- lg-171 Marrow & Pine Home: FTP downloads ----------
  {
    id: 'log-14001',
    kind: 'level',
    situation: 'Marrow & Pine Home downloaded a supplier cost file over FTP. The size matched the server listing.',
    answer: ['INFO'],
    explain: 'A finished transfer gets one INFO line.',
  },
  {
    id: 'log-14002',
    kind: 'choice',
    situation: 'Which line best records the FTP download?',
    options: [
      'FTP download finished host=ftp.supplier-b.example path=/out/costs.zip sizeBytes=4101118 serverSize=4101118 mode=BINARY durationMs=5200',
      'Downloaded file',
      'ftp://marrow-int:<password>@ftp.supplier-b.example/out/costs.zip',
      'Costs: <file content>',
    ],
    answer: 0,
    explain: 'Both sizes and the mode show the copy was exact. An FTP URL with the password must never be logged.',
  },
  {
    id: 'log-14003',
    kind: 'multi',
    situation: 'A zip arrived broken. Which facts on the download line help?',
    options: ['The size read', 'The size on the server', 'The transfer mode', 'The supplier contact name'],
    answers: [0, 1, 2],
    explain: 'Different sizes with ASCII mode explain a broken zip at once.',
  },
  {
    id: 'log-14004',
    kind: 'write',
    situation:
      'A Marrow & Pine FTP download finished. vars.host, vars.path, vars.sizeBytes, vars.serverSize, vars.mode and vars.durationMs hold the facts. Write the line.',
    available: ['vars.host', 'vars.path', 'vars.sizeBytes', 'vars.serverSize', 'vars.mode', 'vars.durationMs', 'vars.password', 'payload'],
    level: ['INFO'],
    checks: [
      says(/download(ed)? (finished|complete)|downloaded/i, 'FTP download finished'),
      labelled('host'),
      labelled('path'),
      labelled('sizeBytes'),
      labelled('serverSize'),
      labelled('mode'),
      durationVar,
      noPwd,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["FTP download finished host=$(vars.host) path=$(vars.path) sizeBytes=$(vars.sizeBytes) serverSize=$(vars.serverSize) mode=$(vars.mode) durationMs=$(vars.durationMs)"]',
    },
    explain: 'A size mismatch is the first sign of a bad transfer.',
  },
  {
    id: 'log-14005',
    kind: 'write',
    situation:
      'A Marrow & Pine download read fewer bytes than the server size. The file is not loaded and will be downloaded again. vars.path, vars.sizeBytes and vars.serverSize hold the facts. Write the line.',
    available: ['vars.path', 'vars.sizeBytes', 'vars.serverSize', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/size mismatch|incomplete|does not match/i, 'Download size mismatch'),
      labelled('path'),
      labelled('sizeBytes'),
      labelled('serverSize'),
      next('next=download again'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Download size mismatch path=$(vars.path) sizeBytes=$(vars.sizeBytes) serverSize=$(vars.serverSize) next=download again"]',
    },
    explain: 'The retry should fix it. Repeated mismatches need an ERROR.',
  },

  // ---------- lg-172 Marrow & Pine Home: FTP connections and modes ----------
  {
    id: 'log-14006',
    kind: 'level',
    situation: 'An FTP LIST command timed out after login worked. The job will try again in passive mode at the next run.',
    answer: ['ERROR', 'WARN'],
    explain: 'No files move until someone fixes the mode, so many teams use ERROR.',
  },
  {
    id: 'log-14007',
    kind: 'choice',
    situation: 'Which line best records the timeout?',
    options: [
      'FTP LIST timed out host=ftp.store-net.example passive=false timeoutMs=30000 loginOk=true',
      'Timeout',
      'FTP broken again',
      'LIST failed for user marrow-int with password …',
    ],
    answer: 0,
    explain: 'loginOk=true with passive=false points straight at the data channel.',
  },
  {
    id: 'log-14008',
    kind: 'multi',
    situation: 'Which connector settings are worth logging once at startup?',
    options: ['Host and port', 'Passive or active mode', 'Transfer mode', 'The password'],
    answers: [0, 1, 2],
    explain: 'Settings that change behaviour, never secrets.',
  },
  {
    id: 'log-14009',
    kind: 'write',
    situation:
      'A Marrow & Pine FTP LIST timed out. vars.host, vars.passive and vars.timeoutMs hold the facts. Write the line.',
    available: ['vars.host', 'vars.passive', 'vars.timeoutMs', 'vars.password', 'error.errorType', 'error.description'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/timed out|timeout/i, 'FTP LIST timed out'),
      labelled('host'),
      labelled('passive'),
      labelled('timeoutMs'),
      errorFacts,
      noPwd,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["FTP LIST timed out host=$(vars.host) passive=$(vars.passive) timeoutMs=$(vars.timeoutMs) errorType=$(error.errorType) error=$(error.description)"]',
    },
    explain: 'The mode on the line saves a long hunt.',
  },
  {
    id: 'log-14010',
    kind: 'write',
    situation:
      'A Marrow & Pine FTP connection was refused during the partner maintenance window. The reconnection strategy will retry. vars.partner, vars.host and vars.attempt hold the facts. Write the line.',
    available: ['vars.partner', 'vars.host', 'vars.attempt', 'vars.password', 'error.errorType', 'error.description'],
    level: ['WARN'],
    checks: [
      says(/connect(ion)? (refused|failed)|could not connect/i, 'FTP connection refused'),
      labelled('partner'),
      labelled('host'),
      labelled('attempt'),
      errorFacts,
      next('next=retry with backoff'),
      noPwd,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["FTP connection refused partner=$(vars.partner) host=$(vars.host) attempt=$(vars.attempt) errorType=$(error.errorType) error=$(error.description) next=retry with backoff"]',
    },
    explain: 'The attempt number shows whether retries will outlast the window.',
  },

  // ---------- lg-173 Marrow & Pine Home: FTP uploads to the planning platform ----------
  {
    id: 'log-14011',
    kind: 'level',
    situation: 'An FTP upload timed out on the client, but the file may have arrived. The flow checks for the final file before retrying.',
    answer: ['WARN'],
    explain: 'The result is unknown and a check follows. WARN.',
  },
  {
    id: 'log-14012',
    kind: 'choice',
    situation: 'Which line best records the unknown result?',
    options: [
      'Upload result unknown path=/in/sales_20261118.dat runId=R-1118 errorType=FTP:CONNECTIVITY next=check final file before retry',
      'Upload failed, sending again as sales_20261118_r1.dat',
      'Timeout!!',
      'Sales: <file content>',
    ],
    answer: 0,
    explain: 'It says the result is unknown and what the flow does to avoid a duplicate.',
  },
  {
    id: 'log-14013',
    kind: 'multi',
    situation: 'Which facts help the planning platform skip a repeat?',
    options: ['A run ID', 'The final file name', 'The row count', 'The FTP password'],
    answers: [0, 1, 2],
    explain: 'The same run ID twice means a repeat.',
  },
  {
    id: 'log-14014',
    kind: 'write',
    situation:
      'A Marrow & Pine upload timed out. vars.path and vars.runId hold the facts. The flow will check for the final file before retrying. Write the line.',
    available: ['vars.path', 'vars.runId', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN'],
    checks: [
      says(/unknown|timed out|timeout/i, 'Upload result unknown'),
      labelled('path'),
      labelled('runId'),
      { must: /error\.errorType/, say: 'Add why: errorType=$(error.errorType).' },
      next('next=check final file before retry'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Upload result unknown path=$(vars.path) runId=$(vars.runId) errorType=$(error.errorType) next=check final file before retry"]',
    },
    explain: 'The run ID ties this line to the platform’s import log.',
  },
  {
    id: 'log-14015',
    kind: 'write',
    situation:
      'The check found the final file already on the server with the right size, so no retry is sent. vars.path, vars.runId and vars.sizeBytes hold the facts. Write the line.',
    available: ['vars.path', 'vars.runId', 'vars.sizeBytes', 'payload'],
    level: ['INFO'],
    checks: [
      says(/already (present|uploaded|there)|found|no retry/i, 'File already on server, no retry'),
      labelled('path'),
      labelled('runId'),
      labelled('sizeBytes'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["File already on server, no retry path=$(vars.path) runId=$(vars.runId) sizeBytes=$(vars.sizeBytes)"]',
    },
    explain: 'This line proves the duplicate was avoided.',
  },

  // ---------- lg-174 Marrow & Pine Home: fixed width exports ----------
  {
    id: 'log-14016',
    kind: 'level',
    situation: 'While writing a fixed width location file, a store name was cut to fit its 40 character field.',
    answer: ['WARN', 'INFO'],
    explain: 'The file is valid, but data was shortened. WARN lets the business see it.',
  },
  {
    id: 'log-14017',
    kind: 'choice',
    situation: 'Which line best records the cut value?',
    options: [
      'Field truncated file=locations_20261118.dat record=612 field=storeName width=40 originalLength=47 store=S612',
      'Truncated',
      'Name too long: Marrow & Pine Home Riverside Retail Park …',
      'Bad data',
    ],
    answer: 0,
    explain: 'Which record, field and lengths. The business can then shorten the name at source.',
  },
  {
    id: 'log-14018',
    kind: 'multi',
    situation: 'Which checks belong before a fixed width file is uploaded?',
    options: ['Every record has the exact length', 'The record count matches the trailer', 'Truncated fields are reported', 'The file has a nice colour'],
    answers: [0, 1, 2],
    explain: 'Catch problems before the receiver rejects the whole file.',
  },
  {
    id: 'log-14019',
    kind: 'write',
    situation:
      'A Marrow & Pine field was truncated. vars.fileName, vars.record, vars.field, vars.width, vars.originalLength and vars.store hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.record', 'vars.field', 'vars.width', 'vars.originalLength', 'vars.store', 'vars.value'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/truncat|cut/i, 'Field truncated'),
      labelled('file', 'file=$(vars.fileName)'),
      labelled('record'),
      labelled('field'),
      labelled('width'),
      labelled('originalLength'),
      labelled('store'),
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Field truncated file=$(vars.fileName) record=$(vars.record) field=$(vars.field) width=$(vars.width) originalLength=$(vars.originalLength) store=$(vars.store)"]',
    },
    explain: 'Lengths, not the value itself, keep the line short and safe.',
  },
  {
    id: 'log-14020',
    kind: 'write',
    situation:
      'A Marrow & Pine fixed width file failed its record length check and was not uploaded. vars.fileName, vars.badRecords and vars.recordLength hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.badRecords', 'vars.recordLength', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/length check failed|wrong length|not uploaded/i, 'Record length check failed'),
      labelled('file', 'file=$(vars.fileName)'),
      labelled('badRecords'),
      labelled('recordLength'),
      next('next=not uploaded, fix mapping'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Record length check failed file=$(vars.fileName) badRecords=$(vars.badRecords) recordLength=$(vars.recordLength) next=not uploaded, fix mapping"]',
    },
    explain: 'Stopping here is better than the platform rejecting the file at 02:20.',
  },

  // ---------- lg-175 Marrow & Pine Home: daily reconciliation across transports ----------
  {
    id: 'log-14021',
    kind: 'level',
    situation: 'All 260 stores reported sales today over FTP, SFTP or the file share. Totals match finance.',
    answer: ['INFO'],
    explain: 'A clean reconciliation is worth one INFO line a day.',
  },
  {
    id: 'log-14022',
    kind: 'choice',
    situation: 'Which line best records the daily reconciliation?',
    options: [
      'Sales reconciled date=2026-11-18 stores=260 expected=260 ftp=180 sftp=72 share=8 hubTotal=1750000.00 financeTotal=1750000.00',
      'Recon ok',
      'Stores: <260 store totals>',
      'All good today',
    ],
    answer: 0,
    explain: 'Counts by source and both totals in one line.',
  },
  {
    id: 'log-14023',
    kind: 'multi',
    situation: 'Which facts help find where a gap starts?',
    options: ['Counts by source', 'Totals by source', 'Stores missing', 'Each sale line'],
    answers: [0, 1, 2],
    explain: 'Narrow it to a source or a store first.',
  },
  {
    id: 'log-14024',
    kind: 'write',
    situation:
      'Write the Marrow & Pine reconciliation line. vars.date, vars.stores, vars.expected, vars.hubTotal and vars.financeTotal hold the facts.',
    available: ['vars.date', 'vars.stores', 'vars.expected', 'vars.hubTotal', 'vars.financeTotal', 'payload'],
    level: ['INFO'],
    checks: [
      says(/reconcil/i, 'Sales reconciled'),
      labelled('date'),
      labelled('stores'),
      labelled('expected'),
      labelled('hubTotal'),
      labelled('financeTotal'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Sales reconciled date=$(vars.date) stores=$(vars.stores) expected=$(vars.expected) hubTotal=$(vars.hubTotal) financeTotal=$(vars.financeTotal)"]',
    },
    explain: 'The two totals side by side are the check.',
  },
  {
    id: 'log-14025',
    kind: 'write',
    situation:
      'Totals differ from finance. vars.date, vars.hubTotal, vars.financeTotal, vars.diffPct and vars.topStore hold the facts. Write the line.',
    available: ['vars.date', 'vars.hubTotal', 'vars.financeTotal', 'vars.diffPct', 'vars.topStore', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/mismatch|differ|not reconcile/i, 'Sales do not reconcile'),
      labelled('date'),
      labelled('hubTotal'),
      labelled('financeTotal'),
      labelled('diffPct'),
      labelled('topStore'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Sales do not reconcile date=$(vars.date) hubTotal=$(vars.hubTotal) financeTotal=$(vars.financeTotal) diffPct=$(vars.diffPct) topStore=$(vars.topStore)"]',
    },
    explain: 'topStore points to where to start looking.',
  },

  // ---------- lg-176 Larkfield Grocers: SQL Server connections ----------
  {
    id: 'log-14026',
    kind: 'level',
    situation: 'A Larkfield request waited 5 seconds for a database connection and then failed because the pool was exhausted.',
    answer: ['ERROR'],
    explain: 'A request failed for the user. ERROR, with pool facts.',
  },
  {
    id: 'log-14027',
    kind: 'choice',
    situation: 'Which line best records the pool timeout?',
    options: [
      'DB pool exhausted db=orders maxPoolSize=5 waitMs=5000 errorType=DB:CONNECTIVITY correlationId=7f3c2a',
      'jdbc:sqlserver://sqlprod01:1433;user=app;password=… failed',
      'DB slow',
      'Error 500',
    ],
    answer: 0,
    explain: 'The pool size and wait time show the cause. Never log the connection string.',
  },
  {
    id: 'log-14028',
    kind: 'multi',
    situation: 'Which facts help size the pool correctly?',
    options: ['maxPoolSize', 'How long requests waited', 'How many replicas run', 'The database password'],
    answers: [0, 1, 2],
    explain: 'Pool size times replicas must fit the server limit.',
  },
  {
    id: 'log-14029',
    kind: 'write',
    situation:
      'A Larkfield request failed waiting for a connection. vars.db, vars.maxPoolSize and vars.waitMs hold the facts. Write the line.',
    available: ['vars.db', 'vars.maxPoolSize', 'vars.waitMs', 'vars.connectionString', 'error.errorType', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/pool exhausted|no connection|connection wait/i, 'DB pool exhausted'),
      labelled('db'),
      labelled('maxPoolSize'),
      labelled('waitMs'),
      { must: /error\.errorType/, say: 'Add the error type: errorType=$(error.errorType).' },
      corr,
      noPwd,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["DB pool exhausted db=$(vars.db) maxPoolSize=$(vars.maxPoolSize) waitMs=$(vars.waitMs) errorType=$(error.errorType) correlationId=$(correlationId)"]',
    },
    explain: 'Many of these at lunch time say the pool is too small.',
  },
  {
    id: 'log-14030',
    kind: 'write',
    situation:
      'A Larkfield write failed because the database became read only after a failover. It will retry. vars.db, vars.server and vars.attempt hold the facts. Write the line.',
    available: ['vars.db', 'vars.server', 'vars.attempt', 'vars.connectionString', 'error.errorType', 'error.description', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/read.?only|failover/i, 'DB write failed, read only after failover'),
      labelled('db'),
      labelled('server'),
      labelled('attempt'),
      errorFacts,
      next('next=retry'),
      corr,
      noPwd,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["DB write failed, read only after failover db=$(vars.db) server=$(vars.server) attempt=$(vars.attempt) errorType=$(error.errorType) error=$(error.description) next=retry correlationId=$(correlationId)"]',
    },
    explain: 'server shows whether the app still points at an old node.',
  },

  // ---------- lg-177 Larkfield Grocers: bulk loads ----------
  {
    id: 'log-14031',
    kind: 'level',
    situation: 'A bulk insert block of 1,000 rows succeeded.',
    answer: ['DEBUG'],
    explain: 'Thousands of blocks a night. Log the summary at INFO, blocks at DEBUG.',
  },
  {
    id: 'log-14032',
    kind: 'choice',
    situation: 'Which line best records the whole load?',
    options: [
      'Bulk load finished table=sales_stage rows=2000000 blocks=2000 fallbackBlocks=3 rejected=7 durationMs=1260000',
      'Load done',
      'Inserted: <2 million rows>',
      'DB ok',
    ],
    answer: 0,
    explain: 'Rows, blocks, fallbacks, rejects and time in one summary.',
  },
  {
    id: 'log-14033',
    kind: 'multi',
    situation: 'Which facts show the load is getting slower over time?',
    options: ['durationMs per run', 'Rows per run', 'Fallback blocks per run', 'The server name'],
    answers: [0, 1, 2],
    explain: 'Rows per second and fallbacks per run show trends.',
  },
  {
    id: 'log-14034',
    kind: 'write',
    situation:
      'A Larkfield bulk load finished. vars.table, vars.rows, vars.blocks, vars.fallbackBlocks, vars.rejected and vars.durationMs hold the facts. Write the line.',
    available: ['vars.table', 'vars.rows', 'vars.blocks', 'vars.fallbackBlocks', 'vars.rejected', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/load (finished|complete)|loaded/i, 'Bulk load finished'),
      labelled('table'),
      labelled('rows'),
      labelled('blocks'),
      labelled('fallbackBlocks'),
      labelled('rejected'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Bulk load finished table=$(vars.table) rows=$(vars.rows) blocks=$(vars.blocks) fallbackBlocks=$(vars.fallbackBlocks) rejected=$(vars.rejected) durationMs=$(vars.durationMs)"]',
    },
    explain: 'A summary per table that a dashboard can chart.',
  },
  {
    id: 'log-14035',
    kind: 'write',
    situation:
      'A Larkfield bulk block failed and the flow switched to row by row for it. vars.table, vars.block and vars.rows hold the facts. Write the line.',
    available: ['vars.table', 'vars.block', 'vars.rows', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN'],
    checks: [
      says(/fallback|row by row|one by one/i, 'Bulk block failed, row by row fallback'),
      labelled('table'),
      labelled('block'),
      labelled('rows'),
      errorFacts,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Bulk block failed, row by row fallback table=$(vars.table) block=$(vars.block) rows=$(vars.rows) errorType=$(error.errorType) error=$(error.description)"]',
    },
    explain: 'The block number finds the rows in the source quickly.',
  },

  // ---------- lg-178 Larkfield Grocers: deadlocks and retries ----------
  {
    id: 'log-14036',
    kind: 'level',
    situation: 'A Larkfield update was chosen as a deadlock victim, error 1205. It will retry after 200 ms.',
    answer: ['WARN'],
    explain: 'A retry follows. Count these, they show contention.',
  },
  {
    id: 'log-14037',
    kind: 'choice',
    situation: 'Which line best records the deadlock?',
    options: [
      'Deadlock victim, retrying table=stock key=S041-ITM-7731 attempt=1 sqlError=1205 next=retry in 200ms',
      'UPDATE stock SET qty = 12 WHERE store = ’S041’ AND item = ’ITM-7731’ failed',
      'Deadlock!!!',
      'DB error',
    ],
    answer: 0,
    explain: 'Table, key, attempt and code. Not the SQL with its values.',
  },
  {
    id: 'log-14038',
    kind: 'multi',
    situation: 'Which facts help the DBA find the cause?',
    options: ['The table', 'The key', 'The time', 'The application password'],
    answers: [0, 1, 2],
    explain: 'The DBA matches these with the deadlock graph.',
  },
  {
    id: 'log-14039',
    kind: 'write',
    situation:
      'A Larkfield update was a deadlock victim. vars.table, vars.key, vars.attempt and vars.sqlError hold the facts. A retry follows. Write the line.',
    available: ['vars.table', 'vars.key', 'vars.attempt', 'vars.sqlError', 'vars.sqlText', 'vars.params'],
    level: ['WARN'],
    checks: [
      says(/deadlock/i, 'Deadlock victim, retrying'),
      labelled('table'),
      labelled('key'),
      labelled('attempt'),
      labelled('sqlError'),
      next('next=retry'),
      noSql,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Deadlock victim, retrying table=$(vars.table) key=$(vars.key) attempt=$(vars.attempt) sqlError=$(vars.sqlError) next=retry"]',
    },
    explain: 'The key is enough. The full statement can hold personal or secret values.',
  },
  {
    id: 'log-14040',
    kind: 'write',
    situation:
      'A Larkfield update failed after its last retry and was sent to the reject table. vars.table, vars.key and vars.attempts hold the facts. Write the line.',
    available: ['vars.table', 'vars.key', 'vars.attempts', 'error.errorType', 'error.description', 'vars.sqlText'],
    level: ['ERROR'],
    checks: [
      says(/failed after|gave up|retries exhausted/i, 'Update failed after retries'),
      labelled('table'),
      labelled('key'),
      labelled('attempts'),
      errorFacts,
      next('next=written to reject table'),
      noSql,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Update failed after retries table=$(vars.table) key=$(vars.key) attempts=$(vars.attempts) errorType=$(error.errorType) error=$(error.description) next=written to reject table"]',
    },
    explain: 'The reject table and this line together let someone fix it later.',
  },

  // ---------- lg-179 Larkfield Grocers: delta extracts ----------
  {
    id: 'log-14041',
    kind: 'level',
    situation: 'A Larkfield delta extract read 410 changed items and moved its watermark forward.',
    answer: ['INFO'],
    explain: 'Each run that sends data gets one INFO line.',
  },
  {
    id: 'log-14042',
    kind: 'choice',
    situation: 'Which line best records the delta extract?',
    options: [
      'Delta extracted table=item from=2026-11-17T23:55:00 to=2026-11-18T00:00:01 rows=410 overlapMin=5 durationMs=2100',
      'Extracted items',
      'Items: <410 items>',
      'Delta ok',
    ],
    answer: 0,
    explain: 'The window read and the overlap show no gap was left.',
  },
  {
    id: 'log-14043',
    kind: 'multi',
    situation: 'A change went missing. Which facts on the extract lines help prove why?',
    options: ['The from and to of each window', 'The overlap', 'The rows read', 'The ERP user who made the change'],
    answers: [0, 1, 2],
    explain: 'If windows touch but the row is outside both, the watermark rule is wrong.',
  },
  {
    id: 'log-14044',
    kind: 'write',
    situation:
      'A Larkfield delta extract finished. vars.table, vars.from, vars.to, vars.rows and vars.durationMs hold the facts. Write the line.',
    available: ['vars.table', 'vars.from', 'vars.to', 'vars.rows', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/delta|extract/i, 'Delta extracted'),
      labelled('table'),
      labelled('from'),
      labelled('to'),
      labelled('rows'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Delta extracted table=$(vars.table) from=$(vars.from) to=$(vars.to) rows=$(vars.rows) durationMs=$(vars.durationMs)"]',
    },
    explain: 'From and to on every run let you check windows join up.',
  },
  {
    id: 'log-14045',
    kind: 'write',
    situation:
      'A Larkfield delta extract found its stored watermark is later than the newest row in the table, a sign of a restore. It stops and does not move the watermark. vars.table, vars.watermark and vars.maxInTable hold the facts. Write the line.',
    available: ['vars.table', 'vars.watermark', 'vars.maxInTable', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/watermark (ahead|later)|restore|stopped/i, 'Watermark ahead of data, extract stopped'),
      labelled('table'),
      labelled('watermark'),
      labelled('maxInTable'),
      next('next=check for restore before running'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Watermark ahead of data, extract stopped table=$(vars.table) watermark=$(vars.watermark) maxInTable=$(vars.maxInTable) next=check for restore before running"]',
    },
    explain: 'Stopping here avoids resending or skipping data after a restore.',
  },

  // ---------- lg-180 Larkfield Grocers: merging plans and forecasts ----------
  {
    id: 'log-14046',
    kind: 'level',
    situation: 'Before a MERGE, a Larkfield check found 14 duplicate keys in the forecast staging table. The latest row of each is kept.',
    answer: ['WARN'],
    explain: 'The load continues by an agreed rule, but the sender should hear about it.',
  },
  {
    id: 'log-14047',
    kind: 'choice',
    situation: 'Which line best records the duplicates?',
    options: [
      'Duplicate keys removed table=fcst_stage key=store+item+week duplicates=14 rule=keep latest',
      'Duplicates',
      'Rows: <all 28 duplicate rows>',
      'MERGE will fail maybe',
    ],
    answer: 0,
    explain: 'The table, key, count and rule. The reject report holds the rows.',
  },
  {
    id: 'log-14048',
    kind: 'multi',
    situation: 'Which facts belong on the MERGE summary?',
    options: ['Rows inserted', 'Rows updated', 'Rows unchanged or deleted', 'Each row merged'],
    answers: [0, 1, 2],
    explain: 'MERGE can return counts by action. They show what changed.',
  },
  {
    id: 'log-14049',
    kind: 'write',
    situation:
      'A Larkfield forecast MERGE finished. vars.target, vars.inserted, vars.updated, vars.unchanged and vars.durationMs hold the facts. Write the line.',
    available: ['vars.target', 'vars.inserted', 'vars.updated', 'vars.unchanged', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/merge (finished|complete)|merged/i, 'Forecast merge finished'),
      labelled('target'),
      labelled('inserted'),
      labelled('updated'),
      labelled('unchanged'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Forecast merge finished target=$(vars.target) inserted=$(vars.inserted) updated=$(vars.updated) unchanged=$(vars.unchanged) durationMs=$(vars.durationMs)"]',
    },
    explain: 'A day with zero updates is worth a second look.',
  },
  {
    id: 'log-14050',
    kind: 'write',
    situation:
      'A Larkfield forecast MERGE failed and was rolled back. Nothing changed in the target. vars.target and vars.rows hold the facts. Write the line.',
    available: ['vars.target', 'vars.rows', 'error.errorType', 'error.description', 'vars.sqlText', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/merge failed|rolled back/i, 'Forecast merge failed, rolled back'),
      labelled('target'),
      labelled('rows'),
      errorFacts,
      next('next=no changes made, fix and rerun'),
      noSql,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Forecast merge failed, rolled back target=$(vars.target) rows=$(vars.rows) errorType=$(error.errorType) error=$(error.description) next=no changes made, fix and rerun"]',
    },
    explain: 'Saying nothing changed tells stores they still see yesterday’s forecast.',
  },
]
