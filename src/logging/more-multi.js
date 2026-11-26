// More "multi" exercises for the Logging Lab. See exercises.js for the format.
export const MORE_MULTI = [
  {
    id: 'log-301',
    kind: 'multi',
    situation: 'At the start of the HTTP Listener flow of a Customer Experience API:',
    code: '<logger level="INFO" message="#[attributes.headers]" />',
    options: [
      'The headers are written as a Java object reference, so no header value appears in the line',
      'It writes the Authorization header, so a bearer token or Basic credentials reach the log',
      'Mule masks header values before a Logger writes them',
      'There is no message that says what happened, and no correlation ID',
      'client_id and client_secret headers, when a caller sends them, are logged too',
    ],
    answers: [1, 3, 4],
    explain:
      'Mule does not mask anything a Logger writes, so every header value lands in the log as it is. The headers map prints its keys and values, which is why this leaks. Log the named facts you need: "Request received method=$(attributes.method) path=$(attributes.requestPath) correlationId=$(correlationId)".',
  },
  {
    id: 'log-302',
    kind: 'multi',
    situation: 'After the call that fetches an OAuth access token for the Salesforce System API:',
    code: '<logger level="DEBUG" message=\'#["Token fetched token=$(payload.access_token) expiresIn=$(payload.expires_in)"]\' />',
    options: [
      'At DEBUG the line is safe as long as the production root level stays at INFO',
      'The access token is a secret and reaches the log',
      'An access token is short-lived, so logging it is acceptable, unlike the client secret',
      'The label expiresIn gives no unit, though the token endpoint sends expires_in in seconds',
      'expires_in from a token endpoint is in milliseconds, so the label should be expiresInMs',
    ],
    answers: [1, 3],
    explain:
      'Tokens never go in a log at any level, and DEBUG is often turned on in production to troubleshoot. A short life limits the damage but does not remove it: until it expires the token works for anyone. OAuth 2.0 defines expires_in in seconds, so expiresInSec names the unit and expiresInMs would mislead. Keep the useful part: "Salesforce token fetched expiresInSec=$(payload.expires_in)".',
  },
  {
    id: 'log-303',
    kind: 'multi',
    situation: 'In the Customer Process API, after the CRM update:',
    code: '<logger level="INFO" message=\'#["Updated customer $(payload.firstName) $(payload.lastName) phone=$(payload.phone) email=$(payload.email)"]\' />',
    options: [
      'The level should be DEBUG, because a CRM update is a technical step inside the flow',
      'There is no correlation ID',
      'Name, phone and email are personal data. Log the customer ID instead',
      'Masking the email, such as a***@example.com, makes the line acceptable',
      'It does not say which system was updated',
    ],
    answers: [1, 2, 4],
    explain:
      'A changed customer record is a business event, so INFO fits; at DEBUG the update would leave no trace in production. Logs are copied to many tools and read by many teams, so personal data stays out. Masking the email still leaves the name and the phone. Write "CRM customer updated customerId=$(vars.customerId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-304',
    kind: 'multi',
    situation: 'In a Batch Step that loads 200,000 card transactions, for each record:',
    code: '<logger level="INFO" message=\'#["Record cardNumber=$(payload.cardNumber) amount=$(payload.amount)"]\' />',
    options: [
      'A Logger in a Batch Step runs once for each block of 100 records, not once for each record',
      'Log a summary in On Complete with the counts, and per-record lines only at DEBUG without the card number',
      'A full card number in a log breaks PCI rules',
      'Inside a Batch Step, payload is the whole input file, not one record',
      'One INFO line per record means 200,000 lines per run',
    ],
    answers: [1, 2, 4],
    explain:
      'Records are loaded in blocks, but a Logger in a Batch Step runs for each record, and there payload is that one record. That is the trouble: one line per record floods INFO, and this one carries a card number. Log a transaction ID at DEBUG and the counts once in On Complete.',
  },
  {
    id: 'log-305',
    kind: 'multi',
    situation: 'At the end of the Inventory Sync flow, after the Database Update:',
    code: '<logger level="INFO" message="Done" />',
    options: [
      '"Done" does not say what finished',
      'The Logger should sit before the Database Update, so a line is written even when the update fails',
      'There is no count of the rows that were updated',
      'There is no error.errorType, so a failed update cannot be told apart from one that worked',
      'There is no correlation ID',
    ],
    answers: [0, 2, 4],
    explain:
      'After the update is the right place, because only then is the row count known, and a failed update belongs in the error handler. This line only runs when the update worked, so error is not set here and there is no error type to log. The line needs the facts: "Inventory sync finished rowsUpdated=$(payload.affectedRows) correlationId=$(correlationId)".',
  },
  {
    id: 'log-306',
    kind: 'multi',
    situation: 'In the Order Process API, three loggers left over from a debugging session:',
    code: '<logger level="INFO" message="Here" />\n<logger level="INFO" message="In flow" />\n<logger level="INFO" message="here 2" />',
    options: [
      'Give each one a category, so log4j2.xml can switch them off in production',
      'They tell a reader nothing about what happened',
      'Set them to DEBUG and leave them in, since DEBUG is off in production',
      'Remove them, or replace them with one line that says what happened, with IDs',
      'They run at INFO, so they fill the production log on every request',
    ],
    answers: [1, 3, 4],
    explain:
      'Markers like these help for an hour on your laptop and then become noise. A category lets you silence them, but they still tell the next reader nothing. DEBUG only hides them until the next person turns DEBUG on to troubleshoot and finds "Here" between the lines that matter.',
  },
  {
    id: 'log-307',
    kind: 'multi',
    situation: 'After the SAP call in the Order Process API:',
    code: '<logger level="INFO" message=\'#["SAP order created $(vars.orderId) $(payload.sapDocNo) $(attributes.statusCode)"]\' />',
    options: [
      'The values have no names, so a reader cannot tell which number is which',
      'attributes.statusCode here is the status of the incoming request, not of the SAP reply',
      'There is no correlation ID',
      'You cannot search for orderId=10045 in the log tool',
      'The line should be DEBUG, because the SAP reply is a detail of the call',
    ],
    answers: [0, 2, 3],
    explain:
      'After an HTTP Request, attributes are the response attributes, so attributes.statusCode is the SAP status. An order created in SAP is a business event, so INFO is right. Give every value a name: "SAP order created orderId=$(vars.orderId) sapDocNo=$(payload.sapDocNo) status=$(attributes.statusCode) correlationId=$(correlationId)".',
  },
  {
    id: 'log-308',
    kind: 'multi',
    situation: 'In the Shipment Process API, after the call to one of three carriers:',
    code: '<logger level="INFO" message=\'#["Carrier replied status=$(attributes.statusCode) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]\' />',
    options: [
      'The correlation ID makes a business ID unnecessary',
      'There is no business ID such as shipmentId, so support cannot find the line from a customer complaint',
      'durationMs can go, because the HTTP Request already logs how long each call took',
      'It does not name the carrier, and the app calls three of them',
      'It has no correlation ID, so the carrier reply cannot be joined to the request that caused it',
    ],
    answers: [1, 3],
    explain:
      'The line already carries the correlation ID, which joins the lines of one request, but support starts from a shipment or order number. The HTTP Request does not log its timing at INFO, so durationMs is where a slow carrier shows. Write "Carrier replied carrier=$(vars.carrier) shipmentId=$(vars.shipmentId) status=... durationMs=... correlationId=...".',
  },
  {
    id: 'log-309',
    kind: 'multi',
    situation:
      'In the On Error Continue for HTTP:NOT_FOUND of a product lookup. The API answers 404, which is normal when the product ID is unknown:',
    code: '<logger level="ERROR" message=\'#["Product not found productId=$(vars.productId) correlationId=$(correlationId)"]\' />',
    options: [
      'The message is badly worded',
      'INFO or WARN fits better',
      'ERROR fits, because the line is written inside an error handler',
      'ERROR is too strong: the app handled a normal answer, and alerts on ERROR will fire for nothing',
    ],
    answers: [1, 3],
    explain:
      'The wording is good: what happened, the ID and the correlation ID. Only the level is wrong, and being inside an error handler does not make a line an error. A 404 for an unknown ID is an answer, not a failure of your app, so keep ERROR for work that failed.',
  },
  {
    id: 'log-310',
    kind: 'multi',
    situation:
      'In the On Error Propagate of the payment call. The order is not paid and the caller gets a 502:',
    code: '<logger level="INFO" message=\'#["Payment call failed orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]\' />',
    options: [
      'The error type is missing',
      'error.description is empty when the HTTP Request raised the error, so the reason is lost',
      'INFO is wrong: the work failed and someone must act, so ERROR',
      'Alerts that watch for ERROR lines will not see this failure',
    ],
    answers: [2, 3],
    explain:
      'The message already has the error type, the reason and the IDs, and the HTTP Request fills error.description like any other component. Only the level hides it: a failed payment at INFO looks like a normal event.',
  },
  {
    id: 'log-311',
    kind: 'multi',
    situation:
      'In the On Error Continue around the call that writes invoices to the ERP. The invoice is skipped and the flow goes on:',
    code: '<logger level="DEBUG" message=\'#["Invoice write failed"]\' />',
    options: [
      'There is no invoice ID, error type or correlation ID',
      'error is cleared once On Error Continue has handled it, so error.errorType is null here',
      'It should be ERROR (or at least WARN) and say what happens next, such as next=skipped',
      'On Error Continue hides the failure from the caller, and DEBUG is off in production, so nobody sees that an invoice was lost',
      'DEBUG is right, because On Error Continue marks the error as expected',
    ],
    answers: [0, 2, 3],
    explain:
      'When you continue past an error, your Logger line is often the only sign it happened, so it must be visible and complete. error is still set inside On Error Continue. Continuing does not make an error expected; it only means the flow goes on. Write "Invoice not written to ERP invoiceId=... errorType=$(error.errorType) error=$(error.description) next=skipped correlationId=...".',
  },
  {
    id: 'log-312',
    kind: 'multi',
    situation: 'In the On Error Propagate of the Salesforce upsert:',
    code: '<logger level="ERROR" message=\'#["Salesforce upsert failed accountId=$(vars.accountId) correlationId=$(correlationId)"]\' />',
    options: [
      'There is no account ID, so support cannot tell which record failed',
      'There is no error.errorType, so you cannot tell a timeout from a rejected record',
      'WARN fits better, because the error goes up to the caller, which logs it at ERROR',
      'ERROR is the right level, because the write failed here and this is where the fault is logged',
      'It does not say what happens next to the account',
    ],
    answers: [1, 3, 4],
    explain:
      'The start is good: what failed, the account ID and the correlation ID are all there. Add errorType=$(error.errorType) error=$(error.description) and next=..., such as next=returned 502 or next=sent to DLQ. ERROR fits a failed write here, where the fault happened, and the caller should log only what it got back, so WARN in this place would hide the one full record of the fault.',
  },
  {
    id: 'log-313',
    kind: 'multi',
    situation: 'Support asks you to turn on DEBUG for the SFTP part of a large app only. Every Logger in the app looks like this:',
    code: '<logger level="DEBUG" message=\'#["File read fileName=$(attributes.fileName) sizeBytes=$(attributes.size)"]\' />',
    options: [
      'Raising org.mule.extension.sftp to DEBUG in log4j2.xml turns on these lines',
      'Add category="com.acme.files.sftp" and raise only that category in log4j2.xml',
      'attributes.fileName is not available from the SFTP connector',
      'Loggers without a category all share one default category, so raising it turns on DEBUG for every Logger in the app',
    ],
    answers: [1, 3],
    explain:
      'org.mule.extension.sftp is the category of the connector\'s own classes, not of your Loggers. A Logger without a category writes under the Logger component\'s own category, which every uncategorised Logger shares. A category per area lets you raise one part of the app. The message itself is good.',
  },
  {
    id: 'log-314',
    kind: 'multi',
    situation: 'The SAP Loggers in one app use these categories:',
    code: '<logger level="INFO" category="com.acme.orders.sap" message="..." />\n<logger level="INFO" category="SAP" message="..." />\n<logger level="INFO" category="com.acme.Orders.Sap" message="..." />',
    options: [
      'A category must match a Java package in the app, or Mule rejects it',
      'Pick one name per area and use it in every Logger',
      'Raising com.acme.orders.sap in log4j2.xml does not reach the other two',
      'Raising com.acme in log4j2.xml reaches all three Loggers',
      'Category names are case sensitive, so com.acme.Orders.Sap is a different category',
    ],
    answers: [1, 2, 4],
    explain:
      'A category is a name you choose. It does not need a matching package, and many Loggers can share it. log4j2 matches names by their dotted parts and their case, so com.acme covers com.acme.orders.sap and com.acme.Orders.Sap, but never SAP, which is not under com.acme.',
  },
  {
    id: 'log-315',
    kind: 'multi',
    situation: 'An order fails in the SAP System API. Each layer has an error handler like this, and each passes the error up:',
    code: '<!-- Experience API -->\n<logger level="ERROR" message=\'#["Order failed correlationId=$(correlationId)"]\' />\n<!-- Process API -->\n<logger level="ERROR" message=\'#["Order failed correlationId=$(correlationId)"]\' />\n<!-- SAP System API -->\n<logger level="ERROR" message=\'#["SAP order create failed errorType=$(error.errorType) correlationId=$(correlationId)"]\' />',
    options: [
      'The correlation ID changes in each layer, so the three lines cannot be joined',
      'The full error, with the type and the reason, belongs where it happens: the System API',
      'The Process API line should add error.description too, so each layer tells the full story',
      'One fault shows as three ERROR lines, so alerts and error counts triple',
      'The upper layers can log the status they got back at WARN or INFO, with the correlation ID',
    ],
    answers: [1, 3, 4],
    explain:
      'Log the error once, in full, where it happens. The HTTP Request sends the correlation ID to the next API by default, so one search finds every line of the request. Upper layers note what they got back without raising a second and third ERROR, and repeating the reason in each layer only copies the same story three times.',
  },
  {
    id: 'log-316',
    kind: 'multi',
    situation: 'Logs go to Splunk, which reads one event per line. In the Order Process API:',
    code: '<logger level="INFO" message=\'#[output application/json --- { event: "Order received", orderId: vars.orderId, correlationId: correlationId }]\' />',
    options: [
      'Splunk puts the lines of an indented JSON event back together, so the indent does no harm',
      'Without indent=false the JSON is written over several lines, so one event becomes many',
      'Using write(..., "application/json") in place of output keeps the event on one line',
      'Add indent=false after output application/json',
    ],
    answers: [1, 3],
    explain:
      'The fields are good. write() uses the same JSON writer, so it indents too unless you pass indent: false. The JSON writer indents by default, so the object spreads over several lines, and a Splunk input that reads one event per line cannot know they belong together. Write output application/json indent=false to keep each event on one line.',
  },
  {
    id: 'log-317',
    kind: 'multi',
    situation: 'In the Customer Process API. vars.loyaltyId is null for customers who have not joined the loyalty scheme:',
    code: '<logger level="INFO" message=\'#["Customer synced customerId=" ++ vars.customerId ++ " loyaltyId=" ++ vars.loyaltyId ++ " correlationId=" ++ correlationId]\' />',
    options: [
      'Switching to $() interpolation fixes it, because $() accepts null',
      'The values have no labels',
      'When vars.loyaltyId is null, ++ fails, so the Logger raises an error and the flow fails',
      '"a" ++ null gives "a", so the line only shows an empty loyaltyId',
      'Give the value a default, such as (vars.loyaltyId default "none"), so the line never breaks the flow',
    ],
    answers: [2, 4],
    explain:
      'The labels are there. But in DataWeave "a" ++ null is an error, and $() interpolation of null fails too. Guard any value that can be null: "Customer synced customerId=$(vars.customerId) loyaltyId=$(vars.loyaltyId default \'none\') correlationId=$(correlationId)".',
  },
  {
    id: 'log-318',
    kind: 'multi',
    situation: 'The HTTP Listener is set to a non-repeatable stream. The first two steps of the flow are:',
    code: '<logger level="INFO" message="#[payload]" />\n<ee:transform doc:name="Map order"> ... </ee:transform>',
    options: [
      'It logs the whole request body at INFO',
      'A Logger reads only the start of a stream, so the Transform still gets the rest of the body',
      'Reading the payload in the Logger consumes the stream, so the Transform after it can get nothing',
      'With the default repeatable stream, the Transform could still read the body after the Logger',
      'The Listener keeps the whole body in memory anyway, so a non-repeatable stream can be read twice',
    ],
    answers: [0, 2, 3],
    explain:
      'A Logger that prints the payload has to read all of it. A non-repeatable stream is not kept in memory and can be read once, so the Transform then finds it empty. Log the IDs you need instead, and leave the body to DEBUG in a test environment.',
  },
  {
    id: 'log-319',
    kind: 'multi',
    situation: 'The log4j2.xml deployed to production:',
    code: '<Loggers>\n  <AsyncRoot level="DEBUG">\n    <AppenderRef ref="file" />\n  </AsyncRoot>\n</Loggers>',
    options: [
      'Each Logger writes at the level in its own level attribute, so the root level changes nothing for it',
      'Set the root to INFO and raise only the categories you need',
      'This level only affects Loggers that have a category',
      'Every Logger at DEBUG and above is written, including payload lines meant for test',
      'Mule and library classes also write their DEBUG lines, so the log grows fast',
    ],
    answers: [1, 3, 4],
    explain:
      'The root level applies to every category that has no level of its own, your Loggers and Mule\'s internal classes alike. The level attribute of a Logger is the level of its line, and the root decides whether that level is written. Keep the root at INFO in production and raise one category for a short time when you troubleshoot.',
  },
  {
    id: 'log-320',
    kind: 'multi',
    situation: 'Someone left this in the production log4j2.xml after a support case:',
    code: '<AsyncLogger name="com.acme.orders" level="TRACE" />',
    options: [
      'Set it back to INFO once the support case is closed',
      'TRACE is finer than DEBUG, so DEBUG lines under com.acme.orders stay hidden',
      'Every TRACE and DEBUG line under com.acme.orders is now written in production',
      'It turns on TRACE for every category in the app, not only com.acme.orders',
      'Lines meant for troubleshooting, such as payloads, can reach the production log',
    ],
    answers: [0, 2, 4],
    explain:
      'TRACE is the finest level, so it lets DEBUG and every coarser level through as well. The setting covers com.acme.orders and the categories under it, such as com.acme.orders.sap, and nothing else. Raised levels belong to the support case and should be undone when it closes.',
  },
  {
    id: 'log-321',
    kind: 'multi',
    situation: 'The log4j2.xml of an API that handles 300 requests a second:',
    code: '<Loggers>\n  <Root level="INFO">\n    <AppenderRef ref="file" />\n  </Root>\n</Loggers>',
    options: [
      'INFO is the wrong root level for production',
      'Root (not AsyncRoot) writes each line on the thread that runs the flow, so slow writes slow the requests',
      'With async logging, no line can be lost if the app crashes',
      'AsyncRoot, as in the log4j2.xml that Studio creates, hands the writing to a background thread',
    ],
    answers: [1, 3],
    explain:
      'INFO is the right root level. The problem is that a synchronous Root makes every request wait for its log writes. Async logging is faster, but lines still in its buffer can be lost if the app crashes, so it is a trade, not a guarantee.',
  },
  {
    id: 'log-322',
    kind: 'multi',
    situation: 'Inside a For Each over the orders of a nightly export, about 8,000 orders per run:',
    code: '<logger level="INFO" message="#[write(payload, \'application/json\')]" />',
    options: [
      'Inside a For Each, payload is the whole list, not one order',
      '8,000 INFO lines per run, each one a whole order',
      'Better: one INFO line after the loop with the count, and per-order lines at DEBUG with the order ID only',
      'Each order may hold customer names and addresses',
      'Moving the Logger to DEBUG fixes both the volume and the personal data',
    ],
    answers: [1, 2, 3],
    explain:
      'Inside a For Each, payload is the current item, so each pass writes one full order. DEBUG only hides the orders until someone turns DEBUG on in production. After the loop, write "Export finished orders=8000 correlationId=...".',
  },

  // ---------- where loggers go, what belongs in the log ----------
  {
    id: 'log-323',
    kind: 'multi',
    situation: 'The payment provider declined a card. Which of these belong in the log line?',
    options: [
      'The full card number',
      'The payment ID',
      'A running count of declines since the app started, kept in a variable',
      'The correlation ID',
      'The decline reason code',
    ],
    answers: [1, 3, 4],
    explain:
      'The payment ID and reason let support look the case up at the provider, and the correlation ID joins the request. The card number never goes in a log; the last 4 digits are allowed if support needs them. A running count lives in one replica and restarts at zero on every deploy, so it gives a different number on each replica; the log tool counts the decline lines better.',
  },
  {
    id: 'log-324',
    kind: 'multi',
    situation:
      'A Scheduler checks an SFTP folder every 5 minutes and loads the files it finds into a database with a Batch Job. Where should loggers go?',
    options: [
      'On every record in the Batch Step (INFO)',
      'When a record fails, with the record ID and the error type (WARN or ERROR)',
      'When a run finds files, with the file count (INFO)',
      'On every run that finds no files (INFO)',
      'In On Complete, with the total, successful and failed counts (INFO)',
    ],
    answers: [1, 2, 4],
    explain:
      'Log the start of real work, every failure, and one summary at the end. Per-record lines belong at DEBUG, and an empty run every 5 minutes is DEBUG noise, not INFO.',
  },
  {
    id: 'log-325',
    kind: 'multi',
    situation: 'An order event arrives from a message queue. Which of these belong in the first log line?',
    options: [
      'The whole message body',
      'The order ID from the message',
      'The number of messages waiting in the queue, read from the broker for each message',
      'What happened, such as "Order event received"',
      'The correlation ID',
    ],
    answers: [1, 3, 4],
    explain:
      'The first line says what arrived and which record it is about, with the correlation ID. The body is large and may hold personal data. The queue depth is a snapshot of the whole queue, not a fact about this order, and asking the broker for it on every message adds a call per event; queue monitoring shows the trend.',
  },
  {
    id: 'log-326',
    kind: 'multi',
    situation: 'An API calls the CRM inside Until Successful, with 3 attempts. Where should loggers go?',
    options: [
      'On each failed attempt that will be retried (WARN, with the attempt number)',
      'Before every attempt, with the whole request body (INFO)',
      'When all attempts are used up (ERROR, with the error type and what happens next)',
      'In the error handler and again in every parent flow the error passes through (ERROR)',
      'After the call works (INFO, with the status and duration)',
    ],
    answers: [0, 2, 4],
    explain:
      'A retry is a WARN, a final failure is one ERROR, and a success is one INFO line with the timing. Logging the body on each attempt is large and risky, and logging the same failure in every parent flow makes one fault look like many.',
  },
  {
    id: 'log-327',
    kind: 'multi',
    situation: 'You need more detail from one flow in production for an hour. Which steps are sound?',
    options: [
      'Change every Logger in the app to INFO, so the lines show without a log4j2 change',
      'Set it back to INFO when you are done',
      'Raise only the category of that flow to DEBUG, not the root',
      'Set the root logger to TRACE to be sure nothing is missed',
      'Check that its DEBUG lines hold no passwords, tokens or card numbers',
    ],
    answers: [1, 2, 4],
    explain:
      'Categories exist for this: one area goes to DEBUG while the rest stays quiet. Turning every Logger up to INFO, or the root to TRACE, floods the log and can leak data that was only ever meant for test.',
  },
  {
    id: 'log-328',
    kind: 'multi',
    situation: 'Which of these must never appear in a log, at any level?',
    options: [
      'The customer ID',
      'A password',
      'error.description of a failed call',
      'The value of the Authorization header',
      'A full card number',
    ],
    answers: [1, 3, 4],
    explain:
      'Secrets and card numbers stay out of every level, DEBUG included. A customer ID is what you log in place of personal data, and error.description is what makes an error line useful.',
  },
]
