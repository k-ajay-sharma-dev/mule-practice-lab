// More "multi" exercises for the Logging Lab. See exercises.js for the format.
export const MORE_MULTI = [
  {
    id: 'log-301',
    kind: 'multi',
    situation: 'At the start of the HTTP Listener flow of a Customer Experience API:',
    code: '<logger level="INFO" message="#[attributes.headers]" />',
    options: [
      'It writes the Authorization header, so a bearer token or Basic credentials reach the log',
      'client_id and client_secret headers, when a caller sends them, are logged too',
      'There is no message that says what happened, and no correlation ID',
      'attributes cannot be read inside a Logger',
      'Mule masks header values before a Logger writes them',
    ],
    answers: [0, 1, 2],
    explain:
      'Mule does not mask anything a Logger writes, so every header value lands in the log as it is. attributes can be read in a Logger, which is why this leaks. Log the named facts you need: "Request received method=$(attributes.method) path=$(attributes.requestPath) correlationId=$(correlationId)".',
  },
  {
    id: 'log-302',
    kind: 'multi',
    situation: 'After the call that fetches an OAuth access token for the Salesforce System API:',
    code: '<logger level="DEBUG" message=\'#["Token fetched token=$(payload.access_token) expiresIn=$(payload.expires_in)"]\' />',
    options: [
      'The access token is a secret and reaches the log',
      'DEBUG lines never reach production, so the token is safe there',
      'Anyone who can read the log can call Salesforce as the app until the token expires',
      '$() interpolation only works at INFO and above',
    ],
    answers: [0, 2],
    explain:
      'Tokens never go in a log at any level, and DEBUG is often turned on in production to troubleshoot. Interpolation works at every level. Keep the useful part: "Salesforce token fetched expiresIn=$(payload.expires_in)".',
  },
  {
    id: 'log-303',
    kind: 'multi',
    situation: 'In the Customer Process API, after the CRM update:',
    code: '<logger level="INFO" message=\'#["Updated customer $(payload.firstName) $(payload.lastName) phone=$(payload.phone) email=$(payload.email)"]\' />',
    options: [
      'Name, phone and email are personal data. Log the customer ID instead',
      'There is no correlation ID',
      'It does not say which system was updated',
      'Personal data is allowed at INFO as long as each value has a label',
      'Personal data is fine in a log when the log store is inside the company network',
    ],
    answers: [0, 1, 2],
    explain:
      'Labels make a line searchable, but they do not make personal data safe, and logs are copied to many tools and read by many teams. Write "CRM customer updated customerId=$(vars.customerId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-304',
    kind: 'multi',
    situation: 'In a Batch Step that loads 200,000 card transactions, for each record:',
    code: '<logger level="INFO" message=\'#["Record cardNumber=$(payload.cardNumber) amount=$(payload.amount)"]\' />',
    options: [
      'A full card number in a log breaks PCI rules',
      'One INFO line per record means 200,000 lines per run',
      'Records inside a Batch Step cannot be logged',
      'Log a summary in On Complete with the counts, and per-record lines only at DEBUG without the card number',
      'Inside a Batch Step, payload is the whole input file, not one record',
    ],
    answers: [0, 1, 3],
    explain:
      'You can log inside a Batch Step, and there payload is the one record being processed. That is the trouble: one line per record floods INFO, and this one carries a card number. Log a transaction ID at DEBUG and the counts once in On Complete.',
  },
  {
    id: 'log-305',
    kind: 'multi',
    situation: 'At the end of the Inventory Sync flow, after the Database Update:',
    code: '<logger level="INFO" message="Done" />',
    options: [
      '"Done" does not say what finished',
      'There is no count of the rows that were updated',
      'There is no correlation ID',
      'A message without #[ ] is not allowed in a Logger',
      'INFO is wrong for the end of a flow. Use DEBUG',
    ],
    answers: [0, 1, 2],
    explain:
      'Plain text is allowed in a Logger, and INFO is right for the end of a run. The line needs the facts: "Inventory sync finished rowsUpdated=$(payload.affectedRows) correlationId=$(correlationId)".',
  },
  {
    id: 'log-306',
    kind: 'multi',
    situation: 'In the Order Process API, three loggers left over from a debugging session:',
    code: '<logger level="INFO" message="Here" />\n<logger level="INFO" message="In flow" />\n<logger level="INFO" message="here 2" />',
    options: [
      'They tell a reader nothing about what happened',
      'They run at INFO, so they fill the production log on every request',
      'Remove them, or replace them with one line that says what happened, with IDs',
      'Two Loggers in one flow cannot have similar messages',
      'Make them ERROR so they stand out when you read the log',
    ],
    answers: [0, 1, 2],
    explain:
      'Markers like these help for an hour on your laptop and then become noise. ERROR would make it worse: alerts fire on ERROR. Mule does not care whether messages repeat.',
  },
  {
    id: 'log-307',
    kind: 'multi',
    situation: 'After the SAP call in the Order Process API:',
    code: '<logger level="INFO" message=\'#["SAP order created $(vars.orderId) $(payload.sapDocNo) $(attributes.statusCode)"]\' />',
    options: [
      'The values have no names, so a reader cannot tell which number is which',
      'You cannot search for orderId=10045 in the log tool',
      'There is no correlation ID',
      'attributes.statusCode is not available after an HTTP Request',
    ],
    answers: [0, 1, 2],
    explain:
      'After an HTTP Request, attributes.statusCode holds the status, so logging it is right. Give every value a name: "SAP order created orderId=$(vars.orderId) sapDocNo=$(payload.sapDocNo) status=$(attributes.statusCode) correlationId=$(correlationId)".',
  },
  {
    id: 'log-308',
    kind: 'multi',
    situation: 'In the Shipment Process API, after the call to one of three carriers:',
    code: '<logger level="INFO" message=\'#["Carrier replied status=$(attributes.statusCode) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]\' />',
    options: [
      'There is no business ID such as shipmentId, so support cannot find the line from a customer complaint',
      'It does not name the carrier, and the app calls three of them',
      'The correlation ID makes a business ID unnecessary',
      'Status and duration should not be logged at INFO',
    ],
    answers: [0, 1],
    explain:
      'The correlation ID joins the lines of one request, but support starts from a shipment or order number. Status and duration at INFO are exactly what you want after a call. Write "Carrier replied carrier=$(vars.carrier) shipmentId=$(vars.shipmentId) status=... durationMs=... correlationId=...".',
  },
  {
    id: 'log-309',
    kind: 'multi',
    situation:
      'In the On Error Continue for HTTP:NOT_FOUND of a product lookup. The API answers 404, which is normal when the product ID is unknown:',
    code: '<logger level="ERROR" message=\'#["Product not found productId=$(vars.productId) correlationId=$(correlationId)"]\' />',
    options: [
      'ERROR is too strong: the app handled a normal answer, and alerts on ERROR will fire for nothing',
      'INFO or WARN fits better',
      'The message is badly worded',
      'A Logger cannot be placed inside On Error Continue',
    ],
    answers: [0, 1],
    explain:
      'The wording is good: what happened, the ID and the correlation ID. Only the level is wrong. A 404 for an unknown ID is an answer, not a failure of your app, so keep ERROR for work that failed.',
  },
  {
    id: 'log-310',
    kind: 'multi',
    situation:
      'In the On Error Propagate of the payment call. The order is not paid and the caller gets a 502:',
    code: '<logger level="INFO" message=\'#["Payment call failed orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]\' />',
    options: [
      'INFO is wrong: the work failed and someone must act, so ERROR',
      'Alerts that watch for ERROR lines will not see this failure',
      'The error type is missing',
      'error.description is not available in On Error Propagate',
    ],
    answers: [0, 1],
    explain:
      'The message already has the error type, the reason and the IDs, and error is available in every error handler. Only the level hides it: a failed payment at INFO looks like a normal event.',
  },
  {
    id: 'log-311',
    kind: 'multi',
    situation:
      'In the On Error Continue around the call that writes invoices to the ERP. The invoice is skipped and the flow goes on:',
    code: '<logger level="DEBUG" message=\'#["Invoice write failed"]\' />',
    options: [
      'On Error Continue hides the failure from the caller, and DEBUG is off in production, so nobody sees that an invoice was lost',
      'There is no invoice ID, error type or correlation ID',
      'It should be ERROR (or at least WARN) and say what happens next, such as next=skipped',
      'error.errorType cannot be used inside On Error Continue',
    ],
    answers: [0, 1, 2],
    explain:
      'When you continue past an error, your Logger line is often the only sign it happened, so it must be visible and complete. error is available in On Error Continue too. Write "Invoice not written to ERP invoiceId=... errorType=$(error.errorType) error=$(error.description) next=skipped correlationId=...".',
  },
  {
    id: 'log-312',
    kind: 'multi',
    situation: 'In the On Error Propagate of the Salesforce upsert:',
    code: '<logger level="ERROR" message=\'#["Salesforce upsert failed accountId=$(vars.accountId) correlationId=$(correlationId)"]\' />',
    options: [
      'There is no error.errorType, so you cannot tell a timeout from a rejected record',
      'There is no error.description with the reason',
      'It does not say what happens next to the account',
      'The words "upsert failed" are too vague',
      'ERROR is the wrong level inside On Error Propagate',
    ],
    answers: [0, 1, 2],
    explain:
      'The start is good: what failed, which account and the correlation ID. Add errorType=$(error.errorType) error=$(error.description) and next=..., such as next=returned 502 or next=sent to DLQ. ERROR fits a failed write.',
  },
  {
    id: 'log-313',
    kind: 'multi',
    situation: 'Support asks you to turn on DEBUG for the SFTP part of a large app only. Every Logger in the app looks like this:',
    code: '<logger level="DEBUG" message=\'#["File read fileName=$(attributes.fileName) sizeBytes=$(attributes.size)"]\' />',
    options: [
      'Loggers without a category all share one default category, so raising it turns on DEBUG for every Logger in the app',
      'Add category="com.acme.files.sftp" and raise only that category in log4j2.xml',
      'A DEBUG Logger needs a category, or it is skipped',
      'attributes.fileName is not available from the SFTP connector',
    ],
    answers: [0, 1],
    explain:
      'A Logger without a category still runs; it writes under the Logger component\'s own category, which every uncategorised Logger shares. A category per area lets you raise one part of the app. The message itself is good.',
  },
  {
    id: 'log-314',
    kind: 'multi',
    situation: 'The SAP Loggers in one app use these categories:',
    code: '<logger level="INFO" category="com.acme.orders.sap" message="..." />\n<logger level="INFO" category="SAP" message="..." />\n<logger level="INFO" category="com.acme.Orders.Sap" message="..." />',
    options: [
      'Raising com.acme.orders.sap in log4j2.xml does not reach the other two',
      'Category names are case sensitive, so com.acme.Orders.Sap is a different category',
      'Pick one name per area and use it in every Logger',
      'A category must match a Java package in the app, or Mule rejects it',
      'Only one Logger in an app may have a category',
    ],
    answers: [0, 1, 2],
    explain:
      'A category is a name you choose. It does not need a matching package, and many Loggers can share it. log4j2 matches names by their dotted parts and their case, so com.acme.orders covers com.acme.orders.sap but not SAP or com.acme.Orders.Sap.',
  },
  {
    id: 'log-315',
    kind: 'multi',
    situation: 'An order fails in the SAP System API. Each layer has an error handler like this, and each passes the error up:',
    code: '<!-- Experience API -->\n<logger level="ERROR" message=\'#["Order failed correlationId=$(correlationId)"]\' />\n<!-- Process API -->\n<logger level="ERROR" message=\'#["Order failed correlationId=$(correlationId)"]\' />\n<!-- SAP System API -->\n<logger level="ERROR" message=\'#["SAP order create failed errorType=$(error.errorType) correlationId=$(correlationId)"]\' />',
    options: [
      'One fault shows as three ERROR lines, so alerts and error counts triple',
      'The full error, with the type and the reason, belongs where it happens: the System API',
      'The upper layers can log the status they got back at WARN or INFO, with the correlation ID',
      'Only the Experience API should log errors, because it faces the client',
      'The correlation ID changes in each layer, so the three lines cannot be joined',
    ],
    answers: [0, 1, 2],
    explain:
      'Log the error once, in full, where it happens. The HTTP Request sends the correlation ID to the next API by default, so one search finds every line of the request. Upper layers note what they got back without raising a second and third ERROR.',
  },
  {
    id: 'log-316',
    kind: 'multi',
    situation: 'Logs go to Splunk, which reads one event per line. In the Order Process API:',
    code: '<logger level="INFO" message=\'#[output application/json --- { event: "Order received", orderId: vars.orderId, correlationId: correlationId }]\' />',
    options: [
      'Without indent=false the JSON is written over several lines, so one event becomes many',
      'Add indent=false after output application/json',
      'output cannot be used inside a Logger expression',
      'JSON in a log can never be searched by field',
    ],
    answers: [0, 1],
    explain:
      'The fields are good and output works in a Logger. The JSON writer indents by default, so the object spreads over several lines. Write output application/json indent=false to keep each event on one line.',
  },
  {
    id: 'log-317',
    kind: 'multi',
    situation: 'In the Customer Process API. vars.loyaltyId is null for customers who have not joined the loyalty scheme:',
    code: '<logger level="INFO" message=\'#["Customer synced customerId=" ++ vars.customerId ++ " loyaltyId=" ++ vars.loyaltyId ++ " correlationId=" ++ correlationId]\' />',
    options: [
      'When vars.loyaltyId is null, ++ fails, so the Logger raises an error and the flow fails',
      'Give the value a default, such as (vars.loyaltyId default "none"), so the line never breaks the flow',
      'Switching to $() interpolation fixes it, because $() accepts null',
      '++ cannot be used in a Logger',
      'The values have no labels',
    ],
    answers: [0, 1],
    explain:
      '++ works in a Logger, and the labels are there. But in DataWeave "a" ++ null is an error, and $() interpolation of null fails too. Guard any value that can be null: "Customer synced customerId=$(vars.customerId) loyaltyId=$(vars.loyaltyId default \'none\') correlationId=$(correlationId)".',
  },
  {
    id: 'log-318',
    kind: 'multi',
    situation: 'The HTTP Listener is set to a non-repeatable stream. The first two steps of the flow are:',
    code: '<logger level="INFO" message="#[payload]" />\n<ee:transform doc:name="Map order"> ... </ee:transform>',
    options: [
      'Reading the payload in the Logger consumes the stream, so the Transform after it can get nothing',
      'It logs the whole request body at INFO',
      'With the default repeatable stream, the Transform could still read the body after the Logger',
      'A Logger never reads the payload unless you call write()',
    ],
    answers: [0, 1, 2],
    explain:
      'A Logger that prints the payload has to read it. A non-repeatable stream can be read once, so the Transform then finds it empty. Log the IDs you need instead, and leave the body to DEBUG in a test environment.',
  },
  {
    id: 'log-319',
    kind: 'multi',
    situation: 'The log4j2.xml deployed to production:',
    code: '<Loggers>\n  <AsyncRoot level="DEBUG">\n    <AppenderRef ref="file" />\n  </AsyncRoot>\n</Loggers>',
    options: [
      'Every Logger at DEBUG and above is written, including payload lines meant for test',
      'Mule and library classes also write their DEBUG lines, so the log grows fast',
      'Set the root to INFO and raise only the categories you need',
      'AsyncRoot ignores the level attribute',
      'This level only affects Loggers that have a category',
    ],
    answers: [0, 1, 2],
    explain:
      'The root level applies to every category that has no level of its own, your Loggers and Mule\'s internal classes alike. Keep the root at INFO in production and raise one category for a short time when you troubleshoot.',
  },
  {
    id: 'log-320',
    kind: 'multi',
    situation: 'Someone left this in the production log4j2.xml after a support case:',
    code: '<AsyncLogger name="com.acme.orders" level="TRACE" />',
    options: [
      'Every TRACE and DEBUG line under com.acme.orders is now written in production',
      'Lines meant for troubleshooting, such as payloads, can reach the production log',
      'Set it back to INFO once the support case is closed',
      'TRACE is not a valid level in log4j2',
      'It turns on TRACE for every category in the app, not only com.acme.orders',
    ],
    answers: [0, 1, 2],
    explain:
      'TRACE is a real level, the finest one. The setting covers com.acme.orders and the categories under it, such as com.acme.orders.sap, and nothing else. Raised levels belong to the support case and should be undone when it closes.',
  },
  {
    id: 'log-321',
    kind: 'multi',
    situation: 'The log4j2.xml of an API that handles 300 requests a second:',
    code: '<Loggers>\n  <Root level="INFO">\n    <AppenderRef ref="file" />\n  </Root>\n</Loggers>',
    options: [
      'Root (not AsyncRoot) writes each line on the thread that runs the flow, so slow writes slow the requests',
      'AsyncRoot, as in the log4j2.xml that Studio creates, hands the writing to a background thread',
      'INFO is the wrong root level for production',
      'With async logging, no line can be lost if the app crashes',
    ],
    answers: [0, 1],
    explain:
      'INFO is the right root level. The problem is that a synchronous Root makes every request wait for its log writes. Async logging is faster, but lines still in its buffer can be lost if the app crashes, so it is a trade, not a guarantee.',
  },
  {
    id: 'log-322',
    kind: 'multi',
    situation: 'Inside a For Each over the orders of a nightly export, about 8,000 orders per run:',
    code: '<logger level="INFO" message="#[write(payload, \'application/json\')]" />',
    options: [
      '8,000 INFO lines per run, each one a whole order',
      'Each order may hold customer names and addresses',
      'Inside a For Each, payload is the whole list, not one order',
      'Better: one INFO line after the loop with the count, and per-order lines at DEBUG with the order ID only',
    ],
    answers: [0, 1, 3],
    explain:
      'Inside a For Each, payload is the current item, so each pass writes one full order. After the loop, write "Export finished orders=8000 correlationId=...".',
  },

  // ---------- where loggers go, what belongs in the log ----------
  {
    id: 'log-323',
    kind: 'multi',
    situation: 'The payment provider declined a card. Which of these belong in the log line?',
    options: ['The payment ID', 'The decline reason code', 'The correlation ID', 'The full card number', 'The CVV'],
    answers: [0, 1, 2],
    explain:
      'The payment ID and reason let support look the case up at the provider, and the correlation ID joins the request. The card number and the CVV never go in a log; the last 4 digits are allowed if support needs them.',
  },
  {
    id: 'log-324',
    kind: 'multi',
    situation:
      'A Scheduler checks an SFTP folder every 5 minutes and loads the files it finds into a database with a Batch Job. Where should loggers go?',
    options: [
      'When a run finds files, with the file count (INFO)',
      'On every record in the Batch Step (INFO)',
      'In On Complete, with the total, successful and failed counts (INFO)',
      'When a record fails, with the record ID and the error type (WARN or ERROR)',
      'On every run that finds no files (INFO)',
    ],
    answers: [0, 2, 3],
    explain:
      'Log the start of real work, every failure, and one summary at the end. Per-record lines belong at DEBUG, and an empty run every 5 minutes is DEBUG noise, not INFO.',
  },
  {
    id: 'log-325',
    kind: 'multi',
    situation: 'An order event arrives from a message queue. Which of these belong in the first log line?',
    options: [
      'What happened, such as "Order event received"',
      'The order ID from the message',
      'The correlation ID',
      'The whole message body',
      'The username and password of the queue connection',
    ],
    answers: [0, 1, 2],
    explain:
      'The first line says what arrived and which record it is about, with the correlation ID. The body is large and may hold personal data, and connection credentials never go in a log.',
  },
  {
    id: 'log-326',
    kind: 'multi',
    situation: 'An API calls the CRM inside Until Successful, with 3 attempts. Where should loggers go?',
    options: [
      'On each failed attempt that will be retried (WARN, with the attempt number)',
      'When all attempts are used up (ERROR, with the error type and what happens next)',
      'After the call works (INFO, with the status and duration)',
      'Before every attempt, with the whole request body (INFO)',
      'In the error handler and again in every parent flow the error passes through (ERROR)',
    ],
    answers: [0, 1, 2],
    explain:
      'A retry is a WARN, a final failure is one ERROR, and a success is one INFO line with the timing. Logging the body on each attempt is large and risky, and logging the same failure in every parent flow makes one fault look like many.',
  },
  {
    id: 'log-327',
    kind: 'multi',
    situation: 'You need more detail from one flow in production for an hour. Which steps are sound?',
    options: [
      'Raise only the category of that flow to DEBUG, not the root',
      'Check that its DEBUG lines hold no passwords, tokens or card numbers',
      'Set it back to INFO when you are done',
      'Change every Logger in the app to INFO, so the lines show without a log4j2 change',
      'Set the root logger to TRACE to be sure nothing is missed',
    ],
    answers: [0, 1, 2],
    explain:
      'Categories exist for this: one area goes to DEBUG while the rest stays quiet. Turning every Logger up to INFO, or the root to TRACE, floods the log and can leak data that was only ever meant for test.',
  },
  {
    id: 'log-328',
    kind: 'multi',
    situation: 'Which of these must never appear in a log, at any level?',
    options: [
      'A password',
      'The value of the Authorization header',
      'A full card number',
      'The customer ID',
      'error.description of a failed call',
    ],
    answers: [0, 1, 2],
    explain:
      'Secrets and card numbers stay out of every level, DEBUG included. A customer ID is what you log in place of personal data, and error.description is what makes an error line useful.',
  },
]
