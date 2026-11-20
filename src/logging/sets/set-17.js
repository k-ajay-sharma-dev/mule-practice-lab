// Logging Lab exercises, set 17. See ../exercises.js for the format.
// Theme: one problem for each focus topic. Expiring queue messages, blob restores, share snapshots, SFTP read checks,
// unmatched FTP files, long SQL Server transactions, Oracle session use, email bounces, reject replays and CSV rows.
import { errorFacts, labelled, noPayload, noPersonal, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }

export const SET_17 = [
  // ---------- lg-201 Harrow Garden Supply: expiring queue messages ----------
  {
    id: 'log-17001',
    kind: 'level',
    situation: 'Harrow Garden Supply found 380 stock messages moved to the expiry queue because their time to live ran out while the consumer was down.',
    answer: ['ERROR', 'WARN'],
    explain: 'Data was not applied in time. ERROR if stock is now wrong, WARN if a snapshot will follow.',
  },
  {
    id: 'log-17002',
    kind: 'choice',
    situation: 'Which line best records the expired messages?',
    options: [
      'Messages expired queue=stock-updates expiryQueue=stock-updates.expired count=380 ttlHours=24 next=send full snapshot',
      'Messages gone',
      'Expired: <380 stock messages>',
      'Messages expired queue=stock-updates count=380 ttlHours=24 next=send full snapshot',
    ],
    answer: 0,
    explain: 'Which queue, where they went, how many, the TTL and the recovery step. The last line does not name the expiry queue, so support does not know where the messages went.',
  },
  {
    id: 'log-17003',
    kind: 'multi',
    situation: 'Which facts help decide the right TTL later?',
    options: ['The TTL in use', 'How long the consumer was down', 'How many messages expired', 'The message bodies'],
    answers: [0, 1, 2],
    explain: 'Compare the TTL with real outage lengths.',
  },
  {
    id: 'log-17004',
    kind: 'write',
    situation:
      'Harrow messages expired. vars.queue, vars.expiryQueue, vars.count and vars.ttlHours hold the facts. A full snapshot will be sent. Write the line, with what happens next.',
    available: ['vars.queue', 'vars.expiryQueue', 'vars.count', 'vars.ttlHours', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/expired/i, 'Messages expired'),
      labelled('queue'),
      labelled('expiryQueue'),
      labelled('count'),
      labelled('ttlHours'),
      next('next=send full snapshot'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Messages expired queue=$(vars.queue) expiryQueue=$(vars.expiryQueue) count=$(vars.count) ttlHours=$(vars.ttlHours) next=send full snapshot"]',
    },
    explain: 'The expiry queue name tells support where to look.',
  },
  {
    id: 'log-17005',
    kind: 'write',
    situation:
      'The Harrow consumer started again after being down. vars.queue, vars.depth and vars.downMinutes hold the facts. Write the line.',
    available: ['vars.queue', 'vars.depth', 'vars.downMinutes', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/consumer (started|resumed)|resumed|started/i, 'Consumer resumed'),
      labelled('queue'),
      labelled('depth'),
      labelled('downMinutes'),
      noPayload,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Consumer resumed queue=$(vars.queue) depth=$(vars.depth) downMinutes=$(vars.downMinutes)"]' },
    explain: 'A depth of zero after a long outage is the clue that messages expired.',
  },

  // ---------- lg-202 Kestrel Logistics: restoring deleted blobs ----------
  {
    id: 'log-17006',
    kind: 'level',
    situation: 'A Kestrel cleanup job deleted 1,840 blobs from the inbound prefix by mistake. The team restored them with soft delete.',
    answer: ['WARN', 'INFO'],
    explain: 'Recovered, but worth a clear WARN so the incident has a record.',
  },
  {
    id: 'log-17007',
    kind: 'choice',
    situation: 'Which line best records the cleanup run?',
    options: [
      'Blob cleanup finished container=inbound prefix=processed/ olderThanDays=30 deleted=1840 durationMs=9200',
      'Cleanup done',
      'Deleted: [a.json, b.json, … 1840 names]',
      'Blob cleanup finished container=inbound deleted=1840 durationMs=9200',
    ],
    answer: 0,
    explain: 'The prefix on the line would have shown the wrong target at once. The last line has no prefix or age rule, so the wrong target stays hidden.',
  },
  {
    id: 'log-17008',
    kind: 'multi',
    situation: 'Which facts belong on every cleanup line?',
    options: ['Container and prefix', 'The age rule', 'How many were deleted', 'Every blob name'],
    answers: [0, 1, 2],
    explain: 'Enough to spot a wrong rule. Names belong in an audit file if needed.',
  },
  {
    id: 'log-17009',
    kind: 'write',
    situation:
      'A Kestrel cleanup finished. vars.container, vars.prefix, vars.olderThanDays, vars.deleted and vars.durationMs hold the facts. Write the line.',
    available: ['vars.container', 'vars.prefix', 'vars.olderThanDays', 'vars.deleted', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/cleanup (finished|complete)|deleted/i, 'Blob cleanup finished'),
      labelled('container'),
      labelled('prefix'),
      labelled('olderThanDays'),
      labelled('deleted'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Blob cleanup finished container=$(vars.container) prefix=$(vars.prefix) olderThanDays=$(vars.olderThanDays) deleted=$(vars.deleted) durationMs=$(vars.durationMs)"]',
    },
    explain: 'A sudden jump in deleted is worth an alert.',
  },
  {
    id: 'log-17010',
    kind: 'write',
    situation:
      'Kestrel restored deleted blobs with soft delete. vars.container, vars.prefix and vars.restored hold the facts. The notifications will be replayed. Write the line, with what happens next.',
    available: ['vars.container', 'vars.prefix', 'vars.restored', 'payload'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/restored|undeleted/i, 'Blobs restored'),
      labelled('container'),
      labelled('prefix'),
      labelled('restored'),
      next('next=replay notifications'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Blobs restored container=$(vars.container) prefix=$(vars.prefix) restored=$(vars.restored) next=replay notifications"]',
    },
    explain: 'restored should match the wrong deletes.',
  },

  // ---------- lg-203 Larkfield Grocers: share snapshots and overwrites ----------
  {
    id: 'log-17011',
    kind: 'level',
    situation: 'A Larkfield plan file with 0 rows was about to overwrite yesterday’s plan. The flow refused to write it.',
    answer: ['ERROR'],
    explain: 'Stores keep yesterday’s plan, but today’s plan is missing. ERROR.',
  },
  {
    id: 'log-17012',
    kind: 'choice',
    situation: 'Which line best records the refused write?',
    options: [
      'Plan write refused, row count too low file=current_plan.csv rows=0 yesterdayRows=48210 minPct=80 next=keep previous plan',
      'Not written',
      'Plan: <empty file>',
      'Plan write refused file=current_plan.csv rows=0 next=keep previous plan',
    ],
    answer: 0,
    explain: 'Both counts and the rule show why it was refused. The last line has no previous count or rule, so the reader cannot see why 0 rows was refused.',
  },
  {
    id: 'log-17013',
    kind: 'multi',
    situation: 'Which facts help restore a plan from a share snapshot?',
    options: ['The file path', 'The snapshot time used', 'The row count restored', 'The share key'],
    answers: [0, 1, 2],
    explain: 'Never the key.',
  },
  {
    id: 'log-17014',
    kind: 'write',
    situation:
      'A Larkfield plan write was refused and yesterday’s plan is kept. vars.fileName, vars.rows, vars.yesterdayRows and vars.minPct hold the facts. Write the line, with what happens next.',
    available: ['vars.fileName', 'vars.rows', 'vars.yesterdayRows', 'vars.minPct', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/refused|not written|too low/i, 'Plan write refused, row count too low'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('rows'),
      labelled('yesterdayRows'),
      labelled('minPct'),
      next('next=keep previous plan'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Plan write refused, row count too low file=$(vars.fileName) rows=$(vars.rows) yesterdayRows=$(vars.yesterdayRows) minPct=$(vars.minPct) next=keep previous plan"]',
    },
    explain: 'The rule on the line explains the refusal to anyone reading it.',
  },
  {
    id: 'log-17015',
    kind: 'write',
    situation:
      'A Larkfield file was restored from a share snapshot. vars.path, vars.snapshot and vars.rows hold the facts. Write the line.',
    available: ['vars.path', 'vars.snapshot', 'vars.rows', 'vars.sasToken', 'payload'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/restored/i, 'File restored from snapshot'),
      labelled('path'),
      labelled('snapshot'),
      labelled('rows'),
      { not: /sasToken/, say: 'Do not log the SAS token.' },
      noPayload,
      noVague,
    ],
    model: { level: 'WARN', message: '#["File restored from snapshot path=$(vars.path) snapshot=$(vars.snapshot) rows=$(vars.rows)"]' },
    explain: 'The snapshot time shows exactly which version came back.',
  },

  // ---------- lg-204 Brindle Outdoor: SFTP read checks ----------
  {
    id: 'log-17016',
    kind: 'level',
    situation: 'After upload, Brindle checks that the planning platform account can read the file. The check failed with permission denied.',
    answer: ['ERROR'],
    explain: 'The receiver cannot read it, so the data will not arrive.',
  },
  {
    id: 'log-17017',
    kind: 'choice',
    situation: 'Which line best records the failed read check?',
    options: [
      'Reader access check failed path=/to-planning/locations.txt readerAccount=planning-reader mode=600 next=ask server owner to fix permissions',
      'Cannot read',
      'Permission problem for password …',
      'Reader access check failed path=/to-planning/locations.txt readerAccount=planning-reader next=ask server owner to fix permissions',
    ],
    answer: 0,
    explain: 'The path, the reader, the file mode and the next step. The last line has no file mode, so the admin must log in to find what is wrong.',
  },
  {
    id: 'log-17018',
    kind: 'multi',
    situation: 'Which facts help the server owner fix it?',
    options: ['The file mode', 'The reader account', 'The path', 'The reader’s password'],
    answers: [0, 1, 2],
    explain: 'Never a password.',
  },
  {
    id: 'log-17019',
    kind: 'write',
    situation:
      'A Brindle read check failed. The server owner must fix the permissions. vars.path, vars.readerAccount and vars.mode hold the facts. Write the line, with what happens next.',
    available: ['vars.path', 'vars.readerAccount', 'vars.mode', 'vars.password', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/access check failed|cannot read|permission denied/i, 'Reader access check failed'),
      labelled('path'),
      labelled('readerAccount'),
      labelled('mode'),
      next('next=ask server owner to fix permissions'),
      { not: /password/i, say: 'Do not log a password.' },
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Reader access check failed path=$(vars.path) readerAccount=$(vars.readerAccount) mode=$(vars.mode) next=ask server owner to fix permissions"]',
    },
    explain: 'mode=600 alone tells an admin the file is private to the uploader.',
  },
  {
    id: 'log-17020',
    kind: 'write',
    situation:
      'A Brindle upload stopped because the server disk is full. The temp file was deleted, and the file is sent again after cleanup. vars.path and vars.sizeBytes hold the facts. Write the line, with the error and what happens next.',
    available: ['vars.path', 'vars.sizeBytes', 'error.errorType', 'error.description', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/no space|disk full|upload failed/i, 'Upload failed, server disk full'),
      labelled('path'),
      labelled('sizeBytes'),
      errorFacts,
      next('next=temp file deleted, resend after cleanup'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Upload failed, server disk full path=$(vars.path) sizeBytes=$(vars.sizeBytes) errorType=$(error.errorType) error=$(error.description) next=temp file deleted, resend after cleanup"]',
    },
    explain: 'The size tells the server owner how much space is needed.',
  },

  // ---------- lg-205 Marrow & Pine Home: unmatched FTP files ----------
  {
    id: 'log-17021',
    kind: 'level',
    situation: 'A Marrow & Pine FTP poll found 3 files that do not match the agreed name pattern.',
    answer: ['WARN'],
    explain: 'Skips must be visible, so WARN, not DEBUG.',
  },
  {
    id: 'log-17022',
    kind: 'choice',
    situation: 'Which line best records the unmatched files?',
    options: [
      'Files not matching pattern host=ftp.supplier-c.example dir=/out unmatched=3 pattern=^[A-Za-z0-9_]+\\.csv$ first=Promo week 47.csv',
      'Skipped some',
      'Unmatched: <file contents>',
      'Files not matching pattern host=ftp.supplier-c.example dir=/out unmatched=3',
    ],
    answer: 0,
    explain: 'The count, the rule and one example are enough to act on. The last line has no pattern or example, so the supplier cannot see what to change.',
  },
  {
    id: 'log-17023',
    kind: 'multi',
    situation: 'Which facts help the supplier fix their file names?',
    options: ['The agreed pattern', 'An example name that failed', 'How many failed', 'The content of the files'],
    answers: [0, 1, 2],
    explain: 'Show the rule and the example.',
  },
  {
    id: 'log-17024',
    kind: 'write',
    situation:
      'Marrow & Pine found files that do not match. vars.host, vars.dir, vars.unmatched, vars.pattern and vars.firstName hold the facts. Write the line.',
    available: ['vars.host', 'vars.dir', 'vars.unmatched', 'vars.pattern', 'vars.firstName', 'payload'],
    level: ['WARN'],
    checks: [
      says(/not match|unmatched/i, 'Files not matching pattern'),
      labelled('host'),
      labelled('dir'),
      labelled('unmatched'),
      labelled('pattern'),
      labelled('(first|firstName|example)', 'first=$(vars.firstName)'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Files not matching pattern host=$(vars.host) dir=$(vars.dir) unmatched=$(vars.unmatched) pattern=$(vars.pattern) first=$(vars.firstName)"]',
    },
    explain: 'Without this line, skipped files stay hidden for weeks.',
  },
  {
    id: 'log-17025',
    kind: 'write',
    situation:
      'A Marrow & Pine passive data connection failed because the server advertised a private address. vars.host and vars.advertised hold the facts. Write the line, with the error.',
    available: ['vars.host', 'vars.advertised', 'error.errorType', 'error.description', 'vars.password'],
    level: ['ERROR'],
    checks: [
      says(/data connection|passive/i, 'Passive data connection failed'),
      labelled('host'),
      labelled('advertised'),
      errorFacts,
      { not: /password/i, say: 'Do not log a password.' },
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Passive data connection failed host=$(vars.host) advertised=$(vars.advertised) errorType=$(error.errorType) error=$(error.description)"]',
    },
    explain: 'A private address in advertised points straight at the partner’s NAT settings.',
  },

  // ---------- lg-206 Larkfield Grocers: long transactions in SQL Server ----------
  {
    id: 'log-17026',
    kind: 'level',
    situation: 'A Larkfield check found a transaction open for 8 hours on the sales database.',
    answer: ['WARN', 'ERROR'],
    explain: 'It can fill tempdb and block work. WARN early, ERROR when it threatens the nightly runs.',
  },
  {
    id: 'log-17027',
    kind: 'choice',
    situation: 'Which line best records the long transaction?',
    options: [
      'Long open transaction db=sales sessionId=112 program=report-app openMinutes=480 versionStoreGB=120',
      'Long transaction',
      'Session 112 running SELECT * FROM … with params …',
      'Long open transaction db=sales sessionId=112 openMinutes=480 versionStoreGB=120',
    ],
    answer: 0,
    explain: 'Who, how long and the effect on tempdb. The last line has no program name, so the DBA does not know whose app to call.',
  },
  {
    id: 'log-17028',
    kind: 'multi',
    situation: 'Which facts help the DBA act?',
    options: ['The session ID', 'The program name', 'How long it has been open', 'The query parameters'],
    answers: [0, 1, 2],
    explain: 'Parameters can hold personal data.',
  },
  {
    id: 'log-17029',
    kind: 'write',
    situation:
      'A Larkfield check found a long open transaction. vars.db, vars.sessionId, vars.program and vars.openMinutes hold the facts. Write the line.',
    available: ['vars.db', 'vars.sessionId', 'vars.program', 'vars.openMinutes', 'vars.sqlText'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/long (open )?transaction/i, 'Long open transaction'),
      labelled('db'),
      labelled('sessionId'),
      labelled('program'),
      labelled('openMinutes'),
      { not: /sqlText/, say: 'Do not log the SQL text.' },
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Long open transaction db=$(vars.db) sessionId=$(vars.sessionId) program=$(vars.program) openMinutes=$(vars.openMinutes)"]',
    },
    explain: 'program tells the DBA whose app to call.',
  },
  {
    id: 'log-17030',
    kind: 'write',
    situation:
      'A Larkfield extract failed because tempdb was full. It will rerun in date ranges. vars.extract and vars.rangeDays hold the facts. Write the line, with the error and what happens next.',
    available: ['vars.extract', 'vars.rangeDays', 'error.errorType', 'error.description'],
    level: ['ERROR'],
    checks: [
      says(/tempdb|extract failed/i, 'Extract failed, tempdb full'),
      labelled('extract'),
      labelled('rangeDays'),
      errorFacts,
      next('next=rerun in date ranges'),
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Extract failed, tempdb full extract=$(vars.extract) rangeDays=$(vars.rangeDays) errorType=$(error.errorType) error=$(error.description) next=rerun in date ranges"]',
    },
    explain: 'rangeDays shows how the rerun is split.',
  },

  // ---------- lg-207 Fenwick Supply: Oracle session use ----------
  {
    id: 'log-17031',
    kind: 'level',
    situation: 'Fenwick’s Oracle session use reached 90 percent of its limit after a scale up.',
    answer: ['WARN'],
    explain: 'A warning before connections are refused.',
  },
  {
    id: 'log-17032',
    kind: 'choice',
    situation: 'Which line best records the pool settings at startup?',
    options: [
      'DB pool configured db=hub maxPoolSize=10 minPoolSize=2 replicas=8 maxTotal=80',
      'jdbc:oracle:thin:hub_user/…@host:1521/HUB',
      'Pool ready',
      'DB pool configured db=hub maxPoolSize=10 minPoolSize=2',
    ],
    answer: 0,
    explain: 'maxTotal shows the share of database sessions the app can take. No URL with credentials. The last line has no replica count, so it hides that 8 replicas can open 80 sessions.',
  },
  {
    id: 'log-17033',
    kind: 'multi',
    situation: 'Which facts help size the pool?',
    options: ['Active connections per replica', 'Idle connections per replica', 'The database session limit', 'The schema password'],
    answers: [0, 1, 2],
    explain: 'Measure use against the limit.',
  },
  {
    id: 'log-17034',
    kind: 'write',
    situation:
      'Fenwick session use is high. vars.db, vars.used, vars.limit and vars.pct hold the facts. Write the line.',
    available: ['vars.db', 'vars.used', 'vars.limit', 'vars.pct', 'vars.connectionString'],
    level: ['WARN'],
    checks: [
      says(/session use|sessions? high|near limit/i, 'Session use high'),
      labelled('db'),
      labelled('used'),
      labelled('limit'),
      labelled('pct'),
      { not: /connectionString/, say: 'Do not log the connection string.' },
      noVague,
    ],
    model: { level: 'WARN', message: '#["Session use high db=$(vars.db) used=$(vars.used) limit=$(vars.limit) pct=$(vars.pct)"]' },
    explain: 'Used and limit together show the headroom left.',
  },
  {
    id: 'log-17035',
    kind: 'write',
    situation:
      'Fenwick rows were rejected because a code had no mapping. They wait in the reject table. vars.field, vars.value and vars.count hold the facts. Write the line, with what happens next.',
    available: ['vars.field', 'vars.value', 'vars.count', 'payload'],
    level: ['WARN'],
    checks: [
      says(/code map miss|no mapping|unknown code/i, 'Code map miss'),
      labelled('field'),
      labelled('value'),
      labelled('count'),
      next('next=rows in reject table'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Code map miss field=$(vars.field) value=$(vars.value) count=$(vars.count) next=rows in reject table"]',
    },
    explain: 'The value tells the business exactly which mapping to add.',
  },

  // ---------- lg-208 Marrow & Pine Home: email bounces ----------
  {
    id: 'log-17036',
    kind: 'level',
    situation: 'Marrow & Pine processed the bounce mailbox and found 40 permanent bounces for store reports.',
    answer: ['WARN'],
    explain: 'Reports did not arrive. WARN with counts.',
  },
  {
    id: 'log-17037',
    kind: 'choice',
    situation: 'Which line best records the bounce run?',
    options: [
      'Bounces processed template=store-report permanent=40 temporary=2 contactsMarked=40',
      'Bounces from anna@store041.example, raj@store052.example …',
      'Bounces processed template=store-report permanent=40 temporary=2',
      'Bounce: <full bounce emails>',
    ],
    answer: 0,
    explain: 'Counts, not addresses. The third line does not say how many contacts were marked, so you cannot check every permanent bounce was handled.',
  },
  {
    id: 'log-17038',
    kind: 'multi',
    situation: 'Which facts help fix bad contacts without exposing addresses?',
    options: ['The store ID of each bad contact', 'The bounce code', 'The count per template', 'The email address in the log'],
    answers: [0, 1, 2],
    explain: 'Use store IDs. Addresses are personal data.',
  },
  {
    id: 'log-17039',
    kind: 'write',
    situation:
      'Marrow & Pine processed bounces. vars.template, vars.permanent, vars.temporary and vars.marked hold the facts. Write the line.',
    available: ['vars.template', 'vars.permanent', 'vars.temporary', 'vars.marked', 'vars.addresses'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/bounces? processed/i, 'Bounces processed'),
      labelled('template'),
      labelled('permanent'),
      labelled('temporary'),
      labelled('(contactsMarked|marked)', 'contactsMarked=$(vars.marked)'),
      { not: /addresses/, say: 'Do not log the addresses.' },
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Bounces processed template=$(vars.template) permanent=$(vars.permanent) temporary=$(vars.temporary) contactsMarked=$(vars.marked)"]',
    },
    explain: 'contactsMarked should match permanent.',
  },
  {
    id: 'log-17040',
    kind: 'write',
    situation:
      'A Marrow & Pine contact was marked bad after a permanent bounce. vars.storeId, vars.bounceCode and vars.template hold the facts. Write the line.',
    available: ['vars.storeId', 'vars.bounceCode', 'vars.template', 'vars.address'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/contact marked|marked bad/i, 'Contact marked bad'),
      labelled('storeId'),
      labelled('bounceCode'),
      labelled('template'),
      { not: /vars\.address/, say: 'Do not log the address. The store ID is enough.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Contact marked bad storeId=$(vars.storeId) bounceCode=$(vars.bounceCode) template=$(vars.template)"]',
    },
    explain: 'The business finds the contact by store ID.',
  },

  // ---------- lg-209 Quayle Freight: replaying rejects ----------
  {
    id: 'log-17041',
    kind: 'level',
    situation: 'Quayle Freight replayed 640 rejected rows after a code map fix. All loaded and were marked RESOLVED.',
    answer: ['INFO'],
    explain: 'A planned recovery that worked.',
  },
  {
    id: 'log-17042',
    kind: 'choice',
    situation: 'Which line best records the replay?',
    options: [
      'Reject replay finished jobId=J-8001 replayed=640 resolved=640 stillOpen=0 requestedBy=support-07',
      'Replay done',
      'Replayed: <640 rows>',
      'Reject replay finished jobId=J-8001 replayed=640 resolved=640 stillOpen=0',
    ],
    answer: 0,
    explain: 'Replayed, resolved and still open add up, and the requester is recorded. The last line leaves out who asked for the replay.',
  },
  {
    id: 'log-17043',
    kind: 'multi',
    situation: 'Which facts show a replay was safe?',
    options: ['How many were replayed', 'How many resolved', 'How many are still open', 'The data in each row'],
    answers: [0, 1, 2],
    explain: 'Counts prove it.',
  },
  {
    id: 'log-17044',
    kind: 'write',
    situation:
      'A Quayle reject replay finished. vars.jobId, vars.replayed, vars.resolved, vars.stillOpen and vars.requestedBy hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.replayed', 'vars.resolved', 'vars.stillOpen', 'vars.requestedBy', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/replay (finished|complete)|replayed/i, 'Reject replay finished'),
      labelled('jobId'),
      labelled('replayed'),
      labelled('resolved'),
      labelled('stillOpen'),
      labelled('requestedBy'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Reject replay finished jobId=$(vars.jobId) replayed=$(vars.replayed) resolved=$(vars.resolved) stillOpen=$(vars.stillOpen) requestedBy=$(vars.requestedBy)"]',
    },
    explain: 'stillOpen above zero means the fix was not complete.',
  },
  {
    id: 'log-17045',
    kind: 'write',
    situation:
      'A Quayle replay was refused because the reject reason has not been marked fixed. vars.jobId and vars.reason hold the facts. Write the line, with what happens next.',
    available: ['vars.jobId', 'vars.reason', 'payload'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/refused|not fixed|blocked/i, 'Replay refused, cause not fixed'),
      labelled('jobId'),
      labelled('reason'),
      next('next=fix cause, then replay'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Replay refused, cause not fixed jobId=$(vars.jobId) reason=$(vars.reason) next=fix cause, then replay"]',
    },
    explain: 'This stops a replay from doubling the reject rows.',
  },

  // ---------- lg-210 Thornbury Freight: bad rows in a large CSV ----------
  {
    id: 'log-17046',
    kind: 'level',
    situation: 'A Thornbury CSV row had 14 fields instead of 12. It was rejected and the load continued.',
    answer: ['WARN'],
    explain: 'The row is handled. WARN so the sender can fix it.',
  },
  {
    id: 'log-17047',
    kind: 'choice',
    situation: 'Which line best records the bad row?',
    options: [
      'Row rejected, wrong field count file=history.csv line=2104411 fields=14 expected=12',
      'Bad row: 2026-11-18,S041,ITM-7731,"Large blue chair, oak legs, pack of 2",…',
      'CSV error',
      'Row rejected, wrong field count file=history.csv fields=14 expected=12',
    ],
    answer: 0,
    explain: 'File, line and counts let the sender find it. The row content stays out. The last line has no line number, so nobody can find the row in a file of millions.',
  },
  {
    id: 'log-17048',
    kind: 'multi',
    situation: 'Which facts belong on the load summary?',
    options: ['Rows read', 'Rows loaded', 'Rows rejected', 'Every rejected line number'],
    answers: [0, 1, 2],
    explain: 'Line numbers go to the reject file. The summary carries counts.',
  },
  {
    id: 'log-17049',
    kind: 'write',
    situation:
      'A Thornbury row had the wrong field count. vars.fileName, vars.lineNo, vars.fields and vars.expected hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.lineNo', 'vars.fields', 'vars.expected', 'vars.row', 'payload'],
    level: ['WARN'],
    checks: [
      says(/rejected|wrong field count/i, 'Row rejected, wrong field count'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('(line|lineNo)', 'line=$(vars.lineNo)'),
      labelled('fields'),
      labelled('expected'),
      { not: /vars\.row\b/, say: 'Do not log the row content.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Row rejected, wrong field count file=$(vars.fileName) line=$(vars.lineNo) fields=$(vars.fields) expected=$(vars.expected)"]',
    },
    explain: 'One line per bad row, with no data in it.',
  },
  {
    id: 'log-17050',
    kind: 'write',
    situation:
      'A Thornbury load finished. vars.fileName, vars.read, vars.loaded, vars.rejected and vars.durationMs hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.read', 'vars.loaded', 'vars.rejected', 'vars.durationMs', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/load (finished|complete)|loaded/i, 'CSV load finished'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('read'),
      labelled('loaded'),
      labelled('rejected'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["CSV load finished file=$(vars.fileName) read=$(vars.read) loaded=$(vars.loaded) rejected=$(vars.rejected) durationMs=$(vars.durationMs)"]',
    },
    explain: 'read should equal loaded plus rejected.',
  },
]
