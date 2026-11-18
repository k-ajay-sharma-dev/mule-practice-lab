// Logging Lab exercises, set 15. See ../exercises.js for the format.
// Theme: Oracle loads and email notifications in a product data hub. Staging, MERGE, rejects, procedures, job rows,
// locks, async email, mailbox polling, report summaries and alert noise.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
const noSql = { not: /vars\.sqlText|vars\.params/i, say: 'Do not log the full SQL text or its parameter values. Log the statement or procedure name.' }
const noRecipients = { not: /vars\.recipients|vars\.toList|vars\.body/i, say: 'Do not log the recipient list or the email body. Log a count and the template.' }

export const SET_15 = [
  // ---------- lg-181 Fenwick Supply: staging and MERGE in Oracle ----------
  {
    id: 'log-15001',
    kind: 'level',
    situation: 'Fenwick Supply merged 60,000 staged items into the item table. 410 were new and the rest updated.',
    answer: ['INFO'],
    explain: 'A normal finished merge gets one INFO line with counts.',
  },
  {
    id: 'log-15002',
    kind: 'choice',
    situation: 'Which line best records the Oracle MERGE?',
    options: [
      'Item merge finished jobId=J-7001 staged=60000 inserted=410 updated=59590 rejected=0 durationMs=118000',
      'MERGE INTO item USING item_stage ON (…) WHEN MATCHED … finished',
      'Merged',
      'Items: <60,000 rows>',
    ],
    answer: 0,
    explain: 'Counts tie to the job and add up. The SQL text adds nothing.',
  },
  {
    id: 'log-15003',
    kind: 'multi',
    situation: 'Which counts should add up after a MERGE?',
    options: ['Staged', 'Inserted plus updated', 'Rejected', 'Duration'],
    answers: [0, 1, 2],
    explain: 'Staged should equal inserted plus updated plus rejected.',
  },
  {
    id: 'log-15004',
    kind: 'write',
    situation:
      'A Fenwick item MERGE finished. vars.jobId, vars.staged, vars.inserted, vars.updated, vars.rejected and vars.durationMs hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.staged', 'vars.inserted', 'vars.updated', 'vars.rejected', 'vars.durationMs', 'vars.sqlText'],
    level: ['INFO'],
    checks: [
      says(/merge (finished|complete)|merged/i, 'Item merge finished'),
      labelled('jobId'),
      labelled('staged'),
      labelled('inserted'),
      labelled('updated'),
      labelled('rejected'),
      durationVar,
      noSql,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Item merge finished jobId=$(vars.jobId) staged=$(vars.staged) inserted=$(vars.inserted) updated=$(vars.updated) rejected=$(vars.rejected) durationMs=$(vars.durationMs)"]',
    },
    explain: 'If staged does not equal the sum, a row went missing.',
  },
  {
    id: 'log-15005',
    kind: 'write',
    situation:
      'Counts do not add up after a Fenwick load: staged 4,800, loaded 4,740, rejected 0. The hub sends PARTIAL, not COMPLETED. vars.jobId, vars.staged, vars.loaded and vars.rejected hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.staged', 'vars.loaded', 'vars.rejected', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/counts? (do not|don.t) add up|mismatch|unaccounted/i, 'Counts do not add up'),
      labelled('jobId'),
      labelled('staged'),
      labelled('loaded'),
      labelled('rejected'),
      next('next=PARTIAL ack sent'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Counts do not add up jobId=$(vars.jobId) staged=$(vars.staged) loaded=$(vars.loaded) rejected=$(vars.rejected) next=PARTIAL ack sent"]',
    },
    explain: 'Records went missing silently. This line and the honest ack catch it.',
  },

  // ---------- lg-182 Fenwick Supply: rejects and constraint errors ----------
  {
    id: 'log-15006',
    kind: 'level',
    situation: 'One Fenwick row failed with ORA-12899, value too large for column. It goes to the reject table and the rest load.',
    answer: ['WARN'],
    explain: 'Handled by design. WARN so the data team sees it.',
  },
  {
    id: 'log-15007',
    kind: 'choice',
    situation: 'Which line best records the rejected row?',
    options: [
      'Row rejected table=ITEM itemId=ITM-4410 oraCode=ORA-12899 column=DESCRIPTION next=written to reject table',
      'INSERT INTO item VALUES (’ITM-4410’, ’a very long description …’) failed',
      'Bad row',
      'Oracle error',
    ],
    answer: 0,
    explain: 'Table, key, code and column. Not the statement with the values.',
  },
  {
    id: 'log-15008',
    kind: 'multi',
    situation: 'Which Oracle codes point to data problems the sender must fix?',
    options: ['ORA-12899 value too large', 'ORA-01400 cannot insert NULL', 'ORA-02291 parent key not found', 'ORA-12541 no listener'],
    answers: [0, 1, 2],
    explain: 'ORA-12541 is a connection problem, not bad data.',
  },
  {
    id: 'log-15009',
    kind: 'write',
    situation:
      'A Fenwick row was rejected. vars.table, vars.itemId, vars.oraCode and vars.column hold the facts. Write the line.',
    available: ['vars.table', 'vars.itemId', 'vars.oraCode', 'vars.column', 'vars.sqlText', 'vars.params'],
    level: ['WARN'],
    checks: [
      says(/rejected|row failed/i, 'Row rejected'),
      labelled('table'),
      labelled('itemId'),
      labelled('oraCode'),
      labelled('column'),
      next('next=written to reject table'),
      noSql,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Row rejected table=$(vars.table) itemId=$(vars.itemId) oraCode=$(vars.oraCode) column=$(vars.column) next=written to reject table"]',
    },
    explain: 'The column tells the sender which field to shorten.',
  },
  {
    id: 'log-15010',
    kind: 'write',
    situation:
      'A Fenwick block hit ORA-00001 on insert and was retried as a MERGE. vars.table, vars.block and vars.rows hold the facts. Write the line.',
    available: ['vars.table', 'vars.block', 'vars.rows', 'error.errorType', 'error.description', 'vars.sqlText'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/unique|duplicate key|retried as merge/i, 'Duplicate key, retried as merge'),
      labelled('table'),
      labelled('block'),
      labelled('rows'),
      errorFacts,
      noSql,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Duplicate key, retried as merge table=$(vars.table) block=$(vars.block) rows=$(vars.rows) errorType=$(error.errorType) error=$(error.description)"]',
    },
    explain: 'Many of these mean the load should use MERGE from the start.',
  },

  // ---------- lg-183 Fenwick Supply: stored procedures ----------
  {
    id: 'log-15011',
    kind: 'level',
    situation: 'A Fenwick outbound procedure returned a cursor with 0 rows on a business day.',
    answer: ['WARN'],
    explain: 'Zero rows on a business day is unusual. Warn so someone checks.',
  },
  {
    id: 'log-15012',
    kind: 'choice',
    situation: 'Which line best records the procedure call?',
    options: [
      'Procedure finished name=PKG_OUT.GET_ITEMS fromDate=2026-11-17 rows=0 durationMs=1200 expectedRows=>0',
      'Called procedure',
      'BEGIN PKG_OUT.GET_ITEMS(:1, :2); END; with params [’2026-11-17’, cursor]',
      'Done',
    ],
    answer: 0,
    explain: 'Name, input range, row count and time. Not the raw call.',
  },
  {
    id: 'log-15013',
    kind: 'multi',
    situation: 'Which facts help when an outbound file is empty?',
    options: ['The procedure name', 'The input window', 'The rows returned', 'The database password'],
    answers: [0, 1, 2],
    explain: 'Wrong window, no data or an undeclared cursor all show up here.',
  },
  {
    id: 'log-15014',
    kind: 'write',
    situation:
      'A Fenwick procedure finished. vars.procedure, vars.fromDate, vars.rows and vars.durationMs hold the facts. Write the line.',
    available: ['vars.procedure', 'vars.fromDate', 'vars.rows', 'vars.durationMs', 'vars.params', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/procedure (finished|complete|returned)/i, 'Procedure finished'),
      labelled('name', 'name=$(vars.procedure)'),
      labelled('fromDate'),
      labelled('rows'),
      durationVar,
      noSql,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Procedure finished name=$(vars.procedure) fromDate=$(vars.fromDate) rows=$(vars.rows) durationMs=$(vars.durationMs)"]',
    },
    explain: 'One line per call that a dashboard can trend.',
  },
  {
    id: 'log-15015',
    kind: 'write',
    situation:
      'A Fenwick async procedure call failed. The job row is set to FAILED. vars.procedure, vars.jobId and the error hold the facts. Write the line.',
    available: ['vars.procedure', 'vars.jobId', 'error.errorType', 'error.description', 'vars.params'],
    level: ['ERROR'],
    checks: [
      says(/procedure failed|call failed/i, 'Procedure failed'),
      labelled('name', 'name=$(vars.procedure)'),
      labelled('jobId'),
      errorFacts,
      next('next=job set to FAILED'),
      noSql,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Procedure failed name=$(vars.procedure) jobId=$(vars.jobId) errorType=$(error.errorType) error=$(error.description) next=job set to FAILED"]',
    },
    explain: 'The job ID links the console status to this line.',
  },

  // ---------- lg-184 Fenwick Supply: job rows and the outbound console ----------
  {
    id: 'log-15016',
    kind: 'level',
    situation: 'A support user started an outbound Location job from the console. A job row was written with status STARTED.',
    answer: ['INFO'],
    explain: 'Who started what is useful for support. INFO.',
  },
  {
    id: 'log-15017',
    kind: 'choice',
    situation: 'Which line best records the started job?',
    options: [
      'Outbound job started jobId=J-901 type=Location trigger=console requestedBy=support-07 status=STARTED',
      'Job started by jane.doe@fenwick.example from 10.1.2.3',
      'Started',
      'Location!',
    ],
    answer: 0,
    explain: 'A user ID, not an email address, is enough to trace who asked.',
  },
  {
    id: 'log-15018',
    kind: 'multi',
    situation: 'Which facts help when two jobs of the same type run at once?',
    options: ['The job IDs', 'The trigger, console or scheduler', 'Who requested it', 'The output file content'],
    answers: [0, 1, 2],
    explain: 'They show how the second job started.',
  },
  {
    id: 'log-15019',
    kind: 'write',
    situation:
      'A Fenwick job started. vars.jobId, vars.jobType, vars.trigger and vars.requestedBy hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.jobType', 'vars.trigger', 'vars.requestedBy', 'vars.userEmail', 'payload'],
    level: ['INFO'],
    checks: [
      says(/job started|started/i, 'Outbound job started'),
      labelled('jobId'),
      labelled('type', 'type=$(vars.jobType)'),
      labelled('trigger'),
      labelled('requestedBy'),
      { not: /userEmail/, say: 'Log the user ID, not the email address.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Outbound job started jobId=$(vars.jobId) type=$(vars.jobType) trigger=$(vars.trigger) requestedBy=$(vars.requestedBy)"]',
    },
    explain: 'A user ID traces the request without personal data.',
  },
  {
    id: 'log-15020',
    kind: 'write',
    situation:
      'A Fenwick start request was refused because a job of the same type is already running. vars.jobType and vars.runningJobId hold the facts. The API returns 409. Write the line.',
    available: ['vars.jobType', 'vars.runningJobId', 'vars.requestedBy', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/already running|refused|conflict/i, 'Job already running, request refused'),
      labelled('type', 'type=$(vars.jobType)'),
      labelled('runningJobId'),
      labelled('requestedBy'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Job already running, request refused type=$(vars.jobType) runningJobId=$(vars.runningJobId) requestedBy=$(vars.requestedBy)"]',
    },
    explain: 'This line proves the guard worked.',
  },

  // ---------- lg-185 Fenwick Supply: locks and long transactions ----------
  {
    id: 'log-15021',
    kind: 'level',
    situation: 'A Fenwick run waited 10 seconds for a row lock on the job table and gave up with ORA-30006.',
    answer: ['WARN'],
    explain: 'The run will try later. WARN shows contention.',
  },
  {
    id: 'log-15022',
    kind: 'choice',
    situation: 'Which line best records the lock wait?',
    options: [
      'Lock wait timed out table=OUT_JOB waitSec=10 oraCode=ORA-30006 next=retry next run',
      'Locked',
      'SELECT … FOR UPDATE WAIT 10 failed with params …',
      'DB stuck',
    ],
    answer: 0,
    explain: 'Table, wait and code. Support can then ask the DBA who held it.',
  },
  {
    id: 'log-15023',
    kind: 'multi',
    situation: 'Which lines help find a transaction left open?',
    options: ['When the transaction began', 'When it committed or rolled back', 'The error that ended a run', 'Each row read'],
    answers: [0, 1, 2],
    explain: 'A begin without an end is the clue.',
  },
  {
    id: 'log-15024',
    kind: 'write',
    situation:
      'A Fenwick lock wait timed out. vars.table, vars.waitSec and vars.oraCode hold the facts. The run will retry next time. Write the line.',
    available: ['vars.table', 'vars.waitSec', 'vars.oraCode', 'vars.sqlText'],
    level: ['WARN'],
    checks: [
      says(/lock/i, 'Lock wait timed out'),
      labelled('table'),
      labelled('waitSec'),
      labelled('oraCode'),
      next('next=retry next run'),
      noSql,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Lock wait timed out table=$(vars.table) waitSec=$(vars.waitSec) oraCode=$(vars.oraCode) next=retry next run"]',
    },
    explain: 'Several in a row point to a session holding locks.',
  },
  {
    id: 'log-15025',
    kind: 'write',
    situation:
      'A Fenwick run failed mid transaction and rolled back. vars.jobId and vars.rowsClaimed hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.rowsClaimed', 'error.errorType', 'error.description', 'vars.sqlText'],
    level: ['ERROR'],
    checks: [
      says(/rolled back|rollback/i, 'Run failed, transaction rolled back'),
      labelled('jobId'),
      labelled('rowsClaimed'),
      errorFacts,
      noSql,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Run failed, transaction rolled back jobId=$(vars.jobId) rowsClaimed=$(vars.rowsClaimed) errorType=$(error.errorType) error=$(error.description)"]',
    },
    explain: 'The rollback line proves the locks were released.',
  },

  // ---------- lg-186 Marrow & Pine Home: async notification emails ----------
  {
    id: 'log-15026',
    kind: 'level',
    situation: 'A Marrow & Pine job report email was sent after the job completed.',
    answer: ['INFO', 'DEBUG'],
    explain: 'INFO if support checks report delivery, DEBUG otherwise.',
  },
  {
    id: 'log-15027',
    kind: 'choice',
    situation: 'Which line best records the sent email?',
    options: [
      'Email sent template=job-report jobId=J-5521 recipients=4 sizeBytes=18400',
      'Email sent to anna@marrow.example, raj@marrow.example, …',
      'Email body: Dear team, the job …',
      'Mail ok',
    ],
    answer: 0,
    explain: 'Template, job and a count. Addresses and bodies stay out.',
  },
  {
    id: 'log-15028',
    kind: 'multi',
    situation: 'Which facts help when someone says they never got the report?',
    options: ['The template', 'The job ID', 'The time it was sent', 'The full body text'],
    answers: [0, 1, 2],
    explain: 'With these, the mail team can trace delivery.',
  },
  {
    id: 'log-15029',
    kind: 'write',
    situation:
      'A Marrow & Pine report email was sent. vars.template, vars.jobId and vars.recipientCount hold the facts. Write the line.',
    available: ['vars.template', 'vars.jobId', 'vars.recipientCount', 'vars.recipients', 'vars.body'],
    level: ['INFO'],
    checks: [
      says(/sent/i, 'Report sent'),
      labelled('template'),
      labelled('jobId'),
      labelled('recipients', 'recipients=$(vars.recipientCount)'),
      noRecipients,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Report sent template=$(vars.template) jobId=$(vars.jobId) recipients=$(vars.recipientCount)"]',
    },
    explain: 'A count is enough. Addresses are personal data.',
  },
  {
    id: 'log-15030',
    kind: 'write',
    situation:
      'A Marrow & Pine email failed with a temporary SMTP error. The job status is not changed. It will retry. vars.template, vars.jobId, vars.smtpCode and vars.attempt hold the facts. Write the line.',
    available: ['vars.template', 'vars.jobId', 'vars.smtpCode', 'vars.attempt', 'vars.recipients', 'error.description'],
    level: ['WARN'],
    checks: [
      says(/email failed|not sent|send failed/i, 'Email send failed'),
      labelled('template'),
      labelled('jobId'),
      labelled('smtpCode'),
      labelled('attempt'),
      next('next=retry, job status unchanged'),
      noRecipients,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Email send failed template=$(vars.template) jobId=$(vars.jobId) smtpCode=$(vars.smtpCode) attempt=$(vars.attempt) next=retry, job status unchanged"]',
    },
    explain: '“job status unchanged” stops anyone reloading data for an email problem.',
  },

  // ---------- lg-187 Marrow & Pine Home: mailbox polling ----------
  {
    id: 'log-15031',
    kind: 'level',
    situation: 'A Marrow & Pine mailbox poller read a supplier ASN email, posted it and moved it to the processed folder.',
    answer: ['INFO'],
    explain: 'One INFO line per business document.',
  },
  {
    id: 'log-15032',
    kind: 'choice',
    situation: 'Which line best records the processed email?',
    options: [
      'Mail processed mailbox=supplier-asn messageId=<a1b2@supplier-c.example> asn=7710 attachments=1 movedTo=Processed',
      'Mail from bob.supplier@supplier-c.example subject "ASN 7710 for your Leeds store" processed',
      'Processed mail',
      'Attachment: <base64 …>',
    ],
    answer: 0,
    explain: 'Message ID and ASN number. Sender addresses and content stay out.',
  },
  {
    id: 'log-15033',
    kind: 'multi',
    situation: 'Which facts prove an email was not processed twice?',
    options: ['The message ID', 'The ASN number', 'The folder it was moved to', 'The sender’s phone number'],
    answers: [0, 1, 2],
    explain: 'IDs and the move show its path.',
  },
  {
    id: 'log-15034',
    kind: 'write',
    situation:
      'A Marrow & Pine email was processed. vars.mailbox, vars.messageId, vars.asn and vars.folder hold the facts. Write the line.',
    available: ['vars.mailbox', 'vars.messageId', 'vars.asn', 'vars.folder', 'vars.from', 'vars.subject', 'payload'],
    level: ['INFO'],
    checks: [
      says(/processed|posted/i, 'Mail processed'),
      labelled('mailbox'),
      labelled('messageId'),
      labelled('asn'),
      labelled('movedTo', 'movedTo=$(vars.folder)'),
      { not: /vars\.from|vars\.subject/, say: 'Leave out the sender address and subject. They can hold personal data.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Mail processed mailbox=$(vars.mailbox) messageId=$(vars.messageId) asn=$(vars.asn) movedTo=$(vars.folder)"]',
    },
    explain: 'The message ID finds the email in the mailbox if needed.',
  },
  {
    id: 'log-15035',
    kind: 'write',
    situation:
      'A Marrow & Pine email had no valid attachment and was moved to the error folder. vars.mailbox, vars.messageId and vars.reason hold the facts. Write the line.',
    available: ['vars.mailbox', 'vars.messageId', 'vars.reason', 'vars.from', 'payload'],
    level: ['WARN'],
    checks: [
      says(/error folder|rejected|not processed/i, 'Mail moved to error folder'),
      labelled('mailbox'),
      labelled('messageId'),
      labelled('reason'),
      { not: /vars\.from/, say: 'Leave out the sender address.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Mail moved to error folder mailbox=$(vars.mailbox) messageId=$(vars.messageId) reason=$(vars.reason)"]',
    },
    explain: 'The reason tells support what to ask the supplier for.',
  },

  // ---------- lg-188 Marrow & Pine Home: report emails with summaries ----------
  {
    id: 'log-15036',
    kind: 'level',
    situation: 'The reject report was too big to attach. It was stored, and a summary email with a link was sent.',
    answer: ['INFO'],
    explain: 'The fallback worked. INFO with the storage location.',
  },
  {
    id: 'log-15037',
    kind: 'choice',
    situation: 'Which line best records the summary email?',
    options: [
      'Report stored, summary emailed jobId=J-6101 rejects=410000 container=reports blob=rejects_20261118.csv sizeBytes=38000000',
      'Report link https://…/rejects.csv?sv=…&sig=… emailed',
      'Big report',
      'Rejects: <410,000 rows>',
    ],
    answer: 0,
    explain: 'Where it is stored and how big. Not the signed link.',
  },
  {
    id: 'log-15038',
    kind: 'multi',
    situation: 'Which facts should alert someone on a reject report?',
    options: ['A reject count far above normal', 'The job ID', 'The top reject reason', 'The font used'],
    answers: [0, 1, 2],
    explain: 'A spike in rejects is a data problem worth chasing.',
  },
  {
    id: 'log-15039',
    kind: 'write',
    situation:
      'A Marrow & Pine reject report was stored and a summary sent. vars.jobId, vars.rejects, vars.container, vars.blobName and vars.sizeBytes hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.rejects', 'vars.container', 'vars.blobName', 'vars.sizeBytes', 'vars.link', 'payload'],
    level: ['INFO'],
    checks: [
      says(/stored|summary/i, 'Report stored, summary emailed'),
      labelled('jobId'),
      labelled('rejects'),
      labelled('container'),
      labelled('blob', 'blob=$(vars.blobName)'),
      labelled('sizeBytes'),
      { not: /vars\.link|sig=/, say: 'Do not log the signed link.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Report stored, summary emailed jobId=$(vars.jobId) rejects=$(vars.rejects) container=$(vars.container) blob=$(vars.blobName) sizeBytes=$(vars.sizeBytes)"]',
    },
    explain: 'The container and name find the file without exposing a link.',
  },
  {
    id: 'log-15040',
    kind: 'write',
    situation:
      'A Marrow & Pine reject rate was far above normal. vars.jobId, vars.rejectPct, vars.normalPct and vars.topReason hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.rejectPct', 'vars.normalPct', 'vars.topReason', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/reject rate|rejects? (high|above)/i, 'Reject rate high'),
      labelled('jobId'),
      labelled('rejectPct'),
      labelled('normalPct'),
      labelled('topReason'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Reject rate high jobId=$(vars.jobId) rejectPct=$(vars.rejectPct) normalPct=$(vars.normalPct) topReason=$(vars.topReason)"]',
    },
    explain: 'The top reason usually points to one upstream change.',
  },

  // ---------- lg-189 Marrow & Pine Home: the daily integration report ----------
  {
    id: 'log-15041',
    kind: 'level',
    situation: 'The daily report found 2 expected jobs with no row by 07:00.',
    answer: ['ERROR'],
    explain: 'Jobs that did not run at all are worse than jobs that failed.',
  },
  {
    id: 'log-15042',
    kind: 'choice',
    situation: 'Which line best records the daily report?',
    options: [
      'Daily report built date=2026-11-18 expected=42 completed=38 failed=2 missing=2 missingJobs=plan-in,alloc-in',
      'All integrations OK',
      'Report: <full HTML report>',
      'Report sent',
    ],
    answer: 0,
    explain: 'Expected against completed shows missing runs, not only failures.',
  },
  {
    id: 'log-15043',
    kind: 'multi',
    situation: 'Which facts make the report honest?',
    options: ['Expected jobs', 'Completed jobs', 'Missing jobs by name', 'Only the failed count'],
    answers: [0, 1, 2],
    explain: 'Counting only failures hides jobs that never started.',
  },
  {
    id: 'log-15044',
    kind: 'write',
    situation:
      'Write the Marrow & Pine daily report line. vars.date, vars.expected, vars.completed, vars.failed and vars.missing hold the facts.',
    available: ['vars.date', 'vars.expected', 'vars.completed', 'vars.failed', 'vars.missing', 'payload'],
    level: ['INFO', 'ERROR'],
    checks: [
      says(/daily report|report built/i, 'Daily report built'),
      labelled('date'),
      labelled('expected'),
      labelled('completed'),
      labelled('failed'),
      labelled('missing'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Daily report built date=$(vars.date) expected=$(vars.expected) completed=$(vars.completed) failed=$(vars.failed) missing=$(vars.missing)"]',
    },
    explain: 'Expected minus completed should equal failed plus missing.',
  },
  {
    id: 'log-15045',
    kind: 'write',
    situation:
      'An expected Marrow & Pine job has no row by its deadline. vars.job, vars.deadline and vars.lastRun hold the facts. Write the line.',
    available: ['vars.job', 'vars.deadline', 'vars.lastRun', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/missing|did not run|no run/i, 'Expected job missing'),
      labelled('job'),
      labelled('deadline'),
      labelled('lastRun'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Expected job missing job=$(vars.job) deadline=$(vars.deadline) lastRun=$(vars.lastRun)"]',
    },
    explain: 'lastRun shows how long it has been silent.',
  },

  // ---------- lg-190 Marrow & Pine Home: alerts with impact ----------
  {
    id: 'log-15046',
    kind: 'level',
    situation: 'Stores have no replenishment plans for today because the plan load failed. An impact alert is raised.',
    answer: ['ERROR'],
    explain: 'Business impact now. ERROR and page.',
  },
  {
    id: 'log-15047',
    kind: 'choice',
    situation: 'Which line best records the impact alert?',
    options: [
      'Impact alert raised impact=stores without plans stores=260 cause=plan-in failed jobId=J-7720 route=on-call',
      'ERROR in plan-in',
      'Alert!!!',
      'Plan load: <stack trace>',
    ],
    answer: 0,
    explain: 'The impact, the scale, the cause and who was told.',
  },
  {
    id: 'log-15048',
    kind: 'multi',
    situation: 'Which make alerts less noisy?',
    options: ['Group repeats of the same cause into one alert', 'Alert on impact, not on every error line', 'Send low urgency items in a daily summary', 'Email every ERROR line'],
    answers: [0, 1, 2],
    explain: 'Fewer, clearer alerts get read.',
  },
  {
    id: 'log-15049',
    kind: 'write',
    situation:
      'Write the Marrow & Pine impact alert line. vars.impact, vars.scope, vars.cause, vars.jobId and vars.route hold the facts.',
    available: ['vars.impact', 'vars.scope', 'vars.cause', 'vars.jobId', 'vars.route', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/impact alert|alert raised/i, 'Impact alert raised'),
      labelled('impact'),
      labelled('scope'),
      labelled('cause'),
      labelled('jobId'),
      labelled('route'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Impact alert raised impact=$(vars.impact) scope=$(vars.scope) cause=$(vars.cause) jobId=$(vars.jobId) route=$(vars.route)"]',
    },
    explain: 'Impact first, then the technical cause.',
  },
  {
    id: 'log-15050',
    kind: 'write',
    situation:
      'Marrow & Pine grouped 140 repeats of the same error into one alert. vars.cause, vars.count, vars.firstAt and vars.lastAt hold the facts. Write the line.',
    available: ['vars.cause', 'vars.count', 'vars.firstAt', 'vars.lastAt', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/grouped|repeated|suppressed/i, 'Alert grouped'),
      labelled('cause'),
      labelled('count'),
      labelled('firstAt'),
      labelled('lastAt'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Alert grouped cause=$(vars.cause) count=$(vars.count) firstAt=$(vars.firstAt) lastAt=$(vars.lastAt)"]',
    },
    explain: 'One line with a count replaces 140 emails.',
  },
]
