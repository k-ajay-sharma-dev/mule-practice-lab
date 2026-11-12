// More "choice" exercises for the Logging Lab. See exercises.js for the format.
export const MORE_CHOICE = [
  {
    id: 'log-201',
    kind: 'choice',
    situation:
      'The Idempotent Message Validator in a VM consumer flow found a message it had already processed, so the flow skipped it. Which message is best?',
    options: [
      'Duplicate found!!! ignoring it',
      'Inside idempotent check, step 2',
      'Skipped message: {"orderId":10045,"customerName":"Ann Lee","phone":"+44 7700 900123"}',
      'Duplicate message skipped orderId=10045 messageId=b81e04 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says what happened and which message, so support can confirm the order was not created twice. The third option dumps the payload, with a name and a phone number in it.',
  },
  {
    id: 'log-202',
    kind: 'choice',
    situation: 'An order event from Anypoint MQ has been processed and the flow acknowledged it. Which message is best?',
    options: [
      'Order event processed and acknowledged orderId=10045 queue=orders-in durationMs=145 correlationId=7f3c2a',
      'Processing message',
      'Message from MQ',
      'ACK sent :)',
    ],
    answer: 0,
    explain:
      'Past tense tells the reader the work is done. "Processing message" only says something started, so nobody can tell from it whether the message was finished or lost.',
  },
  {
    id: 'log-203',
    kind: 'choice',
    situation: 'The Database select for open orders has returned. Which message is best?',
    options: [
      'DB query took 2304',
      'Open orders selected rows=312 durationMs=2304 correlationId=7f3c2a',
      'Open orders selected rows=312 time=2.3 correlationId=7f3c2a',
      'Query OK, see DB for results',
    ],
    answer: 1,
    explain:
      'durationMs puts the unit in the name, so nobody has to guess. "time=2.3" could be seconds or minutes, and it does not match the durationMs that other lines use.',
  },
  {
    id: 'log-204',
    kind: 'choice',
    situation:
      'A Batch job loads 8,000 accounts into Salesforce. Operations want one INFO view of how the run went. Which is best?',
    options: [
      'Account loaded accountId=A-0001, written at INFO for each of the 8,000 records',
      'Batch step running',
      'Salesforce accounts loaded jobId=4c1d9e total=8000 successful=7994 failed=6 durationMs=95210',
      'Salesforce load went fine, only a few failures',
    ],
    answer: 2,
    explain:
      'One summary line with the counts tells the whole story. A line per record at INFO is 8,000 lines that hide the 6 failures, and "only a few" gives no number anyone can alert on.',
  },
  {
    id: 'log-205',
    kind: 'choice',
    situation: 'A Scheduler starts the nightly employee sync from Workday. Which first line is best?',
    options: [
      'Workday employee sync starting runId=r-1112 correlationId=7f3c2a',
      'Step 1 of workday-sync-main',
      'Scheduler triggered',
      'Sync',
    ],
    answer: 0,
    explain:
      'It says what is starting, in present tense, and gives a runId that ties this line to the line at the end of the run. "Step 1 of workday-sync-main" makes the reader open the code to know what it means.',
  },
  {
    id: 'log-206',
    kind: 'choice',
    situation:
      'The flow could not connect to the partner SFTP server to collect invoices. The Scheduler will try again at its next run. Which message is best?',
    options: [
      'SFTP error',
      'Partner SFTP is broken again, their side',
      'Could not connect to SFTP host=sftp.partner.com user=acme_int password=Xy7pq2',
      'Invoice pickup failed errorType=SFTP:CONNECTIVITY host=sftp.partner.com next=retry at next scheduled run correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says what failed, the error type, which host and what happens next. The third option writes a password into the log, and the second blames the partner, who may read these lines too.',
  },
  {
    id: 'log-207',
    kind: 'choice',
    situation: 'Salesforce upserted a contact for a customer. Which message is best?',
    options: [
      'Contact upserted for Ann Lee, ann@example.com',
      'Salesforce call made',
      'Salesforce contact upserted contactId=0035g00000AbCdE created=false customerId=C-2231 correlationId=7f3c2a',
      'Upsert result: <the whole Salesforce response>',
    ],
    answer: 2,
    explain:
      'The Salesforce ID and your customer ID are enough to find the record. The first option puts a name and an email address in the log, which is personal data.',
  },
  {
    id: 'log-208',
    kind: 'choice',
    situation:
      'The Inventory System API answered 503, and your Experience API sends 502 back to the mobile app. Which message is best?',
    options: [
      'Inventory is down!!!',
      'Stock check failed status=503 errorType=HTTP:SERVICE_UNAVAILABLE sku=SKU-7781 next=502 returned to caller correlationId=7f3c2a',
      'HTTP:SERVICE_UNAVAILABLE',
      'Calling inventory',
    ],
    answer: 1,
    explain:
      'It says what failed, the status and error type, which item, and what the caller got back. The bare error type is a fact with no context: which call, which item, which request?',
  },
  {
    id: 'log-209',
    kind: 'choice',
    situation: 'The app refreshed its OAuth access token for the Workday API. Which message is best?',
    options: [
      'New token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9',
      'Token refreshed clientId=wd-int-01 clientSecret=Qm9i8sLx',
      'Got token',
      'Workday access token refreshed clientId=wd-int-01 expiresInSec=3600 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'The client ID and the expiry tell support what they need. A token or a client secret in a log lets anyone who reads the log call Workday as your app.',
  },
  {
    id: 'log-210',
    kind: 'choice',
    situation:
      'After 5 failures in a row, your app stops calling the pricing service for 60 seconds and uses cached prices meanwhile. Which message is best?',
    options: [
      'Calls to pricing service paused after 5 failures in a row pauseMs=60000 next=cached prices used correlationId=7f3c2a',
      'CB state OPEN cb-pricing-02 thr=5',
      'Pricing service is dead',
      'Circuit breaker',
    ],
    answer: 0,
    explain:
      'It says in plain words what changed and what customers get meanwhile. "CB state OPEN thr=5" only makes sense to the developer who wrote it; a support engineer at night cannot act on it.',
  },
  {
    id: 'log-211',
    kind: 'choice',
    situation:
      'The redelivery policy on a JMS listener raised MULE:REDELIVERY_EXHAUSTED after 5 deliveries. Your error handler sends the message to a DLQ. Which message is best?',
    options: [
      'Message poisoned',
      'Shipment update not processed after 5 deliveries errorType=MULE:REDELIVERY_EXHAUSTED shipmentId=SH-5521 next=sent to DLQ correlationId=7f3c2a',
      'Redelivery exhausted, see logs',
      'ERROR ERROR shipment flow broke',
    ],
    answer: 1,
    explain:
      'What failed, why, which shipment, and where the message is now. "Redelivery exhausted, see logs" sends the reader to look for the very line it should have been.',
  },
  {
    id: 'log-212',
    kind: 'choice',
    situation:
      'Several flows log when the ERP rejects a price update. Operations want to count rejections per day. Which approach is best?',
    options: [
      'Each flow words it its own way, as long as the meaning is clear',
      'Put a running count in the text, such as "Rejection number 14 today"',
      'Every flow writes the same text, "Price update rejected", followed by name=value facts',
      'Log the whole ERP response, so the reason is always there',
    ],
    answer: 2,
    explain:
      'The same words for the same event mean one search counts them all. If each flow words it differently, a search for "Price update rejected" misses half of them.',
  },
  {
    id: 'log-213',
    kind: 'choice',
    situation: 'At start-up the app checks that it can reach the database. The check passed. Which message is best?',
    options: [
      'Hello from order-papi!!!',
      'DB OK',
      'Connected with jdbc:sqlserver://db-prod-01;user=svc_orders;password=Orders2026',
      'Database reachable at start-up host=db-prod-01 durationMs=38 app=order-papi version=1.4.2 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says what was checked, against which host, and which app and version ran the check. The third option copies the connection string, password and all, into the log.',
  },
  {
    id: 'log-214',
    kind: 'choice',
    situation: 'After processing, the flow moved the invoice file to the archive folder on SFTP. Which message is best?',
    options: [
      'Invoice file archived fileName=invoices_20261112.csv toPath=/archive/2026/11 sizeBytes=48213 correlationId=7f3c2a',
      'Moving file',
      'Archived file, size 48213',
      'File stuff done',
    ],
    answer: 0,
    explain:
      'It says the result, which file, where it went and its size with the unit in the name. "Archived file, size 48213" leaves out the file name and does not say bytes or KB.',
  },
  {
    id: 'log-215',
    kind: 'choice',
    situation:
      'The nightly reconciliation compared 4,210 orders between the web shop and SAP and found 3 that differ. Which message is best?',
    options: [
      'Reconciliation done, a few mismatches, someone should look',
      'Mismatch orderId=10045, then Mismatch orderId=10077, then Mismatch orderId=10102, as three lines with no total',
      'Reconciliation finished compared=4210 matched=4207 mismatched=3 mismatchedOrderIds=10045,10077,10102 correlationId=7f3c2a',
      'recon_job END rc=3',
    ],
    answer: 2,
    explain:
      'One summary line gives the totals and the IDs to fix. The three loose lines never say how many orders were checked, and "rc=3" means nothing outside the team that wrote it.',
  },
  {
    id: 'log-216',
    kind: 'choice',
    situation:
      'A Scatter-Gather called the stock, price and review services. The review route failed, and the API returned the product without reviews. Which message is best?',
    options: [
      'Scatter-Gather error',
      'Product reviews not loaded errorType=MULE:COMPOSITE_ROUTING failedRoute=reviews productId=P-3301 next=product returned without reviews correlationId=7f3c2a',
      'Route 2 failed in sg-01',
      'One of the routes broke, not sure which',
    ],
    answer: 1,
    explain:
      'It names the part that failed in words the business understands and says what the caller got. "Route 2 failed in sg-01" makes the reader count routes in the XML to find out which call it was.',
  },
  {
    id: 'log-217',
    kind: 'choice',
    situation:
      'Inside an Async scope, the flow sends the order confirmation email to the customer. Which line after the send is best?',
    options: [
      'Email sent to ann@example.com',
      'Sending email',
      'Async done!!!',
      'Order confirmation email sent orderId=10045 templateId=order-confirm durationMs=420 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says what was sent, for which order, and how long it took. The first option logs the email address; the order ID is enough to look it up when someone needs it.',
  },
  {
    id: 'log-218',
    kind: 'choice',
    situation:
      'Salesforce calls the customer AccountId and SAP calls it KUNNR. Your flows log both. Which way of naming them is best?',
    options: [
      'customerId=C-2231 sfAccountId=0015g00000XyZab sapCustomerNo=1000452, with the same names in every flow',
      'KUNNR=1000452 in the SAP flow and AccountId=0015g00000XyZab in the Salesforce flow',
      'id=1000452 in one flow and id=0015g00000XyZab in the other',
      'customer=C-2231 in one flow and cust=C-2231 in the other',
    ],
    answer: 0,
    explain:
      'Pick one clear name per fact and use it in every flow, so one search finds every line. Copying each system\'s own field names means support must know that KUNNR is a customer number.',
  },
  {
    id: 'log-219',
    kind: 'choice',
    situation: 'The Workday API answered 429 Too Many Requests. The flow waits 30 seconds and tries again. Which message is best?',
    options: [
      'Workday is throttling us again, annoying',
      'Workday rate limit hit status=429 workerId=W-4410 attempt=1 of 3 retryAfterMs=30000 next=retry correlationId=7f3c2a',
      '429',
      'Too many requests from workday-sync-sub-flow-3',
    ],
    answer: 1,
    explain:
      'It gives the status, which record, which attempt out of how many, the wait with its unit, and what happens next. The first option is a complaint, not a fact anyone can use.',
  },
  {
    id: 'log-220',
    kind: 'choice',
    situation: 'SAP sent an ORDERS05 IDoc to your app through the SAP connector listener. Which message is best?',
    options: [
      'IDoc: <the whole IDoc XML>',
      'In IDoc listener',
      'SAP IDoc received idocType=ORDERS05 idocNumber=0000000004512873 segments=42 correlationId=7f3c2a',
      'Received something from SAP',
    ],
    answer: 2,
    explain:
      'The IDoc number lets the SAP team find the same IDoc on their side, and the count says how big it was. The whole IDoc is large and can hold customer names and addresses.',
  },
  {
    id: 'log-221',
    kind: 'choice',
    situation:
      'The insert into the orders table failed because the database refused the connection. The API sends 503 back. Which message is best?',
    options: [
      'DB:CONNECTIVITY',
      'Database down, DBA team broke it again',
      "Insert failed: INSERT INTO orders VALUES (10045, 'Ann Lee', '12 High St')",
      'Order not saved errorType=DB:CONNECTIVITY orderId=10045 next=503 returned to caller correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'What failed, why, which order and what the caller got. The third option copies the SQL with a name and an address in it, and the second blames a team.',
  },
  {
    id: 'log-222',
    kind: 'choice',
    situation: 'A For Each sends price updates to 120 stores. Which INFO logging is best?',
    options: [
      'One line after the loop: Store prices sent stores=120 successful=118 failed=2 failedStoreIds=S-014,S-087 durationMs=40211 correlationId=7f3c2a',
      'One INFO line for each store inside the loop, 120 lines per run',
      'One line after the loop: Loop finished',
      'One line before the loop: Sending prices to stores',
    ],
    answer: 0,
    explain:
      'A summary after the loop gives the counts and the stores to look at. 120 lines per run bury the 2 failures, and "Loop finished" says nothing about the result.',
  },
  {
    id: 'log-223',
    kind: 'choice',
    situation: 'An operator replayed an order from the DLQ, and this time SAP created it. Which message is best?',
    options: [
      'Here',
      'Replay OK!!!',
      'DLQ order reprocessed orderId=10045 sapDocNo=4500021 originalErrorType=HTTP:TIMEOUT correlationId=7f3c2a',
      'Reprocessing DLQ',
    ],
    answer: 2,
    explain:
      'It says the replay worked, which order, the SAP document now created and why it failed the first time. "Reprocessing DLQ" says the replay began, not whether it worked.',
  },
  {
    id: 'log-224',
    kind: 'choice',
    situation:
      'SAP rejected an order with 400 because the material number does not exist. A retry will not help, so the order goes to an error queue. Which message is best?',
    options: [
      'SAP said no',
      'Order rejected by SAP status=400 errorType=HTTP:BAD_REQUEST reason=material MAT-889 not found orderId=10045 next=sent to error queue correlationId=7f3c2a',
      'Retrying SAP order create attempt=2 of 3 orderId=10045 correlationId=7f3c2a',
      'Bad data from upstream team again!!!',
    ],
    answer: 1,
    explain:
      'It gives the reason, the record and where the order went, so someone can fix the material and replay it. The retry line is well worded but wrong: the same bad data fails again on every attempt.',
  },
  {
    id: 'log-225',
    kind: 'choice',
    situation: 'The flow published a shipment event to an Anypoint MQ exchange. Which message is best?',
    options: [
      'Publishing to MQ',
      'Published: {"shipmentId":"SH-5521","address":"12 High St, Leeds","phone":"+44 7700 900123"}',
      'MQ publish called',
      'Shipment event published shipmentId=SH-5521 exchange=shipments-x messageId=c41a77 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says the event went out, which shipment and the message ID that the consumers will see. The second option logs the payload, with an address and a phone number.',
  },
  {
    id: 'log-226',
    kind: 'choice',
    situation: 'The nightly Batch job that loads workers from Workday finished with no failures. Which message is best?',
    options: [
      'Workday worker load finished jobId=9e2b17 total=2310 successful=2310 failed=0 durationMs=184220',
      '🎉 Workday load crushed it 🎉',
      'Workday load finished, no failures, lucky us',
      'Workday batch end',
    ],
    answer: 0,
    explain:
      'The counts show it was a full success, and failed=0 can still be charted next to the bad nights. Emojis and jokes add nothing a reader can search for or count.',
  },
  {
    id: 'log-227',
    kind: 'choice',
    situation:
      'A flow picks up an order event from a VM queue, sent by another flow in the same app. Which line lets you join it to the HTTP request that started it?',
    options: [
      'Order event received from VM queue orderId=10045',
      'Order event received queue=order-events orderId=10045 correlationId=7f3c2a',
      'VM message received at 10:42:07',
      'Order event received thread=[MuleRuntime].uber.04',
    ],
    answer: 1,
    explain:
      'The correlationId is what joins this line to the lines of the request that started it. The first option is close, but without correlationId you cannot tell which request sent it if the order was sent twice.',
  },
]
