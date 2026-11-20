// Logging Lab exercises, set 12. See ../exercises.js for the format.
// Theme: queues and Azure Blob Storage in a product data hub. Publishing, acks, claim check notifications, restarting
// failed messages, staging loads, blob uploads and downloads, listing runs, job summaries and storage errors.
import { corr, errorFacts, labelled, noPayload, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
const blobLabel = { must: /blob(Name)?\s*"?\s*[=:]/i, say: 'Label the blob name, such as blob=$(vars.blobName), so it can be searched.' }
const noSas = { not: /sasToken|sig=|attributes\.headers|vars\.blobUrl/i, say: 'Do not log the SAS token or a signed URL. Log the container and blob name.' }

export const SET_12 = [
  // ---------- lg-151 Harrow Garden Supply: publishing to a queue ----------
  {
    id: 'log-12001',
    kind: 'level',
    situation: 'Harrow Garden Supply publishes each new order to a queue for the warehouse. The broker accepted the message.',
    answer: ['INFO', 'DEBUG'],
    explain: 'A successful publish is normal. INFO when you want one line per order in production, DEBUG when another line already records the order.',
  },
  {
    id: 'log-12002',
    kind: 'choice',
    situation: 'Which line best records the publish?',
    options: [
      'Message published queue=warehouse-orders messageId=m-55120 orderId=SO-7001 correlationId=7f3c2a',
      'Message published queue=warehouse-orders orderId=SO-7001 correlationId=7f3c2a',
      'Published: {"orderId":"SO-7001","customer":{…},"lines":[…]}',
      'Queue ok!!!',
    ],
    answer: 0,
    explain: 'The queue, the broker message ID and the order ID let you follow the order from API to warehouse. The second line has no messageId, so you cannot look the message up on the broker. The body does not belong in the line.',
  },
  {
    id: 'log-12003',
    kind: 'multi',
    situation: 'The warehouse says it never received SO-7001. Which facts on the publish line help?',
    options: ['The queue name', 'The broker message ID', 'The order ID', 'The full order body'],
    answers: [0, 1, 2],
    explain: 'With the queue and message ID you can search the broker and the consumer logs. The body adds size and personal data.',
  },
  {
    id: 'log-12004',
    kind: 'write',
    situation:
      'A Harrow order was published. vars.queue, vars.messageId and vars.orderId hold the facts. Write the line.',
    available: ['vars.queue', 'vars.messageId', 'vars.orderId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/published|sent to queue/i, 'Message published'),
      labelled('queue'),
      labelled('messageId'),
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Message published queue=$(vars.queue) messageId=$(vars.messageId) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain: 'The same correlation ID on the consumer side joins both ends of the queue.',
  },
  {
    id: 'log-12005',
    kind: 'write',
    situation:
      'Publishing a Harrow order failed because the broker could not be reached. The order is saved in an outbox table and a job will publish it again. vars.queue and vars.orderId hold the facts. Write the line.',
    available: ['vars.queue', 'vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/publish failed|not published|could not publish/i, 'Publish failed'),
      labelled('queue'),
      labelled('orderId'),
      errorFacts,
      next('next=kept in outbox for retry'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Publish failed queue=$(vars.queue) orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) next=kept in outbox for retry correlationId=$(correlationId)"]',
    },
    explain: 'The order is safe in the outbox, so WARN, not ERROR. The next field stops someone republishing by hand.',
  },

  // ---------- lg-152 Harrow Garden Supply: ack and nack ----------
  {
    id: 'log-12006',
    kind: 'level',
    situation:
      'A Harrow consumer could not reach the ERP and nacked the message, so it will be delivered again. This was the second delivery of five allowed.',
    answer: ['WARN'],
    explain: 'The message will be retried, so nothing is lost yet. WARN shows the pressure building.',
  },
  {
    id: 'log-12007',
    kind: 'choice',
    situation: 'Which line best records the nack?',
    options: [
      'Message nacked messageId=m-55120 orderId=SO-7001 deliveryCount=2 maxDeliveries=5 errorType=HTTP:CONNECTIVITY next=redelivery',
      'Message nacked messageId=m-55120 orderId=SO-7001 errorType=HTTP:CONNECTIVITY next=redelivery',
      'ERP problem',
      'Error occurred in consumer',
    ],
    answer: 0,
    explain: 'Which message, which try out of how many, why, and what happens next. The second line has no delivery count, so nobody can tell how close the message is to the DLQ.',
  },
  {
    id: 'log-12008',
    kind: 'multi',
    situation: 'Which outcomes of a consumed message deserve their own line?',
    options: ['Acked after the work committed', 'Nacked for a retry, with the delivery count', 'Sent to the DLQ, with the reason', 'Each field read from the message'],
    answers: [0, 1, 2],
    explain: 'Every message ends in one of these. Logging each outcome shows where any message went.',
  },
  {
    id: 'log-12009',
    kind: 'write',
    situation:
      'A Harrow message was nacked for a retry. vars.messageId, vars.orderId and vars.deliveryCount hold the facts, and five deliveries are allowed. Write the line.',
    available: ['vars.messageId', 'vars.orderId', 'vars.deliveryCount', 'error.errorType', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/nack|redeliver|retry/i, 'Message nacked'),
      labelled('messageId'),
      labelled('orderId'),
      labelled('deliveryCount'),
      { must: /error\.errorType/, say: 'Add why it failed: errorType=$(error.errorType).' },
      next('next=redelivery'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Message nacked messageId=$(vars.messageId) orderId=$(vars.orderId) deliveryCount=$(vars.deliveryCount) maxDeliveries=5 errorType=$(error.errorType) next=redelivery correlationId=$(correlationId)"]',
    },
    explain: 'The delivery count shows how close the message is to the DLQ.',
  },
  {
    id: 'log-12010',
    kind: 'write',
    situation:
      'A Harrow message used its last delivery and went to the DLQ. vars.messageId, vars.orderId and vars.dlq hold the facts. Write the line.',
    available: ['vars.messageId', 'vars.orderId', 'vars.dlq', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/dlq|dead.?letter/i, 'Message sent to DLQ'),
      labelled('messageId'),
      labelled('orderId'),
      labelled('dlq'),
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Message sent to DLQ messageId=$(vars.messageId) orderId=$(vars.orderId) dlq=$(vars.dlq) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain: 'The order will not move until someone acts, so ERROR, with the DLQ name and the reason.',
  },

  // ---------- lg-153 Fenwick Supply: claim check notifications ----------
  {
    id: 'log-12011',
    kind: 'level',
    situation:
      'Fenwick Supply’s product hub receives a JMS notification that points to a JSON file in blob storage. The notification is valid and the blob exists. The hub sends a RECEIVED ack.',
    answer: ['INFO'],
    explain: 'This is the normal start of every message. One INFO line marks it.',
  },
  {
    id: 'log-12012',
    kind: 'choice',
    situation: 'Which line best records the received notification?',
    options: [
      'Notification received messageId=N-9001 messageType=Item container=inbound-items blob=2026/11/18/batch-41.json sizeBytes=812440 correlationId=7f3c2a',
      'Notification received messageId=N-9001 messageType=Item sizeBytes=812440 correlationId=7f3c2a',
      'Notification: <the whole JSON file>',
      'Blob url=https://…/batch-41.json?sv=…&sig=…',
    ],
    answer: 0,
    explain: 'The IDs, type, location and size are enough. The second line has no container or blob name, so nobody can find the file it points to. The last line leaks a signed URL that grants access.',
  },
  {
    id: 'log-12013',
    kind: 'multi',
    situation: 'Which checks deserve a line when they fail, before the hub acks?',
    options: ['Notification schema invalid', 'Duplicate message ID', 'Blob not found', 'Every field that passed'],
    answers: [0, 1, 2],
    explain: 'Each failure leads to a REJECTED ack with a reason. The line explains the rejection later.',
  },
  {
    id: 'log-12014',
    kind: 'write',
    situation:
      'A Fenwick notification was accepted. vars.messageId, vars.messageType, vars.container and vars.blobName hold the facts. Write the line.',
    available: ['vars.messageId', 'vars.messageType', 'vars.container', 'vars.blobName', 'vars.blobUrl', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|accepted/i, 'Notification received'),
      labelled('messageId'),
      labelled('messageType'),
      labelled('container'),
      blobLabel,
      noSas,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Notification received messageId=$(vars.messageId) messageType=$(vars.messageType) container=$(vars.container) blob=$(vars.blobName) correlationId=$(correlationId)"]',
    },
    explain: 'Container and blob name find the file. The signed URL would let anyone with log access download it.',
  },
  {
    id: 'log-12015',
    kind: 'write',
    situation:
      'A Fenwick notification points to a blob that does not exist. The hub sends a REJECTED ack. vars.messageId, vars.container and vars.blobName hold the facts. Write the line.',
    available: ['vars.messageId', 'vars.container', 'vars.blobName', 'vars.blobUrl', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/not found|missing|rejected/i, 'Notification rejected, blob not found'),
      labelled('messageId'),
      labelled('container'),
      blobLabel,
      next('next=REJECTED ack sent'),
      noSas,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Notification rejected, blob not found messageId=$(vars.messageId) container=$(vars.container) blob=$(vars.blobName) next=REJECTED ack sent correlationId=$(correlationId)"]',
    },
    explain: 'The sender has been told and can resend, so WARN fits. Use ERROR if your team must chase every one.',
  },

  // ---------- lg-154 Fenwick Supply: the restart app ----------
  {
    id: 'log-12016',
    kind: 'level',
    situation:
      'Fenwick’s restart app checks the database and blob storage before reprocessing. The database check failed, so it does nothing this run.',
    answer: ['WARN'],
    explain: 'Skipping is the right choice, and the next run will try again. WARN shows the backlog is waiting.',
  },
  {
    id: 'log-12017',
    kind: 'choice',
    situation: 'Which line best records a restart run that republished messages?',
    options: [
      'Restart run finished runId=R-1118 republished=312 skipped=4 failureQueueLeft=0 durationMs=8120',
      'Restart run finished runId=R-1118 republished=312 durationMs=8120',
      'Republished: <312 message bodies>',
      'OK',
    ],
    answer: 0,
    explain: 'Counts tell operations whether the backlog cleared. The second line has no skipped or left counts, so it cannot show the failure queue is empty. Bodies do not belong in a summary.',
  },
  {
    id: 'log-12018',
    kind: 'multi',
    situation: 'Which facts help prove reprocessing worked?',
    options: [
      'How many messages were republished',
      'How many were skipped and why',
      'How many are left on the failure queue',
      'The text of every message',
    ],
    answers: [0, 1, 2],
    explain: 'Republished, skipped and left should add up to what was there at the start.',
  },
  {
    id: 'log-12019',
    kind: 'write',
    situation:
      'Fenwick’s restart run finished. vars.runId, vars.republished, vars.skipped, vars.left and vars.durationMs hold the facts. Write the line.',
    available: ['vars.runId', 'vars.republished', 'vars.skipped', 'vars.left', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/restart run|reprocess|finished/i, 'Restart run finished'),
      labelled('runId'),
      labelled('republished'),
      labelled('skipped'),
      labelled('left', 'failureQueueLeft=$(vars.left)'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Restart run finished runId=$(vars.runId) republished=$(vars.republished) skipped=$(vars.skipped) failureQueueLeft=$(vars.left) durationMs=$(vars.durationMs)"]',
    },
    explain: 'A non-zero failureQueueLeft after the run is the number to alert on.',
  },
  {
    id: 'log-12020',
    kind: 'write',
    situation:
      'The Fenwick restart app skipped its run because the health check failed. The next scheduled run will try again. vars.check holds which check failed. Write the line.',
    available: ['vars.check', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN'],
    checks: [
      says(/skipped|not run|health check failed/i, 'Restart run skipped'),
      labelled('check'),
      errorFacts,
      next('next=retry at next schedule'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Restart run skipped check=$(vars.check) errorType=$(error.errorType) error=$(error.description) next=retry at next schedule"]',
    },
    explain: 'Reprocessing while the database is down only fails again. The line says why the backlog is still there.',
  },

  // ---------- lg-155 Fenwick Supply: staging loads with a bulk fallback ----------
  {
    id: 'log-12021',
    kind: 'level',
    situation:
      'A bulk insert of 500 rows into a staging table failed on one bad row. The flow now inserts the rows one by one to find it.',
    answer: ['WARN'],
    explain: 'The fallback handles it, so it is not an ERROR yet. WARN shows that a bad row arrived.',
  },
  {
    id: 'log-12022',
    kind: 'choice',
    situation: 'Which line best records the switch to one-by-one inserts?',
    options: [
      'Bulk insert failed, inserting one by one table=STG_ITEM batch=12 rows=500 errorType=DB:QUERY_EXECUTION',
      'Bulk insert failed, inserting one by one table=STG_ITEM rows=500',
      'Rows: <all 500 rows>',
      'Database exploded',
    ],
    answer: 0,
    explain: 'The table, batch, size and error type tell support what happened and how big the fallback is. The second line has no batch and no error type, so nobody can tell which batch or what kind of failure.',
  },
  {
    id: 'log-12023',
    kind: 'multi',
    situation: 'Which lines help after a staging load?',
    options: [
      'One WARN when a batch falls back to one-by-one inserts',
      'One line per rejected row, with its key and the reason',
      'One summary with loaded, failed and total counts',
      'One INFO line per row that worked',
    ],
    answers: [0, 1, 2],
    explain: 'Lines for exceptions and a summary. Thousands of success lines hide the failures.',
  },
  {
    id: 'log-12024',
    kind: 'write',
    situation:
      'One row failed during the one-by-one inserts. vars.table, vars.itemId and the error hold the facts. The row goes to the reject table. Write the line.',
    available: ['vars.table', 'vars.itemId', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/row (rejected|failed)|insert failed|not loaded/i, 'Row rejected'),
      labelled('table'),
      labelled('itemId'),
      errorFacts,
      next('next=written to reject table'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Row rejected table=$(vars.table) itemId=$(vars.itemId) errorType=$(error.errorType) error=$(error.description) next=written to reject table"]',
    },
    explain: 'The item ID and the reason let the data team fix it without opening the file.',
  },
  {
    id: 'log-12025',
    kind: 'write',
    situation:
      'Write the On Complete line of the staging batch job. payload holds loadedRecords, failedRecords and successfulRecords, and vars.table the staging table.',
    available: ['vars.table', 'payload.loadedRecords', 'payload.successfulRecords', 'payload.failedRecords', 'payload.elapsedTimeInMillis'],
    level: ['INFO'],
    checks: [
      says(/load (finished|complete)|batch (finished|complete)|finished/i, 'Staging load finished'),
      labelled('table'),
      { must: /successfulRecords/, say: 'Add how many worked: payload.successfulRecords.' },
      { must: /failedRecords/, say: 'Add how many failed: payload.failedRecords.' },
      { must: /loaded(Records)?\s*"?\s*[=:]/i, say: 'Label how many were read, such as loaded=$(payload.loadedRecords).' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Staging load finished table=$(vars.table) loaded=$(payload.loadedRecords) successful=$(payload.successfulRecords) failed=$(payload.failedRecords) durationMs=$(payload.elapsedTimeInMillis)"]',
    },
    explain: 'One summary per table per job. The failed count should match the rows in the reject table.',
  },

  // ---------- lg-156 Kestrel Logistics: uploading to blob storage ----------
  {
    id: 'log-12026',
    kind: 'level',
    situation: 'Kestrel Logistics uploads each proof of delivery photo to blob storage. The upload worked.',
    answer: ['INFO', 'DEBUG'],
    explain: 'A normal event. INFO if support looks up uploads, DEBUG if a later line already records the delivery.',
  },
  {
    id: 'log-12027',
    kind: 'choice',
    situation: 'Which line best records the upload?',
    options: [
      'Blob uploaded container=pod blob=2026/11/18/DP-04-D-7710.jpg sizeBytes=284120 deliveryId=D-7710 durationMs=310',
      'Blob uploaded container=pod blob=2026/11/18/DP-04-D-7710.jpg sizeBytes=284120 durationMs=310',
      'Upload to https://kestrel.blob.core.windows.net/pod/…?sv=…&sig=…',
      'Photo bytes: /9j/4AAQSkZJRgABAQ…',
    ],
    answer: 0,
    explain: 'Container, name, size and the business ID. The second line has no deliveryId, so support cannot find the photo for a delivery. Never the signed URL or the file content.',
  },
  {
    id: 'log-12028',
    kind: 'multi',
    situation: 'Which facts belong on the upload line?',
    options: ['Container and blob name', 'Size in bytes', 'The delivery ID', 'The storage account key'],
    answers: [0, 1, 2],
    explain: 'Location, size and the business link. Keys and tokens never go in logs.',
  },
  {
    id: 'log-12029',
    kind: 'write',
    situation:
      'A Kestrel photo was uploaded. vars.container, vars.blobName, vars.sizeBytes, vars.deliveryId and vars.durationMs hold the facts. Write the line.',
    available: ['vars.container', 'vars.blobName', 'vars.sizeBytes', 'vars.deliveryId', 'vars.durationMs', 'vars.blobUrl', 'payload'],
    level: ['INFO'],
    checks: [
      says(/uploaded|stored|written/i, 'Blob uploaded'),
      labelled('container'),
      blobLabel,
      labelled('sizeBytes'),
      labelled('deliveryId'),
      durationVar,
      noSas,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Blob uploaded container=$(vars.container) blob=$(vars.blobName) sizeBytes=$(vars.sizeBytes) deliveryId=$(vars.deliveryId) durationMs=$(vars.durationMs)"]',
    },
    explain: 'Size and duration show slow or odd uploads. The name finds the blob without a link.',
  },
  {
    id: 'log-12030',
    kind: 'write',
    situation:
      'A Kestrel upload failed with 403. The photo is kept on the device and will be sent again. vars.container, vars.blobName and vars.deliveryId hold the facts. Write the line.',
    available: ['vars.container', 'vars.blobName', 'vars.deliveryId', 'error.errorType', 'error.description', 'vars.sasToken', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/upload failed|not uploaded/i, 'Blob upload failed'),
      labelled('container'),
      blobLabel,
      labelled('deliveryId'),
      errorFacts,
      next('next=device will resend'),
      noSas,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Blob upload failed container=$(vars.container) blob=$(vars.blobName) deliveryId=$(vars.deliveryId) errorType=$(error.errorType) error=$(error.description) next=device will resend"]',
    },
    explain: 'A 403 usually means a key, SAS or network rule problem that will not fix itself, so ERROR draws attention.',
  },

  // ---------- lg-157 Kestrel Logistics: downloading and validating blob messages ----------
  {
    id: 'log-12031',
    kind: 'level',
    situation: 'A downloaded blob message failed JSON schema validation. The message is rejected and the sender is told.',
    answer: ['WARN'],
    explain: 'The app handled it as designed, but the sender sent bad data. WARN lets the team count these per sender.',
  },
  {
    id: 'log-12032',
    kind: 'choice',
    situation: 'Which line best records the schema failure?',
    options: [
      'Message failed schema validation messageId=N-7710 blob=2026/11/18/batch-12.json errors=3 firstError=$.items[4].gtin is required',
      'Message failed schema validation messageId=N-7710 blob=2026/11/18/batch-12.json errors=3',
      'Validation error: <the whole message>',
      'Bad sender!!!',
    ],
    answer: 0,
    explain: 'The ID, the blob, the error count and the first error tell the sender exactly what to fix. The second line has no first error, so the sender still does not know which field is wrong.',
  },
  {
    id: 'log-12033',
    kind: 'multi',
    situation: 'Which facts help the sender fix a rejected message?',
    options: ['The message ID', 'The path of the first failing field', 'How many errors there were', 'Our database password'],
    answers: [0, 1, 2],
    explain: 'Point at the problem precisely. Secrets never appear.',
  },
  {
    id: 'log-12034',
    kind: 'write',
    situation:
      'A Kestrel message failed validation. vars.messageId, vars.blobName, vars.errorCount and vars.firstError hold the facts. Write the line.',
    available: ['vars.messageId', 'vars.blobName', 'vars.errorCount', 'vars.firstError', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/schema|validation/i, 'Message failed schema validation'),
      labelled('messageId'),
      blobLabel,
      { must: /error(s|Count)\s*"?\s*[=:]/i, say: 'Label the error count, such as errors=$(vars.errorCount).' },
      labelled('firstError'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Message failed schema validation messageId=$(vars.messageId) blob=$(vars.blobName) errors=$(vars.errorCount) firstError=$(vars.firstError) correlationId=$(correlationId)"]',
    },
    explain: 'One line per rejected message, with enough to fix it, and no copy of the data.',
  },
  {
    id: 'log-12035',
    kind: 'write',
    situation:
      'A Kestrel blob downloaded and passed validation. vars.messageId, vars.blobName, vars.sizeBytes, vars.records and vars.durationMs hold the facts. Write the line.',
    available: ['vars.messageId', 'vars.blobName', 'vars.sizeBytes', 'vars.records', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/downloaded|validated|read/i, 'Blob downloaded and validated'),
      labelled('messageId'),
      blobLabel,
      labelled('sizeBytes'),
      labelled('records'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Blob downloaded and validated messageId=$(vars.messageId) blob=$(vars.blobName) sizeBytes=$(vars.sizeBytes) records=$(vars.records) durationMs=$(vars.durationMs)"]',
    },
    explain: 'The record count is the number later steps should account for.',
  },

  // ---------- lg-158 Kestrel Logistics: listing runs ----------
  {
    id: 'log-12036',
    kind: 'level',
    situation: 'A scheduled run lists new blobs every 5 minutes. This run found none.',
    answer: ['DEBUG'],
    explain: 'An empty run every 5 minutes is 288 lines a day that say nothing. Log runs that find blobs at INFO.',
  },
  {
    id: 'log-12037',
    kind: 'choice',
    situation: 'Which line best records a run that found blobs?',
    options: [
      'Blobs listed container=incoming prefix=2026/11/18/ found=742 pages=1 durationMs=410',
      'Blobs listed container=incoming prefix=2026/11/18/ found=742 durationMs=410',
      'Blobs: [a.csv, b.csv, … 742 names]',
      'Listing',
    ],
    answer: 0,
    explain: 'Where, how many and how many pages. The second line has no page count, so nobody can tell whether the listing went past the first page. Logging every name makes one huge line.',
  },
  {
    id: 'log-12038',
    kind: 'multi',
    situation: 'Files were skipped on a busy day. Which facts on the listing line would show it?',
    options: ['The number found', 'The number of pages read', 'Whether a next marker was left unread', 'The name of every blob found'],
    answers: [0, 1, 2],
    explain: 'A count stuck at one page size with a marker left over shows paging was not followed. A list of every name makes one huge line and shows nothing the count does not.',
  },
  {
    id: 'log-12039',
    kind: 'write',
    situation:
      'A Kestrel listing run found blobs. vars.container, vars.prefix, vars.found, vars.pages and vars.durationMs hold the facts. Write the line.',
    available: ['vars.container', 'vars.prefix', 'vars.found', 'vars.pages', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/listed|found/i, 'Blobs listed'),
      labelled('container'),
      labelled('prefix'),
      labelled('found'),
      labelled('pages'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Blobs listed container=$(vars.container) prefix=$(vars.prefix) found=$(vars.found) pages=$(vars.pages) durationMs=$(vars.durationMs)"]',
    },
    explain: 'Found and pages together show whether the listing went past the first page.',
  },
  {
    id: 'log-12040',
    kind: 'write',
    situation:
      'A blob was processed and moved to the processed prefix so the next run ignores it. vars.blobName and vars.target hold the facts. Write the line.',
    available: ['vars.blobName', 'vars.target', 'payload'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/moved|marked processed|archived/i, 'Blob marked processed'),
      blobLabel,
      labelled('target'),
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Blob marked processed blob=$(vars.blobName) target=$(vars.target)"]' },
    explain: 'If a file is processed twice, this line shows whether the move happened.',
  },

  // ---------- lg-159 Fenwick Supply: the job run summary ----------
  {
    id: 'log-12041',
    kind: 'level',
    situation:
      'Fenwick’s hub finished an Item message: 4,800 records, 4,790 loaded and 10 rejected. The final ack was sent.',
    answer: ['INFO'],
    explain: 'A finished job is normal, even with some rejects. Rejects have their own lines.',
  },
  {
    id: 'log-12042',
    kind: 'choice',
    situation: 'Which line best summarises the job?',
    options: [
      'Job finished jobId=J-20117 messageId=N-9001 messageType=Item records=4800 loaded=4790 rejected=10 ack=COMPLETED durationMs=91200',
      'Job finished jobId=J-20117 messageId=N-9001 messageType=Item records=4800 loaded=4790 rejected=10 durationMs=91200',
      'Finished with some errors',
      'Records: <4,800 records>',
    ],
    answer: 0,
    explain: 'One line ties the job, the message, the counts, the ack sent and the time. The second line leaves out the ack, so nobody can tell whether the sender was told the job finished.',
  },
  {
    id: 'log-12043',
    kind: 'multi',
    situation: 'Which numbers on the summary let a report check the job?',
    options: ['Records received', 'Records loaded', 'Records rejected', 'The time each record took'],
    answers: [0, 1, 2],
    explain: 'Received should equal loaded plus rejected. A gap means something went missing.',
  },
  {
    id: 'log-12044',
    kind: 'write',
    situation:
      'Write the Fenwick job summary. vars.jobId, vars.messageId, vars.messageType, vars.records, vars.loaded, vars.rejected and vars.durationMs hold the facts. The final ack was COMPLETED.',
    available: ['vars.jobId', 'vars.messageId', 'vars.messageType', 'vars.records', 'vars.loaded', 'vars.rejected', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/job (finished|complete)/i, 'Job finished'),
      labelled('jobId'),
      labelled('messageId'),
      labelled('messageType'),
      labelled('records'),
      labelled('loaded'),
      labelled('rejected'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Job finished jobId=$(vars.jobId) messageId=$(vars.messageId) messageType=$(vars.messageType) records=$(vars.records) loaded=$(vars.loaded) rejected=$(vars.rejected) ack=COMPLETED durationMs=$(vars.durationMs)"]',
    },
    explain: 'The same facts go in the job log table, so the log and the report agree.',
  },
  {
    id: 'log-12045',
    kind: 'write',
    situation:
      'A Fenwick job failed after loading some records. The message goes to the failure queue for the restart app. vars.jobId, vars.messageId and vars.loaded hold the facts. Write the line.',
    available: ['vars.jobId', 'vars.messageId', 'vars.loaded', 'error.errorType', 'error.description', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/job failed/i, 'Job failed'),
      labelled('jobId'),
      labelled('messageId'),
      labelled('loaded'),
      errorFacts,
      next('next=sent to failure queue'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Job failed jobId=$(vars.jobId) messageId=$(vars.messageId) loaded=$(vars.loaded) errorType=$(error.errorType) error=$(error.description) next=sent to failure queue"]',
    },
    explain: 'loaded tells the restart path that some rows exist already, so the reload must be safe to repeat.',
  },

  // ---------- lg-160 Kestrel Logistics: storage access errors ----------
  {
    id: 'log-12046',
    kind: 'level',
    situation: 'Every call to the storage account now returns 403 AuthorizationFailure. Nothing can be uploaded.',
    answer: ['ERROR'],
    explain: 'All work is failing and it will not fix itself. ERROR, and alert.',
  },
  {
    id: 'log-12047',
    kind: 'choice',
    situation: 'Which line best records a 403 from storage?',
    options: [
      'Storage access denied account=kestrelpod container=pod status=403 code=AuthorizationFailure operation=upload',
      'Access denied with key=Eby8vdM02xNOcqF…',
      'Storage access denied account=kestrelpod container=pod status=403 operation=upload',
      'Request: https://…?sv=…&sig=… returned 403',
    ],
    answer: 0,
    explain: 'The account, container, status, code and operation tell support where to look. The third line has no error code, so it cannot tell a key problem from a network rule problem. Keys and signed URLs never go in logs.',
  },
  {
    id: 'log-12048',
    kind: 'multi',
    situation: 'Which Azure error codes point to different causes, and so are worth logging?',
    options: [
      'AuthenticationFailed, a key or signature problem',
      'AuthorizationFailure, a network rule or permission problem',
      'BlobNotFound, a wrong name or a missing file',
      'The HTTP reason phrase alone, such as Forbidden',
    ],
    answers: [0, 1, 2],
    explain: 'The code narrows the cause. Forbidden alone covers several causes.',
  },
  {
    id: 'log-12049',
    kind: 'write',
    situation:
      'Storage denied an upload. vars.account, vars.container, vars.statusCode, vars.errorCode and vars.operation hold the facts. Write the line.',
    available: ['vars.account', 'vars.container', 'vars.statusCode', 'vars.errorCode', 'vars.operation', 'vars.sasToken', 'vars.blobUrl'],
    level: ['ERROR'],
    checks: [
      says(/denied|forbidden|not allowed|access/i, 'Storage access denied'),
      labelled('account'),
      labelled('container'),
      { must: /status(Code)?\s*"?\s*[=:]/i, say: 'Label the status, such as status=$(vars.statusCode).' },
      labelled('code', 'code=$(vars.errorCode)'),
      labelled('operation'),
      noSas,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Storage access denied account=$(vars.account) container=$(vars.container) status=$(vars.statusCode) code=$(vars.errorCode) operation=$(vars.operation)"]',
    },
    explain: 'The error code is the fact that tells a key problem from a network rule problem.',
  },
  {
    id: 'log-12050',
    kind: 'write',
    situation:
      'A download found no blob at the expected name. The message is rejected. vars.container, vars.blobName and vars.messageId hold the facts. Write the line.',
    available: ['vars.container', 'vars.blobName', 'vars.messageId', 'vars.blobUrl', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/not found|missing/i, 'Blob not found'),
      labelled('container'),
      blobLabel,
      labelled('messageId'),
      noSas,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Blob not found container=$(vars.container) blob=$(vars.blobName) messageId=$(vars.messageId) correlationId=$(correlationId)"]',
    },
    explain: 'Container and name show whether the sender wrote somewhere else or the name is wrong.',
  },
]
