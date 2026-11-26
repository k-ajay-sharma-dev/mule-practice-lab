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
    situation: 'An Oracle MERGE for job J-7001 staged 60,000 items: 410 inserted, 59,590 updated, none rejected, in 118 seconds. Which line best records it?',
    options: [
      'Item merge finished jobId=J-7001 staged=60000 inserted=410 updated=59590 rejected=0 sql=MERGE INTO item USING item_stage…',
      'Item merge finished jobId=J-7001 staged=60000 merged=60000 rejected=0 durationMs=118000',
      'Item merge finished staged=60000 inserted=410 updated=59590 rejected=0 durationMs=118000',
      'Item merge finished jobId=J-7001 staged=60000 inserted=410 updated=59590 rejected=0 durationMs=118000',
    ],
    answer: 3,
    explain:
      'Counts tie to the job and add up. The SQL text adds nothing and pushed out the time. merged=60000 hides how many items are new. The line without jobId cannot be tied to the job row.',
  },
  {
    id: 'log-15003',
    kind: 'multi',
    situation: 'After an Oracle MERGE, which counts should add up to prove no staged row was lost?',
    options: ['Inserted plus updated', 'Rows in the target table after the MERGE', 'Staged', 'Rejected'],
    answers: [0, 2, 3],
    explain:
      'Staged should equal inserted plus updated plus rejected. The target table also holds rows from earlier loads, so its total is not part of the sum.',
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
      'Counts do not add up after a Fenwick load: staged 4,800, loaded 4,740, rejected 0. The hub sends PARTIAL, not COMPLETED. vars.jobId, vars.staged, vars.loaded and vars.rejected hold the facts. Write the line, with what happens next.',
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
    situation:
      'Oracle rejected item ITM-4410 with ORA-12899, because DESCRIPTION is too long. The row goes to the reject table and the load goes on. Which line best records it?',
    options: [
      'Row rejected table=ITEM itemId=ITM-4410 oraCode=ORA-12899 next=written to reject table',
      'Row rejected table=ITEM itemId=ITM-4410 oraCode=ORA-12899 column=DESCRIPTION next=written to reject table',
      'Row rejected table=ITEM itemId=ITM-4410 oraCode=ORA-12899 column=DESCRIPTION next=retry whole batch',
      'Connection error table=ITEM itemId=ITM-4410 oraCode=ORA-12899 errorType=DB:CONNECTIVITY next=written to reject table',
    ],
    answer: 1,
    explain:
      'Table, key, code and column. The line without column=DESCRIPTION, so the sender does not know which field is too long. A retry sends the same long value and fails again. ORA-12899 is a data error, not a connection error.',
  },
  {
    id: 'log-15008',
    kind: 'multi',
    situation: 'Which Oracle codes point to data the sender must fix, not to a problem on the database side?',
    options: [
      'ORA-12541 no listener',
      'ORA-12899 value too large for column',
      'ORA-00060 deadlock detected',
      'ORA-01400 cannot insert NULL',
      'ORA-02291 parent key not found',
    ],
    answers: [1, 3, 4],
    explain:
      'ORA-12541 is a connection problem. ORA-00060 is a deadlock between sessions, and a retry usually works. The other three are about the row itself.',
  },
  {
    id: 'log-15009',
    kind: 'write',
    situation:
      'A Fenwick row was rejected and goes to the reject table. vars.table, vars.itemId, vars.oraCode and vars.column hold the facts. Write the line, with what happens next.',
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
      'A Fenwick block hit ORA-00001 on insert and was retried as a MERGE. vars.table, vars.block and vars.rows hold the facts. Write the line, with the error.',
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
    situation:
      'PKG_OUT.GET_ITEMS was called with fromDate 2026-11-17 and returned 0 rows in 1.2 seconds. The outbound file came out empty. Which line best records the call?',
    options: [
      'Procedure finished name=PKG_OUT.GET_ITEMS fromDate=2026-11-17 rows=0 durationMs=1200',
      'Procedure finished name=PKG_OUT.GET_ITEMS fromDate=2026-11-17 status=SUCCESS durationMs=1200 file=items_20261118.csv',
      'Procedure finished name=PKG_OUT.GET_ITEMS rows=0 durationMs=1200',
      'Procedure finished name=PKG_OUT.GET_ITEMS fromDate=2026-11-17 rows=0 call=BEGIN PKG_OUT.GET_ITEMS(:1, :2); END;',
    ],
    answer: 0,
    explain:
      'Name, input range, row count and time. status=SUCCESS hides that no rows came back. The line without fromDate cannot tell a wrong window from a day with no data. The raw call adds nothing.',
  },
  {
    id: 'log-15013',
    kind: 'multi',
    situation: 'An outbound items file arrived empty. Which facts help tell a wrong window from a quiet day?',
    options: ['The input window', 'The time the file was written', 'The size of the empty file', 'The rows returned'],
    answers: [0, 3],
    explain:
      'A wrong window shows in the input range, and a quiet day shows as 0 rows for a correct range. The write time and the zero size are the same in both cases.',
  },
  {
    id: 'log-15014',
    kind: 'write',
    situation:
      'A Fenwick procedure finished normally and returned rows. vars.procedure, vars.fromDate, vars.rows and vars.durationMs hold the facts. Write the line.',
    available: ['vars.procedure', 'vars.fromDate', 'vars.rows', 'vars.durationMs', 'vars.params', 'payload'],
    level: ['INFO'],
    checks: [
      says(/procedure (finished|complete|returned)/i, 'Procedure finished'),
      labelled('(name|procedure)', 'name=$(vars.procedure)'),
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
      'A Fenwick async procedure call failed. The job row is set to FAILED. vars.procedure, vars.jobId and the error hold the facts. Write the line, with the error and what happens next.',
    available: ['vars.procedure', 'vars.jobId', 'error.errorType', 'error.description', 'vars.params'],
    level: ['ERROR'],
    checks: [
      says(/procedure failed|call failed/i, 'Procedure failed'),
      labelled('(name|procedure)', 'name=$(vars.procedure)'),
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
    situation: 'Support user support-07 started outbound job J-901 for locations from the console. Which line best records it?',
    options: [
      'Outbound job started jobId=J-901 type=Location trigger=console status=STARTED',
      'Outbound job started jobId=J-901 type=Location trigger=console requestedBy=jane.doe@fenwick.example status=STARTED',
      'Outbound job started jobId=J-901 type=Location trigger=console requestedBy=support-07 status=STARTED',
      'Outbound job started correlationId=3e9a1f type=Location trigger=console requestedBy=support-07 status=STARTED',
    ],
    answer: 2,
    explain:
      'A user ID is enough to trace who asked. The line without requestedBy leaves out who asked, which support needs when two jobs collide. An email address is personal data. The job row is keyed by jobId, so a correlation ID alone cannot be tied to it.',
  },
  {
    id: 'log-15018',
    kind: 'multi',
    situation: 'Two Location jobs ran at the same time and wrote the same file. Which facts show how the second one started?',
    options: ['The output file size', 'The trigger, console or scheduler', 'The job IDs', 'Who requested it'],
    answers: [1, 2, 3],
    explain: 'They show how the second job started. The file size says nothing about who started it.',
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
      labelled('(type|jobType)', 'type=$(vars.jobType)'),
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
      'A Fenwick start request was refused because a job of the same type is already running. vars.jobType, vars.runningJobId and vars.requestedBy hold the facts. The API returns 409. Write the line.',
    available: ['vars.jobType', 'vars.runningJobId', 'vars.requestedBy', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/already running|refused|conflict/i, 'Job already running, request refused'),
      labelled('(type|jobType)', 'type=$(vars.jobType)'),
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
    situation: 'A Fenwick run waited 10 seconds for a row lock on the job table and gave up with ORA-30006. The run will try again next time.',
    answer: ['WARN'],
    explain: 'The run will try later. WARN shows contention.',
  },
  {
    id: 'log-15022',
    kind: 'choice',
    situation: 'SELECT … FOR UPDATE WAIT 10 on OUT_JOB timed out with ORA-30006. The job tries again on the next run. Which line best records it?',
    options: [
      'Lock wait timed out waitSec=10 oraCode=ORA-30006 next=retry next run',
      'Deadlock detected table=OUT_JOB waitSec=10 oraCode=ORA-30006 next=retry next run',
      'Lock wait timed out table=OUT_JOB waitSec=10 oraCode=ORA-30006 next=retry next run',
      'Lock wait timed out table=OUT_JOB oraCode=ORA-30006 sql=SELECT … FOR UPDATE WAIT 10 params=[J-901]',
    ],
    answer: 2,
    explain:
      'Table, wait and code, so support can ask the DBA who held the lock. The lock wait line without table=OUT_JOB gives no table. ORA-30006 is a lock wait timeout, a deadlock is ORA-00060. The SQL and its parameters do not belong in the log, and that line lost the next step.',
  },
  {
    id: 'log-15023',
    kind: 'multi',
    situation: 'A job row stayed locked for hours after a crash. Which log lines help find a transaction left open?',
    options: ['When the transaction began', 'Each row read inside it', 'The error that ended a run', 'When it committed or rolled back'],
    answers: [0, 2, 3],
    explain: 'A begin without an end is the clue. Lines for every row read flood the log and do not show the end.',
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
      'A Fenwick run failed mid transaction and rolled back. vars.jobId and vars.rowsClaimed hold the facts. Write the line, with the error.',
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
    situation: 'The job report for J-5521 went to 4 recipients with template job-report, 18,400 bytes. Which line best records it?',
    options: [
      'Email sent template=job-report jobId=J-5521 to=anna@marrow.example,raj@marrow.example,+2 sizeBytes=18400',
      'Email sent template=job-report recipients=4 sizeBytes=18400',
      'Email sent template=job-report jobId=J-5521 recipients=4 body=Dear team, the job J-5521 finished …',
      'Email sent template=job-report jobId=J-5521 recipients=4 sizeBytes=18400',
    ],
    answer: 3,
    explain:
      'Template, job and a count. Addresses are personal data. The line without jobId cannot tell which job report went out. The body belongs in the mail system, not the log.',
  },
  {
    id: 'log-15028',
    kind: 'multi',
    situation: 'A manager says the J-5521 report never arrived. Which facts on the send line help the mail team trace delivery?',
    options: ['The job ID', 'The template', 'The name of the Mule flow that sent it', 'The time it was sent'],
    answers: [0, 1, 3],
    explain: 'With these, the mail team can find the message. The flow name helps a developer, not the mail team.',
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
      labelled('(recipients|recipientCount)', 'recipients=$(vars.recipientCount)'),
      noRecipients,
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
      'A Marrow & Pine email failed with a temporary SMTP error. The job status is not changed. It will retry. vars.template, vars.jobId, vars.smtpCode and vars.attempt hold the facts. Write the line, with what happens next.',
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
    situation: 'The supplier-asn mailbox received ASN 7710 with one attachment. It was processed and moved to Processed. Which line best records it?',
    options: [
      'Mail processed mailbox=supplier-asn from=bob.supplier@supplier-c.example asn=7710 attachments=1 movedTo=Processed',
      'Mail processed mailbox=supplier-asn messageId=<a1b2@supplier-c.example> asn=7710 attachments=1 movedTo=Processed',
      'Mail processed mailbox=supplier-asn messageId=<a1b2@supplier-c.example> subject=ASN 7710 for your Leeds store movedTo=Processed',
      'Mail processed mailbox=supplier-asn asn=7710 attachments=1 movedTo=Processed',
    ],
    answer: 1,
    explain:
      'Message ID and ASN number. The sender address is personal data and does not identify the email. The subject is free text and the ASN is missing from that line. The line without messageId, so the email cannot be found in the mailbox or checked for a repeat.',
  },
  {
    id: 'log-15033',
    kind: 'multi',
    situation: 'Which facts prove an ASN email was not processed twice?',
    options: ['The attachment file size', 'The message ID', 'The folder it was moved to', 'The ASN number'],
    answers: [1, 2, 3],
    explain: 'IDs and the move show its path. Two different ASNs can have the same attachment size.',
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
      labelled('(movedTo|folder)', 'movedTo=$(vars.folder)'),
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
    situation:
      'The reject report for J-6101, 410,000 rejects and 38 MB, was stored as rejects_20261118.csv in container reports, and a summary email went out. Which line best records it?',
    options: [
      'Report stored, summary emailed jobId=J-6101 rejects=410000 container=reports blob=rejects_20261118.csv sizeBytes=38000000',
      'Report stored, summary emailed jobId=J-6101 rejects=410000 url=https://hubstore.blob.core.windows.net/reports/rejects_20261118.csv?sv=…&sig=…',
      'Report stored, summary emailed jobId=J-6101 rejects=410000 sizeBytes=38000000',
      'Report stored, summary emailed jobId=J-6101 rejects=410000 container=reports blob=rejects_20261118.csv topRejects=<first 100 rows>',
    ],
    answer: 0,
    explain:
      'Where it is stored and how big. A signed link grants access to anyone who reads the log. The line with only sizeBytes does not say where the report is, so nobody can find it later. The rows belong in the report, not the log.',
  },
  {
    id: 'log-15038',
    kind: 'multi',
    situation: 'Rejects jumped from 0.2% to 4% for one job. Which facts belong on the alert?',
    options: ['The job ID', 'The reject rate against the normal rate', 'The first 50 rejected rows', 'The top reject reason'],
    answers: [0, 1, 3],
    explain: 'A spike in rejects is a data problem worth chasing. The rows belong in the stored report, not the alert.',
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
      labelled('(blob|blobName)', 'blob=$(vars.blobName)'),
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
    situation: 'The daily report expected 42 runs. 38 completed, 2 failed, and plan-in and alloc-in never started. Which line best records it?',
    options: [
      'Daily report built date=2026-11-18 expected=42 completed=38 failed=2',
      'Daily report built date=2026-11-18 completed=38 failed=2 failedJobs=stock-in,price-in status=AMBER',
      'Daily report built date=2026-11-18 expected=42 completed=38 failed=2 missing=2 missingJobs=plan-in,alloc-in',
      'Daily report built date=2026-11-18 expected=42 completed=38 failed=4 failedJobs=stock-in,price-in,plan-in,alloc-in',
    ],
    answer: 2,
    explain:
      'Expected against completed shows missing runs, not only failures. The line that ends at failed=2 leaves the 2 jobs that never ran unnamed. The AMBER line has no expected count, so missing jobs cannot show. failed=4 calls the missing jobs failed, and support then looks for errors that were never raised.',
  },
  {
    id: 'log-15043',
    kind: 'multi',
    situation: 'The daily report has shown 0 failures for a week, yet a store says its plans are missing. Which facts should the report carry?',
    options: ['Expected jobs', 'Completed jobs', 'The failed count alone', 'Missing jobs by name'],
    answers: [0, 1, 3],
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
    situation: 'plan-in failed (job J-7720), so 260 stores have no plans for the morning. On call must be paged. Which line best records the alert?',
    options: [
      'Impact alert raised cause=plan-in failed jobId=J-7720 route=on-call',
      'Impact alert raised impact=stores without plans cause=plan-in failed jobId=J-7720 route=on-call error=java.sql.SQLException at …',
      'Impact alert raised impact=stores without plans stores=260 cause=plan-in failed jobId=J-7720 route=daily summary',
      'Impact alert raised impact=stores without plans stores=260 cause=plan-in failed jobId=J-7720 route=on-call',
    ],
    answer: 3,
    explain:
      'The impact, the scale, the cause and who was told. The line without impact gives only the technical cause, so on call cannot see that stores are affected. The stack trace line has no store count. A daily summary is too late for stores that need plans by morning.',
  },
  {
    id: 'log-15048',
    kind: 'multi',
    situation: 'On call gets 300 alerts a night and has started to ignore them. Which changes make alerts less noisy without hiding real problems?',
    options: [
      'Group repeats of the same cause into one alert',
      'Raise the alert threshold until fewer than 10 fire',
      'Alert on impact, not on every error line',
      'Send low urgency items in a daily summary',
    ],
    answers: [0, 2, 3],
    explain: 'Fewer, clearer alerts get read. Raising a threshold to hit a number hides real problems along with the noise.',
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
