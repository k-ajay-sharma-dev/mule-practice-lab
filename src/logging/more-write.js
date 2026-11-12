// More "write" exercises for the Logging Lab. See exercises.js for the format.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from './rules.js'

// rules several exercises here share
const duration = { must: /duration|elapsed|took|ms\s*"?\s*[=:]/i, say: 'Add how long it took, such as durationMs=$(vars.durationMs).' }
const status = (code) => ({ must: new RegExp(`${code}|status`, 'i'), say: `Add the status you send back, such as status=${code}.` })
const jsonOut = { must: /output\s+application\/json/, say: 'Start the expression with output application/json.' }
const oneLine = { must: /indent\s*=\s*false/, say: 'Add indent=false, so the JSON stays on one line.' }
const jsonCorr = { must: /correlationId\s*"?\s*:\s*correlationId/, say: 'Add correlationId: correlationId.' }

export const MORE_WRITE = [
  {
    id: 'log-401',
    kind: 'write',
    situation:
      'An Anypoint MQ subscriber has received an order event from the orders queue. vars.mqMessageId holds the message ID and vars.orderId the order ID. Write the first logger of the flow.',
    available: ['vars.mqMessageId', 'vars.orderId', 'payload', 'payload.customer.phone', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|consumed|picked up|arrived|got/i, 'Order event received from Anypoint MQ'),
      { must: /vars\.mqMessageId/, say: 'Add the MQ message ID: vars.mqMessageId. It finds the message in Anypoint MQ.' },
      labelled('messageId', 'messageId=$(vars.mqMessageId)'),
      labelled('orderId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Order event received from Anypoint MQ queue=orders messageId=$(vars.mqMessageId) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain:
      'The message ID finds the message in Anypoint MQ if it is redelivered or lands in the DLQ. The order ID and the correlation ID tie it to the rest of the work.',
  },
  {
    id: 'log-402',
    kind: 'write',
    situation:
      'The flow has published an OrderCreated event to the JMS topic orders.created. Write the logger after the JMS Publish. vars.orderId holds the order ID.',
    available: ['vars.orderId', 'payload', 'payload.customer.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/published|sent|posted|emitted/i, 'OrderCreated event published'),
      { must: /orders\.created|topic|destination/i, say: 'Name where it went, such as topic=orders.created.' },
      labelled('orderId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: { level: 'INFO', message: '#["OrderCreated event published topic=orders.created orderId=$(vars.orderId) correlationId=$(correlationId)"]' },
    explain:
      'When a subscriber says it never got the event, this line shows that it was sent, where and when. The topic name tells the reader which subscribers should have it.',
  },
  {
    id: 'log-403',
    kind: 'write',
    situation:
      'The Inventory API answered in time, but slowly. The response timeout is 10000 ms. vars.durationMs holds how long the call took and vars.sku the product. A Choice router sends calls slower than 8000 ms to this logger.',
    available: ['vars.sku', 'vars.durationMs', 'attributes.statusCode', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/slow|close to|near|answered|replied|took/i, 'Inventory API slow'),
      { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' },
      { must: /timeout|limit|10000/i, say: 'Add the limit, such as timeoutMs=10000, so the reader sees how close it came.' },
      labelled('sku'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Inventory API slow durationMs=$(vars.durationMs) timeoutMs=10000 sku=$(vars.sku) correlationId=$(correlationId)"]' },
    explain:
      'The call worked, so this is not an ERROR. A WARN with the duration and the limit warns you before the calls start to time out.',
  },
  {
    id: 'log-404',
    kind: 'write',
    situation:
      'The Inventory API answered 404 for one product: the SKU does not exist there. The flow skips that order line and carries on with the rest. Write the logger in the On Error Continue for HTTP:NOT_FOUND. vars.sku and vars.orderId are set.',
    available: ['vars.sku', 'vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/not found|skipp|unknown|missing|no product|404/i, 'Order line skipped: SKU not found'),
      { must: /skip|next|ignor|left out|dropped/i, say: 'Say what the flow does next, such as next=line skipped.' },
      labelled('sku'),
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Order line skipped: SKU not found in Inventory API status=404 sku=$(vars.sku) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain:
      'The flow handled it, so WARN. The SKU and the order ID let the team fix the product data, and "skipped" tells them the order went on without that line.',
  },
  {
    id: 'log-405',
    kind: 'write',
    situation:
      'The Inventory API answered 500 to the stock reservation call. There is no retry for this call. The On Error Propagate returns 502 to the caller and the order is not reserved. vars.orderId is set.',
    available: ['vars.orderId', 'error.errorType', 'error.description', 'payload', 'attributes.headers', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not reserved|could not|500/i, 'Stock reservation failed'),
      errorFacts,
      labelled('orderId'),
      status(502),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Stock reservation failed orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) status=502 correlationId=$(correlationId)"]',
    },
    explain:
      'The order was not reserved and someone must look at the Inventory API, so ERROR. The error type tells support whose system failed, and status=502 shows what the caller saw.',
  },
  {
    id: 'log-406',
    kind: 'write',
    situation:
      'Your team built a circuit breaker with an Object Store: after 5 failures in a row the Pricing API is not called for 60 seconds. The breaker is open now, so the flow skips the call and answers 503. vars.productId is set.',
    available: ['vars.productId', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/circuit|breaker|skipp|open|not called/i, 'Pricing API call skipped: circuit open'),
      labelled('productId'),
      status(503),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Pricing API call skipped: circuit open status=503 productId=$(vars.productId) correlationId=$(correlationId)"]' },
    explain:
      'The breaker protects the app as it was designed to, so WARN. A count of these lines shows how long the Pricing API was out and how many callers it touched.',
  },
  {
    id: 'log-407',
    kind: 'write',
    situation:
      'A Scatter-Gather called three carrier APIs for shipping quotes and all three routes returned. vars.quoteCount holds the number of quotes, vars.cheapestCarrier the carrier picked, vars.durationMs how long the Scatter-Gather took, and vars.orderId the order.',
    available: ['vars.quoteCount', 'vars.cheapestCarrier', 'vars.durationMs', 'vars.orderId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/quote|collected|received|returned|gathered/i, 'Shipping quotes collected'),
      { must: /vars\.quoteCount/, say: 'Add how many quotes came back: vars.quoteCount.' },
      labelled('carrier', 'carrier=$(vars.cheapestCarrier)'),
      duration,
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Shipping quotes collected quotes=$(vars.quoteCount) carrier=$(vars.cheapestCarrier) durationMs=$(vars.durationMs) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain:
      'One line after the Scatter-Gather, not one per route. The count shows if a carrier went missing, and the duration shows the cost of waiting for the slowest route.',
  },
  {
    id: 'log-408',
    kind: 'write',
    situation:
      'A Scatter-Gather calls three carrier APIs for shipping quotes. One route failed, so the Scatter-Gather raised MULE:COMPOSITE_ROUTING and the request fails. Write the logger in the On Error Propagate. vars.orderId is set.',
    available: ['vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|no (shipping )?quotes?|not collected/i, 'Shipping quotes failed'),
      errorFacts,
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Shipping quotes failed orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'The request failed, so ERROR. The error type and description say what failed, and the order ID tells support which request lost its quotes.',
  },
  {
    id: 'log-409',
    kind: 'write',
    situation:
      'In an Async scope, the flow sends an audit record to the Audit API, and the main flow does not wait for it. Write the logger at the end of the Async scope. vars.auditId holds the ID the Audit API returned, and vars.orderId the order.',
    available: ['vars.auditId', 'vars.orderId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/written|sent|recorded|stored|saved|created|logged/i, 'Audit record written'),
      labelled('auditId'),
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Audit record written auditId=$(vars.auditId) orderId=$(vars.orderId) correlationId=$(correlationId)"]' },
    explain:
      'The Async scope runs apart from the main flow, so its lines can appear after the response was sent. The correlation ID still joins them to the request.',
  },
  {
    id: 'log-410',
    kind: 'write',
    situation:
      'An Anypoint MQ listener has a redelivery policy with 5 attempts. The same message failed every time, so Mule raised MULE:REDELIVERY_EXHAUSTED. The handler publishes the message to the orders DLQ. vars.mqMessageId and vars.orderId are set.',
    available: ['vars.mqMessageId', 'vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|exhausted|gave up|could not|not processed|moved/i, 'Order event not processed after 5 deliveries'),
      { must: /dlq|dead.?letter|next/i, say: 'Say where the message went, such as next=sent to DLQ.' },
      labelled('messageId', 'messageId=$(vars.mqMessageId)'),
      labelled('orderId'),
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Order event not processed after 5 deliveries messageId=$(vars.mqMessageId) orderId=$(vars.orderId) errorType=$(error.errorType) next=sent to DLQ correlationId=$(correlationId)"]',
    },
    explain:
      'The message stopped and waits for a person in the DLQ, so ERROR. The message ID lets support find it there and send it again.',
  },
  {
    id: 'log-411',
    kind: 'write',
    situation:
      'A JMS listener gets a message again because the first try failed and was rolled back. vars.deliveryCount holds the delivery count and vars.invoiceId the invoice. Write the logger at the start of the flow, for deliveries after the first.',
    available: ['vars.deliveryCount', 'vars.invoiceId', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/redeliver|again|retr|repeat|second/i, 'Invoice message redelivered'),
      { must: /vars\.deliveryCount/, say: 'Add the delivery count: vars.deliveryCount.' },
      labelled('(delivery|attempt|count)', 'deliveryCount=$(vars.deliveryCount)'),
      labelled('invoiceId'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Invoice message redelivered deliveryCount=$(vars.deliveryCount) invoiceId=$(vars.invoiceId) correlationId=$(correlationId)"]' },
    explain:
      'One redelivery is handled, so WARN. If the count keeps going up for the same invoice, these lines show it before the message reaches the DLQ.',
  },
  {
    id: 'log-412',
    kind: 'write',
    situation:
      'A batch job syncs employees to Workday. A second batch step with acceptPolicy="ONLY_FAILURES" gets the records that failed in the first step, sync-to-workday. Write its logger. vars.employeeId is set for each record.',
    available: ['vars.employeeId', 'payload', 'payload.homeAddress', 'payload.dateOfBirth'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/fail|not synced|rejected|could not/i, 'Employee record failed in batch'),
      labelled('employeeId'),
      { must: /step|workday/i, say: 'Say where it failed, such as step=sync-to-workday.' },
      noPayload,
      noPersonal,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Employee record failed in batch step=sync-to-workday employeeId=$(vars.employeeId)"]' },
    explain:
      'One failed record does not stop the job, so WARN fits, or ERROR if each failure needs a person. Log the ID, never the record: employee data is personal.',
  },
  {
    id: 'log-413',
    kind: 'write',
    situation:
      'A scheduler runs the nightly product sync from SAP to Salesforce. At the end of the flow, vars.created, vars.updated and vars.unchanged hold the counts, and vars.durationMs how long the run took. Write the summary line.',
    available: ['vars.created', 'vars.updated', 'vars.unchanged', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/finished|completed|ended|done|synced/i, 'Nightly product sync finished'),
      labelled('created', 'created=$(vars.created)'),
      labelled('updated', 'updated=$(vars.updated)'),
      duration,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Nightly product sync finished created=$(vars.created) updated=$(vars.updated) unchanged=$(vars.unchanged) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'One INFO line per run, with the counts. Mule gives each scheduler run its own correlation ID, so it groups all the lines of one run.',
  },
  {
    id: 'log-414',
    kind: 'write',
    situation:
      'An SFTP On New or Updated File listener has picked up a price file. attributes.fileName holds the name and attributes.size the size in bytes. Write the first logger of the flow.',
    available: ['attributes.fileName', 'attributes.size', 'attributes.path', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/picked up|received|arrived|found|new file|started|read/i, 'Price file picked up'),
      labelled('fileName'),
      { must: /attributes\.size/, say: 'Add the file size: attributes.size.' },
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Price file picked up fileName=$(attributes.fileName) sizeBytes=$(attributes.size) correlationId=$(correlationId)"]' },
    explain:
      'The file name is what support searches for when a price is wrong. The size is a cheap check: a file of 0 bytes explains a run that loaded nothing.',
  },
  {
    id: 'log-415',
    kind: 'write',
    situation:
      'The price file was loaded. The flow moved it to the archive folder with the SFTP Move operation. vars.fileName holds the name, vars.archivePath the new path and vars.recordCount the number of prices loaded.',
    available: ['vars.fileName', 'vars.archivePath', 'vars.recordCount', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/archived|moved/i, 'Price file archived'),
      labelled('fileName'),
      { must: /vars\.archivePath/, say: 'Add where the file went: vars.archivePath.' },
      labelled('(records|count|prices|loaded)', 'records=$(vars.recordCount)'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Price file archived fileName=$(vars.fileName) records=$(vars.recordCount) archivePath=$(vars.archivePath) correlationId=$(correlationId)"]',
    },
    explain:
      'This is the last line of the run. It says the file was used and where to find it if the prices must be loaded a second time.',
  },
  {
    id: 'log-416',
    kind: 'write',
    situation:
      'A CSV price file from SFTP could not be read: the Transform raised an error on a bad row. The flow moves the file to the error folder and stops. Write the logger in the On Error Propagate. vars.fileName holds the file name.',
    available: ['vars.fileName', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|rejected|not loaded|not processed|unreadable|bad/i, 'Price file not loaded'),
      labelled('fileName'),
      errorFacts,
      { must: /error.?folder|moved|next/i, say: 'Say where the file is now, such as next=moved to error folder.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Price file not loaded fileName=$(vars.fileName) errorType=$(error.errorType) error=$(error.description) next=moved to error folder correlationId=$(correlationId)"]',
    },
    explain:
      'No prices were loaded and someone must fix the file, so ERROR. The description says what could not be read, and next= tells support where the file waits.',
  },
  {
    id: 'log-417',
    kind: 'write',
    situation:
      'The flow upserted 50 accounts in Salesforce: 48 worked and 2 failed. vars.successCount and vars.failureCount hold the counts, built from the upsert result. vars.failedIds holds the IDs of the failed accounts as one string.',
    available: ['vars.successCount', 'vars.failureCount', 'vars.failedIds', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/upsert|synced|sent|saved|partly|partial/i, 'Salesforce account upsert finished with failures'),
      { must: /vars\.successCount/, say: 'Add how many worked: vars.successCount.' },
      { must: /vars\.failureCount/, say: 'Add how many failed: vars.failureCount.' },
      labelled('(failed|failures|failureCount)', 'failed=$(vars.failureCount)'),
      { must: /vars\.failedIds/, say: 'Add which accounts failed: vars.failedIds.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Salesforce account upsert finished with failures successful=$(vars.successCount) failed=$(vars.failureCount) failedIds=$(vars.failedIds) correlationId=$(correlationId)"]',
    },
    explain:
      'Most of the work was done and the flow goes on, so WARN. The failed IDs let someone fix those accounts without reading the whole result.',
  },
  {
    id: 'log-418',
    kind: 'write',
    situation:
      'The flow saved the order in the orders table with the Database Insert operation. payload.affectedRows holds the number of rows inserted. vars.orderId is set.',
    available: ['payload.affectedRows', 'vars.orderId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/inserted|saved|stored|written|created|added/i, 'Order saved to database'),
      { must: /affectedRows/, say: 'Add how many rows were inserted: payload.affectedRows.' },
      labelled('(rows|affectedRows|count)', 'rows=$(payload.affectedRows)'),
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Order saved to database table=orders rows=$(payload.affectedRows) orderId=$(vars.orderId) correlationId=$(correlationId)"]' },
    explain:
      'rows=1 is what you expect. rows=0 in this line explains an order that the API said it saved but nobody can find.',
  },
  {
    id: 'log-419',
    kind: 'write',
    situation:
      'The Database Select fails with DB:CONNECTIVITY: the database cannot be reached. The request fails and the API answers 503. Write the logger in the On Error Propagate. vars.customerId is set.',
    available: ['vars.customerId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|unreachable|unavailable|not reach|lost|down/i, 'Customer lookup failed: database unreachable'),
      errorFacts,
      labelled('customerId'),
      status(503),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Customer lookup failed: database unreachable errorType=$(error.errorType) error=$(error.description) status=503 customerId=$(vars.customerId) correlationId=$(correlationId)"]',
    },
    explain:
      'Every request that needs the database fails until someone acts, so ERROR. The error type DB:CONNECTIVITY tells support at once that it is the connection, not the query.',
  },
  {
    id: 'log-420',
    kind: 'write',
    situation:
      'The flow created a new hire in Workday. vars.employeeId holds your own ID for the person, payload.workerId the ID Workday gave back, and vars.durationMs how long the call took.',
    available: ['vars.employeeId', 'payload.workerId', 'vars.durationMs', 'payload.personalData.dateOfBirth', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|hired|added|replied|returned|succeeded/i, 'Workday hire created'),
      labelled('employeeId'),
      labelled('workerId'),
      duration,
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Workday hire created employeeId=$(vars.employeeId) workerId=$(payload.workerId) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'Both IDs are logged so support can go from your system to Workday and back. Hire data is personal, so only IDs go in the line.',
  },
  {
    id: 'log-421',
    kind: 'write',
    situation:
      'An Idempotent Message Validator checks vars.paymentId. The same payment notification came in twice, so it raised MULE:DUPLICATE_MESSAGE. An On Error Continue skips the second one. Write the logger there.',
    available: ['vars.paymentId', 'error.errorType', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/duplicate|already|twice|again|repeat/i, 'Duplicate payment notification skipped'),
      { must: /skip|ignor|dropped|next/i, say: 'Say what the flow did with it, such as skipped.' },
      labelled('paymentId'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Duplicate payment notification skipped paymentId=$(vars.paymentId) correlationId=$(correlationId)"]' },
    explain:
      'The validator did its job and nothing was lost, so INFO fits, or WARN if duplicates are rare for you. Without this line the team would wonder why the second notification did nothing.',
  },
  {
    id: 'log-422',
    kind: 'write',
    situation:
      'The flow asked the identity provider for a new OAuth access token for the Salesforce calls. payload.access_token holds the token and payload.expires_in its lifetime in seconds. Write the logger after the call.',
    available: ['payload.access_token', 'payload.expires_in', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/refresh|renew|obtained|new|fetched|got|received|issued/i, 'Salesforce access token refreshed'),
      { must: /payload\.expires_in/, say: 'Add how long the token lasts: payload.expires_in.' },
      labelled('(expires|expiresIn|expiresInSec|ttl|lifetime)', 'expiresInSec=$(payload.expires_in)'),
      { not: /access_token|accessToken|bearer|password|secret/i, say: 'Never log the token itself. Log how long it lasts instead.' },
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Salesforce access token refreshed expiresInSec=$(payload.expires_in) correlationId=$(correlationId)"]' },
    explain:
      'The time of the refresh and the lifetime explain later 401 errors. The token itself works like a password for the API and never goes in a log.',
  },
  {
    id: 'log-423',
    kind: 'write',
    situation:
      'A flow runs once when the app starts and reads its settings. vars.env holds the environment, such as prod, and vars.appVersion the version from the pom. app.name holds the app name. Write the start-up line.',
    available: ['app.name', 'vars.env', 'vars.appVersion', 'vars.dbPassword', 'vars.clientSecret'],
    level: ['INFO'],
    checks: [
      says(/start|ready|\bup\b|deployed|loaded|running/i, 'App started'),
      { must: /app\.name/, say: 'Add the app name: app.name.' },
      labelled('env'),
      labelled('(version|appVersion)', 'version=$(vars.appVersion)'),
      noSecrets,
      noVague,
    ],
    model: { level: 'INFO', message: '#["App started app=$(app.name) env=$(vars.env) version=$(vars.appVersion)"]' },
    explain:
      'The first question in an incident is often "which version runs where?". This line answers it. It needs no correlation ID because no request is involved.',
  },
  {
    id: 'log-424',
    kind: 'write',
    situation:
      'A nightly job compares the orders in SAP with the orders in the order database for one day. vars.sapCount is 1204 and vars.dbCount is 1201, so 3 orders are missing from the database. vars.runDate holds the day checked.',
    available: ['vars.sapCount', 'vars.dbCount', 'vars.runDate', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/mismatch|differ|missing|not match|out of sync|gap/i, 'Order reconciliation mismatch'),
      { must: /vars\.sapCount/, say: 'Add the SAP count: vars.sapCount.' },
      { must: /vars\.dbCount/, say: 'Add the database count: vars.dbCount.' },
      labelled('(runDate|date|day)', 'date=$(vars.runDate)'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Order reconciliation mismatch date=$(vars.runDate) sapCount=$(vars.sapCount) dbCount=$(vars.dbCount) correlationId=$(correlationId)"]',
    },
    explain:
      'The job worked and found a gap in the data, so WARN. ERROR also fits if lost orders must be fixed the same day. Both counts show the size of the gap at once.',
  },
  {
    id: 'log-425',
    kind: 'write',
    situation:
      "The credit check put an order on hold for manual review, because the order total is above the customer's credit limit. Write an audit line for this decision. vars.orderId, vars.customerId, vars.orderTotal and vars.creditLimit are set.",
    available: ['vars.orderId', 'vars.customerId', 'vars.orderTotal', 'vars.creditLimit', 'payload.customer.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/hold|held|review|decision|blocked|stopped/i, 'Order put on hold for credit review'),
      { must: /reason|limit|because/i, say: 'Add why, such as reason=over credit limit.' },
      labelled('orderId'),
      labelled('customerId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Order put on hold for credit review reason=over credit limit orderTotal=$(vars.orderTotal) creditLimit=$(vars.creditLimit) orderId=$(vars.orderId) customerId=$(vars.customerId) correlationId=$(correlationId)"]',
    },
    explain:
      'An audit line records a business decision and why it was made. When the customer asks why the order did not ship, this line answers with the numbers.',
  },
  {
    id: 'log-426',
    kind: 'write',
    situation:
      'Your logs go to Splunk as JSON. Write the line for "payment captured" as one JSON object on one line, with event, paymentId, orderId, durationMs and correlationId. payload.paymentId holds the payment ID and vars.durationMs how long the call took.',
    available: ['payload.paymentId', 'vars.orderId', 'vars.durationMs', 'payload.card.number', 'correlationId'],
    level: ['INFO'],
    checks: [
      jsonOut,
      oneLine,
      { must: /event\s*"?\s*:/, say: 'Add an event field that says what happened, such as event: "Payment captured".' },
      labelled('paymentId', 'paymentId: payload.paymentId'),
      labelled('orderId', 'orderId: vars.orderId'),
      { must: /durationMs\s*"?\s*:/, say: 'Add durationMs: vars.durationMs.' },
      jsonCorr,
      noSecrets,
      noPayload,
    ],
    model: {
      level: 'INFO',
      message:
        '#[output application/json indent=false --- { event: "Payment captured", paymentId: payload.paymentId, orderId: vars.orderId, durationMs: vars.durationMs, correlationId: correlationId }]',
    },
    explain:
      'Each field can be searched on its own, and durationMs can be charted in Splunk without parsing text. The card number stays out at every level.',
  },
  {
    id: 'log-427',
    kind: 'write',
    situation:
      'Your logs go to Splunk as JSON. A refund failed: it was not made and goes to a manual queue. Write the ERROR line as one JSON object on one line, with event, refundId, the error type, the error description, what happens next and correlationId. vars.refundId is set.',
    available: ['vars.refundId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      jsonOut,
      oneLine,
      { must: /event\s*"?\s*:\s*"[^"]*(fail|not|could)/i, say: 'Make the event say what failed, such as event: "Refund failed".' },
      labelled('refundId', 'refundId: vars.refundId'),
      errorFacts,
      { must: /next|manual|queue/i, say: 'Say what happens next, such as next: "manual refund queue".' },
      jsonCorr,
      noPayload,
      { not: /error occurred|something went wrong/i, say: "Say exactly what happened. 'Error occurred' tells the reader nothing." },
    ],
    model: {
      level: 'ERROR',
      message:
        '#[output application/json indent=false --- { event: "Refund failed", refundId: vars.refundId, errorType: "$(error.errorType)", error: error.description, next: "manual refund queue", correlationId: correlationId }]',
    },
    explain:
      'The same fields as the INFO lines, plus the error facts and what happens next. "$(error.errorType)" turns the error type into text, and an alert can count the lines where event is "Refund failed".',
  },
  {
    id: 'log-428',
    kind: 'write',
    situation:
      "Your API checks the caller's client ID against an allowed list. vars.clientId is not on the list, so the flow answers 403 and stops. Write the logger. The request also carries a client_secret header.",
    available: ['vars.clientId', 'attributes.headers.client_secret', 'attributes.method', 'attributes.requestPath', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/rejected|denied|refused|forbidden|blocked|not allowed/i, 'Request rejected: client not allowed'),
      labelled('clientId'),
      status(403),
      { must: /requestPath|method|path/i, say: 'Add what was called, such as path=$(attributes.requestPath).' },
      corr,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Request rejected: client not allowed status=403 clientId=$(vars.clientId) method=$(attributes.method) path=$(attributes.requestPath) correlationId=$(correlationId)"]',
    },
    explain:
      'Your API did the right thing, so WARN, not ERROR. The client ID tells the team which app to talk to. The client secret is a password and stays out.',
  },
  {
    id: 'log-429',
    kind: 'write',
    situation:
      'An order line has no tax code. The flow uses the default code STD and goes on. vars.orderId and vars.lineNumber are set.',
    available: ['vars.orderId', 'vars.lineNumber', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/default|missing|no tax|fallback|without/i, 'Tax code missing, default used'),
      { must: /STD|used|applied|next/i, say: 'Say what the flow did instead, such as taxCode=STD used.' },
      labelled('orderId'),
      labelled('(line|lineNumber)', 'line=$(vars.lineNumber)'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Tax code missing, default used taxCode=STD orderId=$(vars.orderId) line=$(vars.lineNumber) correlationId=$(correlationId)"]',
    },
    explain:
      'The app handled it, but the data is not as it should be. WARN lets the team count these lines and ask the source system to send the tax code.',
  },
  {
    id: 'log-430',
    kind: 'write',
    situation:
      'Until Successful called SAP. The first attempt timed out and the second worked. vars.attempt holds 2, vars.sapDocNo the SAP document number and vars.orderId the order. Write the logger after the Until Successful.',
    available: ['vars.attempt', 'vars.sapDocNo', 'vars.orderId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|succeeded|worked|replied|accepted/i, 'SAP order created'),
      { must: /vars\.attempt/, say: 'Add the attempt that worked: vars.attempt.' },
      labelled('attempts?', 'attempt=$(vars.attempt)'),
      labelled('sapDocNo'),
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["SAP order created attempt=$(vars.attempt) sapDocNo=$(vars.sapDocNo) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain:
      'The work succeeded, so INFO. The attempt number shows that it needed a retry; many lines with attempt=2 or 3 point to a problem in SAP.',
  },
  {
    id: 'log-431',
    kind: 'write',
    situation:
      "The carrier API created a shipping label. payload.trackingNumber holds the tracking number and vars.carrier the carrier. vars.orderId is set. The response also holds payload.shipTo, the customer's delivery details.",
    available: ['payload.trackingNumber', 'vars.carrier', 'vars.orderId', 'payload.shipTo', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|shipped|label|booked|dispatched/i, 'Shipping label created'),
      labelled('trackingNumber'),
      labelled('orderId'),
      corr,
      noPayload,
      noPersonal,
      { not: /shipTo/i, say: "Leave out shipTo: it is the customer's delivery details." },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Shipping label created carrier=$(vars.carrier) trackingNumber=$(payload.trackingNumber) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain:
      'The tracking number lets support answer "where is my parcel?" from the logs. The delivery details are personal data and are not needed to find the shipment.',
  },
  {
    id: 'log-432',
    kind: 'write',
    situation:
      'The order API answers 202 at once and hands the order to the VM queue orders-in for slower processing in another flow. Write the logger after the VM Publish. vars.orderId is set.',
    available: ['vars.orderId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/queued|published|handed|sent|accepted|put/i, 'Order queued for processing'),
      { must: /orders-in|queue/i, say: 'Name the queue, such as queue=orders-in.' },
      labelled('orderId'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Order queued for processing queue=orders-in orderId=$(vars.orderId) correlationId=$(correlationId)"]' },
    explain:
      'After this line the caller has its answer and the work goes on in another flow. The order ID joins this line to the lines of the flow that reads the queue.',
  },
  {
    id: 'log-433',
    kind: 'write',
    situation:
      'A scheduled flow read 8,000 employee records from the HR database. The next component is a Batch Job. Write the logger before the Batch Job, with how many records go in. payload is the list of records.',
    available: ['payload (a list of records)', 'sizeOf(payload)', 'payload[0].homeAddress', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/start|submitted|sent|loaded|read|queued|handed/i, 'Employee sync started'),
      { must: /sizeOf\s*\(/, say: 'Add how many records: sizeOf(payload).' },
      labelled('(records|count|total)', 'records=$(sizeOf(payload))'),
      { not: /write\s*\(\s*payload|\$\(\s*payload\s*\)|\+\+\s*payload\s*(\]|\+\+|$)/, say: 'Log the count, not the records.' },
      corr,
      noPersonal,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Employee sync started records=$(sizeOf(payload)) correlationId=$(correlationId)"]' },
    explain:
      'The count going in, next to the counts in On Complete, shows whether every record was handled. sizeOf(payload) is a number, so it is safe to log.',
  },
  {
    id: 'log-434',
    kind: 'write',
    situation:
      'A Cache scope wraps the call to the Product API. Write a logger in the Cache scope, before the call. It runs only on a cache miss, because on a hit the scope returns the stored response without running its content. vars.productId is set and the category is com.acme.products.cache.',
    available: ['vars.productId', 'payload', 'correlationId'],
    level: ['DEBUG', 'TRACE'],
    checks: [
      says(/miss|not (in|found in) (the )?cache|calling|fetch/i, 'Product cache miss'),
      labelled('productId'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'DEBUG', message: '#["Product cache miss, calling Product API productId=$(vars.productId) correlationId=$(correlationId)"]' },
    explain:
      'A miss on every request means the cache is not working, but one line per request is too many for INFO. Raise the category to DEBUG in log4j2.xml when you need to check.',
  },
  {
    id: 'log-435',
    kind: 'write',
    situation:
      'You are fixing the SAP mapping in dev with made-up data. vars.sapRequest holds the mapped request as an object, right before it is sent. vars.orderId is set and the category is com.acme.orders.mapping. Write the line that shows the mapped request.',
    available: ['vars.sapRequest', 'vars.orderId', 'payload', 'correlationId'],
    level: ['DEBUG', 'TRACE'],
    checks: [
      says(/mapped|request|body|sending|built/i, 'SAP request mapped'),
      { must: /vars\.sapRequest/, say: 'Show the mapped request: vars.sapRequest.' },
      { must: /write\s*\(|output\s+application\/json/, say: "Turn the object into text with write(vars.sapRequest, 'application/json')." },
      labelled('orderId'),
      corr,
      noVague,
    ],
    model: {
      level: 'DEBUG',
      message: "#[\"SAP request mapped orderId=$(vars.orderId) correlationId=$(correlationId) body=$(write(vars.sapRequest, 'application/json'))\"]",
    },
    explain:
      'The whole mapped request is right for DEBUG in dev. The category lets you turn on only the mapping lines, and the IDs first let a search still find the line.',
  },
  {
    id: 'log-436',
    kind: 'write',
    situation:
      'Before the HTTP Request to Workday, you want a line that says the call is starting. The line after the call already logs the status and duration at INFO. vars.workerId and vars.workdayPath are set.',
    available: ['vars.workerId', 'vars.workdayPath', 'vars.workdayToken', 'payload', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/calling|sending|request|start|about to/i, 'Calling Workday'),
      labelled('workerId'),
      { must: /vars\.workdayPath/, say: 'Add which path you call: vars.workdayPath.' },
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: { level: 'DEBUG', message: '#["Calling Workday path=$(vars.workdayPath) workerId=$(vars.workerId) correlationId=$(correlationId)"]' },
    explain:
      'The line after the call says the same and more, so this one is DEBUG. When a call hangs, turning on DEBUG shows that the call started but never ended.',
  },
  {
    id: 'log-437',
    kind: 'write',
    situation:
      'You need to see what a caller sends to GET /products while you troubleshoot. Log the method, the path and the query parameters. The request headers include Authorization with a bearer token.',
    available: ['attributes.method', 'attributes.requestPath', 'attributes.queryParams', 'attributes.headers', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/request|received|called|arrived|get/i, 'Request received'),
      { must: /attributes\.(requestPath|method)/, say: 'Add what was called: attributes.method and attributes.requestPath.' },
      labelled('path', 'path=$(attributes.requestPath)'),
      { must: /attributes\.queryParams/, say: "Add the query parameters: write(attributes.queryParams, 'application/json')." },
      { not: /attributes\.headers/, say: 'Leave out the headers: they hold the Authorization token.' },
      corr,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'DEBUG',
      message:
        "#[\"Request received method=$(attributes.method) path=$(attributes.requestPath) query=$(write(attributes.queryParams, 'application/json', {indent: false})) correlationId=$(correlationId)\"]",
    },
    explain:
      'The method, path and query are what you need to repeat the call. The headers carry the token, so they stay out even at DEBUG.',
  },
]
