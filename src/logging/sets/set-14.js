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
    situation:
      'Marrow & Pine downloads costs.zip from several suppliers. Today ftp.supplier-b.example sent /out/costs.zip in binary mode: 4,101,118 bytes read, and the server listing gave the same size. Which line best records the download?',
    options: [
      'FTP download finished host=ftp.supplier-b.example path=/out/costs.zip sizeBytes=4101118 mode=BINARY durationMs=5200 status=OK',
      'FTP download finished file=costs.zip sizeBytes=4101118 serverSize=4101118 mode=BINARY durationMs=5200',
      'FTP download finished host=ftp.supplier-b.example path=/out/costs.zip sizeBytes=4101118 serverSize=4101118 mode=BINARY durationMs=5200',
      'FTP download finished host=ftp.supplier-b.example path=/out/costs.zip sizeBytes=4101118 serverSize=4101118 user=marrow-int',
    ],
    answer: 2,
    explain:
      'Both sizes and the mode show the copy was exact. The line with status=OK has no server size, so nothing proves the whole file arrived. The line with only file=costs.zip has no host or folder, and several suppliers send that name. The line with user=marrow-int leaves out the mode, which is what explains a zip broken by ASCII mode.',
  },
  {
    id: 'log-14003',
    kind: 'multi',
    situation: 'A costs.zip downloaded over FTP will not open. Which facts on the download line help find the cause?',
    options: ['The number of other files in the remote folder', 'The transfer mode, ASCII or BINARY', 'The bytes read', 'The size in the server listing', 'How long the transfer took'],
    answers: [1, 2, 3],
    explain: 'Different sizes with ASCII mode explain a broken zip at once. How many other files sit in the folder says nothing about this one, and a slow transfer can still deliver an exact copy.',
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
      'A Marrow & Pine download read fewer bytes than the server size. The file is not loaded and will be downloaded again. vars.path, vars.sizeBytes and vars.serverSize hold the facts. Write the line, with what happens next.',
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
    situation: 'An FTP LIST command timed out after login worked. The connector uses active mode, and the next run will try again with the same settings.',
    answer: ['ERROR', 'WARN'],
    explain: 'Login worked, so the data channel is the suspect. No files move until someone changes the mode, so many teams use ERROR. WARN fits while one more run may still work.',
  },
  {
    id: 'log-14007',
    kind: 'choice',
    situation:
      'An FTP LIST timed out after 30 seconds. Login worked. The connector runs in active mode and the server sits behind a firewall. Which line best records the timeout?',
    options: [
      'FTP LIST timed out host=ftp.store-net.example timeoutMs=30000 loginOk=true dir=/out next=retry next run',
      'FTP LIST timed out host=ftp.store-net.example passive=false timeoutMs=30000 loginOk=true',
      'FTP connection timed out host=ftp.store-net.example passive=false timeoutMs=30000',
      'FTP LIST timed out host=ftp.store-net.example passive=false timeoutMs=30000 loginOk=true next=switch to active mode',
    ],
    answer: 1,
    explain:
      'loginOk=true with passive=false points straight at the data channel. The line with dir=/out leaves out the mode, the one fact that explains the timeout. "FTP connection timed out" without loginOk reads like the host is down. The line that says switch to active mode is wrong: the connector already runs active, and behind a firewall passive mode is the usual fix.',
  },
  {
    id: 'log-14008',
    kind: 'multi',
    situation: 'Marrow & Pine logs the FTP connector settings once at startup, to explain later transfer problems. Which belong on that line?',
    options: ['Passive or active mode', 'The number of files downloaded on the last run', 'Transfer type, ASCII or BINARY', 'Host and port', 'The name of the flow that holds the FTP config'],
    answers: [0, 2, 3],
    explain: 'Settings that change behaviour belong there. The count from the last run is not a setting and is old at startup. The flow name does not change how a transfer behaves.',
  },
  {
    id: 'log-14009',
    kind: 'write',
    situation:
      'A Marrow & Pine FTP LIST timed out. vars.host, vars.passive and vars.timeoutMs hold the facts. Write the line, with the error.',
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
      'A Marrow & Pine FTP connection was refused during the partner maintenance window. The reconnection strategy will retry. vars.partner, vars.host and vars.attempt hold the facts. Write the line, with the error and what happens next.',
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
    situation:
      'The upload of sales_20261118.dat timed out after the data was sent, so the flow cannot tell if the file arrived. The receiver loads every file it finds. Which line best records this?',
    options: [
      'Upload failed path=/in/sales_20261118.dat runId=R-1118 errorType=FTP:CONNECTIVITY next=upload again as sales_20261118_r1.dat',
      'Upload result unknown path=/in/sales_20261118.dat runId=R-1118 errorType=FTP:CONNECTIVITY next=check final file before retry',
      'Upload failed path=/in/sales_20261118.dat runId=R-1118 errorType=FTP:CONNECTIVITY next=retry with same name',
      'Upload result unknown path=/in/sales_20261118.dat errorType=FTP:CONNECTIVITY next=check final file before retry',
    ],
    answer: 1,
    explain:
      'It says the result is unknown and what the flow does to avoid a duplicate. Calling it failed is wrong, the file may be there. A new name like _r1 makes the receiver load the sales twice. A blind retry with the same name can also load twice if the receiver already picked up the first copy. The unknown result line without runId, so the receiver cannot match a repeat.',
  },
  {
    id: 'log-14013',
    kind: 'multi',
    situation:
      'An upload with an unknown result may be sent a second time. Which facts, on the log line and in the file, let the planning platform spot a repeat?',
    options: ['The time of the upload', 'A run ID', 'A sequence number per file', 'The final file name', 'The byte count of the file'],
    answers: [1, 2, 3],
    explain:
      'The same run ID, file name or sequence twice means a repeat. A retry has a new upload time, so the time cannot show it is the same data. A byte count matches on a repeat, but two different days can also give the same size, so it cannot prove one.',
  },
  {
    id: 'log-14014',
    kind: 'write',
    situation:
      'A Marrow & Pine upload timed out. vars.path and vars.runId hold the facts. The flow will check for the final file before retrying. Write the line, with the error type and what happens next.',
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
    situation:
      'In a fixed width export, record 612 (store S612) has a storeName of 47 characters. The field is 40 wide, so the flow cuts the name and keeps the record in the file. Which line best records it?',
    options: [
      'Field truncated file=locations_20261118.dat field=storeName width=40 originalLength=47 count=1',
      'Record rejected file=locations_20261118.dat record=612 field=storeName width=40 originalLength=47 store=S612',
      'Field truncated file=locations_20261118.dat record=612 field=storeName width=40 store=S612',
      'Field truncated file=locations_20261118.dat record=612 field=storeName width=40 originalLength=47 store=S612',
    ],
    answer: 3,
    explain:
      'Which record, field and lengths, so the business can shorten the name at source. The line with count=1 has no record or store, so nobody can tell which name to fix. "Record rejected" is false: the record was sent with a cut name. The line without originalLength hides how much was lost.',
  },
  {
    id: 'log-14018',
    kind: 'multi',
    situation: 'Before a fixed width file goes to the receiver, which checks should the flow run, and log when they fail?',
    options: [
      'The record count matches the trailer',
      'Every record is trimmed of trailing spaces',
      'Every record has the exact length',
      'Truncated fields are reported',
      'Every field is right padded with spaces',
    ],
    answers: [0, 2, 3],
    explain:
      'Catch problems before the receiver rejects the whole file. Trimming trailing spaces breaks a fixed width record, because the padding is part of its length. Padding is set per field by the layout: numeric fields are often right aligned with leading zeros, so a rule that every field ends in spaces rejects good records.',
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
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
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
      'A Marrow & Pine fixed width file failed its record length check and was not uploaded. vars.fileName, vars.badRecords and vars.recordLength hold the facts. Write the line, with what happens next.',
    available: ['vars.fileName', 'vars.badRecords', 'vars.recordLength', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/length check failed|wrong length|not uploaded/i, 'Record length check failed'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
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
    situation:
      'The daily check compares hub sales with finance. 260 stores were expected and all sent files: 180 by FTP, 72 by SFTP and 8 by file share. Both totals are 1,750,000.00. Which line best records it?',
    options: [
      'Sales reconciled date=2026-11-18 stores=260 expected=260 ftp=180 sftp=72 share=8 hubTotal=1750000.00 financeTotal=1750000.00 difference=0.00 status=MISMATCH',
      'Sales reconciled date=2026-11-18 stores=260 hubTotal=1750000.00 financeTotal=1750000.00 difference=0.00 status=MATCHED',
      'Sales reconciled date=2026-11-18 stores=260 expected=260 ftp=180 sftp=72 share=8 hubTotal=1750000.00 financeTotal=1750000.00',
      'Sales reconciled date=2026-11-18 files=260 ftp=180 sftp=72 share=8 hubTotal=1750000.00 financeTotal=1750000.00',
    ],
    answer: 2,
    explain: 'Stores against expected, counts by source and both totals show the day was complete and matched. status=MISMATCH contradicts a difference of 0.00 and would raise a false alarm. Without expected and the counts by source, a later gap cannot be traced to a source. files=260 counts files, not stores, and drops the expected count.',
  },
  {
    id: 'log-14023',
    kind: 'multi',
    situation: 'Hub sales are 12,400.00 below finance for one day. Which facts on the reconciliation lines help find where the gap starts?',
    options: ['Counts by source', 'The total difference', 'Stores missing', 'Totals by source', 'The difference as a percent of the day total'],
    answers: [0, 2, 3],
    explain:
      'Narrow it to a source or a store first. The total difference says how big the gap is, not where it is, and the same is true of the gap as a percent of the day.',
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
    situation: 'Orders API calls fail after waiting 5 seconds for a database connection. The pool holds 5 connections. Which line best records it?',
    options: [
      'DB query timed out db=orders queryTimeoutSec=5 errorType=DB:CONNECTIVITY correlationId=7f3c2a',
      'DB pool exhausted db=orders maxPoolSize=5 errorType=DB:CONNECTIVITY correlationId=7f3c2a',
      'DB pool exhausted db=orders maxPoolSize=5 waitMs=5000 errorType=DB:CONNECTIVITY correlationId=7f3c2a',
      'DB pool exhausted db=orders maxPoolSize=5 waitMs=5000 errorType=DB:CONNECTIVITY url=jdbc:sqlserver://sqlprod01:1433;user=app',
    ],
    answer: 2,
    explain:
      'The pool size and wait time show the cause. "DB query timed out" sends people to tune a query that never started. The line without waitMs cannot tell a small pool from a slow database. Never log the connection string, even without the password, and that line also lost the correlation ID.',
  },
  {
    id: 'log-14028',
    kind: 'multi',
    situation: 'The orders app runs on 4 replicas against a SQL Server that allows it 100 connections. Which facts help size the pool?',
    options: ['How long requests waited', 'The JDBC driver version', 'maxPoolSize', 'How many replicas run', 'The heap size of each replica'],
    answers: [0, 2, 3],
    explain:
      'Pool size times replicas must fit the server limit, and the wait shows whether the pool is too small. The driver version does not change the sizing. Heap size limits memory in the app, not how many connections the server accepts.',
  },
  {
    id: 'log-14029',
    kind: 'write',
    situation:
      'A Larkfield request failed waiting for a connection. vars.db, vars.maxPoolSize and vars.waitMs hold the facts. Write the line, with the error type and the correlation ID.',
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
      'A Larkfield write failed because the database became read only after a failover. It will retry. vars.db, vars.server and vars.attempt hold the facts. Write the line, with the error, what happens next and the correlation ID.',
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
    situation: 'A bulk insert block of 1,000 rows succeeded. There are thousands of blocks a night.',
    answer: ['DEBUG', 'TRACE'],
    explain: 'Thousands of blocks a night. Log the summary at INFO, blocks at DEBUG or TRACE.',
  },
  {
    id: 'log-14032',
    kind: 'choice',
    situation:
      'A bulk load of 2,000,000 rows into sales_stage ran in 2,000 blocks. 3 blocks failed and were loaded row by row, and 7 rows were rejected. Which line best records it?',
    options: [
      'Bulk load finished table=sales_stage rows=2000000 blocks=2000 fallbackBlocks=3 rejected=7 durationMs=1260000',
      'Bulk load finished table=sales_stage loaded=2000000 blocks=2000 fallbackBlocks=3 rejected=7 durationMs=1260000',
      'Bulk load finished table=sales_stage rows=2000000 rejected=7 durationMs=1260000 rowsPerSec=1587',
      'Bulk load finished table=sales_stage rows=2000000 blocks=2000 fallbackBlocks=3 durationMs=1260000',
    ],
    answer: 0,
    explain:
      'Rows, blocks, fallbacks, rejects and time in one summary. loaded=2000000 is false, only 1,999,993 rows went in. The line with rowsPerSec has no fallback count, which is what slows a load down. The line without rejected=7 has no reject count, so 7 rows that never loaded stay hidden.',
  },
  {
    id: 'log-14033',
    kind: 'multi',
    situation: 'The nightly bulk load took 21 minutes last month and 34 minutes now. Which facts, kept for each run, show why?',
    options: ['Rows per run', 'durationMs per run', 'The target table name', 'Fallback blocks per run', 'The column count of the target table'],
    answers: [0, 1, 3],
    explain:
      'Rows per second and fallbacks per run show trends. The table name is the same every night, and so is the column count unless the schema changes, which nothing here suggests.',
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
      'A Larkfield bulk block failed and the flow switched to row by row for it. vars.table, vars.block and vars.rows hold the facts. Write the line, with the error.',
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
    situation:
      'An UPDATE on the stock table for store S041, item ITM-7731 was chosen as deadlock victim (SQL Server error 1205). The flow retries in 200 ms. Which line best records it?',
    options: [
      'Deadlock victim, retrying table=stock attempt=1 sqlError=1205 next=retry in 200ms',
      'Deadlock victim, retrying table=stock key=S041-ITM-7731 attempt=1 sqlError=1205 next=retry in 200ms',
      'Lock timeout, retrying table=stock key=S041-ITM-7731 attempt=1 sqlError=1222 next=retry in 200ms',
      'Deadlock victim, retrying table=stock key=S041-ITM-7731 attempt=1 sqlError=1205 params=[12,S041,ITM-7731] next=retry in 200ms',
    ],
    answer: 1,
    explain:
      'Table, key, attempt and code. The line without key=S041-ITM-7731, so the DBA cannot match it to the deadlock graph. Error 1222 is a lock request timeout, a different problem from a deadlock. The SQL parameter values do not belong in the log.',
  },
  {
    id: 'log-14038',
    kind: 'multi',
    situation: 'The DBA wants to match deadlock lines with the SQL Server deadlock graph. Which facts on the line help?',
    options: ['The table', 'The new quantity being written', 'The key', 'The time, to the millisecond', 'The SQL Server error number, 1205'],
    answers: [0, 2, 3],
    explain:
      'The DBA matches table, key and time with the graph. The quantity is a data value and plays no part in the lock. Error 1205 marks the line as a deadlock, but every deadlock has that number, so it cannot pick out one graph.',
  },
  {
    id: 'log-14039',
    kind: 'write',
    situation:
      'A Larkfield update was a deadlock victim. vars.table, vars.key, vars.attempt and vars.sqlError hold the facts. A retry follows. Write the line, with what happens next.',
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
      'A Larkfield update failed after its last retry and was sent to the reject table. vars.table, vars.key and vars.attempts hold the facts. Write the line, with the error and what happens next.',
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
    situation:
      'A delta extract read item changes from 23:55:00 to 00:00:01, with a 5 minute overlap on the last window. It found 410 rows in 2.1 seconds. Which line best records it?',
    options: [
      'Delta extracted table=item from=2026-11-17T23:55:00 to=2026-11-18T00:00:01 rows=410 durationMs=2100',
      'Delta extracted table=item from=2026-11-17T23:55:00 to=2026-11-18T00:00:01 rows=410 overlapMin=5 itemIds=ITM-1001,ITM-1002,…',
      'Delta extracted table=item from=2026-11-17T23:55:00 to=2026-11-18T00:00:01 rows=410 overlapMin=5 durationMs=2100',
      'Delta extracted table=item rows=410 overlapMin=5 durationMs=2100',
    ],
    answer: 2,
    explain:
      'The window read and the overlap show no gap was left. The line without overlapMin has no overlap. The line with itemIds puts 410 keys in one line and still loses the time. The line with only rows, overlap and time has no from and to, so nobody can check the windows join up.',
  },
  {
    id: 'log-14043',
    kind: 'multi',
    situation: 'An item change made at 23:58 never reached the hub. Which facts on the extract lines help prove why?',
    options: ['The total rows in the item table', 'The from and to of each window', 'The overlap', 'The rows read', 'The time each extract job started'],
    answers: [1, 2, 3],
    explain:
      'If the windows touch but the row is outside both, the watermark rule is wrong. The size of the whole table says nothing about one window. The job start time is not the window: a job can start late and still read the right range, so only the window bounds show what was covered.',
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
      'A Larkfield delta extract found its stored watermark is later than the newest row in the table, a sign of a restore. It stops and does not move the watermark. vars.table, vars.watermark and vars.maxInTable hold the facts. Write the line, with what happens next.',
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
    situation:
      'The forecast stage held 28 rows in groups with the same store, item and week. The flow removed 14 and kept the latest of each. Which line best records it?',
    options: [
      'Duplicate keys removed table=fcst_stage key=store+item+week duplicates=14 rule=keep latest',
      'Duplicate keys removed table=fcst_stage duplicates=14 rule=keep latest',
      'Duplicate keys removed table=fcst_stage key=store+item+week duplicates=28 rule=keep latest',
      'Duplicate keys removed table=fcst_stage key=store+item+week duplicates=14 rows=S041/ITM-7731/W47,S052/ITM-0090/W47,…',
    ],
    answer: 0,
    explain:
      'The table, key, count removed and rule. The line without key does not name the key columns, so the sender cannot tell which fields repeat. duplicates=28 counts the kept rows too, so it overstates what was removed. The rows belong in the reject report, not the log.',
  },
  {
    id: 'log-14048',
    kind: 'multi',
    situation: 'A MERGE loads the forecast stage into the plan table. Which counts belong on the summary line?',
    options: ['Rows updated', 'Rows inserted', 'The key of each row merged', 'Rows deleted by the MERGE', 'Rows in the plan table after the MERGE'],
    answers: [0, 1, 3],
    explain:
      'MERGE can return counts by action. They show what changed. The key of every row floods the log. The plan table total also holds rows from earlier loads, so it does not show what this MERGE did.',
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
      'A Larkfield forecast MERGE failed and was rolled back. Nothing changed in the target. vars.target and vars.rows hold the facts. Write the line, with the error and what happens next.',
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
