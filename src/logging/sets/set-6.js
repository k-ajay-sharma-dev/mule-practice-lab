// Logging Lab exercises, set 6. See ../exercises.js for the format.
// Theme: observability and troubleshooting. Structured JSON lines, correlation IDs across apps, timings, Scatter-Gather,
// Parallel For Each, Async, sub-flows, Choice routes, audit lines, metrics in logs, sampling, Transform failures, Cache.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

// rules several exercises here share
const jsonOut = { must: /output\s+application\/json/, say: 'Start the expression with output application/json.' }
const oneLine = { must: /indent\s*=\s*false/, say: 'Add indent=false, so the JSON stays on one line.' }
const jsonCorr = { must: /correlationId\s*"?\s*:\s*correlationId/, say: 'Add correlationId: correlationId.' }
const event = (re, example) => ({
  must: new RegExp(`event\\s*"?\\s*:\\s*"[^"]*(${re})`, 'i'),
  say: `Add an event field that says what happened, such as event: "${example}".`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
// The digits matter: status=200 is not the status this exercise sends back. Any label ending or starting in
// "status" is fine, such as status=503, httpStatus=503 or statusCode=503.
const status = (code) => ({
  must: new RegExp(`\\w*status\\w*\\s*"?\\s*[=:]\\s*"?${code}\\b`, 'i'),
  say: `Add the status you send back, labelled, such as status=${code}.`,
})

export const SET_6 = [
  // ---------- lg-106 Brightleaf Grocers: one ID across two APIs ----------
  {
    id: 'log-6001',
    kind: 'level',
    situation:
      'The Brightleaf Mobile Experience API receives GET /baskets/{basketId}. The caller sent an X-Correlation-ID header. You log one line when the request arrives.',
    answer: ['INFO'],
    explain:
      'A request arriving is a normal event you want in production, so INFO. Because the caller sent X-Correlation-ID, this line already carries the same ID as the caller.',
  },
  {
    id: 'log-6002',
    kind: 'level',
    situation:
      'Before the HTTP Request to the Brightleaf Basket Process API, you log the path and the names of the headers you are about to send. You only need it to check the header mapping while you build the flow in dev.',
    answer: ['DEBUG'],
    explain:
      'Detail you need while you build is DEBUG. It stays off in production. The line after the call, with the status and the duration, is the one for INFO.',
  },
  {
    id: 'log-6003',
    kind: 'choice',
    situation:
      'The Brightleaf Basket Process API has priced a basket. Which line can be joined to the lines the Experience API wrote for the same request?',
    options: [
      'Basket priced basketId=B-2291 items=7 durationMs=184',
      'Basket priced basketId=B-2291 items=7 durationMs=184 correlationId=7f3c2a',
      'Basket priced for request 7f3c2a!!!',
      'Basket priced basketId=B-2291 requestId=91ad0e (a new ID made in this app)',
    ],
    answer: 1,
    explain:
      'The correlation ID came in with the X-Correlation-ID header, so both apps write the same value. A new ID made in this app joins nothing, and an unlabelled value cannot be searched by field.',
  },
  {
    id: 'log-6004',
    kind: 'multi',
    situation:
      'For the same basket request, the Brightleaf Basket Process API logs a different correlation ID from the Experience API. What can cause it?',
    options: [
      'The Process API logs at DEBUG instead of INFO',
      'The HTTP Request in the Experience API has sendCorrelationId="NEVER", so no X-Correlation-ID header is sent',
      'The Process API writes its lines as JSON instead of plain text',
      'A gateway between the two apps drops the X-Correlation-ID header',
    ],
    answers: [1, 3],
    explain:
      'The HTTP Listener takes the correlation ID from the X-Correlation-ID header. If the header never arrives, Mule makes a new ID. The level and the format of the line do not change which ID it carries.',
  },
  {
    id: 'log-6005',
    kind: 'write',
    situation:
      "Write the first logger of the Brightleaf Basket Process API flow. Mule has set correlationId from the caller's X-Correlation-ID header. vars.basketId holds the basket. Say that the request arrived, with the basket and the correlation ID.",
    available: ['vars.basketId', 'attributes.method', 'attributes.headers', 'payload', 'payload.customer.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|arrived/i, 'Basket request received'),
      labelled('basketId'),
      corr,
      { not: /attributes\.headers(?!\s*\[)/, say: 'Do not log all the headers. They can hold the Authorization header.' },
      noPayload,
      noPersonal,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Basket request received method=$(attributes.method) basketId=$(vars.basketId) correlationId=$(correlationId)"]' },
    explain:
      'correlationId already holds the value from X-Correlation-ID, so there is no need to read the header. Logging every header would also write the Authorization header to the log.',
  },

  // ---------- lg-107 Marchmont Insurance: first JSON log lines ----------
  {
    id: 'log-6006',
    kind: 'level',
    situation:
      'The Marchmont Quote API now writes each line as one JSON object. A quote was priced and sent back with status 200. This is the last line of the request.',
    answer: ['INFO'],
    explain:
      'The format does not change the level. The end of a request that worked is a normal event, so INFO, with the result and the time it took.',
  },
  {
    id: 'log-6007',
    kind: 'choice',
    situation: 'Which logger message writes a Marchmont quote line as one JSON object on one line?',
    options: [
      '#[output application/json --- { event: "Quote priced", quoteId: vars.quoteId, correlationId: correlationId }]',
      '#["{ event: Quote priced, quoteId: $(vars.quoteId) }"]',
      '#[output application/json indent=false --- { event: "Quote priced", quoteId: vars.quoteId, correlationId: correlationId }]',
      '#[output application/json indent=false --- payload]',
    ],
    answer: 2,
    explain:
      'Without indent=false the JSON is written over several lines, and the log tool splits it into several events. The second option is not valid JSON, and the last one dumps the whole payload.',
  },
  {
    id: 'log-6008',
    kind: 'multi',
    situation: 'Other Marchmont APIs log the fields event, quoteId and correlationId. This new logger is in the Quote API:',
    code: `<logger level="INFO" message='#[output application/json indent=false --- { Event: "quote priced", quote_id: vars.quoteId, holder: payload.policyHolder.fullName }]' />`,
    options: [
      'quote_id and Event do not match the names the other APIs use, so one search will not find every line',
      'indent=false makes the line hard to read in Splunk',
      "The policy holder's full name is personal data",
      'There is no correlationId field',
      'JSON lines can only be written at DEBUG',
    ],
    answers: [0, 2, 3],
    explain:
      'Field names must be spelled the same in every app, or a search for quoteId misses these lines. indent=false is right: Splunk reads one JSON object per line. JSON can be written at any level.',
  },
  {
    id: 'log-6009',
    kind: 'write',
    situation:
      'Write the Marchmont line for "quote created" as one JSON object on one line, with event, quoteId, productCode and correlationId. vars.quoteId holds the quote ID and vars.productCode the product, such as HOME-STD.',
    available: ['vars.quoteId', 'vars.productCode', 'payload', 'payload.policyHolder.dateOfBirth', 'correlationId'],
    level: ['INFO'],
    checks: [
      jsonOut,
      oneLine,
      event('creat', 'Quote created'),
      labelled('quoteId', 'quoteId: vars.quoteId'),
      labelled('productCode', 'productCode: vars.productCode'),
      jsonCorr,
      noPayload,
      noPersonal,
    ],
    model: {
      level: 'INFO',
      message: '#[output application/json indent=false --- { event: "Quote created", quoteId: vars.quoteId, productCode: vars.productCode, correlationId: correlationId }]',
    },
    explain:
      'Each field can be searched on its own, such as productCode=HOME-STD, and counted per product. The date of birth stays out: it is personal data.',
  },
  {
    id: 'log-6010',
    kind: 'write',
    situation:
      'The Marchmont rating engine had no rate for the postcode area, so the Quote API used the default rate and carried on. Write the line as one JSON object on one line with event, quoteId, postcodeArea, rateSource and correlationId. vars.quoteId and vars.postcodeArea, such as BS4, are set.',
    available: ['vars.quoteId', 'vars.postcodeArea', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      jsonOut,
      oneLine,
      event('default|no rate|missing|not found', 'Default rate used: no rate for area'),
      labelled('quoteId', 'quoteId: vars.quoteId'),
      labelled('postcodeArea', 'postcodeArea: vars.postcodeArea'),
      labelled('rateSource', 'rateSource: "default"'),
      jsonCorr,
      noPayload,
    ],
    model: {
      level: 'WARN',
      message:
        '#[output application/json indent=false --- { event: "Default rate used: no rate for area", quoteId: vars.quoteId, postcodeArea: vars.postcodeArea, rateSource: "default", correlationId: correlationId }]',
    },
    explain:
      'The quote went out, but the data was not as expected, so WARN. A count of these lines per postcodeArea tells the pricing team which rates to add.',
  },

  // ---------- lg-108 Alderwood Pharmacy: timing each call ----------
  {
    id: 'log-6011',
    kind: 'level',
    situation:
      'The Alderwood Prescription API called the Stock System API. It answered 200 in 4200 ms. It usually takes about 300 ms and the timeout is 5000 ms. The flow goes on.',
    answer: ['WARN'],
    explain:
      'The call worked, so it is not an ERROR. It was far slower than usual and close to the timeout, which is unexpected. WARN lets the team see the trend before calls start to time out.',
  },
  {
    id: 'log-6012',
    kind: 'choice',
    situation: 'The Alderwood team wants a chart of how long the Stock System API takes. Which line is best?',
    options: [
      'Stock checked durationMs=412 storeId=PC-118 correlationId=7f3c2a',
      'Stock checked in 0.4 seconds at store PC-118',
      'Stock checked time=412 storeId=PC-118 correlationId=7f3c2a',
      'Stock check started storeId=PC-118 correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'durationMs is a plain number with the unit in its name, so a log tool can chart it. "time=412" does not say the unit, and a number inside a sentence cannot be charted.',
  },
  {
    id: 'log-6013',
    kind: 'choice',
    situation:
      "Before the Stock System call, a Set Variable stored vars.startMs = now() as Number {unit: 'milliseconds'}. Which message gives the right duration after the call?",
    options: [
      '#["Stock checked durationMs=$(now()) correlationId=$(correlationId)"]',
      '#["Stock checked durationMs=$(vars.startMs) correlationId=$(correlationId)"]',
      '#["Stock checked at $(now()) correlationId=$(correlationId)"]',
      `#["Stock checked durationMs=$((now() as Number {unit: 'milliseconds'}) - vars.startMs) correlationId=$(correlationId)"]`,
    ],
    answer: 3,
    explain:
      'The duration is the time now minus the time stored before the call, both in milliseconds. now() alone is a timestamp, and every log line already has a timestamp.',
  },
  {
    id: 'log-6014',
    kind: 'multi',
    situation: 'The only logger around the Alderwood Stock System call is this one, before the call. There is none after it:',
    code: `<logger level="INFO" message='#["Calling Stock System API"]' />`,
    options: [
      'Nobody can tell from the log how long the call took',
      'Mule adds the call duration to the line by itself',
      'Nobody can tell whether the call worked',
      'The message carries no correlation ID of its own',
      'A line before a call must always be ERROR',
    ],
    answers: [0, 2, 3],
    explain:
      'A line before a call only says something started. The line after the call gives the status and the duration. Mule does not time the call for you in a Logger. The log4j2 pattern Studio generates usually prints %X{correlationId} in the line prefix, so put the ID in the message you control as well. Then the line can be searched and joined wherever the pattern does not carry it.',
  },
  {
    id: 'log-6015',
    kind: 'write',
    situation:
      'Write the logger after the Alderwood Stock System call, which worked in normal time. vars.durationMs holds how long the call took, attributes.statusCode the HTTP status, and vars.storeId the store.',
    available: ['vars.storeId', 'vars.durationMs', 'attributes.statusCode', 'payload', 'payload.patient.nhsNumber', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/checked|answered|returned|received/i, 'Stock checked'),
      durationVar,
      labelled('durationMs'),
      { must: /attributes\.statusCode/, say: 'Add the status: status=$(attributes.statusCode).' },
      labelled('storeId'),
      corr,
      noPayload,
      { not: /patient|nhsNumber/i, say: 'Leave out patient data. The store ID is enough.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Stock checked in Stock System API status=$(attributes.statusCode) durationMs=$(vars.durationMs) storeId=$(vars.storeId) correlationId=$(correlationId)"]',
    },
    explain:
      'The status and the duration answer the two questions after any call: did it work, and how long did it take. The patient number is personal data and does not help here.',
  },

  // ---------- lg-109 Wyecombe Credit Union: Choice routes ----------
  {
    id: 'log-6016',
    kind: 'level',
    situation:
      'The Wyecombe Loan Application API has a Choice router with three routes: personal, car and home loans. You add a line inside each route that says which route ran. It helps when you trace one request, but nobody reads it every day.',
    answer: ['DEBUG'],
    explain:
      'Which route ran is detail for troubleshooting, so DEBUG. If the business needs it, one INFO line after the router can carry the route as a field.',
  },
  {
    id: 'log-6017',
    kind: 'level',
    situation:
      'The Wyecombe Choice router reaches its otherwise route: the loanType is "boat", which no route handles. The flow answers 400 to the caller and stops.',
    answer: ['WARN'],
    explain:
      'The caller sent data the API does not accept. The flow handled it with a 400, so WARN. Nobody on your team has to act, but a rise in these lines is worth a look.',
  },
  {
    id: 'log-6018',
    kind: 'choice',
    situation: 'The Wyecombe team wants one INFO line per loan application that shows which loan team got it. Which line is best?',
    options: [
      'Route taken',
      'In the when branch 2',
      'Loan application routed: {"loanType":"car","applicant":{"name":"Ravi Mehta","income":52000}}',
      'Loan application routed loanType=car route=car-loans applicationId=LA-55120 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It names the route and the application, with labelled fields. "when branch 2" means nothing to a reader, and the payload dump puts a name and an income in the log.',
  },
  {
    id: 'log-6019',
    kind: 'multi',
    situation: 'In the otherwise route of the Wyecombe Choice router, which sends unknown loan types back with 400:',
    code: `<logger level="INFO" message='#["Choice: otherwise"]' />`,
    options: [
      'A Logger cannot be placed inside the otherwise route',
      'It does not say what the unknown loan type was',
      'It gives no application ID, and no correlation ID of its own',
      'A 400 that the flow sends back is unexpected but handled, so WARN fits better than INFO',
    ],
    answers: [1, 2, 3],
    explain:
      'Any processor can sit in the otherwise route, a Logger too. The reader needs the value that matched no route and the application, at WARN. The correlation ID belongs in the message you control, even though the log4j2 pattern usually prints it in the line prefix, so the line can be searched and joined wherever the pattern does not carry it.',
  },
  {
    id: 'log-6020',
    kind: 'write',
    situation:
      'Write the logger for the otherwise route of the Wyecombe Choice router. vars.loanType holds the type the caller sent and vars.applicationId the application. The flow answers 400.',
    available: ['vars.loanType', 'vars.applicationId', 'payload', 'payload.applicant.phone', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|unknown|not supported|unsupported|no route/i, 'Loan application rejected: unknown loanType'),
      labelled('loanType'),
      labelled('applicationId'),
      status(400),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Loan application rejected: unknown loanType=$(vars.loanType) status=400 applicationId=$(vars.applicationId) correlationId=$(correlationId)"]',
    },
    explain:
      'The loan type shows what the caller sent, so the team can tell a typo from a new product nobody built a route for. status=400 shows what the caller saw.',
  },

  // ---------- lg-110 Skyline Travel: fare search with Scatter-Gather ----------
  {
    id: 'log-6021',
    kind: 'level',
    situation:
      'The Skyline Fare Search API sends the same search to three airline APIs in a Scatter-Gather. All three answered. After the Scatter-Gather, you log how many fares came back and how long the search took.',
    answer: ['INFO'],
    explain:
      'A search that worked is a normal event. One INFO line after the Scatter-Gather sums up the result, so you do not need an INFO line in each route.',
  },
  {
    id: 'log-6022',
    kind: 'choice',
    situation:
      'After the Skyline Scatter-Gather, payload is an object with keys "0", "1" and "2", one per airline route. Which message counts the fares of each airline?',
    options: [
      '#["Fares returned count=$(sizeOf(payload)) correlationId=$(correlationId)"]',
      '#["Fares returned aeroNord=$(sizeOf(payload."0".payload)) blueKite=$(sizeOf(payload."1".payload)) sunJet=$(sizeOf(payload."2".payload)) correlationId=$(correlationId)"]',
      '#["Fares returned $(write(payload))"]',
      '#["Fares returned aeroNord=$(sizeOf(payload.aeroNord)) blueKite=$(sizeOf(payload.blueKite)) correlationId=$(correlationId)"]',
    ],
    answer: 1,
    explain:
      'Each key holds the message of one route, so payload."0".payload is the first airline\'s fares. sizeOf(payload) counts the routes, which is always 3. The routes are keyed by number, not by airline name.',
  },
  {
    id: 'log-6023',
    kind: 'multi',
    situation: 'One airline route timed out. The Skyline Scatter-Gather raised MULE:COMPOSITE_ROUTING, and the error handler has this logger:',
    code: `<logger level="ERROR" message='#["Fare search failed $(error.description)"]' />`,
    options: [
      'MULE:COMPOSITE_ROUTING means all three routes failed',
      'It does not say which route failed. error.errorMessage.payload.failures holds the failed routes',
      'The message carries no correlation ID of its own',
      'error.description is always empty for a Scatter-Gather',
      'If the flow still answers with the fares of the other two airlines, WARN fits better than ERROR',
    ],
    answers: [1, 2, 4],
    explain:
      'COMPOSITE_ROUTING is raised when at least one route fails. The failed routes are in error.errorMessage.payload.failures, keyed by route number, next to the results of the routes that worked. A handled partial result is WARN. The correlation ID belongs in the message you control, so the line can be searched and joined wherever the log4j2 pattern does not print it in the prefix.',
  },
  {
    id: 'log-6024',
    kind: 'write',
    situation:
      'One airline route failed, but the On Error Continue for MULE:COMPOSITE_ROUTING sends back the fares from the other two. vars.failedRoutes holds the failed route names as one text, such as "sunJet", built from error.errorMessage.payload.failures. vars.searchId is set. Write the logger.',
    available: ['vars.searchId', 'vars.failedRoutes', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/partial|failed|missing|without|timed out/i, 'Fare search partial: airline route failed'),
      { must: /vars\.failedRoutes/, say: 'Add which routes failed: failedRoutes=$(vars.failedRoutes).' },
      { must: /error\.errorType/, say: 'Add the error type: errorType=$(error.errorType).' },
      labelled('searchId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Fare search partial: airline route failed failedRoutes=$(vars.failedRoutes) errorType=$(error.errorType) searchId=$(vars.searchId) correlationId=$(correlationId)"]',
    },
    explain:
      'The caller still got fares, so WARN. failedRoutes tells the team which airline to look at, and a count of these lines per airline shows which one fails most.',
  },
  {
    id: 'log-6025',
    kind: 'write',
    situation:
      'Skyline logs JSON to ELK. After the Scatter-Gather, write one JSON object on one line with event, searchId, fareCount, durationMs and correlationId. vars.fareCount holds the total fares, vars.durationMs the search time and vars.searchId the search.',
    available: ['vars.searchId', 'vars.fareCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      jsonOut,
      oneLine,
      event('search|returned|complet', 'Fare search completed'),
      labelled('searchId', 'searchId: vars.searchId'),
      labelled('fareCount', 'fareCount: vars.fareCount'),
      labelled('durationMs', 'durationMs: vars.durationMs'),
      jsonCorr,
      noPayload,
    ],
    model: {
      level: 'INFO',
      message:
        '#[output application/json indent=false --- { event: "Fare search completed", searchId: vars.searchId, fareCount: vars.fareCount, durationMs: vars.durationMs, correlationId: correlationId }]',
    },
    explain:
      'In Kibana, fareCount and durationMs are numbers you can chart. A search with fareCount 0 stands out, and a slow search shows on a graph without parsing text.',
  },

  // ---------- lg-111 Maplewood Hardware: Parallel For Each ----------
  {
    id: 'log-6026',
    kind: 'level',
    situation:
      'A Parallel For Each in the Maplewood Price API sends a price update to each of 40 stores. Inside it, you want one line per store with the store ID, for troubleshooting.',
    answer: ['DEBUG'],
    explain:
      'One line per item inside a loop is DEBUG. After the Parallel For Each, one INFO line with the counts tells production what it needs.',
  },
  {
    id: 'log-6027',
    kind: 'choice',
    situation: 'After the Maplewood Parallel For Each, which line is best?',
    options: [
      'Store 1 updated, Store 2 updated, Store 3 updated, and so on',
      'Parallel For Each finished',
      'Price update sent to stores storesTotal=40 succeeded=38 failed=2 durationMs=5120 correlationId=7f3c2a',
      'Price update sent to stores {"stores":[ ...40 store objects with all prices... ]}',
    ],
    answer: 2,
    explain:
      'One line with the counts and the time sums up 40 calls. "Parallel For Each finished" names the scope, not the business result, and the dump is large and slow.',
  },
  {
    id: 'log-6028',
    kind: 'multi',
    situation:
      'Inside the Maplewood Parallel For Each, a logger reads vars.batchNo, which was set before the scope. Which statements are true?',
    options: [
      'Each route gets a new correlation ID, so its lines cannot be joined',
      'vars.batchNo, set before the Parallel For Each, can be read in every route',
      'A variable set inside one route is not seen by the other routes while they run',
      'Loggers are not allowed inside a Parallel For Each',
      'Lines from different routes can appear in any order in the log',
    ],
    answers: [1, 2, 4],
    explain:
      'Every route starts with the variables set before the scope and keeps the same correlation ID. The routes run at the same time, so their lines mix. Add the store ID to each line to tell them apart.',
  },
  {
    id: 'log-6029',
    kind: 'write',
    situation:
      "Inside the Maplewood Parallel For Each, write the line for one store. payload is one store's price list, payload.storeId holds the store and payload.prices the prices. vars.batchNo was set before the scope.",
    available: ['payload.storeId', 'sizeOf(payload.prices)', 'vars.batchNo', 'payload', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/sending|sent|updat/i, 'Sending price update to store'),
      labelled('storeId'),
      labelled('batchNo'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'DEBUG',
      message: '#["Sending price update to store storeId=$(payload.storeId) items=$(sizeOf(payload.prices)) batchNo=$(vars.batchNo) correlationId=$(correlationId)"]',
    },
    explain:
      'A line per store belongs at DEBUG. The store ID tells the mixed lines apart, and sizeOf gives the size of the list without writing the prices.',
  },
  {
    id: 'log-6030',
    kind: 'write',
    situation:
      'Two Maplewood stores failed. The Parallel For Each raised MULE:COMPOSITE_ROUTING, and the On Error Continue puts the failed stores on a retry list. vars.failedStores holds their IDs as one text, such as "ST-12,ST-31", vars.failedCount the count and vars.batchNo the batch. Write the logger.',
    available: ['vars.failedStores', 'vars.failedCount', 'vars.batchNo', 'error.errorType', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/failed|not updated|could not/i, 'Price update failed for some stores'),
      { must: /vars\.failedStores/, say: 'Add which stores failed: failedStores=$(vars.failedStores).' },
      labelled('failedCount'),
      { must: /next|retry/i, say: 'Say what happens next, such as next=retry list.' },
      labelled('batchNo'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Price update failed for some stores failedCount=$(vars.failedCount) failedStores=$(vars.failedStores) batchNo=$(vars.batchNo) next=retry list correlationId=$(correlationId)"]',
    },
    explain:
      'The flow handled the failure and will retry, so WARN. The store IDs and next=retry list tell support which stores still show the old price and that a retry is coming.',
  },

  // ---------- lg-112 Lumen Fitness: Async scope ----------
  {
    id: 'log-6031',
    kind: 'level',
    situation:
      'After a member signs up at Lumen Fitness, an Async scope sends the welcome message through the Notify API. The member already got 201. Inside the Async scope the Notify call failed, and nothing will retry it.',
    answer: ['ERROR'],
    explain:
      'The message is lost and someone must resend it, so ERROR. The member saw a success, so nobody else will notice unless the log says so.',
  },
  {
    id: 'log-6032',
    kind: 'choice',
    situation: 'Inside the Lumen Async scope, the Notify API has accepted the welcome message. Which line is best?',
    options: [
      'Async done',
      'Welcome message sent to ann.lee@example.com',
      'Welcome message accepted by Notify API memberId=M-80412 durationMs=230 correlationId=7f3c2a',
      'Notify API called',
    ],
    answer: 2,
    explain:
      'It says what happened, for which member and how long it took. The second option puts an email address in the log, and "Notify API called" does not say whether it worked.',
  },
  {
    id: 'log-6033',
    kind: 'multi',
    situation: 'The Lumen sign-up flow ends with this logger, placed after the Async scope:',
    code: `<logger level="INFO" message='#["Sign-up complete, welcome message sent memberId=$(vars.memberId) correlationId=$(correlationId)"]' />`,
    options: [
      'The Async scope runs on its own, so the message may not be sent yet when this line is written',
      'The line has no correlation ID',
      'If the Notify call fails, this line still says the message was sent',
      'The Async scope blocks the flow until the Notify API answers',
      'The "sent" part belongs inside the Async scope, after the Notify call, where its result is known',
    ],
    answers: [0, 2, 4],
    explain:
      'The flow goes on as soon as the Async scope starts. A line after the scope can only say the sign-up is complete. Whether the message was sent is known inside the scope.',
  },
  {
    id: 'log-6034',
    kind: 'multi',
    situation: 'Which statements about log lines from inside a Lumen Async scope are true?',
    options: [
      'Mule writes no log lines from inside an Async scope',
      'Lines inside the Async scope keep the same correlationId as the flow that started it',
      "An error inside the Async scope does not reach the flow's error handler, so the scope needs its own Try and logger",
      "Lines from inside the Async scope can appear in the log after the flow's last line",
    ],
    answers: [1, 2, 3],
    explain:
      'The Async scope runs later on another thread, with the same correlation ID. Its errors do not go back to the flow, so without a Try and a logger inside it, a failure leaves no trace.',
  },
  {
    id: 'log-6035',
    kind: 'write',
    situation:
      'Inside the Lumen Async scope, a Try catches the failed Notify call. Write the logger in its On Error Continue. vars.memberId is set. The welcome message is lost unless someone resends it.',
    available: ['vars.memberId', 'error.errorType', 'error.description', 'payload', 'payload.member.email', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not sent|could not/i, 'Welcome message not sent'),
      errorFacts,
      labelled('memberId'),
      { must: /next|resend|manual/i, say: 'Say what happens next, such as next=manual resend.' },
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Welcome message not sent by Notify API memberId=$(vars.memberId) errorType=$(error.errorType) error=$(error.description) next=manual resend correlationId=$(correlationId)"]',
    },
    explain:
      'This line is the only record that the message was lost, so it must say who is affected and what to do. The member ID is enough to find the address in the member system.',
  },

  // ---------- lg-113 Wrenfield Logistics: Flow References and sub-flows ----------
  {
    id: 'log-6036',
    kind: 'level',
    situation:
      'The main flow of the Wrenfield Shipment Booking API calls the sub-flow validate-shipment with a Flow Reference. At the start of the sub-flow, a line says it was entered, with the shipment ID. You only need it when you trace one booking.',
    answer: ['DEBUG'],
    explain:
      'Entering a sub-flow is a step inside the app, not a business event. It is DEBUG detail for tracing one booking.',
  },
  {
    id: 'log-6037',
    kind: 'choice',
    situation:
      'Five Wrenfield sub-flows log with loggers that have no category. Operations want to raise only the rate lookup to DEBUG in production for one hour. Which logger lets them?',
    options: [
      `<logger level="DEBUG" message='#["Rate looked up carrier=$(vars.carrier) correlationId=$(correlationId)"]' />`,
      `<logger level="INFO" message='#["[RATES] Rate looked up carrier=$(vars.carrier)"]' />`,
      `<logger level="DEBUG" category="sub-flow" message='#["Rate looked up"]' />`,
      `<logger level="DEBUG" category="com.wrenfield.booking.rates" message='#["Rate looked up carrier=$(vars.carrier) correlationId=$(correlationId)"]' />`,
    ],
    answer: 3,
    explain:
      'A category per area lets operations raise com.wrenfield.booking.rates to DEBUG and leave the rest alone. A word inside the message does not change any log level.',
  },
  {
    id: 'log-6038',
    kind: 'multi',
    situation:
      'The Wrenfield main flow logs "Shipment booked shipmentId=... correlationId=..." at INFO. The sub-flow book-with-carrier, which the main flow calls, also logs "Shipment booked" at INFO with the same fields.',
    options: [
      'A sub-flow cannot have a Logger',
      'Every booking is counted twice in a Splunk count of "Shipment booked"',
      'Lines from a sub-flow get a new correlation ID',
      'A sub-flow runs with the same correlationId as the flow that calls it',
      'Keep one INFO line for the result, and make the other DEBUG or give it a different event',
    ],
    answers: [1, 3, 4],
    explain:
      'A sub-flow is part of the same event, so it has the same correlation ID. Two identical INFO lines double every count and dashboard built on them.',
  },
  {
    id: 'log-6039',
    kind: 'write',
    situation:
      'The Wrenfield private flow get-carrier-rate, called with a Flow Reference, has called the carrier rate API. Write its logger. vars.carrier, vars.shipmentId and vars.durationMs are set, and payload.rateAmount holds the rate.',
    available: ['vars.carrier', 'vars.shipmentId', 'vars.durationMs', 'payload.rateAmount', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/rate (received|returned|quoted)|received|returned/i, 'Carrier rate received'),
      labelled('carrier'),
      labelled('shipmentId'),
      durationVar,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Carrier rate received carrier=$(vars.carrier) rateAmount=$(payload.rateAmount) durationMs=$(vars.durationMs) shipmentId=$(vars.shipmentId) correlationId=$(correlationId)"]',
    },
    explain:
      'This is the line after a call to another system, so INFO with the carrier, the result and the time. The Flow Reference keeps the correlation ID, so it joins the main flow lines.',
  },
  {
    id: 'log-6040',
    kind: 'write',
    situation:
      "The Wrenfield sub-flow validate-shipment raises the custom error WRENFIELD:INVALID_SHIPMENT when the weight is over 30000 kg. The main flow's On Error Propagate catches it and answers 400. Write the logger there. vars.shipmentId is set.",
    available: ['vars.shipmentId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|invalid|not valid/i, 'Shipment rejected: validation failed'),
      errorFacts,
      labelled('shipmentId'),
      status(400),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Shipment rejected: validation failed errorType=$(error.errorType) error=$(error.description) status=400 shipmentId=$(vars.shipmentId) correlationId=$(correlationId)"]',
    },
    explain:
      'The error type WRENFIELD:INVALID_SHIPMENT tells the reader the sub-flow rejected it on purpose. The caller sent bad data and got a 400, so WARN.',
  },

  // ---------- lg-114 Oakridge Health: audit lines for claim decisions ----------
  {
    id: 'log-6041',
    kind: 'level',
    situation:
      'The Oakridge Claims Process API approved a claim automatically under the fast-track rule. The business wants a record of every decision for the yearly audit.',
    answer: ['INFO'],
    explain:
      'A business decision that went as designed is INFO. Audit lines must reach production, so never DEBUG.',
  },
  {
    id: 'log-6042',
    kind: 'choice',
    situation: 'Which Oakridge audit line is best for a claim that was approved automatically?',
    options: [
      'Claim decision: {"claimId":"C-77310","patient":{"name":"Lena Ortiz","diagnosis":"J45"},"amount":420.00}',
      'Claim approved :)',
      'Claim C-77310 processed',
      'Claim approved claimId=C-77310 rule=fast-track amount=420.00 decidedBy=system correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'An audit line says what was decided, on which record, by whom and under which rule. "processed" does not say approved or denied, and the dump holds health data.',
  },
  {
    id: 'log-6043',
    kind: 'multi',
    situation: 'An Oakridge audit logger for denied claims:',
    code: `<logger level="DEBUG" category="audit" message='#["Claim denied claimId=$(vars.claimId) correlationId=$(correlationId)"]' />`,
    options: [
      'Audit lines at DEBUG are off in production, so the decision is not recorded',
      'A category is not allowed on an audit line',
      'It does not say why the claim was denied, such as the rule or reason code',
      'The claim ID is personal data and must be left out',
      'It does not say who or what made the decision',
    ],
    answers: [0, 2, 4],
    explain:
      'An audit category is a good idea: the audit team can send it to its own store. The claim ID is a reference, not personal data. The line needs INFO, the reason and who decided.',
  },
  {
    id: 'log-6044',
    kind: 'write',
    situation:
      'An Oakridge claims officer overrode the automatic denial and approved a claim by hand. Write the audit line. vars.claimId, vars.officerId (the staff ID) and vars.reasonCode, such as RC-14, are set. payload.patient holds the name and the diagnosis.',
    available: ['vars.claimId', 'vars.officerId', 'vars.reasonCode', 'payload.patient', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/approved|overrid|override/i, 'Claim approved by manual override'),
      labelled('claimId'),
      labelled('officerId'),
      labelled('reasonCode'),
      corr,
      noPayload,
      { not: /patient|diagnosis/i, say: 'Leave out patient data. The claim ID is enough.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Claim approved by manual override claimId=$(vars.claimId) officerId=$(vars.officerId) reasonCode=$(vars.reasonCode) correlationId=$(correlationId)"]',
    },
    explain:
      'The officer ID records who made the decision, and the reason code records why. That is what an auditor asks for. Health data stays in the claims system.',
  },
  {
    id: 'log-6045',
    kind: 'write',
    situation:
      'The Oakridge audit team reads JSON from the audit category in Splunk. Write the line for a denied claim as one JSON object on one line, with event, claimId, rule, decidedBy and correlationId. vars.claimId and vars.rule are set, and decidedBy is "system".',
    available: ['vars.claimId', 'vars.rule', 'payload', 'payload.patient.dateOfBirth', 'correlationId'],
    level: ['INFO'],
    checks: [
      jsonOut,
      oneLine,
      event('denied|declin|reject', 'Claim denied'),
      labelled('claimId', 'claimId: vars.claimId'),
      labelled('rule', 'rule: vars.rule'),
      labelled('decidedBy', 'decidedBy: "system"'),
      jsonCorr,
      noPayload,
      noPersonal,
    ],
    model: {
      level: 'INFO',
      message: '#[output application/json indent=false --- { event: "Claim denied", claimId: vars.claimId, rule: vars.rule, decidedBy: "system", correlationId: correlationId }]',
    },
    explain:
      'With decidedBy as a field, the audit team can count system and manual decisions apart. A denial that follows the rules is a normal business event, so INFO.',
  },

  // ---------- lg-115 Cobalt Energy: metrics hidden in logs ----------
  {
    id: 'log-6046',
    kind: 'level',
    situation:
      'The Cobalt Meter Readings API takes POST /readings with up to 500 readings. A For Each checks each reading against the meter limits. You want one line per reading, with the meter ID and the value.',
    answer: ['DEBUG'],
    explain:
      'Up to 500 lines per request is too much for production. Log each reading at DEBUG and put the counts in one INFO line at the end.',
  },
  {
    id: 'log-6047',
    kind: 'choice',
    situation: 'Cobalt operations want a Splunk chart of request sizes and reading counts. Which last line of the request helps most?',
    options: [
      'Readings stored, lots of them',
      'Readings stored: 482 out of 500, 18 rejected, took about 0.7 s',
      'Readings saved stored=482 rejected=18 requestBytes=96210 durationMs=740 correlationId=7f3c2a',
      'Readings saved correlationId=7f3c2a',
    ],
    answer: 2,
    explain:
      'Each number has a label, so Splunk can chart it without parsing a sentence. The second option has the facts, but inside a sentence a tool cannot pick them out.',
  },
  {
    id: 'log-6048',
    kind: 'choice',
    situation: 'Which Cobalt message logs how many readings arrived without writing the readings?',
    options: [
      '#["Readings received $(payload.readings) correlationId=$(correlationId)"]',
      '#["Readings received count=$(payload.readings.count) correlationId=$(correlationId)"]',
      '#["Readings received count=" ++ write(payload)]',
      '#["Readings received count=$(sizeOf(payload.readings)) correlationId=$(correlationId)"]',
    ],
    answer: 3,
    explain:
      'sizeOf counts the items of the array. payload.readings.count looks for a count field in each reading, which does not exist, and the other two write the readings themselves.',
  },
  {
    id: 'log-6049',
    kind: 'multi',
    situation: 'Cobalt builds Splunk dashboards from the fields in its log lines. Which choices make the numbers on them trustworthy?',
    options: [
      'Use durationMs in one flow and took_ms in another, so the flows can be told apart',
      'Use the same field name, such as stored=, in every flow that stores readings',
      'Log the whole payload, so the dashboard can count the readings itself',
      'Keep the unit in the field name and only the number in the value, such as durationMs=740',
      'Write the counts once per request, after the work is done, not once per reading',
    ],
    answers: [1, 3, 4],
    explain:
      'A dashboard adds up fields by name, so one name per fact, with the unit in the name. The app name already tells flows apart, and a dashboard cannot count readings inside a dumped payload. Cobalt builds these charts in Splunk, because a dashboard built on log fields in Anypoint Monitoring needs the Titanium log-search tier.',
  },
  {
    id: 'log-6050',
    kind: 'write',
    situation:
      "Write the last line of Cobalt's POST /readings. vars.storedCount and vars.rejectedCount hold the counts, vars.durationMs the request time, and attributes.headers['content-length'] the size of the request in bytes.",
    available: ['vars.storedCount', 'vars.rejectedCount', 'vars.durationMs', "attributes.headers['content-length']", 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/stored|saved|processed|accepted/i, 'Readings saved'),
      { must: /vars\.storedCount/, say: 'Add how many were stored: stored=$(vars.storedCount).' },
      { must: /vars\.rejectedCount/, say: 'Add how many were rejected: rejected=$(vars.rejectedCount).' },
      { must: /content-length/i, say: "Add the request size: requestBytes=$(attributes.headers['content-length'])." },
      durationVar,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: `#["Readings saved stored=$(vars.storedCount) rejected=$(vars.rejectedCount) requestBytes=$(attributes.headers['content-length']) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]`,
    },
    explain:
      'One line per request with labelled numbers is a metric you get for free. Splunk can chart the size, the time and the reject rate from it, with no extra tool in the app.',
  },

  // ---------- lg-116 Fennwick Payments: Cache scope hits and misses ----------
  {
    id: 'log-6051',
    kind: 'level',
    situation:
      'The Fennwick Rates API wraps the call to the FX provider in a Cache scope with a 60-second expiry. The scope found no entry for EUR-GBP and called the provider. This happens about once a minute for each currency pair.',
    answer: ['DEBUG'],
    explain:
      'A cache miss is a normal part of how a cache works. It is detail for troubleshooting, so DEBUG.',
  },
  {
    id: 'log-6052',
    kind: 'choice',
    situation:
      'Mule does not log Cache scope hits or misses for you, so the team adds a logger of its own inside the Fennwick Cache scope, next to the FX provider call. Which line is best there?',
    options: [
      'Cache hit pair=EUR-GBP',
      'In cache scope',
      'Cache miss: {"pair":"EUR-GBP","rate":0.8571,"source":"provider"}',
      'Cache miss: FX provider called pair=EUR-GBP cache=fx-rates correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'On a hit the content of the scope does not run, so a line inside it can only mean a miss. The pair is the cache key, which tells you what was looked up.',
  },
  {
    id: 'log-6053',
    kind: 'multi',
    situation: 'During an incident the FX provider is down. The Fennwick Rates API keeps answering for some currency pairs and fails for others. Which statements are true?',
    options: [
      'Pairs whose cache entry has not expired are still served, so they do not fail yet',
      'A logger inside the Cache scope runs on every request, hit or miss',
      'A rise in "Cache miss" lines followed by provider errors shows when the entries ran out',
      'The Cache scope logs every hit at INFO by itself',
      'Logging the cache key, the currency pair, shows which pairs failed',
    ],
    answers: [0, 2, 4],
    explain:
      'The cache hides the outage until each entry expires. The miss lines and the pair on each error line show the outage spreading pair by pair.',
  },
  {
    id: 'log-6054',
    kind: 'write',
    situation:
      'Inside the Fennwick Cache scope, after the FX provider call, write the line for a miss. vars.pair holds the currency pair and vars.durationMs the call time.',
    available: ['vars.pair', 'vars.durationMs', 'payload', 'payload.rate', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/miss/i, 'Cache miss: FX rate fetched'),
      labelled('pair'),
      durationVar,
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'DEBUG', message: '#["Cache miss: FX rate fetched from provider pair=$(vars.pair) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]' },
    explain:
      'Misses are routine, so DEBUG. When you turn it on, a count of miss lines against the number of requests gives you the hit ratio.',
  },
  {
    id: 'log-6055',
    kind: 'write',
    situation:
      'On a Fennwick cache miss, the FX provider call failed. The On Error Continue serves the last known rate from an Object Store and marks it as stale. vars.pair holds the pair and vars.rateAgeSec how old the last known rate is, in seconds. Write the logger.',
    available: ['vars.pair', 'vars.rateAgeSec', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/stale|last known|fallback|old rate/i, 'Stale FX rate served: provider failed'),
      errorFacts,
      labelled('pair'),
      { must: /vars\.rateAgeSec/, say: 'Add how old the rate is: rateAgeSec=$(vars.rateAgeSec).' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stale FX rate served: provider failed pair=$(vars.pair) rateAgeSec=$(vars.rateAgeSec) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'The caller got a rate, so the flow handled it: WARN. rateAgeSec shows how far behind the rate is, which matters more the longer the provider is down.',
  },

  // ---------- lg-117 Quillstone Books: incident between two apps ----------
  {
    id: 'log-6056',
    kind: 'level',
    situation:
      'During a Quillstone incident you find that 37 orders reached the Web Order Experience API but never reached the Order Process API. The Experience API answered 202 to each. What level should its line have when the call to the Process API fails and the order is dropped?',
    answer: ['ERROR'],
    explain:
      'An order was lost and someone must act, so ERROR. Had this line existed at ERROR, an alert would have fired on the first lost order, not after 37 complaints.',
  },
  {
    id: 'log-6057',
    kind: 'choice',
    situation: 'A Quillstone customer complains about order WEB-55871. Which Splunk search finds every line of that request in both apps?',
    options: [
      'index=mule "WEB-55871"',
      'index=mule level=ERROR',
      'index=mule orderId=WEB-55871, then index=mule correlationId= followed by the ID that line shows',
      'index=mule app=order-experience-api earliest=-24h',
    ],
    answer: 2,
    explain:
      'Not every line carries the order ID, but every line carries the correlation ID. Find one line by the order ID, take its correlation ID, and search for that to see the whole request.',
  },
  {
    id: 'log-6058',
    kind: 'multi',
    situation:
      'You follow one Quillstone correlation ID. The Experience API has "Order received" and "Calling Order Process API" lines, then nothing. The Process API has no line with that ID. What can explain it?',
    options: [
      'Splunk drops every line that has a correlation ID',
      'The Process API never got the request, for example because of a network or gateway failure',
      'The Process API got it, but sendCorrelationId="NEVER" on the HTTP Request means its lines carry a different ID',
      'Correlation IDs only last for one minute',
      'The Experience API has no logger after the call and none in its error handler, so a failure there leaves no trace',
    ],
    answers: [1, 2, 4],
    explain:
      'A gap after "Calling" means the call never returned a logged result. Either the request did not arrive, it arrived under another ID, or the failure was not logged.',
  },
  {
    id: 'log-6059',
    kind: 'multi',
    situation: 'After the Quillstone incident, the team reviews the Experience API logger that comes after the Process API call:',
    code: `<logger level="INFO" message='#["Order forwarded"]' />`,
    options: [
      'It runs even when the call fails',
      'It does not give the order ID, so a complaint cannot be matched to it',
      'INFO is the wrong level for an order that was forwarded',
      'It carries no correlation ID of its own',
      'It does not give the status or the duration of the call',
    ],
    answers: [1, 3, 4],
    explain:
      'When the call fails, the flow goes to the error handler and this line does not run. That is why the error handler needs its own logger. A forward that worked is INFO. The correlation ID belongs in the message you control, so the line can be searched and joined wherever the log4j2 pattern does not print it in the prefix.',
  },
  {
    id: 'log-6060',
    kind: 'write',
    situation:
      'Write the Quillstone Experience API logger in the On Error Propagate for the call to the Order Process API, so the next incident is found at once. vars.orderId is set. The caller gets 502.',
    available: ['vars.orderId', 'error.errorType', 'error.description', 'payload', 'payload.customer.email', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not forwarded|could not/i, 'Order not forwarded to Order Process API'),
      errorFacts,
      labelled('orderId'),
      { must: /Process API|target|downstream/i, say: 'Name the system that failed, such as target=order-process-api.' },
      status(502),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Order not forwarded to Order Process API orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) status=502 correlationId=$(correlationId)"]',
    },
    explain:
      'An alert on this ERROR line finds the first lost order. The order ID matches complaints, and the error type tells you whether it was a timeout, a refused connection or a 500.',
  },

  // ---------- lg-118 Fellstone Outfitters: Transform failures ----------
  {
    id: 'log-6061',
    kind: 'level',
    situation:
      'In the Fellstone Catalog API, a Transform Message fails with MULE:EXPRESSION because one product in a partner catalog update has the price "N/A". The flow answers 400 to the partner, who must fix the data.',
    answer: ['WARN'],
    explain:
      "The partner's data was wrong and the flow answered with a 400, so WARN. Nobody on your team must act unless many partners start to fail.",
  },
  {
    id: 'log-6062',
    kind: 'choice',
    situation: 'Which Fellstone error handler line best helps the partner and support fix the failed catalog update?',
    options: [
      'Catalog update rejected: price is not a number errorType=MULE:EXPRESSION sku=FS-4471 field=price status=400 correlationId=7f3c2a',
      'Error occurred in Transform',
      'DataWeave failed: {"items":[{"sku":"FS-4471","price":"N/A", ...1,200 more items...}]}',
      'Catalog update rejected detail=(the whole error.detailedDescription, 40 lines with the input in it)',
    ],
    answer: 0,
    explain:
      'It names the product and the field, so the partner knows what to fix. The other lines say nothing, dump the input, or break one event into 40 lines.',
  },
  {
    id: 'log-6063',
    kind: 'multi',
    situation: 'In the Fellstone On Error Propagate for MULE:EXPRESSION, which answers 400:',
    code: '<logger level="ERROR" message="#[error.detailedDescription]" />',
    options: [
      'A DataWeave error can quote part of the input, which may hold personal data',
      'It can run over several lines, which breaks one event into many in Splunk',
      'error.detailedDescription is always empty for MULE:EXPRESSION',
      'It gives no product ID, and no correlation ID of its own',
      "A 400 caused by the partner's data fits WARN better than ERROR",
    ],
    answers: [0, 1, 3, 4],
    explain:
      'A DataWeave error message shows the script line and the value that broke it, over several lines. Log the error type and the product ID on one line, at WARN, with the correlation ID in the message you control. The log4j2 pattern usually prints the ID in the line prefix, and a line that carries it as a field can be searched and joined wherever the pattern does not.',
  },
  {
    id: 'log-6064',
    kind: 'write',
    situation:
      'Write the Fellstone On Error Propagate logger for MULE:EXPRESSION. vars.sku holds the product being mapped, set in a For Each, and vars.partnerId the partner. The flow answers 400.',
    available: ['vars.sku', 'vars.partnerId', 'error.errorType', 'error.detailedDescription', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|invalid|could not|not mapped|mapping fail/i, 'Catalog update rejected: mapping failed'),
      { must: /error\.errorType/, say: 'Add the error type: errorType=$(error.errorType).' },
      labelled('sku'),
      labelled('partnerId'),
      status(400),
      corr,
      noPayload,
      { not: /detailedDescription/, say: 'Leave out error.detailedDescription. It runs over many lines and can quote the input.' },
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Catalog update rejected: mapping failed errorType=$(error.errorType) sku=$(vars.sku) partnerId=$(vars.partnerId) status=400 correlationId=$(correlationId)"]',
    },
    explain:
      'The SKU and the partner ID point to the record to fix, and the error type says it was the mapping. The long DataWeave description stays out of the INFO and WARN log.',
  },
  {
    id: 'log-6065',
    kind: 'write',
    situation:
      'To find which value breaks the Fellstone mapping, the team adds a line before the Transform, used in the dev environment only. Write it as one JSON object on one line, with event, sku, priceType and correlationId. payload.sku holds the product, and typeOf(payload.price) as String gives the type of the price.',
    available: ['payload.sku', 'typeOf(payload.price) as String', 'payload', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      jsonOut,
      oneLine,
      event('map', 'Mapping catalog item'),
      labelled('sku', 'sku: payload.sku'),
      { must: /typeOf\(/, say: 'Add the type of the price: priceType: typeOf(payload.price) as String.' },
      jsonCorr,
      noPayload,
    ],
    model: {
      level: 'DEBUG',
      message:
        '#[output application/json indent=false --- { event: "Mapping catalog item", sku: payload.sku, priceType: typeOf(payload.price) as String, correlationId: correlationId }]',
    },
    explain:
      'A line that only helps while you troubleshoot is DEBUG. priceType: "String" next to the SKU shows at once which item carries text where a number belongs.',
  },

  // ---------- lg-119 Velo Rides: log sampling at high volume ----------
  {
    id: 'log-6066',
    kind: 'level',
    situation:
      'The Velo Fare Quote API takes 3000 requests a second, and the team now keeps only 1 in 100 of its "Quote returned" lines. A quote could not be priced because the Pricing Engine timed out, and the caller got 503.',
    answer: ['ERROR'],
    explain:
      'The work failed, so ERROR. Sampling is for the routine success lines. Each failure is rare and matters, so it is always written.',
  },
  {
    id: 'log-6067',
    kind: 'choice',
    situation: 'Velo samples its "Quote returned" lines, 1 in 100. Which kept line is best?',
    options: [
      'Quote returned (some lines dropped)',
      'Quote returned quoteId=Q-91 sampleRate=0.01 durationMs=38 correlationId=7f3c2a',
      'Quote returned quoteId=Q-91 durationMs=38',
      'Quote returned quoteId=Q-91 rider=Jo Park durationMs=38 correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'sampleRate tells anyone who counts these lines to multiply by 100. Without it, a dashboard shows 30 quotes a second instead of 3000.',
  },
  {
    id: 'log-6068',
    kind: 'multi',
    situation: 'Velo samples with a Choice router: when #[random() < 0.01] goes to the INFO logger. Which statements are true?',
    options: [
      'Warnings and errors must not be sampled, because they are rare and each one matters',
      'Sampling makes every line shorter',
      'A count of these lines in Splunk must be multiplied by 100 to estimate requests',
      'random() returns the same number for every request',
      'For one complaint, the line for that request is most likely not there, so a search by correlation ID may find nothing',
    ],
    answers: [0, 2, 4],
    explain:
      'random() gives a new number each time, so about 1 request in 100 is logged. You save volume but lose most single requests, which is why errors and warnings are never sampled.',
  },
  {
    id: 'log-6069',
    kind: 'write',
    situation:
      'Write the sampled Velo line in the Choice route for 1 in 100 requests. vars.quoteId and vars.durationMs are set. Mark the line with sampleRate=0.01.',
    available: ['vars.quoteId', 'vars.durationMs', 'payload', 'payload.rider.mobile', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/quote returned|quoted|priced/i, 'Quote returned'),
      labelled('quoteId'),
      { must: /sample/i, say: 'Mark the line as sampled, such as sampleRate=0.01, so counts can be scaled.' },
      durationVar,
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Quote returned quoteId=$(vars.quoteId) sampleRate=0.01 durationMs=$(vars.durationMs) correlationId=$(correlationId)"]' },
    explain:
      'The sample rate travels with the line, so nobody has to remember it when they build a chart. The rider phone number stays out at every level.',
  },
  {
    id: 'log-6070',
    kind: 'write',
    situation:
      'Every failed Velo quote must be kept. Write the line as one JSON object on one line, with event, quoteId, errorType, error, status, sampled: false and correlationId. The Pricing Engine timed out and the caller got 503. vars.quoteId is set.',
    available: ['vars.quoteId', 'error.errorType', 'error.errorType.namespace', 'error.errorType.identifier', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      jsonOut,
      oneLine,
      event('fail|not priced|timed out|could not', 'Quote failed: Pricing Engine timed out'),
      labelled('quoteId', 'quoteId: vars.quoteId'),
      errorFacts,
      status(503),
      { must: /sampled\s*"?\s*:\s*false/, say: 'Add sampled: false, so readers know every error line is kept.' },
      jsonCorr,
      noPayload,
    ],
    model: {
      level: 'ERROR',
      message:
        '#[output application/json indent=false --- { event: "Quote failed: Pricing Engine timed out", quoteId: vars.quoteId, errorType: error.errorType.namespace ++ ":" ++ error.errorType.identifier, error: error.description, status: 503, sampled: false, correlationId: correlationId }]',
    },
    explain:
      'sampled: false tells the reader this count is exact, unlike the success lines. The error type is written as text, such as HTTP:TIMEOUT, so it is one searchable value.',
  },

  // ---------- lg-120 Saltmarsh Outdoor: one order through four apps in Kibana ----------
  {
    id: 'log-6071',
    kind: 'level',
    situation:
      'The Saltmarsh Order Process API calls the Tax, Stock and Payment System APIs. At the end of each request it logs one line with the time each call took, such as taxMs=120 stockMs=340 payMs=610.',
    answer: ['INFO'],
    explain:
      'One line per request with the timings is a normal event and very useful in production. When an order is slow, it shows at once which system took the time.',
  },
  {
    id: 'log-6072',
    kind: 'choice',
    situation:
      'In Kibana, the other Saltmarsh apps log orderId, durationMs as a number, and correlationId. Which line from the Stock System API fits?',
    options: [
      '{"event":"Stock reserved","order_id":"SO-3381","corr":"7f3c2a","time":"340"}',
      '{"Event":"STOCK RESERVED","OrderID":"SO-3381","elapsed":"0.34s"}',
      'Stock reserved {"orderId":"SO-3381"} correlationId=7f3c2a',
      '{"event":"Stock reserved","orderId":"SO-3381","durationMs":340,"correlationId":"7f3c2a"}',
    ],
    answer: 3,
    explain:
      'The same names and a number for the duration let one Kibana query and one chart cover all four apps. The others rename fields, or mix text and JSON on one line.',
  },
  {
    id: 'log-6073',
    kind: 'multi',
    situation:
      'The Saltmarsh Order Process API calls the Tax, Stock and Payment System APIs. Which ways keep the same correlation ID in every app?',
    options: [
      'Set sendCorrelationId="ALWAYS" on the HTTP Request, so Mule sends the X-Correlation-ID header',
      'Add the header X-Correlation-ID with the value #[correlationId] on the HTTP Request',
      'Each System API makes its own ID with uuid() and logs that instead',
      'When an event goes out as a message, set the correlation ID as a user property on the connector',
      'Write the correlation ID only in the request body',
    ],
    answers: [0, 1, 3],
    explain:
      'The HTTP Listener of the next app reads X-Correlation-ID and uses it as its correlationId. For a message on a queue or a topic, carry the ID in a user property, which the consumer reads and logs. A new uuid() in each app breaks the chain, and a body field is not read as the correlation ID.',
  },
  {
    id: 'log-6074',
    kind: 'write',
    situation:
      'Write the Saltmarsh Order Process API last line as one JSON object on one line, with event, orderId, taxMs, stockMs, payMs, totalMs and correlationId. vars.timings holds tax, stock and pay times in ms, vars.totalMs the total and vars.orderId the order.',
    available: ['vars.orderId', 'vars.timings.tax', 'vars.timings.stock', 'vars.timings.pay', 'vars.totalMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      jsonOut,
      oneLine,
      event('processed|complet|placed', 'Order processed'),
      labelled('orderId', 'orderId: vars.orderId'),
      labelled('taxMs', 'taxMs: vars.timings.tax'),
      labelled('stockMs', 'stockMs: vars.timings.stock'),
      labelled('payMs', 'payMs: vars.timings.pay'),
      labelled('totalMs', 'totalMs: vars.totalMs'),
      jsonCorr,
      noPayload,
    ],
    model: {
      level: 'INFO',
      message:
        '#[output application/json indent=false --- { event: "Order processed", orderId: vars.orderId, taxMs: vars.timings.tax, stockMs: vars.timings.stock, payMs: vars.timings.pay, totalMs: vars.totalMs, correlationId: correlationId }]',
    },
    explain:
      'With each call time as a number, Kibana can show which system makes orders slow. The total next to the parts also shows time spent inside the app itself.',
  },
  {
    id: 'log-6075',
    kind: 'write',
    situation:
      'In the Saltmarsh chain, the Payment System API call failed with HTTP:SERVICE_UNAVAILABLE after the stock was reserved. The flow releases the stock and answers 503. Write the line as one JSON object on one line, with event, orderId, target, errorType, error, next and correlationId.',
    available: [
      'vars.orderId',
      'error.errorType',
      'error.errorType.namespace',
      'error.errorType.identifier',
      'error.description',
      'payload',
      'payload.card.number',
      'correlationId',
    ],
    level: ['ERROR'],
    checks: [
      jsonOut,
      oneLine,
      event('fail|not placed|could not', 'Payment failed: order not placed'),
      labelled('orderId', 'orderId: vars.orderId'),
      { must: /target\s*"?\s*:/, say: 'Name the system that failed, such as target: "payment-system-api".' },
      errorFacts,
      { must: /next\s*"?\s*:/, say: 'Say what happens next, such as next: "stock released".' },
      jsonCorr,
      noPayload,
      noSecrets,
    ],
    model: {
      level: 'ERROR',
      message:
        '#[output application/json indent=false --- { event: "Payment failed: order not placed", orderId: vars.orderId, target: "payment-system-api", errorType: error.errorType.namespace ++ ":" ++ error.errorType.identifier, error: error.description, next: "stock released", correlationId: correlationId }]',
    },
    explain:
      'The order was not placed, so ERROR. target names the system to look at, and next tells support the stock was released, so nothing is left half done.',
  },
]
