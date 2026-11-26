// More "choice" exercises for the Logging Lab. See exercises.js for the format.
export const MORE_CHOICE = [
  {
    id: 'log-201',
    kind: 'choice',
    situation:
      'The Idempotent Message Validator in a VM consumer flow found a message it had already processed, so the flow skipped it. Which message is best?',
    options: [
      'Duplicate message skipped messageId=b81e04 payloadHash=9f2c41d7e0 store=idempotent-os validator=order-dedupe',
      'Order processing failed errorType=MULE:DUPLICATE_MESSAGE orderId=10045 messageId=b81e04 correlationId=7f3c2a',
      'Duplicate message skipped orderId=10045 messageId=b81e04 correlationId=7f3c2a',
      'Skipped message orderId=10045 customerName=Ann Lee phone=+44 7700 900123 correlationId=7f3c2a',
    ],
    answer: 2,
    explain:
      'A skipped duplicate is expected behaviour, so the line says skipped, names the order and carries the correlation ID. The line with the hash and the store name has no orderId or correlationId, so support cannot confirm which order it was. "Order processing failed" makes a normal skip look like an error and can wake someone up for nothing. The line with customerName=Ann Lee writes a name and a phone number.',
  },
  {
    id: 'log-202',
    kind: 'choice',
    situation: 'An order event from Anypoint MQ has been processed and the flow acknowledged it. Which message is best?',
    options: [
      'Order event received orderId=10045 queue=orders-in messageId=c41a77 deliveryCount=1 correlationId=7f3c2a',
      'Order event processed and acknowledged orderId=10045 queue=orders-in durationMs=145 correlationId=7f3c2a',
      'Order event processed and acknowledged orderId=10045 queue=orders-in durationMs=145 body=<whole message body> correlationId=7f3c2a',
      'Processing order event orderId=10045 queue=orders-in durationMs=145 correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'The work is over, so the line says processed and acknowledged, in past tense, with the duration. "Order event received" is a good first line but says nothing about the outcome. "Processing order event" reads as if the work is still going, so nobody can tell whether the message was finished or lost. Adding the whole body puts order data, often with personal details, in the log.',
  },
  {
    id: 'log-203',
    kind: 'choice',
    situation: 'The Database select for open orders has returned. Which message is best?',
    options: [
      'Open orders selected rows=312 time=2.3 correlationId=7f3c2a',
      'Open orders selected rows=312 durationMs=2304 query=SELECT id, status FROM orders WHERE status = :status',
      'Open orders selected durationMs=2304 result=[{"orderId":10045,"customer":"Ann Lee"},...] correlationId=7f3c2a',
      'Open orders selected rows=312 durationMs=2304 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'Row count, duration with its unit in the name and the correlation ID tell support how the query went. "time=2.3" could be seconds or minutes and does not match the durationMs other lines use. The line with the query text has no correlation ID, and the SQL is already in the code. Dumping the result puts customer names in the log.',
  },
  {
    id: 'log-204',
    kind: 'choice',
    situation:
      'A Batch job loads 8,000 accounts into Salesforce. Operations want one INFO view of how the run went. Which is best?',
    options: [
      'Salesforce accounts loaded jobId=4c1d9e total=8000 successful=7994 failed=6 durationMs=95210',
      'Salesforce account loaded accountId=A-0001 status=success, one INFO line for each of the 8,000 records',
      'Salesforce accounts loaded jobId=4c1d9e total=8000 durationMs=95210, with failures logged at DEBUG inside the step',
      'Salesforce account load finished jobId=4c1d9e successful=7994, with the 6 failed records written in full to the log',
    ],
    answer: 0,
    explain:
      'One line in the On Complete phase with total, successful and failed tells the whole run, and failed=6 is a number someone can alert on. A line per record at INFO is 8,000 lines that bury the 6 failures. Failures at DEBUG vanish in production, where DEBUG is off. Writing the failed records in full copies account data into the log; their IDs are enough.',
  },
  {
    id: 'log-205',
    kind: 'choice',
    situation: 'A Scheduler starts the nightly employee sync from Workday. Which first line is best?',
    options: [
      'Scheduler triggered flow=workday-sync-main frequency=86400000 timeUnit=MILLISECONDS thread=[MuleRuntime].uber.04',
      'Workday employee sync finished runId=r-1112 correlationId=7f3c2a',
      'Workday employee sync starting runId=r-1112 tenant=acme_prod clientId=wd-int-01 clientSecret=<secret> correlationId=7f3c2a',
      'Workday employee sync starting runId=r-1112 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says what is starting, in present tense, with a runId that ties it to the end-of-run line. The Scheduler line repeats the configuration and the thread but never says which business job started. "finished" at the start of a run misleads anyone reading the history. The line with the client secret leaks a credential that lets anyone call Workday as your app.',
  },
  {
    id: 'log-206',
    kind: 'choice',
    situation:
      'The flow could not connect to the partner SFTP server to collect invoices. The Scheduler will try again at its next run. Which message is best?',
    options: [
      'SFTP login failed host=sftp.partner.com user=acme_int password=<password> errorType=SFTP:CONNECTIVITY',
      'Invoice pickup failed errorType=SFTP:CONNECTIVITY host=sftp.partner.com next=retry at next scheduled run correlationId=7f3c2a',
      'Invoice pickup failed errorType=SFTP:CONNECTIVITY host=sftp.partner.com next=file moved to error folder correlationId=7f3c2a',
      'Invoice pickup failed errorType=SFTP:CONNECTIVITY host=sftp.partner.com stack=<full Java stack trace> correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'It says what failed, the error type, the host and that the next run tries again. The line with password= writes the SFTP password into the log. "next=file moved to error folder" is wrong here: the flow never connected, so no file was read or moved. The full stack trace adds a hundred lines for a connection error that the type already explains.',
  },
  {
    id: 'log-207',
    kind: 'choice',
    situation: 'Salesforce upserted a contact for a customer. Which message is best?',
    options: [
      'Salesforce contact upserted contactId=0035g00000AbCdE created=false customerId=C-2231 correlationId=7f3c2a',
      'Salesforce contact upserted contactId=0035g00000AbCdE customerId=C-2231 email=ann@example.com mobile=+44 7700 900123 correlationId=7f3c2a',
      'Salesforce contact upserted success=true errors=[] id=0035g00000AbCdE created=false',
      'Salesforce contact created contactId=0035g00000AbCdE customerId=C-2231 correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'The Salesforce ID, your customer ID and created=false tell support which record changed and that an existing contact was updated. The line with email= and mobile= writes an email and a mobile number, which is personal data. The raw result has no customer ID or correlation ID, so nobody can join it to the request. "contact created" is wrong when the upsert updated a contact that already existed.',
  },
  {
    id: 'log-208',
    kind: 'choice',
    situation:
      'The Inventory System API answered 503, and your Experience API sends 502 back to the mobile app. Which message is best?',
    options: [
      'Stock check failed status=502 errorType=HTTP:BAD_GATEWAY sku=SKU-7781 next=502 returned to caller correlationId=7f3c2a',
      'Stock check failed status=503 errorType=HTTP:SERVICE_UNAVAILABLE sku=SKU-7781 headers=<all headers> correlationId=7f3c2a',
      'Stock check failed status=503 errorType=HTTP:SERVICE_UNAVAILABLE sku=SKU-7781 next=retry correlationId=7f3c2a',
      'Stock check failed status=503 errorType=HTTP:SERVICE_UNAVAILABLE sku=SKU-7781 next=502 returned to caller correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It records what Inventory answered, the error type, the item and what the mobile app got back. Logging status=502 with HTTP:BAD_GATEWAY hides that the real cause was a 503 from Inventory. Dumping all request headers can copy client secrets and tokens into the log. "next=retry" is wrong: the flow returned 502 at once, so support would wait for a retry that never comes.',
  },
  {
    id: 'log-209',
    kind: 'choice',
    situation: 'The app refreshed its OAuth access token for the Workday API. Which message is best?',
    options: [
      'Workday access token refreshed clientId=wd-int-01 accessToken=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9 expiresInSec=3600',
      'Workday access token refreshed clientId=wd-int-01 expiresInSec=3600 correlationId=7f3c2a',
      'Workday token request sent clientId=wd-int-01 clientSecret=<client-secret> grantType=client_credentials correlationId=7f3c2a',
      'Workday access token refreshed clientId=wd-int-01 expiresIn=3600 correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'The client ID and the expiry with its unit tell support what they need. A token in the log lets anyone who reads it call Workday as your app until it expires, and a client secret is worse, because it works until someone rotates it. "expiresIn=3600" gives no unit, so the reader has to guess seconds or minutes.',
  },
  {
    id: 'log-210',
    kind: 'choice',
    situation:
      'After 5 failures in a row, your app stops calling the pricing service for 60 seconds and uses cached prices meanwhile. Which message is best?',
    options: [
      'Pricing service call failed errorType=HTTP:TIMEOUT failuresInRow=5 durationMs=10000 correlationId=7f3c2a',
      'Pricing calls paused after 5 failures in a row pauseMs=60000 next=error returned to caller correlationId=7f3c2a',
      'Calls to pricing service paused after 5 failures in a row pauseMs=60000 next=cached prices used correlationId=7f3c2a',
      'Circuit OPEN breaker=cb-pricing-02 threshold=5 resetTimeout=60 correlationId=7f3c2a',
    ],
    answer: 2,
    explain:
      'It says in plain words that calls are paused, for how long, and what customers get meanwhile. The timeout line reads like one more failed call and does not say calls are now paused. "next=error returned to caller" is wrong here: callers get cached prices, so support would chase errors that do not exist. The circuit state line speaks the developer\'s terms, gives resetTimeout=60 with no unit, and never says cached prices are used.',
  },
  {
    id: 'log-211',
    kind: 'choice',
    situation:
      'The redelivery policy on a JMS listener raised MULE:REDELIVERY_EXHAUSTED after 5 deliveries. Your error handler sends the message to a DLQ. Which message is best?',
    options: [
      'Shipment update failed errorType=MULE:REDELIVERY_EXHAUSTED message={"shipmentId":"SH-5521","address":"12 High St, Leeds"}',
      'Shipment update failed errorType=MULE:REDELIVERY_EXHAUSTED shipmentId=SH-5521 next=message redelivered by the broker correlationId=7f3c2a',
      'Redelivery exhausted for JMS message messageId=ID:broker-01-4471 deliveries=5 errorType=MULE:REDELIVERY_EXHAUSTED correlationId=7f3c2a',
      'Shipment update not processed after 5 deliveries errorType=MULE:REDELIVERY_EXHAUSTED shipmentId=SH-5521 next=sent to DLQ correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'What failed, why, which shipment and where the message is now, so someone can replay it from the DLQ. The line with message={...} dumps the message with an address in it. "next=message redelivered by the broker" is wrong: once redelivery is exhausted the error handler takes the message, and here it goes to the DLQ. The broker message ID line names neither the shipment nor where the message went.',
  },
  {
    id: 'log-212',
    kind: 'choice',
    situation:
      'Several flows log when the ERP rejects a price update. Operations want to count rejections per day. Which approach is best?',
    options: [
      'Every flow writes the same text, "Price update rejected", followed by name=value facts',
      'Each flow words the line its own way, as long as the meaning and the facts in it are clear to a reader',
      'Every flow logs the rejection at ERROR, since the level alone is enough to count the rejections per day',
      'Each flow adds a running count to the text, such as "Price update rejected, number 14 today", for the daily total',
    ],
    answer: 0,
    explain:
      'The same words for the same event mean one search counts them all, and the name=value facts let you split the count by reason or flow. If each flow words it differently, a search for "Price update rejected" misses some of them. Every failure in the app shares the ERROR level, so counting ERROR lines counts far more than rejections. A running count lives in the memory of one replica, so it restarts at zero after a redeploy and two replicas give two different numbers.',
  },
  {
    id: 'log-213',
    kind: 'choice',
    situation: 'At start-up the app checks that it can reach the database. The check passed. Which message is best?',
    options: [
      'Connected jdbc:sqlserver://db-prod-01;user=svc_orders;password=<password> durationMs=38',
      'Database reachable at start-up host=db-prod-01 durationMs=38 app=order-papi version=1.4.2 correlationId=7f3c2a',
      'Database check starting host=db-prod-01 app=order-papi version=1.4.2 correlationId=7f3c2a',
      'Database reachable host=db-prod-01 durationMs=38, logged at INFO every 10 seconds by a health check',
    ],
    answer: 1,
    explain:
      'It says what was checked, against which host, how long it took and which app and version ran the check. The connection string carries the password into the log. "Database check starting" at the end of a check that passed leaves the reader unsure it ever finished. A health line every 10 seconds at INFO floods the log with thousands of identical lines that hide the ones that matter.',
  },
  {
    id: 'log-214',
    kind: 'choice',
    situation: 'After processing, the flow moved the invoice file to the archive folder on SFTP. Which message is best?',
    options: [
      'Invoice file processed fileName=invoices_20261112.csv rows=412 durationMs=930 correlationId=7f3c2a',
      'Invoice file archived fileName=invoices_20261112.csv toPath=/archive/2026/11 size=47 correlationId=7f3c2a',
      'Invoice file archived fileName=invoices_20261112.csv toPath=/archive/2026/11 sizeBytes=48213 correlationId=7f3c2a',
      'Invoice file archived fileName=invoices_20261112.csv toPath=sftp://acme_int:<password>@sftp.partner.com/archive/2026/11 correlationId=7f3c2a',
    ],
    answer: 2,
    explain:
      'It says the result, which file, where it went and its size with the unit in the name. "Invoice file processed" does not say the file was moved or where to find it. "size=47" gives no unit, so nobody can tell bytes from KB. Writing the full SFTP URL copies the user name and password into the log.',
  },
  {
    id: 'log-215',
    kind: 'choice',
    situation:
      'The nightly reconciliation compared 4,210 orders between the web shop and SAP and found 3 that differ. Which message is best?',
    options: [
      'Reconciliation finished compared=4210 matched=4207 mismatched=3 durationMs=81520 correlationId=7f3c2a',
      'Reconciliation finished compared=4210 matched=4207 mismatched=3 mismatchedOrderIds=10045,10077,10102 correlationId=7f3c2a',
      'Reconciliation mismatch orderId=10045 webTotal=129.90 sapTotal=119.90 customer=Ann Lee correlationId=7f3c2a, one line per mismatch and no summary',
      'Reconciliation finished rc=3 job=recon_job host=mule-worker-2 durationMs=81520 correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'One summary line gives the totals and the IDs someone has to fix. Without mismatchedOrderIds the reader knows there are 3 problems but not which orders, so someone has to run the job again to find them. One line per mismatch never says how many orders were checked, and it adds a customer name. "rc=3" means nothing outside the team that wrote the job.',
  },
  {
    id: 'log-216',
    kind: 'choice',
    situation:
      'A Scatter-Gather called the stock, price and review services. The review route failed, and the API returned the product without reviews. Which message is best?',
    options: [
      'Product reviews not loaded errorType=MULE:COMPOSITE_ROUTING failedRoute=reviews productId=P-3301 next=product returned without reviews correlationId=7f3c2a',
      'Product request failed errorType=MULE:COMPOSITE_ROUTING productId=P-3301 status=500 next=error returned to caller correlationId=7f3c2a',
      'Product reviews not loaded errorType=MULE:COMPOSITE_ROUTING failedRoute=2 productId=P-3301 next=product returned without reviews correlationId=7f3c2a',
      'Product reviews not loaded errorType=MULE:COMPOSITE_ROUTING failedRoute=reviews productId=P-3301 routeResults=<payload and attributes of all three routes> correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'It names the part that failed in words the business understands and says what the caller got. "Product request failed" with status=500 is wrong: the API still returned the product. "failedRoute=2" makes the reader count routes in the XML to know which call it was. Dumping the results of every route copies stock, prices and attributes into the log and buries the one fact that matters.',
  },
  {
    id: 'log-217',
    kind: 'choice',
    situation:
      'Inside an Async scope, the flow sends the order confirmation email to the customer. Which line after the send is best?',
    options: [
      'Sending order confirmation email orderId=10045 templateId=order-confirm correlationId=7f3c2a',
      'Order confirmation email sent orderId=10045 templateId=order-confirm durationMs=420 correlationId=7f3c2a',
      'Order confirmation email sent orderId=10045 to=ann@example.com templateId=order-confirm durationMs=420 correlationId=7f3c2a',
      'Order confirmation email sent orderId=10045 templateId=order-confirm durationMs=420 body=<rendered HTML of the email>',
    ],
    answer: 1,
    explain:
      'After the send, the reader needs to know the email went out, for which order and how long it took. "Sending order confirmation email" is a good line before the send but says nothing about the result. The address is personal data, and the order ID is enough to look it up. The rendered body holds the customer name and the order details, makes every line huge, and drops the correlation ID.',
  },
  {
    id: 'log-218',
    kind: 'choice',
    situation:
      'Salesforce calls the customer AccountId and SAP calls it KUNNR. Your flows log both. Which way of naming them is best?',
    options: [
      'KUNNR=1000452 in the SAP flow and AccountId=0015g00000XyZab in the Salesforce flow, matching the field names of each system',
      'customerId=1000452 in the SAP flow and customerId=0015g00000XyZab in the Salesforce flow, one name for both',
      'customerId=C-2231 sfAccountId=0015g00000XyZab sapCustomerNo=1000452, with the same names in every flow',
      'cust=C-2231 in the new flows and customer=C-2231 in the older flows, with the system IDs added where a flow has them',
    ],
    answer: 2,
    explain:
      'One clear name per fact, used in every flow, means one search finds every line for the customer. Copying the field names of each system means support must know that KUNNR is a customer number. Using customerId for two different IDs breaks the search: customerId=C-2231 finds neither line. Two names for the same fact, cust and customer, split every search in two.',
  },
  {
    id: 'log-219',
    kind: 'choice',
    situation: 'The Workday API answered 429 Too Many Requests. The flow waits 30 seconds and tries again. Which message is best?',
    options: [
      'Workday rate limit hit status=429 workerId=W-4410 attempt=1 of 3 retryAfterMs=30000 next=retry correlationId=7f3c2a',
      'Workday call failed status=429 errorType=HTTP:TOO_MANY_REQUESTS workerId=W-4410 next=sent to error queue',
      'Workday rate limit hit status=429 workerId=W-4410 attempt=1 retryAfter=30 next=retry correlationId=7f3c2a',
      'Workday rate limit hit status=429 worker={"name":"Lena Fischer","salary":64000} next=retry correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'It gives the status, the record, which attempt out of how many, the wait with its unit and what happens next. "next=sent to error queue" is wrong here: the flow waits and tries again, so support would look for a record that is not there. "retryAfter=30" has no unit, and "attempt=1" does not say how many tries are left. The worker object copies a name and a salary into the log.',
  },
  {
    id: 'log-220',
    kind: 'choice',
    situation: 'SAP sent an ORDERS05 IDoc to your app through the SAP connector listener. Which message is best?',
    options: [
      'SAP IDoc received idocType=ORDERS05 soldTo=Ann Lee shipTo=12 High St, Leeds idocNumber=0000000004512873',
      'SAP IDoc received idocType=ORDERS05 segments=42 sizeBytes=18342 thread=[MuleRuntime].uber.04 correlationId=7f3c2a',
      'SAP order created idocType=ORDERS05 idocNumber=0000000004512873 correlationId=7f3c2a',
      'SAP IDoc received idocType=ORDERS05 idocNumber=0000000004512873 segments=42 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'The IDoc number lets the SAP team find the same IDoc on their side, and the segment count says how big it was. The line with soldTo and shipTo copies a name and an address out of the IDoc. Without idocNumber the SAP team has nothing to search for, however many other facts the line carries. "SAP order created" claims a result when the IDoc has only arrived.',
  },
  {
    id: 'log-221',
    kind: 'choice',
    situation:
      'The insert into the orders table failed because the database refused the connection. The API sends 503 back. Which message is best?',
    options: [
      'Order not saved errorType=DB:CONNECTIVITY orderId=10045 next=503 returned to caller correlationId=7f3c2a',
      "Insert failed errorType=DB:CONNECTIVITY sql=INSERT INTO orders VALUES (10045, 'Ann Lee', '12 High St') correlationId=7f3c2a",
      'Order not saved errorType=DB:QUERY_EXECUTION orderId=10045 next=503 returned to caller correlationId=7f3c2a',
      'Order not saved errorType=DB:CONNECTIVITY orderId=10045 next=retry in 5 minutes correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'What failed, why, which order and what the caller got. The SQL text copies a name and an address into the log. DB:QUERY_EXECUTION points support at a bad query when the database refused the connection. "next=retry in 5 minutes" is wrong: the API returned 503, and the caller decides whether to try again.',
  },
  {
    id: 'log-222',
    kind: 'choice',
    situation: 'A For Each sends price updates to 120 stores. Which INFO logging is best?',
    options: [
      'One INFO line inside the loop for each store: Store price sent storeId=S-001 status=200 durationMs=310 correlationId=7f3c2a',
      'One line after the loop: Store prices sent stores=120 durationMs=40211 correlationId=7f3c2a, with failures logged at DEBUG inside the loop',
      'One line after the loop: Store prices sent stores=120 successful=118 failed=2 failedStoreIds=S-014,S-087 durationMs=40211 correlationId=7f3c2a',
      'One line after the loop: Store prices sent stores=120 failed=2 failedStores=<full price list of each failed store> correlationId=7f3c2a',
    ],
    answer: 2,
    explain:
      'A summary after the loop gives the counts and the stores to look at. A line per store at INFO is 120 lines per run that bury the 2 failures. Failures at DEBUG disappear in production, where DEBUG is off. The full price lists of the failed stores make the line huge, when their IDs are all someone needs to send the prices again.',
  },
  {
    id: 'log-223',
    kind: 'choice',
    situation: 'An operator replayed an order from the DLQ, and this time SAP created it. Which message is best?',
    options: [
      'SAP order created orderId=10045 sapDocNo=4500021 durationMs=1180 source=orders-in correlationId=7f3c2a',
      'DLQ order reprocessed orderId=10045 sapDocNo=4500021 originalErrorType=HTTP:TIMEOUT correlationId=7f3c2a',
      'Reprocessing DLQ order orderId=10045 originalErrorType=HTTP:TIMEOUT attempt=2 correlationId=7f3c2a',
      'DLQ order reprocessed orderId=10045 sapDocNo=4500021 message={"orderId":10045,"customer":"Ann Lee","address":"12 High St"}',
    ],
    answer: 1,
    explain:
      'It says the replay worked, which order, the SAP document now created and why it failed the first time. "SAP order created" looks like a normal order, so nobody can count the replays or see why the order needed one. "Reprocessing DLQ order" says the replay began, not whether it worked. The line with message={...} dumps the message with a name and an address.',
  },
  {
    id: 'log-224',
    kind: 'choice',
    situation:
      'SAP rejected an order with 400 because the material number does not exist. A retry will not help, so the order goes to an error queue. Which message is best?',
    options: [
      'Order rejected by SAP status=400 reason=material MAT-889 not found orderId=10045 attempt=2 of 3 next=retry in 30 seconds correlationId=7f3c2a',
      'Order rejected by SAP status=400 errorType=HTTP:BAD_REQUEST orderId=10045 next=sent to error queue correlationId=7f3c2a',
      'Order rejected by SAP status=400 errorType=HTTP:BAD_REQUEST requestBody=<whole order with customer address> correlationId=7f3c2a',
      'Order rejected by SAP status=400 errorType=HTTP:BAD_REQUEST reason=material MAT-889 not found orderId=10045 next=sent to error queue correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It gives the reason, the record and where the order went, so someone can fix the material and replay it. The retry line is well worded but wrong for a 400: the same bad material fails on every attempt. Without the reason, someone has to open the error queue to learn what to fix. The request body copies the customer address into the log.',
  },
  {
    id: 'log-225',
    kind: 'choice',
    situation: 'The flow published a shipment event to an Anypoint MQ exchange. Which message is best?',
    options: [
      'Shipment event published shipmentId=SH-5521 exchange=shipments-x messageId=c41a77 correlationId=7f3c2a',
      'Publishing shipment event shipmentId=SH-5521 exchange=shipments-x correlationId=7f3c2a',
      'Shipment event published shipmentId=SH-5521 exchange=shipments-x body={"address":"12 High St, Leeds","phone":"+44 7700 900123"}',
      'Shipment event published shipmentId=SH-5521 exchange=shipments-x clientId=<client-id> clientSecret=<client-secret> correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'It says the event went out, which shipment, and the message ID that the consumers will see. "Publishing shipment event" is written before the publish, so it does not say the event left. The body copies an address and a phone number into the log. The client secret of the Anypoint MQ client app lets anyone who reads the log publish as your app.',
  },
  {
    id: 'log-226',
    kind: 'choice',
    situation: 'The nightly Batch job that loads workers from Workday finished with no failures. Which message is best?',
    options: [
      'Workday worker load finished jobId=9e2b17 durationMs=184220 correlationId=7f3c2a',
      'Workday worker load finished jobId=9e2b17 total=2310 successful=2310 failed=0 durationMs=184220',
      'Workday worker load finished jobId=9e2b17 total=2310 successful=2310 durationMs=184220, with failed left out when it is zero',
      'Workday worker loaded workerId=W-0001 name=Lena Fischer status=success, one INFO line for each of the 2,310 workers',
    ],
    answer: 1,
    explain:
      'The counts show it was a full success, and failed=0 can be charted next to the bad nights. Without counts nobody can tell how many workers were loaded. Leaving failed out when it is zero leaves gaps in any chart or alert on failed, and a search for failed=0 finds nothing. A line per worker is 2,310 lines with a name in each.',
  },
  {
    id: 'log-227',
    kind: 'choice',
    situation:
      'A flow picks up an order event from a VM queue, sent by another flow in the same app. Which line lets you join it to the HTTP request that started it?',
    options: [
      'Order event received from VM queue orderId=10045 sizeBytes=812 thread=[MuleRuntime].uber.04 receivedAt=10:42:07',
      'Order event received queue=order-events orderId=10045 correlationId=<new UUID created by this flow>',
      'Order event received queue=order-events orderId=10045 correlationId=7f3c2a',
      'Order event received queue=order-events orderId=10045 originalRequest=<attributes of the HTTP request, headers included>',
    ],
    answer: 2,
    explain:
      'The correlation ID travels with the VM message to the consumer in the same app, so logging it joins this line to the lines of the request that started it. The line with the thread and the time has no correlation ID, so two events for the same order cannot be told apart. A new UUID made in this flow breaks the join. The HTTP attributes carry the request headers, and with them the bearer token.',
  },
]
