// Logging Lab exercises, set 4. See ../exercises.js for the format.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

// rules several exercises here share
const uses = (expr, say) => ({ must: new RegExp(expr.replace(/[.$()[\]]/g, '\\$&')), say })
const next = (example) => ({ must: /next|skip|park|held|saved|retry|rerun|replay|review/i, say: `Say what happens next, such as ${example}.` })

// Theme: SaaS connectors and databases (Salesforce, SAP, Workday, ServiceNow, NetSuite, Database, Object Store).
export const SET_4 = [
  // ---------- lg-076 Salesforce account lookup ----------
  {
    id: 'log-4001',
    kind: 'level',
    situation:
      'The Customer System API of Brightmoor Outdoor runs a Salesforce Query for one account by its account number. One record comes back, as expected. You log the result once per request.',
    answer: ['INFO', 'DEBUG'],
    explain:
      'A lookup that works is a normal event you want to see in production, so INFO, and one line per request is a fair volume. DEBUG is also fair when this API is called very often and nobody reads the successful lookups.',
  },
  {
    id: 'log-4002',
    kind: 'choice',
    situation: 'The Salesforce Query for all accounts in the North region has returned. Which message is best?',
    options: [
      'Salesforce query done',
      'Accounts queried: [{"Id":"001Kx00000AbCdE","Name":"Brightmoor Outdoor","Phone":"+1 555 0100"}]',
      'Salesforce accounts queried region=North records=42 durationMs=380 correlationId=5d1e9a',
      'Query returned some results for North correlationId=5d1e9a',
    ],
    answer: 2,
    explain:
      'It says what was queried, how many records came back and how long it took. The second option dumps the records, with a phone number in them. "Some results" gives no count to compare with.',
  },
  {
    id: 'log-4003',
    kind: 'write',
    situation:
      'The Salesforce Query by account number found no record, so the Customer System API will answer 404. vars.accountNumber holds the number the caller asked for. Write the logger.',
    available: ['vars.accountNumber', 'sizeOf(payload)', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/not found|no record|no account|missing|records\s*=\s*0/i, 'Salesforce account not found'),
      labelled('accountNumber'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Salesforce account not found accountNumber=$(vars.accountNumber) records=$(sizeOf(payload)) status=404 correlationId=$(correlationId)"]',
    },
    explain:
      'A lookup with no match is handled: the caller gets a clear 404. WARN or INFO both fit. The account number lets support check Salesforce, and sizeOf(payload) is a count, not the data.',
  },
  {
    id: 'log-4004',
    kind: 'multi',
    situation: 'After the Salesforce Query in the Customer System API. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["Account found $(payload[0].Name) phone=$(payload[0].Phone) ownerEmail=$(payload[0].Owner.Email)"]\' />',
    options: [
      'A Salesforce Query returns one object, not a list, so payload[0] fails',
      'The phone number and the owner email are personal data and reach the log',
      'There is no correlation ID',
      'Salesforce masks the Phone field before Mule receives it',
      'The account Id, payload[0].Id, would identify the record without personal data',
    ],
    answers: [1, 2, 4],
    explain:
      'A query returns a list of records, so payload[0] is the first one. Salesforce sends the fields as they are, and Mule does not mask them. Log the record ID: "Salesforce account found accountId=$(payload[0].Id) correlationId=$(correlationId)".',
  },
  {
    id: 'log-4005',
    kind: 'level',
    situation:
      'While you fix a filter in the Salesforce dev sandbox, you want to see the SOQL text the flow builds, with the values in its WHERE clause.',
    answer: ['DEBUG'],
    explain:
      'The query text is detail for building and troubleshooting. DEBUG keeps it out of production by default, where the WHERE values may hold customer data.',
  },

  // ---------- lg-077 Product lookup cache ----------
  {
    id: 'log-4006',
    kind: 'level',
    situation:
      'The Price API of Kestrel Home Goods looks up a product in Object Store before it calls the database. The key is in the store. This happens hundreds of times a minute.',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'A cache hit is the normal case and very frequent. At INFO it would flood the log. DEBUG, or TRACE, lets you turn it on while you check the cache.',
  },
  {
    id: 'log-4007',
    kind: 'choice',
    situation:
      'The cache entry for a product had expired, so the flow read the price from the database and stored it again in the Object Store price-cache. Which DEBUG message is best?',
    options: [
      'Price cache miss, loaded from database sku=KH-2207 objectStore=price-cache ttlMinutes=30 correlationId=c41b7e',
      'Cache stuff happened',
      'Stored in OS: {"sku":"KH-2207","price":19.99,"cost":11.20,"supplierId":"SUP-88"}',
      'MISS!!!',
    ],
    answer: 0,
    explain:
      'It says it was a miss, where the value came from, which key and which store. The third option writes the whole cached value, including the cost price, which other teams should not see.',
  },
  {
    id: 'log-4008',
    kind: 'write',
    situation:
      'Once an hour the Price API refreshes its whole cache: it reads every active product from the database and stores each one in the Object Store price-cache. vars.storedCount holds how many entries were stored and vars.durationMs the time. Write the INFO line after the refresh.',
    available: ['vars.storedCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/refresh|reload|rebuilt|loaded/i, 'Price cache refreshed'),
      uses('vars.storedCount', 'Add how many entries were stored: entries=$(vars.storedCount).'),
      labelled('durationMs'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Price cache refreshed objectStore=price-cache entries=$(vars.storedCount) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'One line per refresh shows the cache is kept up to date. If the count drops one hour, the database read went wrong. The single hits stay at DEBUG.',
  },
  {
    id: 'log-4009',
    kind: 'multi',
    situation: 'In the Price API, after every Object Store Retrieve that finds the key. Pick every problem.',
    code: '<logger level="INFO" message=\'#["Cache hit for $(vars.cacheKey) value=$(write(payload))"]\' />',
    options: [
      'Object Store keys must never be logged',
      'At hundreds of reads a minute, an INFO line for every hit floods the production log',
      'A cache hit is a failure, so it needs ERROR',
      'write(payload) puts the whole cached value in the log',
      'There is no correlation ID',
    ],
    answers: [1, 3, 4],
    explain:
      'A key such as a SKU is a fine fact to log. A hit is the normal case, not a failure. Write it at DEBUG and without the value: "Price cache hit sku=$(vars.sku) correlationId=$(correlationId)".',
  },
  {
    id: 'log-4010',
    kind: 'choice',
    situation:
      'A product was never cached, so the Object Store Retrieve has no value for it. The flow loads the price from the database. Which message is best?',
    options: [
      'ERROR: key not found in object store!!!',
      'Price not cached, loading from database sku=KH-3310 objectStore=price-cache correlationId=c41b7e',
      'OS:KEY_NOT_FOUND',
      'Price not cached sku=KH-3310 customer=ann.lee@example.com correlationId=c41b7e',
    ],
    answer: 1,
    explain:
      'A missing key is expected for a new product and the flow handles it. Set a default value on the Retrieve, or catch OS:KEY_NOT_FOUND, and log what the flow does next. The last option adds an email that has nothing to do with the price.',
  },

  // ---------- lg-078 ServiceNow incidents ----------
  {
    id: 'log-4011',
    kind: 'level',
    situation:
      'The Alerts System API of Harbourgate Logistics created a ServiceNow incident in the incident table for a scanner that went offline, and got back the incident number.',
    answer: ['INFO'],
    explain:
      'The API did its job: the ticket exists. That is a normal event, so INFO. The scanner problem is the reason for the ticket, not a failure of the API.',
  },
  {
    id: 'log-4012',
    kind: 'multi',
    situation: 'After the call that creates a ServiceNow incident. Pick every problem.',
    code: '<logger level="INFO" message=\'#["Incident created"]\' />',
    options: [
      'Creating an incident is always an ERROR',
      'It does not give the incident number, so nobody can find the ticket',
      'It does not say which device or alert the ticket is for',
      'The message must start with output application/json',
      'There is no correlation ID',
    ],
    answers: [1, 2, 4],
    explain:
      'The level is right: the API worked. JSON logs are a choice, not a rule. Add the facts: "ServiceNow incident created incident=$(payload.result.number) alertId=$(vars.alertId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-4013',
    kind: 'write',
    situation:
      'The ServiceNow Table API call has returned the new incident. payload.result.number is the incident number and payload.result.sys_id its record ID. vars.alertId holds your alert ID. Write the logger.',
    available: ['payload.result.number', 'payload.result.sys_id', 'vars.alertId', 'payload', 'payload.result.caller_id', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|opened|raised|logged/i, 'ServiceNow incident created'),
      uses('payload.result.number', 'Add the incident number: incident=$(payload.result.number). People search ServiceNow by it.'),
      labelled('alertId'),
      corr,
      noPayload,
      { not: /caller/i, say: 'Leave the caller out. That field names a person, and the incident number already finds the ticket.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["ServiceNow incident created incident=$(payload.result.number) sysId=$(payload.result.sys_id) alertId=$(vars.alertId) correlationId=$(correlationId)"]',
    },
    explain:
      'The incident number is what people type into ServiceNow. The alert ID ties it back to your own system. The caller is a person, so leave it out.',
  },
  {
    id: 'log-4014',
    kind: 'choice',
    situation:
      'ServiceNow refused to create an incident: the assignment group in the request does not exist. The alert is held until someone fixes the group mapping. Which message is best?',
    options: [
      'ServiceNow said no',
      'Incident not created: {"short_description":"Scanner 14 offline","caller_id":"j.ortiz@harborline.example","assignment_group":"WH-NETWORK"}',
      'Something went wrong with ServiceNow',
      'ServiceNow incident not created alertId=AL-7781 reason="assignment group not found" group=WH-NETWORK next=held for mapping fix correlationId=0e6b2d',
    ],
    answer: 3,
    explain:
      'It names the alert, the reason, the bad value and what happens next, so the team knows which mapping to fix. The second option dumps the request with a person in it.',
  },
  {
    id: 'log-4015',
    kind: 'multi',
    situation: 'A flow sets a ServiceNow incident to Resolved. Pick every fact worth putting in the line after the update.',
    options: [
      'The incident number',
      'The new state, such as state=Resolved',
      'The full work notes text, which may hold names and phone numbers',
      'The correlation ID',
      'The password of the ServiceNow integration user',
    ],
    answers: [0, 1, 3],
    explain:
      'The number and the new state tell the reader what changed. Work notes are free text and may hold personal data. A password never goes in a log.',
  },

  // ---------- lg-079 Store stock database ----------
  {
    id: 'log-4016',
    kind: 'level',
    situation:
      'In the Stock System API of Pinecrest Grocers, a Database Select for the stock of one store returned 0 rows. The store is new and has no stock yet. The API answers with an empty list.',
    answer: ['INFO', 'DEBUG'],
    explain:
      'An empty result is a normal answer here, not a failure. INFO with rows=0 records it. DEBUG is also fair if the API is called very often.',
  },
  {
    id: 'log-4017',
    kind: 'choice',
    situation: 'A Database Update lowered the stock of one SKU after a sale. Which message is best?',
    options: [
      'Stock updated',
      'Stock decreased storeId=S-118 sku=PG-5521 quantity=2 affectedRows=1 durationMs=14 correlationId=91ad3f',
      'UPDATE stock SET qty = qty - 2 WHERE store_id = ? AND sku = ? executed',
      'Stock updated rows: 1',
    ],
    answer: 1,
    explain:
      'It names the store, the SKU and the change, and affectedRows=1 shows that one row really changed. The SQL text says what was run, not for which item.',
  },
  {
    id: 'log-4018',
    kind: 'multi',
    situation: 'After the Database Update that lowers stock. For some sales the log shows affectedRows=0. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["Stock updated affectedRows=$(payload.affectedRows) correlationId=$(correlationId)"]\' />',
    options: [
      'affectedRows=0 means no row matched the WHERE clause, so the stock did not change',
      'An Update that matches 0 rows raises DB:QUERY_EXECUTION',
      'The line does not say which store and SKU, so the 0 cannot be traced',
      'payload.affectedRows does not exist after an Update',
      'A Choice router can send affectedRows=0 to a WARN line',
    ],
    answers: [0, 2, 4],
    explain:
      'An Update that matches nothing is not an error for the database, so no error is raised. The flow has to check affectedRows itself and warn, with the store and the SKU.',
  },
  {
    id: 'log-4019',
    kind: 'write',
    situation:
      'The Database Update for a sale changed 0 rows: the SKU has no stock row for that store. The sale is still recorded, and the stock team must check the item. vars.storeId and vars.sku are set.',
    available: ['vars.storeId', 'vars.sku', 'payload.affectedRows', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/no row|not found|0 rows|missing|not updated|unchanged/i, 'Stock not updated: no row for SKU'),
      labelled('storeId'),
      labelled('sku'),
      { must: /affectedRows/, say: 'Add affectedRows=$(payload.affectedRows), so the reader sees that nothing changed.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Stock not updated: no row for SKU storeId=$(vars.storeId) sku=$(vars.sku) affectedRows=$(payload.affectedRows) correlationId=$(correlationId)"]',
    },
    explain:
      'The sale went through, so it is not an ERROR, but the stock is now wrong. WARN with the store and the SKU lets the stock team find and fix the missing rows.',
  },
  {
    id: 'log-4020',
    kind: 'level',
    situation:
      'A Database Select for the stock of one store took 4.2 seconds. Most of these selects take under 50 ms. The answer was still correct.',
    answer: ['WARN'],
    explain:
      'Nothing failed, but the query is far slower than normal. WARN with durationMs shows the trend before calls start to time out.',
  },

  // ---------- lg-080 Web leads to Salesforce ----------
  {
    id: 'log-4021',
    kind: 'level',
    situation:
      'Larkspur Solar sends web form leads to Salesforce. A Salesforce Upsert of 50 leads came back: 48 successful and 2 failed because a required field is missing. The 2 failed leads are saved for review.',
    answer: ['WARN'],
    explain:
      'Most of the work is done and the failures are handled. WARN with the counts tells the team to check the saved leads. If all 50 failed, ERROR would fit.',
  },
  {
    id: 'log-4022',
    kind: 'choice',
    situation: 'A Salesforce Upsert on the external ID field Web_Lead_Id__c returned one successful item for a lead. Which message is best?',
    options: [
      'Lead upserted webLeadId=WL-20931 salesforceId=00QKx000004mR2t successful=true correlationId=a7c3e1',
      'Lead for Maria Gomez maria.gomez@example.com upserted',
      'Upsert OK',
      'Lead upserted: [{"id":"00QKx000004mR2t","successful":true,"statusCode":null,"message":null}] correlationId=a7c3e1',
    ],
    answer: 0,
    explain:
      'Your ID and the Salesforce ID let anyone find the lead in both systems. The Upsert answers with a Bulk Operation Result whose items hold Id, Successful, Status Code and Message, so successful=true is the flag to log. The item says nothing about whether the record was new. The second option logs a name and an email.',
  },
  {
    id: 'log-4023',
    kind: 'write',
    situation:
      'The Salesforce Upsert of a batch of leads has returned. vars.okCount and vars.failedCount were set from payload.items[*].successful, and vars.batchId names the batch. Write the summary line.',
    available: ['vars.okCount', 'vars.failedCount', 'vars.batchId', 'payload', 'payload.items', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/upsert|synced|sent|loaded/i, 'Salesforce leads upserted'),
      uses('vars.okCount', 'Add how many worked: successful=$(vars.okCount).'),
      uses('vars.failedCount', 'Add how many failed: failed=$(vars.failedCount).'),
      labelled('batchId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Salesforce leads upserted batchId=$(vars.batchId) successful=$(vars.okCount) failed=$(vars.failedCount) correlationId=$(correlationId)"]',
    },
    explain:
      'An Upsert does not fail as a whole when some records fail: each item has its own successful flag. So the summary needs both counts. INFO fits, and WARN fits when failedCount is above 0.',
  },
  {
    id: 'log-4024',
    kind: 'multi',
    situation: 'In the For Each over the leads that failed, vars.lead holds the lead as it came from the web form. Pick every problem.',
    code: '<logger level="WARN" message=\'#["Lead failed $(write(vars.lead))"]\' />',
    options: [
      'write(vars.lead) puts the whole lead, with name, email and phone, in the log',
      'It does not give the Salesforce error, such as the status code and the field',
      'There is no lead ID to look the record up',
      'WARN is wrong for one failed lead when the rest of the batch worked',
      'There is no correlation ID',
    ],
    answers: [0, 1, 2, 4],
    explain:
      'WARN fits one handled failure. Write the ID and the reason instead: "Salesforce lead not upserted webLeadId=$(vars.lead.webLeadId) reason=$(vars.sfError) correlationId=$(correlationId)".',
  },
  {
    id: 'log-4025',
    kind: 'choice',
    situation:
      'The whole Salesforce Upsert call failed with SALESFORCE:CONNECTIVITY. The batch of leads goes back to the queue for another try. Which message is best?',
    options: [
      'Salesforce down!!!',
      'Upsert failed for leads: Maria Gomez, Tom Reyes, Lin Zhou and 47 more',
      'Error occurred in upsert',
      'Salesforce lead upsert failed batchId=B-0412 leads=50 errorType=SALESFORCE:CONNECTIVITY next=retry from queue correlationId=a7c3e1',
    ],
    answer: 3,
    explain:
      'It gives the batch, the size, the error type and the next step, so the reader knows nothing is lost yet. Names of people do not help anyone fix a connection.',
  },

  // ---------- lg-081 SAP sales orders by BAPI ----------
  {
    id: 'log-4026',
    kind: 'level',
    situation:
      'At Fernhill Tools, BAPI_SALESORDER_CREATEFROMDAT2 ran without a Mule error, but its RETURN table holds a message of TYPE E: the material is blocked. No sales order was created, and the order is held for the sales team.',
    answer: ['ERROR'],
    explain:
      'A BAPI reports business errors in its RETURN table, not as a Mule error. The order is not in SAP and a person must act, so ERROR. A refusal that answers the caller at once, such as a 409 on a repeat request, is WARN: there the work is finished and nothing waits. Here the order should exist, no caller is told, and it sits until someone unblocks the material.',
  },
  {
    id: 'log-4027',
    kind: 'multi',
    situation: 'After the SAP connector runs a BAPI to create a sales order. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["SAP BAPI called"]\' />',
    options: [
      'A BAPI can end without a Mule error and still fail: the RETURN table may hold a TYPE E message',
      'SAP always raises SAP:INVALID_INPUT when a business rule fails, so this line always means success',
      'The line should carry the document number the BAPI returned, such as sapOrderNo',
      'The whole BAPI XML response belongs at INFO, so nothing is lost',
      'Without the order ID and correlationId, the call cannot be matched to the request',
    ],
    answers: [0, 2, 4],
    explain:
      'Check the RETURN table before you log success. Then log your order ID, the SAP document number and the correlation ID. The full XML is large and holds customer data.',
  },
  {
    id: 'log-4028',
    kind: 'write',
    situation:
      'The BAPI created the sales order. vars.sapOrderNo holds the SALESDOCUMENT number SAP returned, vars.orderId your order ID and vars.durationMs the call time. Write the logger.',
    available: ['vars.sapOrderNo', 'vars.orderId', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|posted|booked/i, 'SAP sales order created'),
      uses('vars.sapOrderNo', 'Add the document number SAP returned: sapOrderNo=$(vars.sapOrderNo).'),
      labelled('orderId'),
      labelled('durationMs'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["SAP sales order created sapOrderNo=$(vars.sapOrderNo) orderId=$(vars.orderId) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'Both numbers on one line let anyone go from your order to SAP and back. The duration shows when SAP gets slow.',
  },
  {
    id: 'log-4029',
    kind: 'choice',
    situation:
      'The BAPI RETURN table holds a message of TYPE W: the requested delivery date was moved by two days. The sales order was created. Which message is best?',
    options: [
      'SAP warning',
      'SAP sales order created with warning sapOrderNo=0000123456 orderId=FT-88213 sapMessageType=W sapMessage="delivery date moved" correlationId=3b7d0c',
      'SAP RETURN: <RETURN><item><TYPE>W</TYPE><MESSAGE>...</MESSAGE></item><item>...</item></RETURN>',
      'Sales order maybe ok?',
    ],
    answer: 1,
    explain:
      'The order exists, so the line says created, and the warning text tells the sales team why the date changed. The raw RETURN table is long and hard to search.',
  },
  {
    id: 'log-4030',
    kind: 'multi',
    situation: 'The SAP call failed with SAP:CONNECTIVITY because the SAP gateway did not answer. Pick every fact the ERROR line should carry.',
    options: [
      'error.errorType and error.description',
      'The RFC user password from the connector config',
      'Your order ID',
      'What happens next, such as next=retry in 5 minutes',
      'The full sales order with the customer delivery details',
    ],
    answers: [0, 2, 3],
    explain:
      'The error facts, the order and the next step are what operations need. Credentials never go in a log, and the order data adds nothing to a network failure.',
  },

  // ---------- lg-082 SAP IDocs ----------
  {
    id: 'log-4031',
    kind: 'level',
    situation: 'At Granite Peak Beverages, the SAP Document Listener received a DELVRY07 delivery IDoc. You log one line for each IDoc.',
    answer: ['INFO'],
    explain:
      'An IDoc arriving is the start of the work, like a request arriving. INFO with the IDoc number lets anyone confirm it reached Mule.',
  },
  {
    id: 'log-4032',
    kind: 'choice',
    situation: 'The flow sent an ORDERS05 IDoc to SAP for one order. Which message is best?',
    options: [
      'IDoc sent',
      'IDoc: <ORDERS05><IDOC BEGIN="1"><EDI_DC40 SEGMENT="1">...</EDI_DC40>...',
      'ORDERS05 IDoc sent to SAP idocNumber=0000000004418273 orderId=GP-55120 correlationId=d2e8f4',
      'Sent the IDoc to SAP for the order, all good',
    ],
    answer: 2,
    explain:
      'The IDoc number is what SAP support types into WE02 to find it. The order ID and the correlation ID tie it to your side. The XML is long and full of partner data.',
  },
  {
    id: 'log-4033',
    kind: 'write',
    situation:
      'The SAP Document Listener received a delivery IDoc. vars.idocNumber holds the IDoc number (DOCNUM) from the control record and vars.deliveryNo the SAP delivery number. Write the first logger of the flow.',
    available: ['vars.idocNumber', 'vars.deliveryNo', 'vars.shipToName', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|arrived|picked up|consumed/i, 'Delivery IDoc received from SAP'),
      uses('vars.idocNumber', 'Add the IDoc number: idocNumber=$(vars.idocNumber). SAP support finds the IDoc in WE02 by it.'),
      labelled('deliveryNo'),
      corr,
      noPayload,
      { not: /shipToName/, say: 'Leave out the ship-to name. The delivery number is enough to find it.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Delivery IDoc received from SAP idocType=DELVRY07 idocNumber=$(vars.idocNumber) deliveryNo=$(vars.deliveryNo) correlationId=$(correlationId)"]',
    },
    explain:
      'The IDoc number finds the document in SAP, the delivery number finds the business record. The ship-to name is personal data that adds nothing.',
  },
  {
    id: 'log-4034',
    kind: 'multi',
    situation: 'Your flow checks the status of an ORDERS IDoc it sent to SAP. SAP reports status 51. Pick every true statement.',
    options: [
      'Status 51 is a success, so an INFO line with no details is enough',
      'Status 51 means SAP could not post the application document, so the order is not in SAP',
      'IDoc numbers are personal data and must be left out',
      'Status 53 means the application document was posted',
      'The ERROR line should carry the IDoc number and the status, so SAP support can find it in WE02',
    ],
    answers: [1, 3, 4],
    explain:
      'Status 53 is posted, 51 is not posted. An IDoc number is a document number, not personal data, and it is the key fact on the line.',
  },
  {
    id: 'log-4035',
    kind: 'write',
    situation:
      'SAP reports that the ORDERS IDoc for an order is in status 51. The order is not in SAP, and the sales desk must fix it there. vars.idocNumber, vars.idocStatus and vars.orderId are set, and vars.statusText holds the SAP status message.',
    available: ['vars.idocNumber', 'vars.idocStatus', 'vars.orderId', 'vars.statusText', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/not posted|failed|rejected/i, 'SAP IDoc not posted'),
      labelled('idocNumber'),
      uses('vars.idocStatus', 'Add the IDoc status: idocStatus=$(vars.idocStatus).'),
      labelled('orderId'),
      { must: /next|fix|sales desk/i, say: 'Say what happens next, such as next=sales desk to fix in SAP.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["SAP IDoc not posted idocNumber=$(vars.idocNumber) idocStatus=$(vars.idocStatus) orderId=$(vars.orderId) sapMessage=$(vars.statusText) next=sales desk to fix in SAP correlationId=$(correlationId)"]',
    },
    explain:
      'The order did not reach SAP and a person must act, so ERROR. The IDoc number, the status and the SAP message tell the sales desk exactly what to open and why.',
  },

  // ---------- lg-083 Workday worker changes ----------
  {
    id: 'log-4036',
    kind: 'level',
    situation:
      'Thornbury Health syncs Workday worker changes to its badge system. A worker was terminated in Workday, and the badge system disabled the badge as planned.',
    answer: ['INFO'],
    explain:
      'The sync did what it should. A disabled badge is a normal, useful event to see in production, so INFO.',
  },
  {
    id: 'log-4037',
    kind: 'multi',
    situation: 'In the Workday badge sync, after a termination. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["Worker $(vars.workerName) terminated, home $(vars.homeAddress), salary $(vars.salary)"]\' />',
    options: [
      'Name, home address and salary are personal data',
      'Logs only need to leave out passwords. HR data is fine',
      'The Workday worker ID identifies the worker without personal data',
      'Workday encrypts these fields before Mule logs them',
      'There is no correlation ID',
    ],
    answers: [0, 2, 4],
    explain:
      'HR data is some of the most sensitive data a company has, and Mule writes the values as they are. Log "Badge disabled for terminated worker workerId=$(vars.workerId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-4038',
    kind: 'write',
    situation:
      'The Workday badge sync has finished its run. vars.disabledCount badges were disabled, vars.updatedCount updated and vars.skippedCount skipped. vars.durationMs holds the run time. Write the last logger.',
    available: ['vars.disabledCount', 'vars.updatedCount', 'vars.skippedCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/finish|complete|ended|synced/i, 'Workday badge sync finished'),
      uses('vars.disabledCount', 'Add how many badges were disabled: disabled=$(vars.disabledCount).'),
      uses('vars.updatedCount', 'Add how many were updated: updated=$(vars.updatedCount).'),
      uses('vars.skippedCount', 'Add how many were skipped: skipped=$(vars.skippedCount).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Workday badge sync finished disabled=$(vars.disabledCount) updated=$(vars.updatedCount) skipped=$(vars.skippedCount) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'One summary line per run shows the sync is alive and what it did. A run with many skipped workers is the first sign the data does not match.',
  },
  {
    id: 'log-4039',
    kind: 'choice',
    situation:
      'The Workday Get_Workers call through the Web Service Consumer failed with WSC:SOAP_FAULT: the integration user has no permission for the Job Data domain. Which message is best?',
    options: [
      'SOAP fault',
      'Workday error: <soapenv:Envelope><soapenv:Header><wsse:Security>...</wsse:Security></soapenv:Header>...',
      'Workday Get_Workers failed errorType=WSC:SOAP_FAULT reason="no permission for Job Data domain" next=sync stopped, HR systems team to grant access correlationId=7a90bd',
      'Workday is broken again',
    ],
    answer: 2,
    explain:
      'It names the operation, the error type, the reason and who must act. The second option dumps a SOAP envelope whose security header can hold credentials.',
  },
  {
    id: 'log-4040',
    kind: 'write',
    situation:
      'A Workday worker change names a badge that does not exist in the badge system. The flow skips this worker and goes on with the rest. vars.workerId (the Workday Employee_ID) and vars.badgeId are set.',
    available: ['vars.workerId', 'vars.badgeId', 'vars.workerName', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/not found|skipp|unknown|missing|no badge/i, 'Badge not found, worker change skipped'),
      labelled('workerId'),
      labelled('badgeId'),
      { must: /skip|next|ignor/i, say: 'Say what the flow does next, such as next=skipped.' },
      { not: /workerName/, say: 'Leave out the worker name. The worker ID is enough.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Badge not found, worker change skipped workerId=$(vars.workerId) badgeId=$(vars.badgeId) correlationId=$(correlationId)"]',
    },
    explain:
      'The run goes on, so it is not an ERROR, but someone may still have a badge that should be off. WARN with both IDs lets the security team check it.',
  },

  // ---------- lg-084 NetSuite invoices ----------
  {
    id: 'log-4041',
    kind: 'level',
    situation:
      'Oakvale Furniture posts invoices to NetSuite. One call was refused because too many requests ran at the same time for the account. The flow waits 10 seconds and tries again.',
    answer: ['WARN'],
    explain:
      'A concurrency limit that a retry handles is unexpected but handled, so WARN. Many of these lines mean the flow sends too many calls in parallel.',
  },
  {
    id: 'log-4042',
    kind: 'choice',
    situation: 'The NetSuite Add for an invoice worked and returned the internalId of the new record. Which message is best?',
    options: [
      'Invoice added to NetSuite',
      'NetSuite invoice created invoiceNo=OV-INV-30418 netsuiteId=88231 amount=1240.00 currency=USD correlationId=e5c1a8',
      'NetSuite response: <addResponse><writeResponse><status isSuccess="true"/>...',
      'Invoice OK for Oakvale customer Dana Whitfield',
    ],
    answer: 1,
    explain:
      'Your invoice number and the NetSuite internalId find the invoice in both systems. The amount helps finance check totals. A customer name is personal data and finds nothing.',
  },
  {
    id: 'log-4043',
    kind: 'write',
    situation:
      'NetSuite answered the Add for an invoice with isSuccess=false and the code INVALID_KEY_OR_REF: the customer it points to does not exist. The invoice is parked for the finance team. vars.invoiceNo, vars.nsCode and vars.nsMessage are set.',
    available: ['vars.invoiceNo', 'vars.nsCode', 'vars.nsMessage', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/not created|rejected|failed|not added|refused/i, 'NetSuite invoice rejected'),
      labelled('invoiceNo'),
      uses('vars.nsCode', 'Add the NetSuite status code: code=$(vars.nsCode).'),
      next('next=parked for finance review'),
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["NetSuite invoice rejected invoiceNo=$(vars.invoiceNo) code=$(vars.nsCode) reason=$(vars.nsMessage) next=parked for finance review correlationId=$(correlationId)"]',
    },
    explain:
      'NetSuite reports this in the response status, not always as a Mule error, so the flow must check it. The invoice is not posted and finance must act: ERROR, with the code and the next step.',
  },
  {
    id: 'log-4044',
    kind: 'multi',
    situation: 'Inside a For Each over the lines of a NetSuite invoice. Large invoices have 400 lines. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["Invoice line $(payload.item) qty=$(payload.quantity)"]\' />',
    options: [
      'One INFO line per invoice line floods the log on large invoices',
      'There is no invoice number, so the lines cannot be grouped',
      'Move it to DEBUG and log one INFO line after the loop with the line count',
      'Inside For Each, payload is the whole invoice, not one line',
      'There is no correlation ID',
    ],
    answers: [0, 1, 2, 4],
    explain:
      'Inside For Each, payload is the current line. Keep per-line detail at DEBUG and write one INFO line after the loop: "NetSuite invoice lines mapped invoiceNo=$(vars.invoiceNo) lines=$(vars.lineCount) correlationId=$(correlationId)".',
  },
  {
    id: 'log-4045',
    kind: 'write',
    situation:
      'Before it posts, the flow searches NetSuite for an invoice with the same external ID. One is found, so this invoice was already posted and the flow skips it. vars.invoiceNo and vars.netsuiteId are set.',
    available: ['vars.invoiceNo', 'vars.netsuiteId', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/already|duplicate|exists|skipp/i, 'Invoice already in NetSuite, skipped'),
      labelled('invoiceNo'),
      uses('vars.netsuiteId', 'Add the internalId of the invoice found: netsuiteId=$(vars.netsuiteId).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Invoice already in NetSuite, skipped invoiceNo=$(vars.invoiceNo) netsuiteId=$(vars.netsuiteId) correlationId=$(correlationId)"]',
    },
    explain:
      'The check stopped a double posting, which is the flow working well. INFO records it, WARN is fair if repeats are rare. The internalId proves which record already exists.',
  },

  // ---------- lg-085 Ledger transactions and rollback ----------
  {
    id: 'log-4046',
    kind: 'level',
    situation:
      'The Points API of Bluewater Rewards moves points inside a Try scope transaction. The second insert failed with DB:QUERY_EXECUTION, the transaction rolled back so neither row was kept, and the caller got a 500.',
    answer: ['ERROR'],
    explain:
      'The transfer did not happen and the cause is on the server side, so someone must look. The rollback kept the data correct, but the work still failed.',
  },
  {
    id: 'log-4047',
    kind: 'choice',
    situation: 'Both inserts in the points transaction worked and the Try scope ended, so the transaction committed. Which message is best after the Try scope?',
    options: [
      'Transaction ok',
      'Inserted debit row and credit row: [{"memberId":"M-1182","points":-500},{"memberId":"M-2290","points":500}]',
      'Points transfer committed transferId=TR-55012 fromMemberId=M-1182 toMemberId=M-2290 points=500 correlationId=6f2a9c',
      'Points moved for member jane.doe@example.com',
    ],
    answer: 2,
    explain:
      'It says the transfer is committed, which is only true after the Try scope ends, and gives the IDs and the amount. The last option uses an email instead of a member ID.',
  },
  {
    id: 'log-4048',
    kind: 'write',
    situation:
      'The credit insert failed, so the transfer must not be kept. Write the logger in the On Error Propagate of the Try scope that holds the transaction. vars.transferId is set.',
    available: ['vars.transferId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|roll/i, 'Points transfer failed, rolling back'),
      { must: /roll(ed|ing)?\s*back|rollback/i, say: 'Say that the transaction is rolled back, so the reader knows no row is kept.' },
      labelled('transferId'),
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Points transfer failed, rolling back transferId=$(vars.transferId) errorType=$(error.errorType) reason=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'On Error Propagate rolls the transaction back when it ends. Saying so tells the reader that no half transfer is left in the database. The error facts say why.',
  },
  {
    id: 'log-4049',
    kind: 'multi',
    situation: 'Inside the Try scope that holds the points transaction, right after the first insert, a teammate added this. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["Points transfer committed transferId=$(vars.transferId) correlationId=$(correlationId)"]\' />',
    options: [
      'Nothing is committed yet: the commit happens when the Try scope ends without an error',
      'A Logger inside a transaction makes the transaction fail',
      'If the second insert fails, the log says committed for a transfer that was rolled back',
      'The correlation ID is missing',
      'Move the line after the Try scope, or reword it as "debit row inserted" at DEBUG',
    ],
    answers: [0, 2, 4],
    explain:
      'A Logger does not touch the transaction, and the correlation ID is there. The problem is timing: a log line must not claim a commit that has not happened.',
  },
  {
    id: 'log-4050',
    kind: 'write',
    situation:
      'A points transfer was refused before any insert: the member has 120 points and asked to move 500. The API answers 422 and no transaction starts. vars.memberId, vars.balance and vars.requested are set.',
    available: ['vars.memberId', 'vars.balance', 'vars.requested', 'payload', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/refused|rejected|not enough|insufficient|declined/i, 'Points transfer refused: not enough points'),
      labelled('memberId'),
      uses('vars.balance', 'Add the balance: balance=$(vars.balance).'),
      uses('vars.requested', 'Add what was asked for: requested=$(vars.requested).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Points transfer refused: not enough points memberId=$(vars.memberId) balance=$(vars.balance) requested=$(vars.requested) status=422 correlationId=$(correlationId)"]',
    },
    explain:
      'The API handled a request it could not do, like a 400. WARN or INFO fits, never ERROR. The balance and the amount show why, so nobody has to query the ledger.',
  },

  // ---------- lg-086 Stored procedures and the connection pool ----------
  {
    id: 'log-4051',
    kind: 'level',
    situation:
      'The Claims API of Redwood Pharmacy waited for a free database connection. All 10 connections in the pool were busy, and after 30 seconds it raised DB:CONNECTIVITY. Every request at that time failed.',
    answer: ['ERROR'],
    explain:
      'No request could reach the database, so the work failed and someone must act, for example find the query that holds the connections.',
  },
  {
    id: 'log-4052',
    kind: 'multi',
    situation: 'After the Stored Procedure call usp_ApproveClaim. Pick every true statement.',
    code: '<logger level="INFO" message=\'#["Proc result $(write(payload))"]\' />',
    options: [
      'Stored procedure results can only be read in a Transform Message, not in a Logger',
      'write(payload) dumps every result set and output parameter, which may hold patient data',
      'DEBUG would make the patient data safe to log in production',
      'Log the output parameters you need by name, such as payload.approvalCode',
      'There is no claim ID and no correlation ID',
    ],
    answers: [1, 3, 4],
    explain:
      'A Logger can read any part of the result. Output parameters come back in the payload under their names. Patient data stays out of logs at every level.',
  },
  {
    id: 'log-4053',
    kind: 'write',
    situation:
      'The stored procedure usp_ApproveClaim has returned. Its output parameter approvalCode is in payload.approvalCode. vars.claimId holds the claim ID and vars.durationMs the call time. Write the logger.',
    available: ['payload.approvalCode', 'vars.claimId', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/approved|executed|ran|returned/i, 'Claim approved'),
      { must: /usp_ApproveClaim|procedure/i, say: 'Name the procedure: procedure=usp_ApproveClaim.' },
      labelled('claimId'),
      uses('payload.approvalCode', 'Add the output: approvalCode=$(payload.approvalCode).'),
      labelled('durationMs'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Claim approved procedure=usp_ApproveClaim claimId=$(vars.claimId) approvalCode=$(payload.approvalCode) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'The procedure name tells the DBA what ran, the approval code is the result, and the duration shows when the procedure gets slow.',
  },
  {
    id: 'log-4054',
    kind: 'choice',
    situation: 'A DB:CONNECTIVITY error from the full connection pool reached the error handler of the Claims API. Which message is best?',
    options: [
      'DB error',
      'Database connection not available: {"errorType":"DB:CONNECTIVITY","stackTrace":"java.sql.SQLTransientConnectionException at ... (212 lines)"}',
      'DB is down, call the DBA!!!',
      'Database connection not available errorType=DB:CONNECTIVITY pool=claims-db maxPoolSize=10 claimId=CL-40917 next=503 to caller correlationId=2c8e5f',
    ],
    answer: 3,
    explain:
      'It names the pool and its size, so the reader sees it ran out of connections, not that the server is down. The stack trace belongs in the error log, not in this line.',
  },
  {
    id: 'log-4055',
    kind: 'write',
    situation:
      'The call to usp_ApproveClaim failed with DB:QUERY_EXECUTION: the procedure raised its own error because the claim is already approved. The API answers 409. vars.claimId is set.',
    available: ['vars.claimId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/not approved|already|rejected|refused|conflict/i, 'Claim not approved: already approved'),
      labelled('claimId'),
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Claim not approved: already approved claimId=$(vars.claimId) errorType=$(error.errorType) reason=$(error.description) status=409 correlationId=$(correlationId)"]',
    },
    explain:
      'The procedure did its job: it stopped a second approval. The caller gets a clear 409. That is handled, so WARN, not ERROR.',
  },

  // ---------- lg-087 Salesforce Bulk API jobs ----------
  {
    id: 'log-4056',
    kind: 'level',
    situation:
      'Copperfield Wholesale loads 400,000 price book entries with a Salesforce Bulk API 2.0 job. The flow polls the job state every 30 seconds until it ends. Each poll returns InProgress.',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'A poll that says InProgress is not news. At INFO a long job writes hundreds of empty lines. Log the polls at DEBUG, or TRACE if you keep DEBUG for the job itself, and the final state at INFO or WARN.',
  },
  {
    id: 'log-4057',
    kind: 'choice',
    situation: 'The Bulk API 2.0 job reached the state JobComplete. Which message is best?',
    options: [
      'Salesforce bulk job complete jobId=750Kx00000Abc12 object=PricebookEntry operation=upsert processed=400000 failed=0 durationMs=1840000 correlationId=8d3b6a',
      'Job 750Kx00000Abc12 state JobComplete',
      'Bulk job finished',
      'Bulk results: sf__Id,sf__Created,Product2Id,UnitPrice ... (400,000 rows)',
    ],
    answer: 0,
    explain:
      'It gives the job ID, the object, the operation and the counts. The second option has the ID but not the counts or the correlation ID, so nobody can tell if every record loaded.',
  },
  {
    id: 'log-4058',
    kind: 'write',
    situation:
      'The Bulk API 2.0 job ended in state JobComplete, but numberRecordsFailed is not 0. The failed rows are fetched and saved for the data team. vars.jobId, vars.processed and vars.failed are set.',
    available: ['vars.jobId', 'vars.processed', 'vars.failed', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/failed|partial|complete with|completed with/i, 'Salesforce bulk job completed with failed records'),
      labelled('jobId'),
      uses('vars.processed', 'Add how many were processed: processed=$(vars.processed).'),
      uses('vars.failed', 'Add how many failed: failed=$(vars.failed).'),
      next('next=failed rows saved for review'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Salesforce bulk job completed with failed records jobId=$(vars.jobId) processed=$(vars.processed) failed=$(vars.failed) next=failed rows saved for review correlationId=$(correlationId)"]',
    },
    explain:
      'JobComplete only means the job ran to the end. Some records can still fail. The job worked for most rows and the rest are saved, so WARN with both counts.',
  },
  {
    id: 'log-4059',
    kind: 'multi',
    situation: 'Pick every true statement about logging a Salesforce Bulk API job.',
    options: [
      'Log the job ID when the job is created, so it can be found in Salesforce under Bulk Data Load Jobs',
      'Log every record of the job at INFO, so a failed row can be found later',
      'Log each poll of the job state at DEBUG and the final state at INFO or WARN',
      'A job in state Failed or Aborted needs an ERROR line with the job ID and the reason',
      'A bulk job uses no API calls, so the job ID is not worth logging',
    ],
    answers: [0, 2, 3],
    explain:
      'The job ID is the key to everything Salesforce knows about the job, including the failed rows. Per-record lines for 400,000 records would bury the log.',
  },
  {
    id: 'log-4060',
    kind: 'write',
    situation:
      'The Bulk API 2.0 job ended in state Failed. vars.jobId is set and vars.jobError holds the errorMessage from the job info. No records were loaded, and the nightly price load must run again.',
    available: ['vars.jobId', 'vars.jobError', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/failed|not loaded|aborted/i, 'Salesforce bulk job failed'),
      labelled('jobId'),
      uses('vars.jobError', 'Add the reason Salesforce gave: reason=$(vars.jobError).'),
      next('next=rerun price load'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Salesforce bulk job failed jobId=$(vars.jobId) state=Failed reason=$(vars.jobError) next=rerun price load correlationId=$(correlationId)"]',
    },
    explain:
      'Nothing loaded and a person must start the load again, so ERROR. The job ID and the reason let them check the job in Salesforce first.',
  },

  // ---------- lg-088 Platform Events and Change Data Capture ----------
  {
    id: 'log-4061',
    kind: 'level',
    situation:
      'At Quillstone Telecom, a flow subscribes to the Change Data Capture channel /data/AccountChangeEvent. After a restart it resumes from the replay ID stored in Object Store. You log this once when the app starts.',
    answer: ['INFO'],
    explain:
      'Where the subscription resumed is a normal, once-per-start event, and it is the first thing you check when events seem missing. INFO with the replay ID.',
  },
  {
    id: 'log-4062',
    kind: 'choice',
    situation: 'A Change Data Capture event for an Account arrived. Which message is best?',
    options: [
      'CDC event: {"ChangeEventHeader":{...},"Name":"Priya Nair","Phone":"+1 555 0199","BillingStreet":"12 Elm Road"}',
      'Got an event',
      'Account updated by Priya Nair priya.nair@quillstone.example',
      'Account change received changeType=UPDATE entity=Account recordIds=001Kx00000QzT8p replayId=18733 correlationId=4e1f7d',
    ],
    answer: 3,
    explain:
      'The change type, the record IDs and the replay ID say what changed and where the event sits in the stream. The changed fields themselves often hold personal data.',
  },
  {
    id: 'log-4063',
    kind: 'write',
    situation:
      'A Change Data Capture event for Account arrived. payload.ChangeEventHeader.changeType holds the kind of change, such as CREATE, UPDATE, DELETE or UNDELETE, and the gap types such as GAP_CREATE or GAP_UPDATE. vars.recordIds holds the record IDs as one text and vars.replayId the replay ID. Write the first logger.',
    available: ['payload.ChangeEventHeader.changeType', 'vars.recordIds', 'vars.replayId', 'payload', 'payload.Phone', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|arrived|change/i, 'Account change received'),
      { must: /changeType/, say: 'Add the change type: changeType=$(payload.ChangeEventHeader.changeType).' },
      labelled('recordIds'),
      labelled('replayId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Account change received changeType=$(payload.ChangeEventHeader.changeType) recordIds=$(vars.recordIds) replayId=$(vars.replayId) correlationId=$(correlationId)"]',
    },
    explain:
      'The replay ID shows where this event sits in the stream, so you can replay from it. The record IDs and the change type say what happened without the field values.',
  },
  {
    id: 'log-4064',
    kind: 'multi',
    situation: 'After an order ships, the flow publishes the Platform Event Order_Status__e. Pick every true statement.',
    options: [
      'Log the event name and your order ID after the publish, so a missing update in a subscriber can be traced',
      'Log the full event body at INFO, with the customer phone number, so subscribers can be checked',
      'High-volume Platform Events are kept for a retention window, so a subscriber that was down can replay them from a replay ID',
      'A Platform Event publish can never fail, so the error handler needs no logger',
      'The correlation ID can travel in a custom field of the event, so the subscriber can log the same value',
    ],
    answers: [0, 2, 4],
    explain:
      'A publish can fail like any call, for example on a limit or a lost connection. Order_Status__e is a high-volume Platform Event, and those are the ones kept for a retention window that a subscriber can replay from. The order ID and a shared correlation ID let you follow one event through publisher and subscriber.',
  },
  {
    id: 'log-4065',
    kind: 'write',
    situation:
      'A Change Data Capture event arrived with changeType GAP_UPDATE: Salesforce could not send the changed fields, so the flow re-reads the records with a query. vars.recordIds is set.',
    available: ['payload.ChangeEventHeader.changeType', 'vars.recordIds', 'payload', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/gap/i, 'CDC gap event received'),
      { must: /re-?read|query|fetch/i, say: 'Say what the flow does next, such as next=records re-read by query.' },
      labelled('recordIds'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["CDC gap event received changeType=$(payload.ChangeEventHeader.changeType) recordIds=$(vars.recordIds) next=records re-read by query correlationId=$(correlationId)"]',
    },
    explain:
      'A gap event is handled but unusual, and many of them point to a problem in Salesforce. WARN, or INFO if they are common for you, with the next step so nobody thinks the change was lost.',
  },

  // ---------- lg-089 Salesforce limits and composite calls ----------
  {
    id: 'log-4066',
    kind: 'level',
    situation:
      'In the Booking Process API of Driftwood Travel, a Salesforce call inside a For Each runs once per booking line, so one booking uses 40 API calls. You want to see each call while you tune it in a sandbox.',
    answer: ['DEBUG'],
    explain:
      'Lines inside a loop belong at DEBUG. They help you count the calls now and stay out of the production log later.',
  },
  {
    id: 'log-4067',
    kind: 'choice',
    situation:
      'A Salesforce composite request with allOrNone=true created an Opportunity and two Opportunity line items in one call. Which message is best?',
    options: [
      'Composite done',
      'Composite response: {"compositeResponse":[{"body":{...},"httpStatusCode":201,"referenceId":"newOpp"},...]}',
      'Created opportunity for traveller Tom Reyes, born 1984-03-12',
      'Salesforce composite booking created bookingId=DT-77105 opportunityId=006Kx00000Lp3Rz lineItems=2 durationMs=640 correlationId=b9a4c2',
    ],
    answer: 3,
    explain:
      'It names your booking, the main record Salesforce created and how many items came with it. The third option logs a name and a date of birth.',
  },
  {
    id: 'log-4068',
    kind: 'write',
    situation:
      'A Salesforce composite request with allOrNone=true failed: one subrequest got INVALID_FIELD, so Salesforce rolled back the others too. vars.bookingId is set, vars.failedRef holds the referenceId of the failed subrequest and vars.sfErrorCode its errorCode.',
    available: ['vars.bookingId', 'vars.failedRef', 'vars.sfErrorCode', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|rolled back|not created|rejected/i, 'Salesforce composite booking failed'),
      labelled('bookingId'),
      uses('vars.failedRef', 'Add which subrequest failed: referenceId=$(vars.failedRef).'),
      uses('vars.sfErrorCode', 'Add the Salesforce error code: errorCode=$(vars.sfErrorCode).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Salesforce composite booking failed, all subrequests rolled back bookingId=$(vars.bookingId) referenceId=$(vars.failedRef) errorCode=$(vars.sfErrorCode) correlationId=$(correlationId)"]',
    },
    explain:
      'With allOrNone, one bad subrequest undoes the whole call, so the booking is not in Salesforce. The referenceId points to the subrequest to fix, and the error code says why.',
  },
  {
    id: 'log-4069',
    kind: 'multi',
    situation:
      'A Salesforce call failed with REQUEST_LIMIT_EXCEEDED: the org has used its 24-hour API allocation. Pick every true statement.',
    options: [
      'Later calls from every app in the org fail until usage drops, so this is ERROR',
      'Retrying right away in a tight loop fixes it',
      'The line should name the limit and what happens to the booking, such as next=held in queue',
      'On normal calls to the REST API, logging the Sforce-Limit-Info header at DEBUG shows usage climb',
      'A limit error is the caller\'s fault, so WARN is enough',
    ],
    answers: [0, 2, 3],
    explain:
      'The limit is shared by the whole org, so this stops more than one booking. Fast retries only use more of a limit that is already gone.',
  },
  {
    id: 'log-4070',
    kind: 'write',
    situation:
      'A daily check reads the Salesforce org limits. The limits resource answers with Max and Remaining for DailyApiRequests, and vars.apiMax and vars.apiRemaining hold those two numbers. Remaining is under 20% of Max, so the flow writes a line the operations team alerts on.',
    available: ['vars.apiMax', 'vars.apiRemaining', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/limit|usage|high|near|remaining/i, 'Salesforce API usage high'),
      uses('vars.apiMax', 'Add the maximum: max=$(vars.apiMax).'),
      uses('vars.apiRemaining', 'Add what is left, or the used figure worked out from it: remaining=$(vars.apiRemaining).'),
      { must: /DailyApiRequests/, say: 'Name the limit: limit=DailyApiRequests.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Salesforce API usage high limit=DailyApiRequests max=$(vars.apiMax) remaining=$(vars.apiRemaining) used=$(vars.apiMax - vars.apiRemaining) correlationId=$(correlationId)"]',
    },
    explain:
      'The limits resource gives Max and Remaining, not a used figure, so the line works it out as max minus remaining. Nothing has failed yet, but it will if usage keeps climbing. WARN gives the team time to act before calls are refused.',
  },

  // ---------- lg-090 Deadlocks and bulk inserts ----------
  {
    id: 'log-4071',
    kind: 'level',
    situation:
      'At Ironbridge Freight, an update of a shipment row failed with DB:QUERY_EXECUTION: SQL Server chose it as the deadlock victim. An Until Successful scope tried again and the second try worked.',
    answer: ['WARN'],
    explain:
      'The retry handled it, so it is not an ERROR. A WARN for each deadlock shows when two flows lock the same rows too often.',
  },
  {
    id: 'log-4072',
    kind: 'choice',
    situation: 'A Database Bulk Insert wrote one block of 5,000 tracking scans. Which message is best?',
    options: [
      'Bulk insert result: [1,1,1,1,1,1,1,1,1,1,1,1,...]',
      'Inserted rows',
      'Tracking scans inserted table=tracking_scans blockNo=12 rows=5000 durationMs=930 correlationId=1a7e3d',
      'Scans inserted for driver Sam Okafor, mobile +44 7700 900456',
    ],
    answer: 2,
    explain:
      'It names the table, the block, the row count and the time. The first option logs the raw result, one count per row, which tells a reader nothing at a glance.',
  },
  {
    id: 'log-4073',
    kind: 'write',
    situation:
      'A Database Bulk Insert of tracking scans has returned. vars.blockNo names the block, vars.rowCount holds how many rows were sent and vars.durationMs the time. Write the logger.',
    available: ['vars.blockNo', 'vars.rowCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/inserted|loaded|written/i, 'Tracking scans inserted'),
      labelled('blockNo'),
      uses('vars.rowCount', 'Add how many rows were sent: rows=$(vars.rowCount).'),
      labelled('durationMs'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Tracking scans inserted table=tracking_scans blockNo=$(vars.blockNo) rows=$(vars.rowCount) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'One line per block shows the load moving and how fast. If one block is much slower, you know where to look.',
  },
  {
    id: 'log-4074',
    kind: 'multi',
    situation: 'After a Bulk Insert, a teammate logs rows=$(sum(payload)). Some days the log shows rows=-10000. Pick every true statement.',
    options: [
      'Bulk Insert returns one update count for each row in the batch',
      'Some JDBC drivers return -2 for a row, which means it worked but the count is not known',
      'A negative count always means the rows were rolled back',
      'Log the number of rows sent, and treat a -2 count as written',
      'sizeOf(payload) is the number of rows that failed',
    ],
    answers: [0, 1, 3],
    explain:
      'The value -2 is the JDBC code for success with no row count, so summing it gives nonsense. A failed bulk insert raises an error instead of returning negative counts.',
  },
  {
    id: 'log-4075',
    kind: 'write',
    situation:
      'The shipment update was the deadlock victim on every try, and the Until Successful scope gave up after the last one. The scan goes to the failed-scans table for support to replay. vars.shipmentId and vars.attempts are set.',
    available: ['vars.shipmentId', 'vars.attempts', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not updated|gave up/i, 'Shipment update failed: deadlock'),
      { must: /deadlock/i, say: 'Name the cause: deadlock.' },
      labelled('shipmentId'),
      uses('vars.attempts', 'Add how many tries were made: attempts=$(vars.attempts).'),
      errorFacts,
      next('next=saved to failed-scans for replay'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Shipment update failed: deadlock on every try shipmentId=$(vars.shipmentId) attempts=$(vars.attempts) errorType=$(error.errorType) reason=$(error.description) next=saved to failed-scans for replay correlationId=$(correlationId)"]',
    },
    explain:
      'The retries are used up and a person must replay the scan, so ERROR. The attempt count and the next step show that the flow tried and where the scan waits.',
  },
]
