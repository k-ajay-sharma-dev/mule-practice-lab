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
    situation:
      'Harrow publishes each new order to the warehouse-orders queue. The broker accepted order SO-7001 and returned message ID m-55120. Later the warehouse says it never got the order. Which publish line helps most?',
    options: [
      'Message published queue=warehouse-orders orderId=SO-7001 sizeBytes=2140 correlationId=7f3c2a',
      'Message published messageId=m-55120 orderId=SO-7001 broker=harrow-mq-prod correlationId=7f3c2a',
      'Message published queue=warehouse-orders messageId=m-55120 orderId=SO-7001 correlationId=7f3c2a',
      'Message published queue=warehouse-orders messageId=m-55120 orderId=SO-7001 customer=Ana Lopez',
    ],
    answer: 2,
    explain: 'Queue, broker message ID and order ID let you search the broker and the consumer logs. Without messageId the broker lookup has nothing exact to search for. Without the queue you do not know where to look on the broker. A customer name is personal data and adds nothing to the trace.',
  },
  {
    id: 'log-12003',
    kind: 'multi',
    situation: 'The warehouse says it never received SO-7001. Which facts on the Harrow publish line help trace it?',
    options: [
      'The order ID',
      'The full order body',
      'The queue name',
      'The name of the thread that published it',
      'The broker message ID',
    ],
    answers: [0, 2, 4],
    explain: 'The queue and message ID find the message on the broker and in the consumer logs, and the order ID links back to the API. The body adds size and personal data. A thread name says nothing about where the message went.',
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
    situation:
      'A Harrow consumer could not reach the ERP and nacked message m-55120. This was delivery 2 of the 5 allowed before the DLQ. Which line best records it?',
    options: [
      'Message nacked messageId=m-55120 orderId=SO-7001 deliveryCount=2 maxDeliveries=5 errorType=HTTP:CONNECTIVITY next=sent to DLQ',
      'Message nacked messageId=m-55120 orderId=SO-7001 deliveryCount=2 maxDeliveries=5 errorType=HTTP:CONNECTIVITY next=redelivery',
      'Message nacked messageId=m-55120 orderId=SO-7001 attempt=1 errorType=HTTP:CONNECTIVITY erpUrl=https://erp.harrow.example next=redelivery',
      'Message nacked messageId=m-55120 orderId=SO-7001 deliveryCount=2 maxDeliveries=5 errorType=HTTP:BAD_REQUEST next=redelivery',
    ],
    answer: 1,
    explain: 'Which message, which delivery out of how many, why and what happens next. Delivery 2 of 5 goes back for redelivery, not to the DLQ. A local attempt counter starts again at 1 on each redelivery, so it hides how close the message is to the DLQ, while the broker delivery count does not. HTTP:BAD_REQUEST would mean the ERP refused the data, a fault a retry cannot fix.',
  },
  {
    id: 'log-12008',
    kind: 'multi',
    situation: 'Which outcomes of a consumed Harrow message each deserve their own line?',
    options: [
      'Received, with the full body at INFO',
      'Acked after the work committed',
      'Each field read from the message',
      'Sent to the DLQ, with the reason',
      'Nacked for a retry, with the delivery count',
    ],
    answers: [1, 3, 4],
    explain: 'Every message ends acked, nacked or in the DLQ, and a line for each shows where any message went. The body at INFO copies order data into the logs for every message. Field by field lines are noise.',
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
    situation:
      'Fenwick’s product hub gets a JMS notification that points to a JSON file in blob storage. It is valid and the blob exists, so the hub sends a RECEIVED ack. Which line best records it?',
    options: [
      'Notification received messageId=N-9001 messageType=Item sizeBytes=812440 receivedAt=2026-11-18T04:12:00Z correlationId=7f3c2a',
      'Notification received messageId=N-9001 messageType=Item container=inbound-items blob=2026/11/18/batch-41.json correlationId=7f3c2a',
      'Notification received messageId=N-9001 messageType=Item blobUrl=https://fenwick.blob.core.windows.net/inbound-items/batch-41.json?sv=…&sig=…',
      'Notification received messageType=Item container=inbound-items blob=2026/11/18/batch-41.json correlationId=7f3c2a',
    ],
    answer: 1,
    explain: 'The message ID, type and blob location tie the notification to its file and to the ack. Without container and blob nobody can find the file. The signed URL grants read access to anyone who sees the log. Without the message ID the ack and any duplicate check cannot be matched.',
  },
  {
    id: 'log-12013',
    kind: 'multi',
    situation: 'Before it acks, the Fenwick hub checks each notification. Which failed checks deserve their own line?',
    options: [
      'Notification schema invalid',
      'A check that passed, at INFO, for every notification',
      'Blob not found',
      'Duplicate message ID',
      'The notification body when the schema check passes',
    ],
    answers: [0, 2, 3],
    explain: 'Each failure leads to a REJECTED ack with a reason, and the line explains the rejection later. A line per passed check multiplies the volume. A valid body adds size and data, not a reason.',
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
    situation:
      'Fenwick’s restart app republished messages from the failure queue: 312 were republished and 4 skipped as duplicates. Operations must know the queue is empty afterwards. Which line best records the run?',
    options: [
      'Restart run finished runId=R-1118 republished=312 skipped=4 durationMs=8120 replica=restart-1',
      'Restart run finished runId=R-1118 republished=312 failureQueueLeft=0 durationMs=8120',
      'Restart run finished runId=R-1118 republished=316 skipped=0 failureQueueLeft=0 durationMs=8120',
      'Restart run finished runId=R-1118 republished=312 skipped=4 failureQueueLeft=0 durationMs=8120',
    ],
    answer: 3,
    explain: 'Republished, skipped and left should add up to what was on the queue, and left=0 shows it is empty. Without left the backlog may still be there. Without skipped the 4 duplicates vanish from the sum. republished=316 counts duplicates as sent, so the receiver will look for 4 messages that never came.',
  },
  {
    id: 'log-12018',
    kind: 'multi',
    situation: 'Which facts on the restart summary help prove Fenwick’s reprocessing worked?',
    options: [
      'The text of every message',
      'How many messages were republished',
      'How many were skipped and why',
      'Only the republished count, since skipped messages are not errors',
      'How many are left on the failure queue',
    ],
    answers: [1, 2, 4],
    explain: 'Republished, skipped with the reason and left should add up to what was there at the start. Skipped messages are not errors, but leaving them out breaks the sum. Message text adds size and data and proves nothing the counts do not.',
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
    situation:
      'A bulk insert of 500 rows into STG_ITEM failed on one bad row, in batch 12 of the night. The flow now inserts the rows one by one to find it. Which line best records the switch?',
    options: [
      'Bulk insert failed, inserting one by one table=STG_ITEM batch=12 rows=500 firstRow={"itemId":"ITM-1",…}',
      'Bulk insert failed, inserting one by one table=STG_ITEM batch=12 rows=500 errorType=DB:CONNECTIVITY',
      'Bulk insert failed, inserting one by one table=STG_ITEM rows=500 errorType=DB:QUERY_EXECUTION',
      'Bulk insert failed, inserting one by one table=STG_ITEM batch=12 rows=500 errorType=DB:QUERY_EXECUTION',
    ],
    answer: 3,
    explain: 'Table, batch, size and error type show which batch fell back and why. DB:CONNECTIVITY would mean the database was unreachable, where one by one inserts fail too and a retry is the answer. Without the batch nobody can tell which block fell back. The first row is data, not a reason.',
  },
  {
    id: 'log-12023',
    kind: 'multi',
    situation: 'A Fenwick staging load of 2 million rows runs every night. Which lines help after it?',
    options: [
      'One INFO line per row that worked',
      'One WARN when a batch falls back to one by one inserts',
      'A DEBUG line per batch with all its rows, left on in production',
      'One line per rejected row, with its key and the reason',
      'One summary with loaded, failed and total counts',
    ],
    answers: [1, 3, 4],
    explain: 'Exceptions get a line each and the run gets one summary. Two million success lines hide the failures and cost time. Rows at DEBUG left on in production copy the data and flood the log.',
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
    situation:
      'Kestrel uploads each proof of delivery photo to blob storage under a random name. Support is often asked for the photo of one delivery. Which line best records the upload?',
    options: [
      'Blob uploaded container=pod blob=2026/11/18/7f3c2a91.jpg sizeBytes=284120 contentType=image/jpeg durationMs=310',
      'Blob uploaded container=pod blob=2026/11/18/7f3c2a91.jpg sizeBytes=284120 deliveryId=D-7710 durationMs=310',
      'Blob uploaded url=https://kestrel.blob.core.windows.net/pod/2026/11/18/7f3c2a91.jpg?sv=…&sig=… deliveryId=D-7710',
      'Blob uploaded container=pod sizeBytes=284120 deliveryId=D-7710 durationMs=310 recipient=J. Hart',
    ],
    answer: 1,
    explain: 'Container, blob name, size and delivery ID let support find the photo for a delivery. The blob name is random, so a line without deliveryId cannot be matched to the delivery. A signed URL grants access to anyone who reads the log. Without the blob name the photo cannot be found, and the recipient name is personal data.',
  },
  {
    id: 'log-12028',
    kind: 'multi',
    situation: 'Which facts belong on the Kestrel photo upload line?',
    options: [
      'The GPS location stored in the photo',
      'Container and blob name',
      'Size in bytes',
      'The SAS token, so support can open the photo',
      'The delivery ID',
    ],
    answers: [1, 2, 4],
    explain: 'Location, size and the business link. A SAS token grants access, so it never goes in a log. GPS data in a delivery photo points to a home and is personal data.',
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
    situation:
      'A downloaded Kestrel blob message failed JSON schema validation with 3 errors. The message is rejected and the sender must fix it. Which line best records it?',
    options: [
      'Message failed schema validation messageId=N-7710 blob=2026/11/18/batch-12.json errors=3 schema=item-v2.json',
      'Message failed schema validation messageId=N-7710 errors=3 firstError=$.items[4].gtin is required item={"gtin":null,…}',
      'Message failed schema validation messageId=N-7710 blob=2026/11/18/batch-12.json errors=3 firstError=$.items[4].gtin is required',
      'Message failed schema validation messageId=N-7710 blob=2026/11/18/batch-12.json errors=1 firstError=$.items[4].gtin is required',
    ],
    answer: 2,
    explain: 'The ID, the blob, the error count and the first error tell the sender what to fix and how much. The schema name does not say which field failed. The item content is data, and without the blob the file cannot be found. errors=1 hides two more errors, so the sender fixes one field and is rejected again.',
  },
  {
    id: 'log-12033',
    kind: 'multi',
    situation: 'Which facts help the sender fix a rejected Kestrel message?',
    options: [
      'The full stack trace of the validator',
      'The message ID',
      'The value that failed, such as a date of birth',
      'The path of the first failing field',
      'How many errors there were',
    ],
    answers: [1, 3, 4],
    explain: 'Point at the problem precisely: which message, which field and how many errors. The failing value may be personal data, and the path is enough to fix it. A validator stack trace is about our code, not the sender’s data.',
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
    situation:
      'A Kestrel run lists new blobs every 5 minutes. A listing returns at most 5,000 names per page, with a marker for the next page. This run found 742 blobs. Which line best records it?',
    options: [
      'Blobs listed container=incoming prefix=2026/11/18/ found=742 durationMs=410',
      'Blobs listed container=incoming found=742 pages=1 first=a.csv last=zz.csv',
      'Blobs listed container=incoming prefix=2026/11/18/ found=742 pages=1',
      'Blobs listed container=incoming prefix=2026/11/18/ found=742 pages=1 durationMs=410',
    ],
    answer: 3,
    explain: 'Where, how many, how many pages and how long. Without pages nobody can tell whether the run followed the next marker. Without the prefix you cannot see which folder was read. Without the duration a listing that grows slower each day does not show.',
  },
  {
    id: 'log-12038',
    kind: 'multi',
    situation:
      'On a busy day 6,200 new blobs arrived, but the Kestrel run processed exactly 5,000. Which facts on the listing line would show why?',
    options: [
      'The name of every blob found',
      'The number found',
      'The total size of the blobs found',
      'The number of pages read',
      'Whether a next marker was left unread',
    ],
    answers: [1, 3, 4],
    explain: 'found=5000 with pages=1 and a next marker left over shows paging was not followed. A list of every name makes one huge line and shows nothing the count does not. The total size does not say how many pages were read.',
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
    situation:
      'Fenwick’s hub finished an Item message: 4,800 records, 4,790 loaded and 10 rejected. A COMPLETED ack was sent. Which line best summarises the job?',
    options: [
      'Job finished jobId=J-20117 messageId=N-9001 records=4800 loaded=4790 rejected=10 durationMs=91200 heapMb=812',
      'Job finished jobId=J-20117 messageId=N-9001 records=4800 loaded=4800 rejected=10 ack=COMPLETED durationMs=91200',
      'Job finished jobId=J-20117 records=4800 loaded=4790 rejected=10 ack=COMPLETED rejectedIds=I-1,I-2,…',
      'Job finished jobId=J-20117 messageId=N-9001 records=4800 loaded=4790 rejected=10 ack=COMPLETED durationMs=91200',
    ],
    answer: 3,
    explain: 'One line ties the job, the message, the counts, the ack and the time. Without ack nobody can tell whether the sender was told. loaded=4800 counts the rejected records as loaded, so the sum no longer works. Without the message ID the job cannot be tied to the notification, and the list of IDs belongs in the reject table.',
  },
  {
    id: 'log-12043',
    kind: 'multi',
    situation: 'A report checks each Fenwick job summary. Which numbers let it prove nothing went missing?',
    options: [
      'The time each record took',
      'Records received',
      'The number of batches the job used',
      'Records loaded',
      'Records rejected',
    ],
    answers: [1, 3, 4],
    explain: 'Received should equal loaded plus rejected, and a gap means something went missing. Time per record and the batch count show speed, not completeness.',
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
    situation:
      'Every call from Kestrel to its storage account now returns 403 with code AuthorizationFailure. Last week a 403 was AuthenticationFailed after a key rotation. Which line lets support tell the two causes apart?',
    options: [
      'Storage access denied account=kestrelpod container=pod status=403 reason=Forbidden operation=upload',
      'Storage access denied account=kestrelpod status=403 code=AuthorizationFailure keyName=key1 keyPrefix=Eby8vd',
      'Storage access denied account=kestrelpod container=pod status=403 code=AuthorizationFailure operation=upload',
      'Storage access denied container=pod status=403 code=AuthorizationFailure url=https://kestrelpod.blob.core.windows.net/pod/x.jpg?sig=…',
    ],
    answer: 2,
    explain: 'The account, container, status, Azure code and operation tell support where to look. AuthorizationFailure points to a network rule or permission, AuthenticationFailed to a key or signature. Forbidden is the reason phrase for both, so it cannot tell them apart. Part of a key is still part of a secret, and a signed URL grants access.',
  },
  {
    id: 'log-12048',
    kind: 'multi',
    situation:
      'Which Azure Storage error codes point to different causes, and so are worth logging next to the status?',
    options: [
      'AuthenticationFailed, a key or signature problem',
      'The HTTP reason phrase alone, such as Forbidden',
      'AuthorizationFailure, a network rule or permission problem',
      'ContainerNotFound, which Azure returns with status 403',
      'BlobNotFound, a wrong name or a missing file',
    ],
    answers: [0, 2, 4],
    explain: 'The code narrows the cause: a key or signature, a network rule or permission, or a wrong name. Forbidden alone covers several causes. ContainerNotFound comes back with status 404, not 403.',
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
