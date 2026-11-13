// Logging Lab exercises, set 1: HTTP APIs and API-led layers. See ../exercises.js for the format.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

// rules several exercises here share
const duration = { must: /duration|elapsed|took|ms\s*"?\s*[=:]/i, say: 'Add how long it took, such as durationMs=$(vars.durationMs).' }
// the digits of the code must be there; any label around them is fine, such as status=404 or httpStatus=404
const status = (code) => ({ must: new RegExp(`(?<![\\d.])${code}(?![\\d.])`), say: `Add the status you send back, such as status=${code}.` })
const method = { must: /attributes\.method/, say: 'Add the method: method=$(attributes.method).' }
const path = { must: /attributes\.requestPath/, say: 'Add the path: path=$(attributes.requestPath).' }
const next = (example) => ({ must: /next|retry|again|manual|partial|held|without/i, say: `Say what happens next, such as next=${example}.` })
const noFileContent = { not: /parts\.\w+\.content/, say: 'Do not log the file content. Log its name, type and size.' }

export const SET_1 = [
  // ---------- lg-031 Booking Experience API: request in, response out ----------
  {
    id: 'log-1001',
    kind: 'level',
    situation:
      'The Booking Experience API has sent 201 Created back for a new hotel booking. You log one line at the end of every request, with the status and the time it took.',
    answer: ['INFO'],
    explain:
      'The end of a request is a normal event that operations want to see in production. One INFO line with the status and durationMs shows how every request went.',
  },
  {
    id: 'log-1002',
    kind: 'choice',
    situation: 'A GET /bookings/{bookingId} request arrives at the Booking Experience API. Which first line is best?',
    options: [
      'GET came in',
      'Booking request received headers={authorization=Bearer <token>, client_id=<client-id>}',
      'Booking request received method=GET path=/api/bookings/BK-77120 correlationId=5d2e91',
      'Booking request received at 10:42:07',
    ],
    answer: 2,
    explain:
      'It says what arrived, with the method, the path and the correlation ID. Dumping the headers leaks the bearer token. The time is already in every log line, so it adds nothing.',
  },
  {
    id: 'log-1003',
    kind: 'multi',
    situation: 'At the end of the POST /bookings flow of the Booking Experience API:',
    code: `<logger level="INFO" message='#["Booking created " ++ write(payload)]' />`,
    options: [
      'It writes the whole response body, which holds the guest name and contact details',
      'There is no correlation ID',
      'It does not give the status sent back or how long the request took',
      'write(payload) cannot be used in a Logger message',
      'The last line of a request should be DEBUG, not INFO',
    ],
    answers: [0, 1, 2],
    explain:
      'write() works in a Logger, which is why the whole body reaches the log, and INFO is right for the end of a request. Log the facts, not the body: "Booking created bookingId=$(vars.bookingId) status=201 durationMs=$(vars.durationMs) correlationId=$(correlationId)".',
  },
  {
    id: 'log-1004',
    kind: 'level',
    situation:
      'You are building the response mapping for GET /bookings/{bookingId} in the dev environment. You want to see every field the Booking System API sends back.',
    answer: ['DEBUG'],
    explain:
      'DEBUG is for detail you need while you build. It is off in production by default, so the guest data in the response stays out of the production logs.',
  },
  {
    id: 'log-1005',
    kind: 'write',
    situation:
      'The POST /bookings flow of the Booking Experience API has created the booking and is about to send 201. vars.bookingId holds the new ID and vars.durationMs how long the request took. Write the last logger of the flow.',
    available: ['vars.bookingId', 'vars.durationMs', 'attributes.method', 'payload', 'payload.guest.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|booked|confirmed|completed|sent/i, 'Booking created'),
      labelled('bookingId'),
      status(201),
      duration,
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Booking created bookingId=$(vars.bookingId) status=201 durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'The last line says how the request ended: the new ID, the status and the time. With the first line it gives the whole request in two lines.',
  },

  // ---------- lg-032 Claims API: APIkit rejects a bad request ----------
  {
    id: 'log-1006',
    kind: 'level',
    situation:
      'APIkit rejects a POST /claims request because incidentDate is not a valid date. The handler for APIKIT:BAD_REQUEST sends 400 back to the caller.',
    answer: ['WARN'],
    explain:
      'The caller made the mistake and the API handled it with a clear 400. WARN lets the team count bad requests. ERROR would page someone for a problem that is not theirs.',
  },
  {
    id: 'log-1007',
    kind: 'choice',
    situation: 'In the On Error Propagate for APIKIT:BAD_REQUEST of the Claims Experience API, which message is best?',
    options: [
      'Caller sent rubbish again!!!',
      'Claim request rejected status=400 errorType=APIKIT:BAD_REQUEST error=Invalid value for incidentDate path=/api/claims correlationId=9b41c7',
      'Bad request: {"policyNumber":"PL-448812","claimant":{"name":"Ravi Shah","phone":"+44 7700 900456"},"incidentDate":"yesterday"}',
      'ERROR: claim failed',
    ],
    answer: 1,
    explain:
      'It says what happened, which field was wrong and which request it was. The first option blames the caller, the third dumps the body with a name and a phone number, and the last says nothing useful.',
  },
  {
    id: 'log-1008',
    kind: 'multi',
    situation: 'In the On Error Propagate for APIKIT:BAD_REQUEST of the Claims Experience API:',
    code: `<logger level="ERROR" message='#["Bad request " ++ write(payload)]' />`,
    options: [
      'ERROR is too high: the caller made the mistake and the API handled it, so WARN fits',
      'The request body is written to the log, with the personal data of the claimant',
      'It leaves out error.description, which says which field failed',
      'write(payload) fails inside an error handler, so the logger throws',
      'A 400 should not be logged at all',
    ],
    answers: [0, 1, 2],
    explain:
      'write() works in an error handler, and a 400 is worth one WARN line so bad callers can be found. Log the error, not the body: "Claim request rejected status=400 errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)".',
  },
  {
    id: 'log-1009',
    kind: 'choice',
    situation:
      'The RAML of the Claims Experience API marks policyNumber as required. A POST /claims came without it and APIkit rejected it. Which line is best?',
    options: [
      'Validation failed',
      'Claim request rejected status=400 policyNumber=null claimant=Ravi Shah correlationId=9b41c7',
      'Claim request rejected status=400 error=Required field policyNumber is missing',
      'Claim request rejected status=400 error=Required field policyNumber is missing correlationId=9b41c7',
    ],
    answer: 3,
    explain:
      'It names the missing field and carries the correlation ID, so support can find the call the partner asks about. The second option logs a name, and the third cannot be joined to the request.',
  },
  {
    id: 'log-1010',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for APIKIT:BAD_REQUEST of the Claims Experience API. The API answers 400. error.description says which field failed. The request body holds the claimant name and phone.',
    available: ['error.errorType', 'error.description', 'attributes.method', 'attributes.requestPath', 'payload', 'payload.claimant.phone', 'correlationId'],
    level: ['WARN'],
    checks: [says(/rejected|invalid|bad request|400|refused/i, 'Claim request rejected'), errorFacts, status(400), path, corr, noPayload, noPersonal, noVague],
    model: {
      level: 'WARN',
      message:
        '#["Claim request rejected status=400 method=$(attributes.method) path=$(attributes.requestPath) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'error.description from APIkit already names the field that failed, so the body is not needed. The path and the correlation ID let support find the call the partner asks about.',
  },

  // ---------- lg-033 Inventory System API: wrong paths and wrong methods ----------
  {
    id: 'log-1011',
    kind: 'level',
    situation:
      'A partner calls GET /api/stock/levels on the Inventory System API. The RAML has no such resource, so APIkit raises APIKIT:NOT_FOUND and the API answers 404.',
    answer: ['WARN'],
    explain:
      'The API handled it with a clear answer, but a caller is using a wrong URL. WARN lets the team see which partner needs help, without paging anyone. INFO is not enough here: a path that is not in the RAML is never part of normal use, so it has to stand out. An unknown ID in a path that does exist is different, and INFO fits that one.',
  },
  {
    id: 'log-1012',
    kind: 'choice',
    situation:
      'A caller sends DELETE /api/items/SKU-4471. The RAML only allows GET and PUT on that resource, so APIkit raises APIKIT:METHOD_NOT_ALLOWED. Which line is best?',
    options: [
      'Request rejected status=405 method=DELETE path=/api/items/SKU-4471 errorType=APIKIT:METHOD_NOT_ALLOWED correlationId=e40b18',
      'Method not allowed',
      'Someone tried to delete stock, blocked!!!',
      'Request rejected status=405 headers={client_id=<client-id>, authorization=Basic <credentials>}',
    ],
    answer: 0,
    explain:
      'It gives the method, the path, the error type and the correlation ID. The last option dumps the headers, so the Basic credentials reach the log.',
  },
  {
    id: 'log-1013',
    kind: 'multi',
    situation: 'Which of these are true about the APIkit routing errors of the Inventory System API?',
    options: [
      'APIKIT:NOT_FOUND means no resource in the RAML matches the path',
      'APIKIT:METHOD_NOT_ALLOWED means the path exists, but not with that HTTP method',
      'APIKIT:NOT_FOUND means the item was not found in the inventory',
      'The router raises them before any resource flow runs, so the error handler of the main flow is where they are logged',
      'They are failures of the API, so they should be logged at ERROR',
    ],
    answers: [0, 1, 3],
    explain:
      'APIkit raises these in the main flow, so the generated handler there is the place to log them. They are about the URL or the method, not the data. An item that does not exist is a 404 your own flow decides.',
  },
  {
    id: 'log-1014',
    kind: 'multi',
    situation: 'In the On Error Propagate for APIKIT:NOT_FOUND in the main flow of the Inventory System API:',
    code: `<logger level="INFO" message='#["Not found"]' />`,
    options: [
      'It does not say which path was asked for, so nobody can tell which caller has a wrong URL',
      'There is no correlation ID',
      'It does not name the error type or the status sent back',
      'It should log the whole request body, so the caller can be found',
      'INFO is wrong because an unknown path must always be ERROR',
      'INFO is too low: a path that is not in the RAML means a caller is misconfigured, so WARN fits',
    ],
    answers: [0, 1, 2, 5],
    explain:
      'The body does not tell you who called, and an unknown path is not a failure of the API, so it is not an ERROR either. Write "Request rejected: unknown resource status=404 method=$(attributes.method) path=$(attributes.requestPath) correlationId=$(correlationId)" at WARN.',
  },
  {
    id: 'log-1015',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for APIKIT:METHOD_NOT_ALLOWED in the main flow of the Inventory System API. The API answers 405.',
    available: ['attributes.method', 'attributes.requestPath', 'attributes.headers', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rejected|not allowed|405|refused/i, 'Request rejected: method not allowed'),
      method,
      path,
      status(405),
      corr,
      noPayload,
      { not: /attributes\.headers/, say: 'Do not log all the headers. They hold the client secret and the Authorization header.' },
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Request rejected: method not allowed status=405 method=$(attributes.method) path=$(attributes.requestPath) errorType=$(error.errorType) correlationId=$(correlationId)"]',
    },
    explain:
      'The method and the path are the two facts that explain a 405. The headers would add credentials, not answers.',
  },

  // ---------- lg-034 Customer lookup: when the System API says 404 ----------
  {
    id: 'log-1016',
    kind: 'level',
    situation:
      'The Customer Process API calls GET /customers/C-20931 on the Customer System API. It answers 404, and the Process API returns 404 to its caller. Unknown IDs come in a few times a day.',
    answer: ['WARN', 'INFO'],
    explain:
      'An unknown ID is a normal answer that the flow handles, so it is not an ERROR. WARN helps if you want to count them, and INFO is fine when they are part of normal use. The resource itself exists here, so this 404 is about the data, not a caller with a wrong URL.',
  },
  {
    id: 'log-1017',
    kind: 'choice',
    situation: 'The HTTP Request to the Customer System API returned 200. Which line is best after it?',
    options: [
      'Customer System API called',
      'Customer fetched customerId=C-20931 name=Lena Fischer dob=1988-02-14 correlationId=2a7f03',
      'Customer fetched from Customer System API customerId=C-20931 status=200 durationMs=184 correlationId=2a7f03',
      'Customer fetched from Customer System API customerId=C-20931 status=200 durationMs=184 response={"name":"Lena Fischer",...}',
    ],
    answer: 2,
    explain:
      'After a call, log the status and the duration with the ID. The second and the last options put a name and a date of birth in the log.',
  },
  {
    id: 'log-1018',
    kind: 'multi',
    situation:
      'In the Customer Process API, an On Error Continue for HTTP:NOT_FOUND catches the 404 from the Customer System API and returns 404 to the caller. This logger is in it:',
    code: `<logger level="ERROR" message='#["Customer lookup failed " ++ error.description]' />`,
    options: [
      'ERROR is too high: an unknown customer ID is a normal answer that the flow handles',
      'It does not give the customer ID that was asked for',
      'There is no correlation ID',
      'error.description cannot be read in an On Error Continue',
      'A Logger message must use $() interpolation, because ++ does not work there',
    ],
    answers: [0, 1, 2],
    explain:
      'Both ++ and $() work, and error is there in every error handler. The line needs the ID, the correlation ID and a level that does not page anyone for a normal answer.',
  },
  {
    id: 'log-1019',
    kind: 'level',
    situation:
      'The Customer System API answered 200, but the response has no segment field. The Process API uses segment to pick a discount, so it uses the default segment and goes on.',
    answer: ['WARN'],
    explain:
      'The flow handled it, but the data is not as expected. WARN lets the team count these and fix the data at the source.',
  },
  {
    id: 'log-1020',
    kind: 'write',
    situation:
      'Write the logger in the On Error Continue for HTTP:NOT_FOUND. The Customer System API has no customer with the ID in vars.customerId. The Process API sends 404 back to its caller.',
    available: ['vars.customerId', 'error.errorType', 'error.description', 'payload', 'payload.customer.phone', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [says(/not found|unknown|no customer|404/i, 'Customer not found'), labelled('customerId'), status(404), corr, noPayload, noPersonal, noVague],
    model: {
      level: 'WARN',
      message: '#["Customer not found in Customer System API customerId=$(vars.customerId) status=404 correlationId=$(correlationId)"]',
    },
    explain:
      'The ID that was asked for is the one fact support needs. With it they can tell a wrong ID from a customer that is missing in the System API.',
  },

  // ---------- lg-035 Shipping Process API: carrier calls and their status codes ----------
  {
    id: 'log-1021',
    kind: 'level',
    situation:
      'The Carrier System API answered 201 to POST /labels in 640 ms. The Shipping Process API logs one line after each call to another API.',
    answer: ['INFO'],
    explain: 'A call that worked is a normal event. One INFO line with the status and the duration shows how each call went.',
  },
  {
    id: 'log-1022',
    kind: 'choice',
    situation:
      'The Carrier System API answered 503 Service Unavailable to POST /labels. The flow raises HTTP:SERVICE_UNAVAILABLE and the order cannot ship today. Which line is best?',
    options: [
      'Label creation failed!!! carrier is broken again',
      'Carrier System API answered 503',
      'Label creation failed status=503 request={"orderId":"SO-55120","shipTo":{"street":"12 Elm Row","postcode":"EH7 4AA"}}',
      'Label creation failed orderId=SO-55120 status=503 errorType=HTTP:SERVICE_UNAVAILABLE durationMs=88 next=held for manual shipping correlationId=c19d42',
    ],
    answer: 3,
    explain:
      'It says what failed, for which order, why, and what happens next. The third option puts a home address in the log, and the second cannot be joined to the order.',
  },
  {
    id: 'log-1023',
    kind: 'multi',
    situation: 'This logger comes right after the HTTP Request to the Carrier System API. Which statements are true?',
    code: `<logger level="INFO" message='#["Label created status=$(attributes.statusCode) method=$(attributes.method) trackingNumber=$(payload.trackingNumber) correlationId=$(correlationId)"]' />`,
    options: [
      'After an HTTP Request, attributes holds the response attributes, so attributes.method is not the method of the incoming request',
      'attributes.statusCode holds the status the Carrier System API sent back',
      'There is no duration, so a slow carrier cannot be seen',
      'attributes.statusCode is the status the Shipping Process API will send to its own caller',
      'A tracking number is personal data and must not be logged',
    ],
    answers: [0, 1, 2],
    explain:
      'The HTTP Request replaces attributes with the response attributes, which have statusCode but no method. Keep request facts in vars before the call. A tracking number is a business ID and helps support.',
  },
  {
    id: 'log-1024',
    kind: 'write',
    situation:
      'The Carrier System API answered 201 to POST /labels. vars.orderId holds the order, payload.trackingNumber the tracking number and vars.durationMs how long the call took. Write the logger after the HTTP Request.',
    available: ['vars.orderId', 'payload.trackingNumber', 'attributes.statusCode', 'vars.durationMs', 'payload', 'payload.shipTo.address', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/created|booked/i, 'Shipping label created'),
      { must: /attributes\.statusCode/, say: 'Add the status the carrier sent: status=$(attributes.statusCode).' },
      duration,
      labelled('trackingNumber'),
      labelled('orderId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Shipping label created orderId=$(vars.orderId) trackingNumber=$(payload.trackingNumber) status=$(attributes.statusCode) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'After a call, log the status and the duration. The tracking number links the order to the carrier, so support can answer "where is my parcel" from one line.',
  },
  {
    id: 'log-1025',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for HTTP:SERVICE_UNAVAILABLE after POST /labels. The Shipping Process API answers 503 to its caller, and the order waits for a person to ship it. vars.orderId is set.',
    available: ['vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR', 'WARN'],
    checks: [says(/fail|not created|could not|unavailable/i, 'Label creation failed'), errorFacts, labelled('orderId'), next('held for manual shipping'), corr, noPayload, noVague],
    model: {
      level: 'ERROR',
      message:
        '#["Label creation failed orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) status=503 next=held for manual shipping correlationId=$(correlationId)"]',
    },
    explain:
      'The order did not get a label and a person must act, so ERROR. WARN is fair too, because the flow has a fallback and the order is safe in the manual queue. next= tells the reader where the order is now.',
  },

  // ---------- lg-036 Product catalogue: paging through a System API ----------
  {
    id: 'log-1026',
    kind: 'level',
    situation:
      'The Catalogue Experience API fetches products from the Product System API page by page, 200 at a time. Inside the loop, you want a line per page with the page number and the item count.',
    answer: ['DEBUG'],
    explain:
      'A line inside a loop belongs at DEBUG. After the loop, one INFO line gives the total pages and products.',
  },
  {
    id: 'log-1027',
    kind: 'choice',
    situation: 'The paging loop of the Catalogue Experience API has fetched all pages. Which line after the loop is best?',
    options: [
      'Page 14 done',
      'Products fetched from Product System API pages=14 products=2716 durationMs=5320 correlationId=4be8a1',
      'Products fetched: [{"sku":"FG-001",...},{"sku":"FG-002",...}, 2716 items]',
      'Loop finished',
    ],
    answer: 1,
    explain:
      'One line with the counts and the time sums up the whole loop. The list of products is large and tells the reader less than the count.',
  },
  {
    id: 'log-1028',
    kind: 'multi',
    situation: 'Inside the paging loop of the Catalogue Experience API, which runs about 15 times per request. Which statements are true?',
    code: `<logger level="INFO" message='#["Page fetched page=$(vars.page) items=$(sizeOf(payload.items)) correlationId=$(correlationId)"]' />`,
    options: [
      'At INFO this writes about 15 lines per request. DEBUG fits a line inside a loop',
      'sizeOf(payload.items) logs a count, not the items',
      'After the loop there should be one INFO line with the total pages and products',
      'sizeOf(payload.items) writes every product into the log',
      'The correlation ID changes on each page, so it is of no use here',
    ],
    answers: [0, 1, 2],
    explain:
      'sizeOf() returns a number, and the correlation ID stays the same for the whole request. The problem is the level: 15 INFO lines per request hide the lines that matter.',
  },
  {
    id: 'log-1029',
    kind: 'choice',
    situation: 'A caller asked for GET /products?page=3&pageSize=50 on the Catalogue Experience API. Which first line is best?',
    options: [
      'GET products',
      'Products requested attributes={headers={client_id=<client-id>, authorization=Bearer <token>}, queryParams={page=3, pageSize=50}}',
      'Products requested method=GET path=/api/products page=3 pageSize=50 correlationId=0d93fe',
      'Products requested page=3 pageSize=50',
    ],
    answer: 2,
    explain:
      'It names the query values that shape the answer and carries the correlation ID. Logging all of attributes writes the bearer token too.',
  },
  {
    id: 'log-1030',
    kind: 'write',
    situation:
      'The paging loop of the Catalogue Experience API has finished. vars.pageCount holds the number of pages fetched, vars.productCount the products and vars.durationMs the total time. Write the INFO line after the loop.',
    available: ['vars.pageCount', 'vars.productCount', 'vars.durationMs', 'payload', 'payload.items', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/fetched|loaded|retrieved|read|collected/i, 'Products fetched'),
      labelled('pages', 'pages=$(vars.pageCount)'),
      { must: /vars\.productCount/, say: 'Add how many products: products=$(vars.productCount).' },
      duration,
      corr,
      noPayload,
      { not: /\$\(\s*payload\.items\s*\)/, say: 'Do not log the list of products. Log the count.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Products fetched from Product System API pages=$(vars.pageCount) products=$(vars.productCount) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'One summary line replaces 15 page lines. If the total time grows, the page count tells you whether the catalogue grew or the System API got slower.',
  },

  // ---------- lg-037 PATCH a customer: logging partial updates ----------
  {
    id: 'log-1031',
    kind: 'level',
    situation: 'A PATCH /customers/C-88014 changes only the marketingOptIn field. The Customer System API saves it and answers 200.',
    answer: ['INFO'],
    explain: 'A saved change is a normal business event that support may need to see later, so INFO.',
  },
  {
    id: 'log-1032',
    kind: 'choice',
    situation: 'PATCH /customers/C-88014 changed the email and the phone number. Which line after the save is best?',
    options: [
      'Customer updated customerId=C-88014 email=old@example.com>new@example.com phone=+44 7700 900789',
      'Customer patched',
      'PATCH ok',
      'Customer updated customerId=C-88014 fields=email,phone status=200 correlationId=71ac3e',
    ],
    answer: 3,
    explain:
      'Log the names of the fields that changed, not their values. Support can see that the email changed and when, without the email itself in the log.',
  },
  {
    id: 'log-1033',
    kind: 'multi',
    situation: 'In the Customer System API, after a PATCH /customers/{customerId} is saved. Which statements are true?',
    code: `<logger level="INFO" message='#["Customer patched customerId=$(vars.customerId) changes=" ++ write(payload)]' />`,
    options: [
      'The patch body can hold an email, a phone number or a home address, and all of it reaches the log',
      'There is no correlation ID',
      'Logging only the names of the changed fields, such as namesOf(payload) joinBy ",", keeps the useful part',
      'A PATCH must be logged at DEBUG, because it changes data',
      'write(payload) cannot be joined with ++ in a Logger message',
    ],
    answers: [0, 1, 2],
    explain:
      'write() and ++ work fine in a Logger, which is why the body leaks. A change is worth an INFO line, but with the field names, not the values.',
  },
  {
    id: 'log-1034',
    kind: 'write',
    situation:
      'The Customer System API saved a PATCH /customers/{customerId}. vars.customerId holds the ID and vars.changedFields the names of the changed fields, such as "email,marketingOptIn". Write the logger after the save.',
    available: ['vars.customerId', 'vars.changedFields', 'payload', 'payload.email', 'payload.phone', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/updated|patched|saved|changed/i, 'Customer updated'),
      labelled('customerId'),
      { must: /vars\.changedFields/, say: 'Add which fields changed: fields=$(vars.changedFields).' },
      corr,
      noPayload,
      { not: /payload\.(email|phone)/, say: 'Leave out the new values. Log which fields changed.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Customer updated customerId=$(vars.customerId) fields=$(vars.changedFields) status=200 correlationId=$(correlationId)"]',
    },
    explain:
      'The field names say what changed without putting personal data in the log. The values stay in the System API, where access is controlled.',
  },
  {
    id: 'log-1035',
    kind: 'write',
    situation:
      'A PATCH /customers/{customerId} tries to change createdAt, which is read-only. A Raise Error of type CUSTOMER:READ_ONLY_FIELD stops the flow, and its On Error Propagate answers 422. vars.customerId is set and error.description names the field. Write the logger in that handler.',
    available: ['vars.customerId', 'error.errorType', 'error.description', 'attributes.method', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rejected|refused|not allowed|read-only|422/i, 'Customer update rejected'),
      errorFacts,
      labelled('customerId'),
      status(422),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Customer update rejected: read-only field status=422 customerId=$(vars.customerId) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'The caller sent a change the API does not allow, and the API answered clearly. That is a WARN. Your own error type and its description tell the reader which rule was broken.',
  },

  // ---------- lg-038 Cancel a booking: DELETE ----------
  {
    id: 'log-1036',
    kind: 'level',
    situation:
      'DELETE /bookings/BK-30318 arrives for a booking that was cancelled yesterday. The Booking Process API answers 204 again, so a repeated DELETE does no harm.',
    answer: ['INFO'],
    explain:
      'A repeated DELETE is normal: clients resend when they lose a response. The API handles it as designed, so INFO with a note such as alreadyCancelled=true.',
  },
  {
    id: 'log-1037',
    kind: 'choice',
    situation: 'The Booking Process API cancelled booking BK-30318 and the Booking System API answered 204 No Content. Which line is best?',
    options: [
      'Booking cancelled bookingId=BK-30318 status=204 refund=requested durationMs=412 correlationId=86f0d2',
      'Booking deleted, response body: (empty)',
      'DELETE /bookings/BK-30318',
      'Booking cancelled for Tom Brennan, card ending 4417',
    ],
    answer: 0,
    explain:
      'It says what happened, to which booking, the status, the time and what happened to the money. The last option logs a name and part of a card.',
  },
  {
    id: 'log-1038',
    kind: 'multi',
    situation: 'After the HTTP Request that sends DELETE to the Booking System API, which answers 204 No Content:',
    code: `<logger level="INFO" message='#["Booking cancelled bookingId=$(payload.bookingId) correlationId=$(correlationId)"]' />`,
    options: [
      'A 204 response has no body, so payload.bookingId is empty and the line shows no ID',
      'Keep the ID in a variable before the call, such as vars.bookingId, and log that',
      'The line does not give the status or how long the call took',
      'A DELETE cannot be logged at INFO',
      'The HTTP Request resets the correlation ID, so it no longer matches',
    ],
    answers: [0, 1, 2],
    explain:
      'The HTTP Request replaces the payload with the empty 204 body. The correlation ID does not change. Write "Booking cancelled bookingId=$(vars.bookingId) status=$(attributes.statusCode) durationMs=$(vars.durationMs) correlationId=$(correlationId)".',
  },
  {
    id: 'log-1039',
    kind: 'multi',
    situation: 'Which of these lines fit the DELETE /bookings/{bookingId} flow of the Booking Process API?',
    options: [
      'INFO "Booking cancel requested method=DELETE bookingId=BK-30318 correlationId=86f0d2" when the request arrives',
      'INFO "Refund requested bookingId=BK-30318 amount=240.00 currency=EUR correlationId=86f0d2" after the call to the Payment System API',
      'DEBUG "Refund requested card=<full card number> expiry=<expiry date>"',
      'ERROR "Booking not found" when the booking ID does not exist and the API answers 404',
      'WARN "Cancel refused: booking already used bookingId=BK-30318 status=409 correlationId=86f0d2"',
    ],
    answers: [0, 1, 4],
    explain:
      'Card data never goes in a log, at any level. An unknown booking ID is a normal 404, not an ERROR, and that line has no ID and no correlation ID.',
  },
  {
    id: 'log-1040',
    kind: 'write',
    situation:
      'The Payment System API answered 409 to the refund, because the booking was paid with a voucher. The response validator treats 409 as a success, and a Choice on attributes.statusCode sends it here. The booking stays cancelled and finance will refund it by hand. vars.bookingId is set.',
    available: ['vars.bookingId', 'attributes.statusCode', 'payload.reason', 'payload', 'payload.card.number', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/refused|declined|rejected|not refunded|409/i, 'Refund refused by Payment System API'),
      { must: /attributes\.statusCode|409/, say: 'Add the status: status=$(attributes.statusCode).' },
      labelled('bookingId'),
      next('manual refund'),
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Refund refused by Payment System API bookingId=$(vars.bookingId) status=$(attributes.statusCode) reason=$(payload.reason) next=manual refund correlationId=$(correlationId)"]',
    },
    explain:
      'The flow handled it and a person will finish the refund, so WARN. The reason from the response and next=manual refund tell finance why and what to do.',
  },

  // ---------- lg-039 Claim documents: file uploads over HTTP ----------
  {
    id: 'log-1041',
    kind: 'level',
    situation:
      'A multipart upload to POST /claims/CL-6620/documents is 31 MB. A size check in the flow compares it with the 25 MB limit and raises an error, so the API answers 413 and asks the caller to send a smaller file.',
    answer: ['WARN'],
    explain: 'The API handled it with a clear answer, but the upload did not go through. WARN lets the team see how often callers hit the limit.',
  },
  {
    id: 'log-1042',
    kind: 'choice',
    situation: 'A scanned invoice was uploaded to POST /claims/CL-6620/documents and stored. Which line is best?',
    options: [
      'Document uploaded: JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3Ro...',
      'Upload ok',
      'Document uploaded claimId=CL-6620 fileName=invoice-0412.pdf contentType=application/pdf sizeBytes=842113 correlationId=f52c0b',
      'Document uploaded claimId=CL-6620 sizeBytes=842113',
    ],
    answer: 2,
    explain:
      'Name, type and size tell the reader what arrived. The first option writes the file itself into the log, and the last cannot be joined to the request.',
  },
  {
    id: 'log-1043',
    kind: 'multi',
    situation: 'At the start of the upload flow, after the HTTP Listener has read the multipart request:',
    code: `<logger level="INFO" message="#[payload.parts.file.content]" />`,
    options: [
      'It writes the file content into the log: megabytes of binary, maybe a medical record',
      'There is no message that says what happened, and no correlation ID',
      'File name, content type and size tell the reader what arrived without the content',
      'Mule leaves binary content out of a Logger, so it does no harm',
      'payload.parts cannot be read in a Logger',
    ],
    answers: [0, 1, 2],
    explain:
      'Mule writes what you give it, binary or not, and payload.parts can be read anywhere. Log the facts about the file, not the file.',
  },
  {
    id: 'log-1044',
    kind: 'write',
    situation:
      'POST /claims/{claimId}/documents has arrived with one file part. Set Variable steps stored vars.claimId, vars.fileName, vars.contentType and vars.sizeBytes. Write the first INFO line of the flow.',
    available: ['vars.claimId', 'vars.fileName', 'vars.contentType', 'vars.sizeBytes', 'payload', 'payload.parts.file.content', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|uploaded|arrived/i, 'Claim document received'),
      labelled('claimId'),
      { must: /vars\.contentType/, say: 'Add the content type: contentType=$(vars.contentType).' },
      { must: /vars\.sizeBytes/, say: 'Add the size: sizeBytes=$(vars.sizeBytes).' },
      corr,
      noPayload,
      noFileContent,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Claim document received claimId=$(vars.claimId) fileName=$(vars.fileName) contentType=$(vars.contentType) sizeBytes=$(vars.sizeBytes) correlationId=$(correlationId)"]',
    },
    explain:
      'The size with a unit in the name and the content type answer most upload questions. The file itself stays in the document store.',
  },
  {
    id: 'log-1045',
    kind: 'write',
    situation:
      'A caller uploaded an .exe file to POST /claims/{claimId}/documents. Only PDF and JPEG are allowed, so the flow answers 415 Unsupported Media Type and stores nothing. vars.claimId and vars.contentType are set.',
    available: ['vars.claimId', 'vars.contentType', 'payload', 'payload.parts.file.content', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rejected|refused|not allowed|unsupported|415/i, 'Claim document rejected'),
      status(415),
      labelled('claimId'),
      { must: /vars\.contentType/, say: 'Add the type that was refused: contentType=$(vars.contentType).' },
      corr,
      noPayload,
      noFileContent,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Claim document rejected: unsupported type status=415 claimId=$(vars.claimId) contentType=$(vars.contentType) correlationId=$(correlationId)"]',
    },
    explain:
      'The API handled it and told the caller why, so WARN. The content type shows what was sent, so support can explain it to the caller.',
  },

  // ---------- lg-040 Statements API: accepted now, done later ----------
  {
    id: 'log-1046',
    kind: 'level',
    situation:
      'A client polls GET /statements/exports/EXP-5521 every 5 seconds until the export is ready. Each poll answers 200 with status=RUNNING.',
    answer: ['DEBUG'],
    explain:
      'The same answer every 5 seconds says nothing new. Log the polls at DEBUG, and log the change to READY at INFO.',
  },
  {
    id: 'log-1047',
    kind: 'choice',
    situation: 'POST /statements/exports has started the export in an Async scope and is sending 202 Accepted. Which line is best?',
    options: [
      'Statement export done jobId=EXP-5521 correlationId=3ce6a9',
      'Statement export accepted jobId=EXP-5521 accountRef=ACC-7781 status=202 location=/statements/exports/EXP-5521 correlationId=3ce6a9',
      'Statement export accepted for IBAN <full IBAN>',
      '202',
    ],
    answer: 1,
    explain:
      'A 202 means the work has started, not finished, so "done" misleads the reader. The job ID links this line to the lines the export writes later.',
  },
  {
    id: 'log-1048',
    kind: 'multi',
    situation: 'Which statements about logging the 202 flow of the Statements API are true?',
    options: [
      'The work in the Async scope keeps the same correlationId, so its lines join the request lines',
      'The 202 line must not say "completed", because the export has only started',
      'Log the jobId in every line, so the request and the later export lines can be found with one search',
      'Lines in the Async scope cannot be logged, because the response was already sent',
      'The 202 line should be WARN, because the work is not finished',
    ],
    answers: [0, 1, 2],
    explain:
      'Loggers work in an Async scope, and the event there keeps its correlation ID. A 202 is a normal answer, so INFO.',
  },
  {
    id: 'log-1049',
    kind: 'write',
    situation:
      'POST /statements/exports has handed the work to an Async scope. vars.jobId holds the new job ID and vars.accountRef the internal account reference. Write the logger right before the 202 response.',
    available: ['vars.jobId', 'vars.accountRef', 'payload', 'payload.accountHolder.name', 'attributes.headers', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/accepted|queued|started|202/i, 'Statement export accepted'),
      labelled('jobId'),
      status(202),
      corr,
      noPayload,
      { not: /accountHolder/i, say: 'Leave out the account holder name. Log the account reference.' },
      { not: /complete|finished|\bdone\b/i, say: 'Do not say it is done. The export has only started.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Statement export accepted jobId=$(vars.jobId) accountRef=$(vars.accountRef) status=202 correlationId=$(correlationId)"]',
    },
    explain:
      'The word "accepted" and status=202 tell the reader the work is on its way. The job ID ties this line to the export lines that come later.',
  },
  {
    id: 'log-1050',
    kind: 'write',
    situation:
      'The Async scope has finished the export file for vars.jobId. vars.rowCount holds the number of transactions and vars.durationMs how long it took. Write the last logger in the Async scope.',
    available: ['vars.jobId', 'vars.rowCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/finished|completed|ready|built/i, 'Statement export completed'),
      labelled('jobId'),
      { must: /vars\.rowCount/, say: 'Add how many rows: rows=$(vars.rowCount).' },
      duration,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Statement export completed jobId=$(vars.jobId) rows=$(vars.rowCount) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'This closes the story the 202 line started. One search for the job ID shows when it was accepted, when it finished and how big it was.',
  },

  // ---------- lg-041 Client IDs, 401s and 429s ----------
  {
    id: 'log-1051',
    kind: 'level',
    situation:
      'The Order Experience API calls the Order Process API and gets 429 Too Many Requests from its rate limiting policy. The flow waits the number of seconds configured for a retry, then calls once more, and the second call works.',
    answer: ['WARN'],
    explain:
      'The flow handled it, but the app is close to its limit. WARN lets the team see when it is time to ask for a higher SLA tier.',
  },
  {
    id: 'log-1052',
    kind: 'choice',
    situation:
      'The Order Process API answered 401 to the Order Experience API. Its Client ID Enforcement policy did not accept the client ID the app sent. Which line is best?',
    options: [
      'Order Process API rejected the call status=401 errorType=HTTP:UNAUTHORIZED next=check the client credentials of this app correlationId=a8d3f1',
      'Unauthorized!!!',
      'Order Process API rejected the call headers={client_id=<client-id>, client_secret=<client-secret>}',
      'Order Process API rejected the call status=401',
    ],
    answer: 0,
    explain:
      'It names the error and points to the fix. The third option writes the client secret into the log, which is the same as a password.',
  },
  {
    id: 'log-1053',
    kind: 'multi',
    situation: 'Which statements about API policies, seen from inside the Order Process API, are true?',
    options: [
      'A request that Client ID Enforcement rejects never reaches the flow, so the flow loggers write nothing for it',
      'To see policy rejections, look at API Manager analytics or the policy logs, not the flow logs',
      'The flow should log the client_secret header, so failed calls can be traced',
      'Logging the client ID, such as clientId=$(attributes.headers.client_id), shows which app sent a request',
      'A policy rejection is always logged at ERROR by the error handler of the flow',
    ],
    answers: [0, 1, 3],
    explain:
      'Policies run before the flow, so a rejected request never reaches your loggers or your error handler. The client ID names the caller and is not a secret. The client secret is.',
  },
  {
    id: 'log-1054',
    kind: 'write',
    situation:
      'The Order Process API answered 429 Too Many Requests. The flow catches HTTP:TOO_MANY_REQUESTS, waits the seconds in vars.retryAfterSec, which the flow sets from its own configuration, then tries once more. vars.orderId is set. Write the logger in that handler.',
    available: ['vars.orderId', 'vars.retryAfterSec', 'error.errorType', 'error.description', 'attributes.headers', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rate limit|throttl|429|too many/i, 'Order Process API rate limited the call'),
      { must: /vars\.retryAfterSec/, say: 'Add how long the flow waits: waitSec=$(vars.retryAfterSec).' },
      next('retry once'),
      labelled('orderId'),
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Order Process API rate limited the call status=429 orderId=$(vars.orderId) waitSec=$(vars.retryAfterSec) next=retry once correlationId=$(correlationId)"]',
    },
    explain:
      'A 429 that the flow handles is a WARN. The wait time and next=retry once tell the reader why the order took longer, and many of these lines say the limit is too low.',
  },
  {
    id: 'log-1055',
    kind: 'write',
    situation:
      'A request reaches the Order Process API after its Client ID Enforcement policy passed. You want each first line to show which app called. The client ID is in attributes.headers.client_id and the secret in attributes.headers.client_secret. Write the first logger of the flow.',
    available: ['attributes.method', 'attributes.requestPath', 'attributes.headers.client_id', 'attributes.headers.client_secret', 'attributes.headers', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|arrived/i, 'Order request received'),
      { must: /attributes\.headers\.client_id/, say: 'Add the caller: clientId=$(attributes.headers.client_id).' },
      method,
      corr,
      noPayload,
      noSecrets,
      { not: /attributes\.headers(?!\.client_id)/, say: 'Do not log all the headers. Pick the client ID.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Order request received method=$(attributes.method) path=$(attributes.requestPath) clientId=$(attributes.headers.client_id) correlationId=$(correlationId)"]',
    },
    explain:
      'The client ID tells you which consumer app sent the request, which helps when one app floods the API. The secret never goes in a log.',
  },

  // ---------- lg-042 Patient summary: one Experience API, three System APIs ----------
  {
    id: 'log-1056',
    kind: 'level',
    situation:
      'The Lab Results System API timed out. The Patient Experience API still sends the summary with 200, without the lab section, and the response has partial=true.',
    answer: ['WARN'],
    explain:
      'The request worked, but not fully, and the flow handled it as designed. WARN with partial=true lets the team count how often patients get a summary without lab results.',
  },
  {
    id: 'log-1057',
    kind: 'choice',
    situation: 'The patient summary was sent back. The Patient and Appointments calls worked, the lab call did not. Which last line is best?',
    options: [
      'Patient summary sent patientId=P-40917 status=200 durationMs=2210 correlationId=b7e5c0',
      'Summary sent for Grace Okafor, DOB 1979-06-03, 2 appointments, HbA1c 6.1',
      'Patient summary sent but something went wrong with labs',
      'Patient summary sent patientId=P-40917 status=200 partial=true missing=labResults durationMs=2210 correlationId=b7e5c0',
    ],
    answer: 3,
    explain:
      'The first option hides that the summary was partial, so the 200 looks perfect. The second puts health data in the log, and the third is vague.',
  },
  {
    id: 'log-1058',
    kind: 'multi',
    situation:
      'After the call to the Lab Results System API, in production, where DEBUG has been turned on for a day to find a slow call:',
    code: `<logger level="DEBUG" message='#["Lab results " ++ write(payload)]' />`,
    options: [
      'Lab results are health data. They must not reach the log at any level',
      'DEBUG is often turned on in production to troubleshoot, so DEBUG does not keep data out of the log',
      'For a slow call, the useful facts are the status and durationMs, not the results',
      'Mule encrypts DEBUG lines, so health data is safe in them',
      'write(payload) only writes the first 1 KB, so little data leaks',
    ],
    answers: [0, 1, 2],
    explain:
      'Mule writes DEBUG lines as plain text, all of them. To find a slow call, write "Lab results fetched patientId=$(vars.patientId) status=$(attributes.statusCode) durationMs=$(vars.durationMs) correlationId=$(correlationId)".',
  },
  {
    id: 'log-1059',
    kind: 'write',
    situation:
      'In the Patient Experience API, an On Error Continue catches HTTP:TIMEOUT from the Lab Results System API. The summary goes on without lab results and will say partial=true. vars.patientId is set and vars.timeoutMs holds the response timeout.',
    available: ['vars.patientId', 'vars.timeoutMs', 'error.errorType', 'error.description', 'payload', 'payload.labResults', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/timed out|timeout|no answer|no response/i, 'Lab Results System API timed out'),
      errorFacts,
      labelled('patientId'),
      { must: /vars\.timeoutMs/, say: 'Add the limit: timeoutMs=$(vars.timeoutMs).' },
      next('summary sent as partial'),
      corr,
      noPayload,
      { not: /labResults/, say: 'Leave out the lab results. They are health data.' },
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Lab Results System API timed out patientId=$(vars.patientId) timeoutMs=$(vars.timeoutMs) errorType=$(error.errorType) error=$(error.description) next=summary sent as partial correlationId=$(correlationId)"]',
    },
    explain:
      'The flow handled the timeout as designed, so WARN. next= explains why this patient got a summary without lab results.',
  },
  {
    id: 'log-1060',
    kind: 'write',
    situation:
      'The Patient System API answered 500. Without the patient record no summary can be built, so the On Error Propagate for HTTP:INTERNAL_SERVER_ERROR sends 502 to the caller. vars.patientId is set.',
    available: ['vars.patientId', 'error.errorType', 'error.description', 'payload', 'payload.patient.dateOfBirth', 'correlationId'],
    level: ['ERROR'],
    checks: [says(/fail|could not|not built|500/i, 'Patient summary failed'), errorFacts, labelled('patientId'), status(502), corr, noPayload, noPersonal, noVague],
    model: {
      level: 'ERROR',
      message:
        '#["Patient summary failed: Patient System API answered 500 patientId=$(vars.patientId) errorType=$(error.errorType) error=$(error.description) status=502 correlationId=$(correlationId)"]',
    },
    explain:
      'The whole request failed and the System API team must act, so ERROR. The line names which System API failed and the 502 the caller got.',
  },

  // ---------- lg-043 Payments API: validation beyond the RAML ----------
  {
    id: 'log-1061',
    kind: 'level',
    situation:
      'A POST /payments passes the RAML checks, but the amount 25000.00 is above the daily limit of 10000.00 for that account. The API answers 422 with a clear reason.',
    answer: ['WARN'],
    explain: 'The API applied a business rule and told the caller why. It handled it, so WARN, not ERROR.',
  },
  {
    id: 'log-1062',
    kind: 'choice',
    situation:
      'A Transform in the Payments Process API failed with MULE:EXPRESSION because beneficiary.bankCode was null and the script did not expect it. The API answers 500. Which line is best?',
    options: [
      'DataWeave broke',
      'Payment mapping failed paymentId=PM-90215 errorType=MULE:EXPRESSION error=Cannot coerce Null (null) to String status=500 correlationId=61d8ab',
      'Payment mapping failed body={"amount":120.50,"beneficiary":{"name":"Omar Haddad","iban":"<full IBAN>"}}',
      'Payment mapping failed errorType=MULE:EXPRESSION',
    ],
    answer: 1,
    explain:
      'error.description from DataWeave says what was null, so a developer can fix the script. The body adds a name and an IBAN, which do not belong in a log.',
  },
  {
    id: 'log-1063',
    kind: 'multi',
    situation: 'In the business validation of POST /payments, when the amount is over the limit. Which statements are true?',
    code: `<logger level="WARN" message='#["Payment rejected amount=$(payload.amount) iban=$(payload.beneficiary.iban) cvv=$(payload.card.cvv) correlationId=$(correlationId)"]' />`,
    options: [
      'The CVV must never be logged, not even masked',
      'The full IBAN of the beneficiary should not be logged. Log the payment ID',
      'It does not say why the payment was rejected or which limit it broke',
      'WARN is wrong, because a rejected payment must be ERROR',
      'The correlation ID is missing',
    ],
    answers: [0, 1, 2],
    explain:
      'The correlation ID is there, and WARN fits a rule the API applied. Write "Payment rejected: daily limit exceeded paymentId=$(vars.paymentId) amount=$(vars.amount) limit=$(vars.dailyLimit) correlationId=$(correlationId)".',
  },
  {
    id: 'log-1064',
    kind: 'write',
    situation:
      'In the Payments Process API, a Choice router found the amount above the daily limit. A Raise Error of type PAYMENT:LIMIT_EXCEEDED leads to an On Error Propagate that answers 422. vars.paymentId, vars.amount and vars.dailyLimit are set.',
    available: ['vars.paymentId', 'vars.amount', 'vars.dailyLimit', 'error.errorType', 'payload', 'payload.beneficiary.iban', 'payload.card.cvv', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rejected|declined|refused|exceed|over/i, 'Payment rejected: daily limit exceeded'),
      labelled('paymentId'),
      { must: /vars\.dailyLimit/, say: 'Add the limit: limit=$(vars.dailyLimit).' },
      status(422),
      corr,
      noPayload,
      noSecrets,
      { not: /iban/i, say: 'Leave out the IBAN. Log the payment ID.' },
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Payment rejected: daily limit exceeded paymentId=$(vars.paymentId) amount=$(vars.amount) limit=$(vars.dailyLimit) status=422 correlationId=$(correlationId)"]',
    },
    explain:
      'The amount and the limit side by side explain the 422 at a glance. The payment ID finds the rest in the payment system, where access is controlled.',
  },
  {
    id: 'log-1065',
    kind: 'write',
    situation:
      'A Transform in POST /payments failed with MULE:EXPRESSION, because a field the script needs was null. The On Error Propagate answers 500 and the payment is not made. vars.paymentId is set.',
    available: ['vars.paymentId', 'error.errorType', 'error.description', 'payload', 'payload.card.cardNumber', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|not made|mapping|transform/i, 'Payment mapping failed'),
      errorFacts,
      labelled('paymentId'),
      status(500),
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Payment mapping failed paymentId=$(vars.paymentId) errorType=$(error.errorType) error=$(error.description) status=500 next=payment not made correlationId=$(correlationId)"]',
    },
    explain:
      'A bug in the script stopped a payment, so a developer must act: ERROR. error.description from DataWeave points to the field and the line.',
  },

  // ---------- lg-044 Loan quotes: timeouts, gateways and time budgets ----------
  {
    id: 'log-1066',
    kind: 'level',
    situation:
      'The Loan Experience API could not reach the Credit Check System API at all: HTTP:CONNECTIVITY, connection refused. No quote can be given, and the API answers 503.',
    answer: ['ERROR'],
    explain: 'The request failed and the System API is down or unreachable. Someone must act, so ERROR.',
  },
  {
    id: 'log-1067',
    kind: 'choice',
    situation: 'The Loan Experience API has a time budget of 3000 ms per request. A request took 4870 ms but worked. Which line is best?',
    options: [
      'Loan quote sent slowly quoteId=Q-11873 durationMs=4870 budgetMs=3000 creditCheckMs=4100 correlationId=0f7c3d',
      'Slow!!!',
      'Loan quote sent quoteId=Q-11873 time=4.87 correlationId=0f7c3d',
      'Loan quote sent to Dana Whitfield, income 54000, durationMs=4870',
    ],
    answer: 0,
    explain:
      'It gives the time, the budget and the slowest call, so the reader knows where the time went. time=4.87 has no unit, and the last option logs a name and an income.',
  },
  {
    id: 'log-1068',
    kind: 'multi',
    situation: 'Which statements about these error types of the HTTP Request are true?',
    options: [
      'HTTP:TIMEOUT means the request was sent but no response came within the response timeout',
      'HTTP:CONNECTIVITY means the connection could not be made or was lost, so the System API may never have seen the request',
      'HTTP:GATEWAY_TIMEOUT means the other side answered 504, so a gateway in front of it gave up',
      'HTTP:TIMEOUT and HTTP:CONNECTIVITY are the same error with two names',
      'After HTTP:TIMEOUT you can be sure the System API did nothing',
    ],
    answers: [0, 1, 2],
    explain:
      'They point to different problems, which is why errorType belongs in the line. After a timeout the other side may still have done the work, so check before you send it again.',
  },
  {
    id: 'log-1069',
    kind: 'write',
    situation:
      'The call to the Credit Check System API raised HTTP:TIMEOUT after the 5000 ms response timeout. The On Error Propagate answers 504 to the caller. vars.applicationId and vars.durationMs are set.',
    available: ['vars.applicationId', 'vars.durationMs', 'error.errorType', 'error.description', 'payload', 'payload.applicant.dateOfBirth', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/timed out|timeout|no response/i, 'Credit check timed out'),
      errorFacts,
      labelled('applicationId'),
      duration,
      status(504),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Credit check timed out applicationId=$(vars.applicationId) durationMs=$(vars.durationMs) timeoutMs=5000 errorType=$(error.errorType) error=$(error.description) status=504 correlationId=$(correlationId)"]',
    },
    explain:
      'The applicant got no quote, so ERROR. The duration and the limit show it was a timeout and not a refused connection.',
  },
  {
    id: 'log-1070',
    kind: 'write',
    situation:
      'The quote was sent back with 200, but the request took longer than the 3000 ms budget. A Choice router sends slow requests to this logger. vars.quoteId, vars.durationMs and vars.creditCheckMs are set.',
    available: ['vars.quoteId', 'vars.durationMs', 'vars.creditCheckMs', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/slow|over budget|exceed|took longer/i, 'Loan quote sent slowly'),
      duration,
      { must: /3000|budget/i, say: 'Add the budget, such as budgetMs=3000.' },
      { must: /vars\.creditCheckMs/, say: 'Add the time of the slowest call: creditCheckMs=$(vars.creditCheckMs).' },
      labelled('quoteId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Loan quote sent slowly quoteId=$(vars.quoteId) durationMs=$(vars.durationMs) budgetMs=3000 creditCheckMs=$(vars.creditCheckMs) correlationId=$(correlationId)"]',
    },
    explain:
      'The request worked, so not ERROR. A WARN with the budget and the slowest call warns the team before callers start to time out.',
  },

  // ---------- lg-045 Stock updates: PUT, ETags and conflicts ----------
  {
    id: 'log-1071',
    kind: 'level',
    situation:
      'A PUT to the Inventory System API carried an old ETag in If-Match and got 412 Precondition Failed. The Inventory Process API reads the item again, gets the new ETag, and the second PUT works.',
    answer: ['WARN', 'INFO'],
    explain:
      'Two updates crossed and the flow handled it as designed. INFO is fine when this is common. WARN helps if you want to count it, because many in a row point to a problem.',
  },
  {
    id: 'log-1072',
    kind: 'choice',
    situation: 'A PUT replaced the stock record for SKU-2218 in warehouse WH-03. The Inventory System API answered 200 with a new ETag. Which line is best?',
    options: [
      'PUT ok',
      'Stock record replaced: {"warehouseId":"WH-03","sku":"SKU-2218","quantity":140,"bins":[...]}',
      'Stock record replaced warehouseId=WH-03 sku=SKU-2218 quantity=140 etag=v18 status=200 durationMs=96 correlationId=5a0e72',
      'Stock record replaced sku=SKU-2218 quantity=140',
    ],
    answer: 2,
    explain:
      'It names the item, the new quantity, the ETag, the status and the time. The ETag lets you match this update with a later 412.',
  },
  {
    id: 'log-1073',
    kind: 'multi',
    situation: 'Which statements about logging stock PUTs in the Inventory Process API are true?',
    options: [
      'A 412 on PUT means another update came first. It is expected under load, so WARN fits, not ERROR',
      'Log the ETag you sent and the status, so two updates that crossed can be matched',
      'A PUT replaces the whole record, so the record body must be logged at INFO',
      'To act on a 412 in a Choice, add 412 to the success status codes of the response validator, then check attributes.statusCode',
      'A PUT that got 412 has changed the stock record',
    ],
    answers: [0, 1, 3],
    explain:
      'A 412 means nothing was changed. The ETag and the status are the facts that explain it, not the body.',
  },
  {
    id: 'log-1074',
    kind: 'write',
    situation:
      'A Choice on attributes.statusCode found 412 Precondition Failed after the PUT to the Inventory System API. The ETag in vars.etag is out of date. The flow reads the item again and retries the PUT once. vars.sku and vars.warehouseId are set.',
    available: ['vars.sku', 'vars.warehouseId', 'vars.etag', 'attributes.statusCode', 'payload', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/conflict|out of date|stale|precondition|412/i, 'Stock update conflict'),
      { must: /attributes\.statusCode|412/, say: 'Add the status: status=$(attributes.statusCode).' },
      labelled('sku'),
      labelled('warehouseId'),
      { must: /vars\.etag/, say: 'Add the ETag you sent: etag=$(vars.etag).' },
      next('read again and retry'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stock update conflict: ETag out of date status=$(attributes.statusCode) warehouseId=$(vars.warehouseId) sku=$(vars.sku) etag=$(vars.etag) next=read again and retry correlationId=$(correlationId)"]',
    },
    explain:
      'The flow handles it, so not ERROR. The ETag and next= show the reader that the conflict was caught and what the flow did about it.',
  },
  {
    id: 'log-1075',
    kind: 'write',
    situation:
      'The retry also got 412, so the Inventory Process API gives up and answers 409 Conflict to the warehouse app. The stock was not changed. vars.sku, vars.warehouseId and vars.attempts are set.',
    available: ['vars.sku', 'vars.warehouseId', 'vars.attempts', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/not (updated|changed|saved)|conflict|gave up|rejected/i, 'Stock update not saved: conflict'),
      labelled('sku'),
      labelled('warehouseId'),
      { must: /vars\.attempts/, say: 'Add how many tries: attempts=$(vars.attempts).' },
      status(409),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stock update not saved: conflict after retry status=409 warehouseId=$(vars.warehouseId) sku=$(vars.sku) attempts=$(vars.attempts) correlationId=$(correlationId)"]',
    },
    explain:
      'The caller got a clear 409 and can send the update again, so WARN fits. ERROR is fair too, because the stock count is now behind. attempts= shows the flow tried before it gave up.',
  },
]
