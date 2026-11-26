// Logging Lab exercises, set 16. See ../exercises.js for the format.
// Theme: batch jobs and large files. Job start and On Complete, failed records, aggregator groups, run locks,
// checkpoints, large file intake, split exports, checksums, archives and step timelines.
import { errorFacts, labelled, noPayload, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
const noRecord = { not: /vars\.record\b|vars\.row\b/i, say: 'Do not log the whole record. Log its key.' }

export const SET_16 = [
  // ---------- lg-191 Quayle Freight: batch job start and On Complete ----------
  {
    id: 'log-16001',
    kind: 'level',
    situation: 'Quayle Freight started a nightly batch job with 800,000 shipment records.',
    answer: ['INFO'],
    explain: 'The start of a big job deserves one INFO line.',
  },
  {
    id: 'log-16002',
    kind: 'choice',
    situation:
      'Batch job shipment-sync, instance b-71, processed 800,000 records: 799,120 succeeded and 880 failed, in 52 minutes. Which On Complete line best records it?',
    options: [
      'Batch finished job=shipment-sync instanceId=b-71 total=800000 successful=799120 failed=880 status=SUCCESS durationMs=3120000',
      'Batch finished job=shipment-sync instanceId=b-71 total=800000 successful=799120 failed=880 status=PARTIAL durationMs=3120000',
      'Batch finished job=shipment-sync instanceId=b-71 total=800000 status=PARTIAL failedKeys=SH-88120,SH-88131,…',
      'Batch finished job=shipment-sync total=800000 successful=799120 failed=880 status=PARTIAL durationMs=3120000',
    ],
    answer: 1,
    explain:
      'The instance, the three counts, the status and the time. status=SUCCESS hides 880 failures from anyone who filters on status. Failed keys belong in a reject table, not in the summary. The line without instanceId, so it cannot be tied to that run.',
  },
  {
    id: 'log-16003',
    kind: 'multi',
    situation: 'Which values from the On Complete phase belong on the batch summary line?',
    options: ['failedRecords', 'totalRecords', 'The payload of each failed record', 'successfulRecords'],
    answers: [0, 1, 3],
    explain: 'In On Complete the payload is the job result with its counts. The records themselves are no longer there, and failed keys go to a reject table.',
  },
  {
    id: 'log-16004',
    kind: 'write',
    situation:
      'Write the Quayle On Complete line. payload holds batchJobInstanceId, totalRecords, successfulRecords, failedRecords and elapsedTimeInMillis. vars.status holds COMPLETED, PARTIAL or FAILED.',
    available: ['payload.batchJobInstanceId', 'payload.totalRecords', 'payload.successfulRecords', 'payload.failedRecords', 'payload.elapsedTimeInMillis', 'vars.status'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/batch (job )?(finished|complete)|finished|completed/i, 'Batch finished'),
      { must: /batchJobInstanceId/, say: 'Add the instance: instanceId=$(payload.batchJobInstanceId).' },
      { must: /totalRecords/, say: 'Add the total: payload.totalRecords.' },
      { must: /successfulRecords/, say: 'Add how many worked: payload.successfulRecords.' },
      { must: /failedRecords/, say: 'Add how many failed: payload.failedRecords.' },
      labelled('status'),
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Batch finished instanceId=$(payload.batchJobInstanceId) total=$(payload.totalRecords) successful=$(payload.successfulRecords) failed=$(payload.failedRecords) status=$(vars.status) durationMs=$(payload.elapsedTimeInMillis)"]',
    },
    explain: 'The status comes from the counts, so a PARTIAL run is never logged as success.',
  },
  {
    id: 'log-16005',
    kind: 'write',
    situation:
      'A Quayle batch job stopped because failed records passed maxFailedRecords. vars.instanceId, vars.failed and vars.maxFailed hold the facts. The data must be fixed and the job run again. Write the line, with what happens next.',
    available: ['vars.instanceId', 'vars.failed', 'vars.maxFailed', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/stopped|max failed|failure limit/i, 'Batch stopped, failure limit reached'),
      labelled('instanceId'),
      labelled('failed'),
      labelled('maxFailed'),
      next('next=fix data and rerun'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Batch stopped, failure limit reached instanceId=$(vars.instanceId) failed=$(vars.failed) maxFailed=$(vars.maxFailed) next=fix data and rerun"]',
    },
    explain: 'maxFailed in the line explains why the job stopped early.',
  },

  // ---------- lg-192 Quayle Freight: failed records ----------
  {
    id: 'log-16006',
    kind: 'level',
    situation: 'In a Quayle batch, one shipment record failed validation in a step. It will be collected by an ONLY_FAILURES step.',
    answer: ['WARN'],
    explain: 'Bad data arrived and must be fixed at source, so WARN, as for any rejected record. Log it once, in one place.',
  },
  {
    id: 'log-16007',
    kind: 'choice',
    situation:
      'Record SH-88120 failed validation because the postcode is missing, and goes to the reject table. The record holds the consignee name and address. Which line best records it?',
    options: [
      'Record failed step=validate shipmentId=SH-88120 next=reject table',
      'Record failed step=validate shipmentId=SH-88120 reason=missing postcode address=12 Elm Row, Leeds next=reject table',
      'Record failed step=validate shipmentId=SH-88120 reason=missing postcode next=reject table',
      'Record failed step=validate recordIndex=41207 reason=missing postcode next=reject table',
    ],
    answer: 2,
    explain:
      'The step, the key and the reason. The line without reason, so nobody knows what to fix. The address is personal data. The record index changes from run to run, so it does not find the shipment.',
  },
  {
    id: 'log-16008',
    kind: 'multi',
    situation: 'Support must fix 880 failed shipment records. Which facts should each failure line carry?',
    options: ['The record key', 'The step where it failed', 'The position of the record in the batch', 'The reason'],
    answers: [0, 1, 3],
    explain: 'The reject table holds what is needed. The log points to it. The position in the batch changes when the input changes.',
  },
  {
    id: 'log-16009',
    kind: 'write',
    situation:
      'A Quayle record failed in the validate step. vars.step, vars.shipmentId and vars.reason hold the facts. It goes to the reject table. Write the line, with what happens next.',
    available: ['vars.step', 'vars.shipmentId', 'vars.reason', 'vars.record', 'payload'],
    level: ['WARN'],
    checks: [
      says(/record failed|rejected/i, 'Record failed'),
      labelled('step'),
      labelled('shipmentId'),
      labelled('reason'),
      next('next=reject table'),
      noRecord,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Record failed step=$(vars.step) shipmentId=$(vars.shipmentId) reason=$(vars.reason) next=reject table"]',
    },
    explain: 'One line per failed record, with nothing personal in it.',
  },
  {
    id: 'log-16010',
    kind: 'write',
    situation:
      'The Quayle failures step wrote failed records to the reject table at the end of the job. vars.instanceId, vars.written and vars.topReason hold the facts. Write the line.',
    available: ['vars.instanceId', 'vars.written', 'vars.topReason', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/(rejects?|failures?|failed records?) (written|stored)|written to (the )?reject/i, 'Rejects written'),
      labelled('instanceId'),
      labelled('written'),
      labelled('topReason'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Rejects written instanceId=$(vars.instanceId) written=$(vars.written) topReason=$(vars.topReason)"]',
    },
    explain: 'written should match failedRecords from On Complete.',
  },

  // ---------- lg-193 Quayle Freight: aggregator groups and fallback ----------
  {
    id: 'log-16011',
    kind: 'level',
    situation: 'A Quayle batch aggregator group of 500 rows failed its bulk insert because one row was bad, so the flow fell back to inserting the rows one by one.',
    answer: ['WARN'],
    explain: 'The fallback handled it, but a bad row arrived and the group was slower. WARN.',
  },
  {
    id: 'log-16012',
    kind: 'choice',
    situation:
      'Group 14 of 500 rows failed the bulk insert into SHIPMENT, so the flow inserted it row by row: 499 went in and 1 was rejected. Which line best records the fallback?',
    options: [
      'Group insert failed table=SHIPMENT group=14 rows=500 errorType=DB:QUERY_EXECUTION next=skip group',
      'Group fallback finished table=SHIPMENT group=14 rows=500 status=done durationMs=8400',
      'Group fallback finished table=SHIPMENT group=14 inserted=499 rejected=1 rejectedRow={"shipmentId":"SH-88120","consignee":…}',
      'Group fallback finished table=SHIPMENT group=14 rows=500 inserted=499 rejected=1',
    ],
    answer: 3,
    explain:
      'It names the table, the group, its size and the split between inserted and rejected. Skipping the group would lose 499 good rows. status=done says nothing about the rejected row. The rejected row holds personal data and belongs in the reject table.',
  },
  {
    id: 'log-16013',
    kind: 'multi',
    situation: 'Which facts show that insert groups are too large or too small?',
    options: ['The correlation ID of each group', 'Rows per group', 'Duration per group', 'Fallbacks per run'],
    answers: [1, 2, 3],
    explain:
      'Rows and time per group give throughput. Fallbacks show the cost of bad rows, because a large group that falls back is slow. A correlation ID helps you trace a group, not size it.',
  },
  {
    id: 'log-16014',
    kind: 'write',
    situation:
      'A Quayle group finished its row by row fallback. vars.table, vars.group, vars.rows, vars.inserted and vars.rejected hold the facts. Write the line.',
    available: ['vars.table', 'vars.group', 'vars.rows', 'vars.inserted', 'vars.rejected', 'payload'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/fallback/i, 'Group fallback finished'),
      labelled('table'),
      labelled('group'),
      labelled('rows'),
      labelled('inserted'),
      labelled('rejected'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Group fallback finished table=$(vars.table) group=$(vars.group) rows=$(vars.rows) inserted=$(vars.inserted) rejected=$(vars.rejected)"]',
    },
    explain: 'inserted plus rejected should equal rows.',
  },
  {
    id: 'log-16015',
    kind: 'write',
    situation:
      'A Quayle aggregator group wrote with a bulk insert. vars.table, vars.group, vars.rows and vars.durationMs hold the facts. This runs thousands of times a night. Write the line.',
    available: ['vars.table', 'vars.group', 'vars.rows', 'vars.durationMs', 'payload'],
    level: ['DEBUG', 'TRACE'],
    checks: [
      says(/group (written|inserted)|bulk insert/i, 'Group written'),
      labelled('table'),
      labelled('group'),
      labelled('rows'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'DEBUG',
      message: '#["Group written table=$(vars.table) group=$(vars.group) rows=$(vars.rows) durationMs=$(vars.durationMs)"]',
    },
    explain: 'DEBUG for each group. The job summary carries the totals at INFO.',
  },

  // ---------- lg-194 Quayle Freight: run locks and overlapping runs ----------
  {
    id: 'log-16016',
    kind: 'level',
    situation: 'A Quayle scheduled run was skipped because the previous run still holds the run lock.',
    answer: ['WARN'],
    explain: 'The guard worked, but the job is running long. WARN.',
  },
  {
    id: 'log-16017',
    kind: 'choice',
    situation: 'inv-batch is due at 03:00, but run b-70 has held the lock since 01:00. The new run is skipped. Which line best records it?',
    options: [
      'Run skipped, previous still running job=inv-batch runningSince=2026-11-18T01:00:00 lockHolder=b-70 next=release lock and start',
      'Run skipped, previous still running job=inv-batch lockHolder=b-70',
      'Run skipped, previous still running job=inv-batch runningSince=2026-11-18T01:00:00 lockHolder=b-70',
      'Run failed, lock not acquired job=inv-batch runningSince=2026-11-18T01:00:00 lockHolder=b-70',
    ],
    answer: 2,
    explain:
      'Which job, how long the other has run and who holds the lock. Releasing the lock would start a second run beside b-70. The line without runningSince cannot tell a long run from a stuck one. A skip by design is not a failure, and calling it one raises false alarms.',
  },
  {
    id: 'log-16018',
    kind: 'multi',
    situation: 'Auditors ask for proof that inv-batch never ran twice at the same time. Which lines prove it?',
    options: ['Lock taken, with the instance', 'The start time of each run only', 'Lock released, with the instance', 'Run skipped, with the holder'],
    answers: [0, 2, 3],
    explain: 'Taken and released lines bracket each run. Start times alone cannot show whether one run ended before the next began.',
  },
  {
    id: 'log-16019',
    kind: 'write',
    situation:
      'A Quayle run was skipped. vars.job, vars.runningSince and vars.lockHolder hold the facts. Write the line.',
    available: ['vars.job', 'vars.runningSince', 'vars.lockHolder', 'payload'],
    level: ['WARN'],
    checks: [
      says(/skipped|still running/i, 'Run skipped, previous still running'),
      labelled('job'),
      labelled('runningSince'),
      labelled('lockHolder'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Run skipped, previous still running job=$(vars.job) runningSince=$(vars.runningSince) lockHolder=$(vars.lockHolder)"]',
    },
    explain: 'runningSince tells you if the other run is stuck.',
  },
  {
    id: 'log-16020',
    kind: 'write',
    situation:
      'A Quayle run released its lock after finishing. vars.job, vars.instanceId and vars.durationMs hold the facts. Write the line.',
    available: ['vars.job', 'vars.instanceId', 'vars.durationMs', 'payload'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/lock released|released/i, 'Run lock released'),
      labelled('job'),
      labelled('instanceId'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Run lock released job=$(vars.job) instanceId=$(vars.instanceId) durationMs=$(vars.durationMs)"]',
    },
    explain: 'A run with a taken line and no released line left a lock behind.',
  },

  // ---------- lg-195 Quayle Freight: checkpoints and restarts ----------
  {
    id: 'log-16021',
    kind: 'level',
    situation: 'A Quayle history load saved a checkpoint after finishing a key range.',
    answer: ['DEBUG', 'INFO'],
    explain: 'INFO if checkpoints are rare, DEBUG if there are hundreds per run.',
  },
  {
    id: 'log-16022',
    kind: 'choice',
    situation: 'hist-load crashed and restarts from its checkpoint: last key 2026-06-30, 182 ranges done, 138 left. Which line best records the restart?',
    options: [
      'Restart from checkpoint job=hist-load lastKey=2026-06-30 rangesDone=182 rangesLeft=138',
      'Restart from checkpoint job=hist-load startedAt=2026-11-18T02:10:00 rangesDone=182 rangesLeft=138 worker=w-3',
      'Restart from checkpoint job=hist-load rangesDone=182 rangesLeft=138',
      'Restart from checkpoint job=hist-load lastKey=2026-06-30 checkpointRows=<182 range rows>',
    ],
    answer: 0,
    explain:
      'Where it restarts and how much is left. The time of the restart is not the key it starts from. The line with only the counts has no key, so nobody can check the restart follows the last checkpoint. A dump of the checkpoint table does not belong in a log.',
  },
  {
    id: 'log-16023',
    kind: 'multi',
    situation: 'After a crash and restart, which facts prove no range was skipped?',
    options: ['The key the restart began from', 'The worker name of the restarted run', 'Counts per range', 'The last checkpoint before the crash'],
    answers: [0, 2, 3],
    explain: 'The restart key should follow the last checkpoint. The worker name says where it ran, not what it covered.',
  },
  {
    id: 'log-16024',
    kind: 'write',
    situation:
      'A Quayle load restarted from its checkpoint. vars.job, vars.lastKey, vars.rangesDone and vars.rangesLeft hold the facts. Write the line.',
    available: ['vars.job', 'vars.lastKey', 'vars.rangesDone', 'vars.rangesLeft', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/restart|resum/i, 'Restart from checkpoint'),
      labelled('job'),
      labelled('lastKey'),
      labelled('rangesDone'),
      labelled('rangesLeft'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Restart from checkpoint job=$(vars.job) lastKey=$(vars.lastKey) rangesDone=$(vars.rangesDone) rangesLeft=$(vars.rangesLeft)"]',
    },
    explain: 'With this line, a restart is visible and checkable.',
  },
  {
    id: 'log-16025',
    kind: 'write',
    situation:
      'A Quayle load found no checkpoint and an unfinished earlier run. It stops instead of starting over. vars.job and vars.earlierRun hold the facts. Write the line, with what happens next.',
    available: ['vars.job', 'vars.earlierRun', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/no checkpoint|stopped|unfinished/i, 'No checkpoint for unfinished run, stopped'),
      labelled('job'),
      labelled('earlierRun'),
      next('next=check earlier run before restart'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["No checkpoint for unfinished run, stopped job=$(vars.job) earlierRun=$(vars.earlierRun) next=check earlier run before restart"]',
    },
    explain: 'Stopping avoids loading the same ranges twice.',
  },

  // ---------- lg-196 Thornbury Freight: large file intake ----------
  {
    id: 'log-16026',
    kind: 'level',
    situation: 'Thornbury Freight received a 3 GB file. The flow will stream it into a batch job.',
    answer: ['INFO'],
    explain: 'The start of a large file is worth one INFO line.',
  },
  {
    id: 'log-16027',
    kind: 'choice',
    situation: 'A 3 GB history.csv arrived at /in. The flow reads it as a stream. Which line best records it on arrival?',
    options: [
      'Large file received path=/in/history.csv sizeBytes=3221225472 rows=41200331 streaming=true',
      'Large file received path=/in/history.csv sizeBytes=3221225472 streaming=true',
      'Large file received path=/in/history.csv sizeOf(payload)=3221225472 streaming=true',
      'Large file received path=/in/history.csv streaming=true firstRecord=2026-11-18,S041,ITM-7731,2',
    ],
    answer: 1,
    explain:
      'Path, size from attributes, and the streaming mode. A row count on arrival means reading the whole file first. sizeOf would read the whole stream too. The first record is content and the size is missing.',
  },
  {
    id: 'log-16028',
    kind: 'multi',
    situation: 'Which expressions are safe in a log line for a 3 GB file read as a stream?',
    options: ['attributes.size', 'sizeOf(payload)', 'vars.jobId', 'attributes.fileName'],
    answers: [0, 2, 3],
    explain: 'Attributes and variables are cheap. sizeOf reads every byte.',
  },
  {
    id: 'log-16029',
    kind: 'write',
    situation:
      'A Thornbury large file arrived. attributes.path and attributes.size hold the facts. Write the line without reading the content.',
    available: ['attributes.path', 'attributes.size', 'payload', 'sizeOf(payload)'],
    level: ['INFO'],
    checks: [
      says(/received|arrived/i, 'Large file received'),
      labelled('path'),
      labelled('(sizeBytes|size)', 'sizeBytes=$(attributes.size)'),
      { not: /sizeOf/, say: 'Do not use sizeOf on a large stream. Use attributes.size.' },
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Large file received path=$(attributes.path) sizeBytes=$(attributes.size)"]' },
    explain: 'The log line must never be the thing that loads the file.',
  },
  {
    id: 'log-16030',
    kind: 'write',
    situation:
      'A Thornbury file is larger than the agreed maximum. It is moved aside and not processed, and the sender is asked to split it. vars.fileName, vars.sizeBytes and vars.maxBytes hold the facts. Write the line, with what happens next.',
    available: ['vars.fileName', 'vars.sizeBytes', 'vars.maxBytes', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/too large|over (the )?limit|exceeds/i, 'File too large, moved aside'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('sizeBytes'),
      labelled('maxBytes'),
      next('next=moved aside, ask sender to split'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["File too large, moved aside file=$(vars.fileName) sizeBytes=$(vars.sizeBytes) maxBytes=$(vars.maxBytes) next=moved aside, ask sender to split"]',
    },
    explain: 'Moving it aside stops a crash loop.',
  },

  // ---------- lg-197 Thornbury Freight: split exports ----------
  {
    id: 'log-16031',
    kind: 'level',
    situation: 'A Thornbury export rolled over to a new part file after reaching 1 GB.',
    answer: ['INFO', 'DEBUG'],
    explain: 'A few parts a night: INFO. Many: DEBUG with a summary.',
  },
  {
    id: 'log-16032',
    kind: 'choice',
    situation:
      'Export run R-1118 wrote 6 data parts, 41,200,331 rows and 5 GB in total, then the control file sales_20261118.ctl. Which line best records the set?',
    options: [
      'Export set written runId=R-1118 parts=6 totalRows=41200331 totalBytes=5368709120',
      'Export part written runId=R-1118 part=6 of 6 rows=6866722 bytes=894784853 control=sales_20261118.ctl',
      'Export set written runId=R-1118 files=7 totalRows=41200331 totalBytes=5368709120 control=sales_20261118.ctl',
      'Export set written runId=R-1118 parts=6 totalRows=41200331 totalBytes=5368709120 control=sales_20261118.ctl',
    ],
    answer: 3,
    explain:
      'Parts, totals and the control file name. The set line without control= does not name the control file, which tells the receiver the set is complete. The part 6 line gives one part, not the set. files=7 counts the control file as a part, so a receiver that expects 7 data parts waits forever.',
  },
  {
    id: 'log-16033',
    kind: 'multi',
    situation: 'The receiver wants to check a 6 part set before loading it. Which facts should the control file and the log line carry?',
    options: ['Rows in each part', 'Number of parts', 'The time each part was written', 'Total rows'],
    answers: [0, 1, 3],
    explain: 'They let the receiver count what arrived. Write times do not show whether anything is missing.',
  },
  {
    id: 'log-16034',
    kind: 'write',
    situation:
      'A Thornbury part file was closed. vars.runId, vars.part, vars.rows and vars.sizeBytes hold the facts. Write the line.',
    available: ['vars.runId', 'vars.part', 'vars.rows', 'vars.sizeBytes', 'payload'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/part (closed|written)|rolled over/i, 'Part written'),
      labelled('runId'),
      labelled('part'),
      labelled('rows'),
      labelled('sizeBytes'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Part written runId=$(vars.runId) part=$(vars.part) rows=$(vars.rows) sizeBytes=$(vars.sizeBytes)"]',
    },
    explain: 'Each part line matches a row in the control file.',
  },
  {
    id: 'log-16035',
    kind: 'write',
    situation:
      'A Thornbury split set was finished and its control file written last. vars.runId, vars.parts, vars.totalRows and vars.controlFile hold the facts. Write the line.',
    available: ['vars.runId', 'vars.parts', 'vars.totalRows', 'vars.controlFile', 'payload'],
    level: ['INFO'],
    checks: [
      says(/set (written|complete)|export (finished|complete)/i, 'Export set written'),
      labelled('runId'),
      labelled('parts'),
      labelled('totalRows'),
      labelled('(control|controlFile)', 'control=$(vars.controlFile)'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Export set written runId=$(vars.runId) parts=$(vars.parts) totalRows=$(vars.totalRows) control=$(vars.controlFile)"]',
    },
    explain: 'The control file is the receiver’s signal that the set is complete.',
  },

  // ---------- lg-198 Thornbury Freight: checksums and copies ----------
  {
    id: 'log-16036',
    kind: 'level',
    situation: 'A Thornbury copy of a 3 GB file finished and its SHA-256 matched the sender’s.',
    answer: ['INFO'],
    explain: 'A verified copy. One INFO line.',
  },
  {
    id: 'log-16037',
    kind: 'choice',
    situation:
      'history.csv was copied. Its size matches, but its SHA-256 does not match the sender\'s. The flow will copy it again. Which line best records it?',
    options: [
      'Size check passed file=history.csv sizeBytes=3221225472 expectedSize=3221225472 next=load',
      'Checksum mismatch file=history.csv expected=9f2c…e1 actual=41ab…07 sizeBytes=3221225472 next=copy again',
      'Checksum mismatch file=history.csv sizeBytes=3221225472 next=copy again',
      'Checksum mismatch file=history.csv expected=9f2c…e1 actual=41ab…07 sizeBytes=3221225472 next=load anyway, sizes match',
    ],
    answer: 1,
    explain:
      'Both hashes, the size and the next step. A matching size does not prove the content, so loading is wrong in both the size check line and the load anyway line. The line without hashes gives nothing to compare with the sender.',
  },
  {
    id: 'log-16038',
    kind: 'multi',
    situation: 'A 3 GB copy has the right size but the wrong hash. Which facts help find where the copy went wrong?',
    options: ['Expected and actual hash', 'Whether a resume happened, and at which offset', 'The number of rows in the file', 'Expected and actual size'],
    answers: [0, 1],
    explain:
      'A resume at a suspicious offset is a strong clue, and the hashes confirm the bad copy. The sizes already match, so they add nothing here. A row count can match while bytes inside the rows are wrong.',
  },
  {
    id: 'log-16039',
    kind: 'write',
    situation:
      'A Thornbury copy failed its checksum. vars.fileName, vars.expected, vars.actual and vars.sizeBytes hold the facts. It will be copied again. Write the line, with what happens next.',
    available: ['vars.fileName', 'vars.expected', 'vars.actual', 'vars.sizeBytes', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/checksum mismatch|hash mismatch/i, 'Checksum mismatch'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('expected'),
      labelled('actual'),
      labelled('sizeBytes'),
      next('next=copy again'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Checksum mismatch file=$(vars.fileName) expected=$(vars.expected) actual=$(vars.actual) sizeBytes=$(vars.sizeBytes) next=copy again"]',
    },
    explain: 'Never load a file that failed its checksum.',
  },
  {
    id: 'log-16040',
    kind: 'write',
    situation:
      'A Thornbury copy verified. vars.fileName, vars.sizeBytes, vars.sha256 and vars.durationMs hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.sizeBytes', 'vars.sha256', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/verified|checksum ok|copied/i, 'Copy verified'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('sizeBytes'),
      labelled('sha256'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Copy verified file=$(vars.fileName) sizeBytes=$(vars.sizeBytes) sha256=$(vars.sha256) durationMs=$(vars.durationMs)"]',
    },
    explain: 'The hash on the line proves which version was loaded.',
  },

  // ---------- lg-199 Thornbury Freight: archives ----------
  {
    id: 'log-16041',
    kind: 'level',
    situation: 'A Thornbury archive has an entry whose name tries to write outside the target folder. The archive is rejected.',
    answer: ['ERROR'],
    explain: 'A hostile or broken archive. ERROR.',
  },
  {
    id: 'log-16042',
    kind: 'choice',
    situation: 'images.zip held 48,000 entries, 6 GB uncompressed. All 48,000 were written and none skipped, in 980 seconds. Which line best records it?',
    options: [
      'Archive extracted file=images.zip compressedBytes=1900000000 written=48000 skipped=0 durationMs=980000',
      'Archive extracted file=images.zip entries=48000 written=48000 skipped=0 entryNames=a.jpg,b.jpg,…',
      'Archive extracted file=images.zip entries=48000 uncompressedBytes=6000000000 durationMs=980000',
      'Archive extracted file=images.zip entries=48000 uncompressedBytes=6000000000 written=48000 skipped=0 durationMs=980000',
    ],
    answer: 3,
    explain:
      'Counts and sizes. The compressed size does not show how big the archive grows, which is what the size guard checks. 48,000 names do not belong in a line. The line without written and skipped does not show whether every entry landed.',
  },
  {
    id: 'log-16043',
    kind: 'multi',
    situation: 'Before extracting an uploaded zip, the flow runs guards. Which failed guards deserve their own line?',
    options: ['Too many entries', 'An entry name that contains spaces', 'Uncompressed size above the limit', 'An entry path outside the target folder'],
    answers: [0, 2, 3],
    explain: 'Each is a guard against a dangerous or broken archive. A space in a name is legal and harmless.',
  },
  {
    id: 'log-16044',
    kind: 'write',
    situation:
      'A Thornbury archive was extracted. vars.fileName, vars.entries, vars.uncompressedBytes, vars.written, vars.skipped and vars.durationMs hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.entries', 'vars.uncompressedBytes', 'vars.written', 'vars.skipped', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/extracted|unzipped/i, 'Archive extracted'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('entries'),
      labelled('uncompressedBytes'),
      labelled('written'),
      labelled('skipped'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Archive extracted file=$(vars.fileName) entries=$(vars.entries) uncompressedBytes=$(vars.uncompressedBytes) written=$(vars.written) skipped=$(vars.skipped) durationMs=$(vars.durationMs)"]',
    },
    explain: 'written plus skipped should equal entries.',
  },
  {
    id: 'log-16045',
    kind: 'write',
    situation:
      'A Thornbury archive was rejected because an entry path leaves the target folder. vars.fileName and vars.entryName hold the facts. The file is quarantined and the sender told. Write the line, with what happens next.',
    available: ['vars.fileName', 'vars.entryName', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/rejected|unsafe|path/i, 'Archive rejected, unsafe entry path'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('(entry|entryName)', 'entry=$(vars.entryName)'),
      next('next=quarantined, tell sender'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Archive rejected, unsafe entry path file=$(vars.fileName) entry=$(vars.entryName) next=quarantined, tell sender"]',
    },
    explain: 'The entry name shows the attempt for security to review.',
  },

  // ---------- lg-200 Thornbury Freight: step timelines for a nightly chain ----------
  {
    id: 'log-16046',
    kind: 'level',
    situation: 'A Thornbury nightly chain step finished 40 minutes after its expected time. Stores open in 90 minutes.',
    answer: ['WARN'],
    explain: 'Late but recoverable. WARN now, ERROR if the deadline is at risk.',
  },
  {
    id: 'log-16047',
    kind: 'choice',
    situation:
      'Step upload-sales in the nightly-plans chain was expected by 02:00 and finished at 02:40. Stores need their plans by 08:00. Which line best records it?',
    options: [
      'Step late chain=nightly-plans step=upload-sales expectedBy=02:00 finishedAt=02:40 lateMin=40 deadline=08:00',
      'Step finished chain=nightly-plans step=upload-sales startedAt=01:10 finishedAt=02:40 durationMin=90 rows=48210',
      'Step late chain=nightly-plans step=upload-sales expectedBy=02:00 finishedAt=02:40 lateMin=40',
      'Step late chain=nightly-plans step=upload-sales lateMin=40 deadline=08:00 status=DEADLINE MISSED',
    ],
    answer: 0,
    explain:
      'The step, expected and actual times, and the deadline that matters. The Step finished line never says the step was late. The line without deadline does not let on call judge how urgent it is. The 08:00 deadline has not been missed, so that status pages people for nothing.',
  },
  {
    id: 'log-16048',
    kind: 'multi',
    situation: 'Each night someone asks where the time went in the nightly-plans chain. Which facts belong on each step line?',
    options: ['Start and finish times', 'The chain and step name', 'The Mule runtime version', 'Rows or bytes moved'],
    answers: [0, 1, 3],
    explain: 'Enough to see where time goes each night. The runtime version is the same for every step.',
  },
  {
    id: 'log-16049',
    kind: 'write',
    situation:
      'A Thornbury chain step finished late. vars.chain, vars.step, vars.expectedBy, vars.finishedAt, vars.lateMin and vars.deadline hold the facts. Write the line.',
    available: ['vars.chain', 'vars.step', 'vars.expectedBy', 'vars.finishedAt', 'vars.lateMin', 'vars.deadline', 'payload'],
    level: ['WARN'],
    checks: [
      says(/late|behind/i, 'Step late'),
      labelled('chain'),
      labelled('step'),
      labelled('expectedBy'),
      labelled('finishedAt'),
      labelled('lateMin'),
      labelled('deadline'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Step late chain=$(vars.chain) step=$(vars.step) expectedBy=$(vars.expectedBy) finishedAt=$(vars.finishedAt) lateMin=$(vars.lateMin) deadline=$(vars.deadline)"]',
    },
    explain: 'The deadline tells on call how urgent it is.',
  },
  {
    id: 'log-16050',
    kind: 'write',
    situation:
      'A Thornbury chain step finished on time. vars.chain, vars.step, vars.rows and vars.durationMs hold the facts. Write the line.',
    available: ['vars.chain', 'vars.step', 'vars.rows', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/step (finished|complete)|finished/i, 'Step finished'),
      labelled('chain'),
      labelled('step'),
      labelled('rows'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Step finished chain=$(vars.chain) step=$(vars.step) rows=$(vars.rows) durationMs=$(vars.durationMs)"]',
    },
    explain: 'Durations per step over weeks show which one is growing.',
  },
]
