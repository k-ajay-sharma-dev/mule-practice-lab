// Logging Lab: practice for the Mule 4 Logger. Four kinds of exercise, all checked in the browser:
//   level    pick the level for a situation (answer: the accepted levels)
//   choice   pick the best-worded message (answer: index of the best option)
//   multi    pick every problem, or every place, that applies (answers: indexes that apply)
//   write    write the logger message and pick its level; the message is checked against rules (src/logging/grade.js)
//
// The rules of a write exercise: { must: RegExp, say } fails when the message does not match, { not: RegExp, say }
// fails when it does. `say` tells the learner what to change. Every model answer passes its own rules
// (scripts/check-logging.js).

import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from './rules.js'
import { MORE_CHOICE } from './more-choice.js'
import { MORE_LEVEL } from './more-level.js'
import { MORE_MULTI } from './more-multi.js'
import { MORE_WRITE } from './more-write.js'

export { KINDS, LEVELS } from './rules.js'

// The first exercises written. More of each kind live in more-*.js and are added below, so each kind keeps its own file.
const FIRST = [
  // ---------- pick the level ----------
  {
    id: 'log-001',
    kind: 'level',
    situation: 'A POST /orders request arrives at the Order Process API. You log one line at the start of every request.',
    answer: ['INFO'],
    explain:
      'INFO is for the normal events you want to see in production: a request arrived, an order was created. One line per request is a fair volume.',
  },
  {
    id: 'log-002',
    kind: 'level',
    situation: 'You want to see the full request payload while you fix a mapping in the dev environment.',
    answer: ['DEBUG'],
    explain:
      'DEBUG is for detail you need while you build or troubleshoot. It is off in production by default, so large and sensitive data does not reach the production logs.',
  },
  {
    id: 'log-003',
    kind: 'level',
    situation: 'The SAP call failed three times in a row. The retries are used up and the order goes to the dead-letter queue.',
    answer: ['ERROR'],
    explain: 'ERROR means the work failed and someone has to act. Here an order did not reach SAP and waits in the DLQ.',
  },
  {
    id: 'log-004',
    kind: 'level',
    situation: 'The first call to SAP timed out. The flow will retry, and the retry usually works.',
    answer: ['WARN'],
    explain:
      'WARN is for something unexpected that the app handled. One timeout that a retry fixes is not a failure yet, but many of them point to a problem.',
  },
  {
    id: 'log-005',
    kind: 'level',
    situation:
      'A customer record has no email address, so the welcome email is skipped. The rest of the onboarding goes on as normal.',
    answer: ['WARN'],
    explain:
      'The app handled it, but the data is not as expected. WARN lets the team count these and fix the source data. ERROR would page someone for nothing.',
  },
  {
    id: 'log-006',
    kind: 'level',
    situation: 'A scheduler checks the SFTP folder every 5 minutes. Most runs find no new files.',
    answer: ['DEBUG'],
    explain:
      'An empty run every 5 minutes is 288 lines a day that say nothing. Log the empty runs at DEBUG and the runs that pick up files at INFO.',
  },
  {
    id: 'log-007',
    kind: 'level',
    situation: 'A batch job finished: 12,000 records, 11,997 successful and 3 failed.',
    answer: ['INFO'],
    explain:
      'The end of a job is a normal event, so INFO with the counts. The 3 failed records get their own WARN or ERROR lines in the step that failed them.',
  },
  {
    id: 'log-008',
    kind: 'level',
    situation: 'Inside a For Each over 5,000 order lines, you want to log the values of each line.',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'One line per record floods INFO and slows the app. Use DEBUG or TRACE inside the loop, and one INFO line after the loop with the count.',
  },
  {
    id: 'log-009',
    kind: 'level',
    situation: 'A request is rejected with 400 because the required field shipTo.country is missing.',
    answer: ['WARN', 'INFO'],
    explain:
      'The caller sent bad data and got a clear answer. Your app did its job, so this is not an ERROR. WARN (or INFO) keeps it visible without waking the support team.',
  },
  {
    id: 'log-010',
    kind: 'level',
    situation: 'The database connection pool is exhausted and every request that needs the database fails.',
    answer: ['ERROR'],
    explain: 'Requests are failing and someone must act now. That is ERROR.',
  },
  {
    id: 'log-011',
    kind: 'level',
    situation: 'The payment provider answered in 4.8 seconds. The limit is 5 seconds, so the call worked.',
    answer: ['WARN'],
    explain:
      'It worked, but close to the limit. WARN gives an early signal before the calls start to time out.',
  },
  {
    id: 'log-012',
    kind: 'level',
    situation: 'The app has started in production and loaded the configuration for env=prod.',
    answer: ['INFO'],
    explain: 'Start-up, with the environment and version, is a normal event that helps every investigation. INFO.',
  },

  // ---------- best wording ----------
  {
    id: 'log-020',
    kind: 'choice',
    situation: 'The order was created in SAP. Which message is best?',
    options: [
      'Done',
      'SAP OK!!!',
      'SAP order created orderId=10045 sapDocNo=4500017 durationMs=812 correlationId=7f3c2a',
      'Success in flow sap-create-order-flow at step 4',
    ],
    answer: 2,
    explain:
      'It says what happened, then the facts as name=value pairs: which order, the SAP document, how long it took, and the correlation ID. The others make the reader open the code to understand them.',
  },
  {
    id: 'log-021',
    kind: 'choice',
    situation: 'The request failed validation. Which message is best?',
    options: [
      'User sent garbage again',
      'Validation error',
      'Request rejected: shipTo.country is missing orderId=10045 status=400 correlationId=7f3c2a',
      'ERROR!!! bad request in main flow',
    ],
    answer: 2,
    explain:
      'It says the result (rejected), the reason (which field), the ID, the status sent back and the correlation ID. Never blame the caller in a log: other teams read these lines.',
  },
  {
    id: 'log-022',
    kind: 'choice',
    situation: 'The flow is about to retry a call to SAP. Which message is best?',
    options: [
      'Retry',
      'Retrying SAP order create attempt=2 of 3 after HTTP:TIMEOUT orderId=10045 correlationId=7f3c2a',
      'Trying again because SAP is slow',
      'retry retry retry',
    ],
    answer: 1,
    explain:
      'It names the call, which attempt out of how many, why, and the IDs. Reading the lines of one request, you can see the retries and when they stopped.',
  },
  {
    id: 'log-023',
    kind: 'choice',
    situation: 'A request has arrived. Which message is best?',
    options: [
      'Inside main flow',
      'Flow started',
      'Request received POST /orders orderId=10045 channel=web correlationId=7f3c2a',
      'Got payload: {"orderId":10045,"customer":{"email":"ann@example.com"}}',
    ],
    answer: 2,
    explain:
      'It says which request, with the key facts and the correlation ID. The last one dumps the payload, with an email address in it.',
  },
  {
    id: 'log-024',
    kind: 'choice',
    situation: 'The order could not be sent to SAP after every retry. Which message is best?',
    options: [
      'Something went wrong',
      'Order not sent to SAP after 3 attempts errorType=HTTP:TIMEOUT orderId=10045 next=sent to DLQ correlationId=7f3c2a',
      'Exception!!',
      'SAP is down, please check',
    ],
    answer: 1,
    explain:
      'A good error line says what failed, why (the error type), which record, and what happens next. "next=sent to DLQ" tells support where the order is now.',
  },
  {
    id: 'log-025',
    kind: 'choice',
    situation: 'Your team searches logs in Splunk by field. Which set of messages is quickest to search?',
    options: [
      'order_id=10045 … OrderID=10046 … orderNo=10047',
      'orderId=10045 … orderId=10046 … orderId=10047',
      'Order 10045 … the order with number 10046 … #10047',
      'All three work the same in a search',
    ],
    answer: 1,
    explain: 'One name for one thing, in every flow and every app. Then one search, orderId=10046, finds every line.',
  },
  {
    id: 'log-026',
    kind: 'choice',
    situation: 'The payment provider declined a card. Which message is best?',
    options: [
      'Payment declined paymentId=pay_881 reason=insufficient_funds orderId=10045 correlationId=7f3c2a',
      'Payment declined for card 4111111111111111 of ann@example.com',
      'Card problem',
      'Payment error: see payload',
    ],
    answer: 0,
    explain:
      'It gives the reason and IDs that support can look up. The second one breaks PCI and privacy rules: a card number and an email in a log file.',
  },
  {
    id: 'log-027',
    kind: 'choice',
    situation: 'A call to the CRM has returned. Which message is best?',
    options: [
      'Called CRM',
      'CRM replied status=200 durationMs=342 customerId=C-2231 correlationId=7f3c2a',
      'CRM call complete!!!',
      'Response from CRM: <the whole response body>',
    ],
    answer: 1,
    explain:
      'The status and the time taken are what you need when a call is slow or fails. Logging the whole response body is large and may hold personal data.',
  },

  // ---------- spot the problems ----------
  {
    id: 'log-040',
    kind: 'multi',
    situation: 'In the Order Process API, at the start of the main flow:',
    code: '<logger level="INFO" message="#[payload]" />',
    options: [
      'It logs the whole payload at INFO: large lines and personal data in production',
      'There is no correlation ID or order ID to search for',
      'It does not say what happened',
      'A Logger must have a category, or it does not run',
      'INFO is never allowed at the start of a flow',
    ],
    answers: [0, 1, 2],
    explain:
      'The payload belongs at DEBUG at most. A good line says what happened with labelled IDs. A Logger runs without a category; the category only lets you change the level for one area.',
  },
  {
    id: 'log-041',
    kind: 'multi',
    situation: 'In the login flow of a customer portal API:',
    code: '<logger level="INFO" message=\'#["Login for " ++ payload.username ++ " with password " ++ payload.password]\' />',
    options: [
      'It writes the password into the log',
      'Using ++ to join strings does not work in a Logger',
      'There is no correlation ID',
      'It should log a user ID rather than the username, if the username is an email',
    ],
    answers: [0, 2, 3],
    explain:
      'A password must never reach a log. ++ works fine in DataWeave. Log a user ID, the result and the correlation ID: "Login succeeded userId=U-118 correlationId=...".',
  },
  {
    id: 'log-042',
    kind: 'multi',
    situation: 'In the On Error Propagate of the SAP call:',
    code: '<logger level="ERROR" message="Error occurred" />',
    options: [
      'The message does not say what failed or why',
      'There is no error.errorType or error.description',
      'There is no order ID or correlation ID',
      'ERROR is the wrong level in an error handler, always use WARN',
    ],
    answers: [0, 1, 2],
    explain:
      'At 3 a.m. this line tells support nothing. Say what failed, add error.errorType and error.description, the order ID and the correlation ID. ERROR is right when the work failed.',
  },
  {
    id: 'log-043',
    kind: 'multi',
    situation: 'Inside a For Each over the 10,000 lines of a price file:',
    code: '<logger level="INFO" message=\'#["Processing line $(vars.counter)"]\' />',
    options: [
      '10,000 INFO lines per file flood the logs and slow the flow',
      'Better: DEBUG inside the loop, and one INFO line after it with the count',
      'vars.counter does not exist in a For Each',
      'The line has no file name or correlation ID to tie it to the run',
    ],
    answers: [0, 1, 3],
    explain:
      'For Each does set vars.counter. The trouble is the volume and the missing context. One summary line, such as "Price file processed fileName=prices.csv lines=10000", is worth more.',
  },
  {
    id: 'log-044',
    kind: 'multi',
    situation: 'In the payment flow, for troubleshooting:',
    code: '<logger level="DEBUG" message=\'#["Charging card " ++ payload.cardNumber ++ " amount " ++ payload.amount]\' />',
    options: [
      'A card number in a log breaks PCI rules, even at DEBUG',
      'DEBUG is sometimes turned on in production to troubleshoot, so this can leak',
      'DEBUG lines are never written anywhere, so it is safe',
      'Log a payment ID or the last 4 digits instead',
    ],
    answers: [0, 1, 3],
    explain:
      'DEBUG is switched on in production more often than people think. Card numbers, CVV and passwords never go into a log at any level.',
  },
  {
    id: 'log-045',
    kind: 'multi',
    situation: 'Before and after the call to SAP:',
    code: '<logger level="INFO" message="Calling SAP" />\n<http:request ... />\n<logger level="INFO" message="Called SAP" />',
    options: [
      'The line after the call has no status or duration',
      'There is no order ID or correlation ID',
      'The line before the call could be DEBUG, as the line after it says the same and more',
      'You must never log around an outbound call',
    ],
    answers: [0, 1, 2],
    explain:
      'The useful line is the one after the call: "SAP replied status=201 durationMs=812 orderId=... correlationId=...". It answers "was it slow?" and "did it fail?".',
  },
  {
    id: 'log-046',
    kind: 'multi',
    situation: 'A customer lookup in a Customer System API:',
    code: '<logger level="WARN" message=\'#["Customer " ++ payload.email ++ " not found"]\' />',
    options: [
      'An email address is personal data. Log the customer ID instead',
      'There is no correlation ID',
      'Not found may be a normal answer: INFO can fit better than WARN',
      'WARN lines are dropped in production',
    ],
    answers: [0, 1, 2],
    explain:
      'Ask what the reader needs: which lookup, which ID and which request. "Customer not found customerId=C-2231 correlationId=..." is enough. WARN lines are kept in production.',
  },
  {
    id: 'log-047',
    kind: 'multi',
    situation: 'In every flow of a 15-flow app, every Logger looks like this:',
    code: '<logger level="INFO" message=\'#["Order received orderId=$(vars.orderId) correlationId=$(correlationId)"]\' />',
    options: [
      'No category is set, so you cannot raise one area (such as the SAP calls) to DEBUG alone',
      'The message wording is poor',
      'Set category="com.acme.orders.sap" and similar, then change levels per category in log4j2.xml',
      'Without a category nothing is logged',
    ],
    answers: [0, 2],
    explain:
      'The message is good. The category is what lets operations turn on DEBUG for one area without flooding the rest. Without one, the Logger still writes its lines.',
  },
  {
    id: 'log-048',
    kind: 'multi',
    situation: 'Before a Transform that maps a 50 MB file from SFTP:',
    code: '<logger level="INFO" message="#[write(payload, \'application/json\')]" />',
    options: [
      'The whole 50 MB file is turned into one log line',
      'It reads the whole stream into memory to write the line',
      'The file may hold personal data',
      'write() is not a DataWeave function',
    ],
    answers: [0, 1, 2],
    explain:
      'write() is a real function, which is what makes this costly. Log the file name, size and record count instead.',
  },
  {
    id: 'log-049',
    kind: 'multi',
    situation: 'Your Order Process API receives a POST /orders, calls SAP, and returns 201. Where should loggers go?',
    options: [
      'When the request arrives (INFO, with the order ID)',
      'After the SAP call (INFO, with status and duration)',
      'In each error handler (WARN or ERROR, with the error type)',
      'Before and after every Set Variable and Transform (INFO)',
      'At the end with the result sent back (INFO)',
    ],
    answers: [0, 1, 2, 4],
    explain:
      'Log the edges: in, out, every call to another system, and every error. Logging every small step at INFO hides the lines that matter.',
  },

  // ---------- write the logger ----------
  {
    id: 'log-060',
    kind: 'write',
    situation: 'Write the first logger of POST /orders in the Order Process API. It runs as soon as the request arrives.',
    available: ['vars.orderId', 'payload.customer.email', 'payload.items', 'attributes.method', 'attributes.requestPath', 'correlationId'],
    level: ['INFO'],
    checks: [says(/received|arrived|accepted|start/i, 'Order received'), labelled('orderId'), corr, noPayload, noPersonal, noVague],
    model: { level: 'INFO', message: '#["Order received orderId=$(vars.orderId) correlationId=$(correlationId)"]' },
    explain: 'What happened, the business ID and the correlation ID. Nothing personal, no payload.',
  },
  {
    id: 'log-061',
    kind: 'write',
    situation:
      'SAP has created the order. Write the logger after the HTTP Request. vars.startMs holds the time before the call, in milliseconds.',
    available: ['vars.orderId', 'vars.startMs', 'payload.sapDocNo', 'attributes.statusCode', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|replied|returned|succeeded|completed/i, 'SAP order created'),
      labelled('orderId'),
      labelled('sapDocNo'),
      { must: /duration|elapsed|took|ms\s*[=:]/i, say: 'Add how long the call took, such as durationMs=$(...).' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        "#[\"SAP order created orderId=$(vars.orderId) sapDocNo=$(payload.sapDocNo) durationMs=$((now() as Number {unit: 'milliseconds'}) - vars.startMs) correlationId=$(correlationId)\"]",
    },
    explain: 'The time taken is what you need the day SAP is slow. The SAP document number lets support find the order in SAP.',
  },
  {
    id: 'log-062',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate of the SAP call. The retries are used up and the order goes to the dead-letter queue.',
    available: ['vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not (sent|created)|could not|rejected/i, 'Order not sent to SAP'),
      labelled('orderId'),
      errorFacts,
      { must: /dlq|dead.?letter|next/i, say: 'Say what happens next, such as next=sent to DLQ.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Order not sent to SAP orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) next=sent to DLQ correlationId=$(correlationId)"]',
    },
    explain: 'What failed, why, which order, and where it is now. Support can act on this line without opening the code.',
  },
  {
    id: 'log-063',
    kind: 'write',
    situation:
      'The SAP call timed out and Until Successful is about to try again. Write the logger for the retry. vars.attempt holds the attempt number, and there are 3 attempts in all.',
    available: ['vars.orderId', 'vars.attempt', 'error.errorType', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/retr/i, 'Retrying SAP order create'),
      { must: /vars\.attempt/, say: 'Add which attempt this is, such as attempt=$(vars.attempt).' },
      labelled('attempt', 'attempt=$(vars.attempt)'),
      labelled('orderId'),
      corr,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Retrying SAP order create attempt=$(vars.attempt) of 3 errorType=$(error.errorType) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain: 'A retry that works is a WARN, not an ERROR. The attempt number shows how close you came to failing.',
  },
  {
    id: 'log-064',
    kind: 'write',
    situation:
      'APIkit rejected the request with 400 because a field is missing. Write the logger in the APIKIT:BAD_REQUEST handler.',
    available: ['error.description', 'payload.customer.email', 'attributes.requestPath', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/rejected|invalid|bad request|validation/i, 'Request rejected'),
      { must: /error\.description/, say: 'Add the reason: error.description says which field is wrong.' },
      { must: /400|status/i, say: 'Add the status you send back, such as status=400.' },
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Request rejected status=400 reason=$(error.description) correlationId=$(correlationId)"]' },
    explain: 'The caller made the mistake, so this is WARN, not ERROR. The reason helps the caller and you when they ask why.',
  },
  {
    id: 'log-065',
    kind: 'write',
    situation:
      'Write the logger in the On Complete phase of a batch job. In On Complete, payload is the batch job result.',
    available: ['payload.batchJobInstanceId', 'payload.totalRecords', 'payload.successfulRecords', 'payload.failedRecords', 'payload.elapsedTimeInMillis'],
    level: ['INFO'],
    checks: [
      says(/finished|completed|done processing|ended/i, 'Batch job finished'),
      { must: /batchJobInstanceId/, say: 'Add the job instance ID: payload.batchJobInstanceId.' },
      { must: /successfulRecords/, say: 'Add how many records worked: payload.successfulRecords.' },
      { must: /failedRecords/, say: 'Add how many records failed: payload.failedRecords.' },
      labelled('failed', 'failed=$(payload.failedRecords)'),
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Batch job finished jobId=$(payload.batchJobInstanceId) total=$(payload.totalRecords) successful=$(payload.successfulRecords) failed=$(payload.failedRecords) durationMs=$(payload.elapsedTimeInMillis)"]',
    },
    explain: 'One summary line per run. The failed count is the number operations watch.',
  },
  {
    id: 'log-066',
    kind: 'write',
    situation: 'You are fixing a mapping in the dev environment and want to see the request body. Test data only.',
    available: ['payload', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      { must: /\bpayload\b/, say: 'This time the payload is what you need to see.' },
      { must: /write\s*\(|output application\/json|\$\(payload\)|payload\s*\]/, say: 'Turn the payload into text, such as write(payload, "application/json").' },
      corr,
    ],
    model: { level: 'DEBUG', message: "#[\"Request body correlationId=$(correlationId) body=$(write(payload, 'application/json'))\"]" },
    explain:
      'The whole payload is fine at DEBUG in dev. The level is what keeps it out of production, so the level is the important choice here.',
  },
  {
    id: 'log-067',
    kind: 'write',
    situation: 'The Customer System API found no customer for the ID it was given. It answers 404, which is a normal answer.',
    available: ['vars.customerId', 'payload.email', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [says(/not found|no customer|missing/i, 'Customer not found'), labelled('customerId'), corr, noPersonal, noPayload, noVague],
    model: { level: 'INFO', message: '#["Customer not found customerId=$(vars.customerId) status=404 correlationId=$(correlationId)"]' },
    explain: 'Log the ID you searched for, not the email. A 404 is an answer, not a failure of your app.',
  },
  {
    id: 'log-068',
    kind: 'write',
    situation: 'A customer logged in to the portal. Write the logger for a successful login.',
    available: ['vars.userId', 'payload.username', 'payload.password', 'vars.accessToken', 'correlationId'],
    level: ['INFO'],
    checks: [says(/login|logged in|signed in|authenticated/i, 'Login succeeded'), labelled('userId'), corr, noSecrets, noPersonal, noVague],
    model: { level: 'INFO', message: '#["Login succeeded userId=$(vars.userId) correlationId=$(correlationId)"]' },
    explain: 'The user ID is enough to trace the session. The password and the token must never reach a log.',
  },
  {
    id: 'log-069',
    kind: 'write',
    situation: 'The scheduler picked up new files from SFTP. payload is the list of files found. Write the summary line.',
    available: ['payload (a list of files)', 'sizeOf(payload)', 'payload.*fileName', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/found|picked up|received|listed/i, 'Files found'),
      { must: /sizeOf\s*\(/, say: 'Add how many files: sizeOf(payload).' },
      labelled('files', 'files=$(sizeOf(payload))'),
      corr,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Files found on SFTP files=$(sizeOf(payload)) correlationId=$(correlationId)"]' },
    explain: 'Logging sizeOf(payload) is fine: it is a count, not the payload. The file contents stay out of the log.',
  },
  {
    id: 'log-070',
    kind: 'write',
    situation: 'The payment provider charged the card. Write the logger after the call.',
    available: ['vars.orderId', 'payload.paymentId', 'payload.amount', 'payload.card.number', 'payload.card.last4', 'correlationId'],
    level: ['INFO'],
    checks: [says(/charged|captured|accepted|succeeded|paid/i, 'Payment captured'), labelled('paymentId'), labelled('orderId'), corr, noSecrets, noVague],
    model: {
      level: 'INFO',
      message: '#["Payment captured paymentId=$(payload.paymentId) amount=$(payload.amount) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain: 'The payment ID finds the payment at the provider. The card number never goes in a log; the last 4 digits are allowed if support needs them.',
  },
  {
    id: 'log-071',
    kind: 'write',
    situation:
      'Your team sends logs to Splunk as JSON. Write the logger for "order received" as one JSON object on one line, with event, orderId and correlationId.',
    available: ['vars.orderId', 'correlationId'],
    level: ['INFO'],
    checks: [
      { must: /output\s+application\/json/, say: 'Start the expression with output application/json.' },
      { must: /indent\s*=\s*false/, say: 'Add indent=false, so the JSON stays on one line.' },
      { must: /event\s*:/, say: 'Add an event field that says what happened.' },
      labelled('orderId', 'orderId: vars.orderId'),
      { must: /correlationId\s*:\s*correlationId/, say: 'Add correlationId: correlationId.' },
      noPayload,
    ],
    model: {
      level: 'INFO',
      message: '#[output application/json indent=false --- { event: "Order received", orderId: vars.orderId, correlationId: correlationId }]',
    },
    explain:
      'Structured logs are searched by field: event="Order received" AND orderId=10045. indent=false keeps one event on one line, which most log tools need.',
  },
  {
    id: 'log-072',
    kind: 'write',
    situation:
      'At the end of POST /orders, the API sends back 201. Write the last logger with the result. vars.startMs holds the time the request arrived.',
    available: ['vars.orderId', 'vars.startMs', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/completed|created|returned|responded|finished/i, 'Order request completed'),
      { must: /201|status/i, say: 'Add the status you send back, such as status=201.' },
      { must: /duration|elapsed|took|ms\s*[=:]/i, say: 'Add how long the request took, such as durationMs=$(...).' },
      labelled('orderId'),
      corr,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        "#[\"Order request completed status=201 orderId=$(vars.orderId) durationMs=$((now() as Number {unit: 'milliseconds'}) - vars.startMs) correlationId=$(correlationId)\"]",
    },
    explain: 'A first line and a last line per request, with the duration, give you response times without any other tool.',
  },
]

// In the order the page shows them: each kind together.
const byKind = (kind, more) => [...FIRST.filter((e) => e.kind === kind), ...more]
export const EXERCISES = [
  ...byKind('level', MORE_LEVEL),
  ...byKind('choice', MORE_CHOICE),
  ...byKind('multi', MORE_MULTI),
  ...byKind('write', MORE_WRITE),
]

// The guide shown above the exercises.
export const GUIDE = `
## How to word a log message

1. **Start with what happened**, in a few words: \`Order received\`, \`SAP order created\`, \`Payment declined\`.
2. **Then the facts, as name=value pairs**: \`orderId=10045 sapDocNo=4500017 durationMs=812\`.
3. **Always add correlationId.** It joins every line of one request, across all your apps.
4. **Use the same names everywhere.** Always \`orderId\`, never \`order_id\` in one flow and \`OrderID\` in another.
5. **For an error**, add \`error.errorType\` and \`error.description\`, and say what happens next: \`next=retry\`, \`next=sent to DLQ\`.
6. **Never log** passwords, tokens or card numbers. Leave out personal data such as email or phone. Log an ID instead.
7. **Not the whole payload at INFO.** It is large, slow and full of personal data. If you need it, use DEBUG in a test environment.
8. **No blame, no shouting.** Other teams read these lines. \`Request rejected: shipTo.country is missing\`, not \`User sent garbage!!!\`.

A good line: \`#["SAP order created orderId=$(vars.orderId) durationMs=$(...) correlationId=$(correlationId)"]\`

## Pick the level

| Level | When | Example |
|---|---|---|
| ERROR | The work failed and someone must act | Order not sent to SAP after 3 attempts |
| WARN | Unexpected, but handled | A retry, a slow call, data that is not as expected, a 400 |
| INFO | Normal events you want in production | Request received, order created, job finished |
| DEBUG | Detail for building or troubleshooting | The payload in dev, each line of a loop |
| TRACE | Even finer detail, rarely used | Every value at every step |

## Where to put loggers

- When a request or message **arrives** (INFO).
- **After each call** to another system, with the status and duration (INFO). The line before the call can be DEBUG.
- In **every error handler** (WARN or ERROR).
- At the **end**, with the result sent back (INFO).
- Inside loops only at DEBUG. After the loop, one INFO line with the count.

## Set a category

\`<logger level="INFO" category="com.acme.orders.sap" message="..." />\`

The category lets operations raise one area to DEBUG in log4j2.xml without flooding the rest.

## Structured logs (JSON)

\`#[output application/json indent=false --- { event: "Order received", orderId: vars.orderId, correlationId: correlationId }]\`

\`indent=false\` keeps one event on one line, which log tools such as Splunk need.
`
