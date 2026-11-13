// Logging Lab exercises, set 5. See ../exercises.js for the format.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

// rules several exercises here share
const status = (code) => ({ must: new RegExp(`${code}|status`, 'i'), say: `Add the status you send back, such as status=${code}.` })
const noSecureProp = { not: /secure::/, say: 'Never log a secure:: property. A Logger writes it in clear text.' }
const nextStep = (re, example) => ({ must: re, say: `Say what happens next, such as ${example}.` })

export const SET_5 = [
  // ---------- lg-091 Greenleaf Garden Centres: On Error Continue or On Error Propagate ----------
  {
    id: 'log-5001',
    kind: 'level',
    situation:
      'The Greenleaf Store Finder API adds a weather forecast to each store page. The Weather API answers 503. An On Error Continue leaves the forecast out, and the API still returns 200 with the store details.',
    answer: ['WARN'],
    explain:
      'On Error Continue handled it and the customer still sees the store. Something unexpected happened, so WARN. ERROR would wake someone up for a missing forecast.',
  },
  {
    id: 'log-5002',
    kind: 'level',
    situation:
      'The Store Finder API cannot read the store list: the Stores System API answers 500 every time. An On Error Propagate returns 500 to the website, so the page shows no stores at all.',
    answer: ['ERROR'],
    explain:
      'The work failed and customers cannot find a store. On Error Propagate passes the failure to the caller, and someone must act, so ERROR.',
  },
  {
    id: 'log-5003',
    kind: 'choice',
    situation:
      'Which line fits best in the On Error Continue that catches HTTP:SERVICE_UNAVAILABLE from the Weather API? The store page is still returned, without a forecast.',
    options: [
      '#["Weather API error"]',
      '#["Forecast left out: Weather API unavailable errorType=$(error.errorType) storeId=$(vars.storeId) next=store returned without forecast correlationId=$(correlationId)"]',
      '#["ERROR!!! Weather API is down again " ++ write(error)]',
      '#["Forecast left out storeId=$(vars.storeId)"]',
    ],
    answer: 1,
    explain:
      'With On Error Continue the caller never sees the error, so the log line is the only trace. It must say what was left out, the error type, the store and what the flow did next.',
  },
  {
    id: 'log-5004',
    kind: 'multi',
    situation:
      'This is the only error handler of the Store Finder flow. When the Stores System API is down, the website gets 200 and an empty store list. What is wrong here?',
    code: '<on-error-continue type="ANY">\n  <logger level="DEBUG" message="#[error.description]" />\n</on-error-continue>',
    options: [
      'type="ANY" with On Error Continue hides real failures: the caller gets 200 when the store list could not be read',
      'At DEBUG the line is off in production, so nobody sees these errors',
      'The line has no correlation ID and no error type',
      'error.description cannot be read inside On Error Continue',
      'On Error Continue stops the flow and always sends 500 to the caller',
    ],
    answers: [0, 1, 2],
    explain:
      'error.description works in every handler. On Error Continue makes the flow end as a success, which is why it should only catch errors you can live with. Use On Error Propagate for a failed store list, and log at WARN or ERROR with errorType and correlationId.',
  },
  {
    id: 'log-5005',
    kind: 'write',
    situation:
      'The Stores System API answered 500. The On Error Propagate of the Store Finder flow returns 500 to the website. vars.regionId holds the region the customer searched. Write the logger in that handler.',
    available: ['vars.regionId', 'error.errorType', 'error.description', 'payload', 'attributes.headers', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|not (read|loaded)|unavailable/i, 'Store list not loaded'),
      errorFacts,
      labelled('regionId'),
      nextStep(/500|status|next\s*=/i, 'next=500 returned to the website'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Store list not loaded from Stores System API regionId=$(vars.regionId) errorType=$(error.errorType) error=$(error.description) next=500 returned to the website correlationId=$(correlationId)"]',
    },
    explain:
      'On Error Propagate sends the failure up, and this line tells support what failed, why, and what the customer got back. The region ID helps them check if one region or all of them fail.',
  },

  // ---------- lg-092 Thistlebank Credit Union: secure properties ----------
  {
    id: 'log-5006',
    kind: 'level',
    situation:
      'The Thistlebank Credit Union Member Notifications app starts. It loaded its secure properties from secure-prod.yaml. You log one line with the environment name and the properties file it loaded.',
    answer: ['INFO'],
    explain:
      'A start-up line is a normal event you want in production, once per start. It proves which settings the app runs with, without showing any secret value.',
  },
  {
    id: 'log-5007',
    kind: 'choice',
    situation: 'A developer wants a line that shows which mail server the notifications app uses. Which line is best?',
    options: [
      `#["SMTP config user=$(p('smtp.user')) password=$(p('secure::smtp.password'))"]`,
      `#["Mail settings loaded " ++ write(p('secure::smtp.password'))]`,
      '#["Config OK"]',
      `#["Mail settings loaded env=$(p('mule.env')) smtpHost=$(p('smtp.host')) smtpPort=$(p('smtp.port'))"]`,
    ],
    answer: 3,
    explain:
      'Host, port and environment are enough to see which server is used. A Logger does not mask a secure:: property: p() returns the decrypted value, so it lands in the log in clear text.',
  },
  {
    id: 'log-5008',
    kind: 'choice',
    situation:
      'The app reads a partner API key from secure::partner.apiKey. The team keeps a version label for each key in partner.keyVersion. You want a start-up line that proves the right key is loaded. Which line is best?',
    options: [
      `#["Partner key loaded key=$(p('secure::partner.apiKey'))"]`,
      `#["Partner key loaded keyStart=$(p('secure::partner.apiKey')[0 to 5])"]`,
      `#["Partner key loaded keyVersion=$(p('partner.keyVersion')) env=$(p('mule.env'))"]`,
      '#["Partner key loaded"]',
    ],
    answer: 2,
    explain:
      'The version label tells you which key is in use without any part of the key itself. Even the first characters of a key help an attacker, and a line with no facts proves nothing.',
  },
  {
    id: 'log-5009',
    kind: 'multi',
    situation: 'This line was found in the Member Notifications app before a production release. What is wrong with it?',
    code: `<logger level="DEBUG" category="com.harborcu.notify" message="#['Connecting to SMTP with ' ++ p('secure::smtp.password')]" />`,
    options: [
      'The SMTP credential is written in clear text. A Logger does not mask secure properties',
      'DEBUG is often turned on in production to troubleshoot, so the credential can reach the production log',
      'The Secure Properties module encrypts the value again when a Logger writes it',
      'Anyone who can read the log can now sign in to the mail server',
      'A category on a Logger stops it from writing secure values',
    ],
    answers: [0, 1, 3],
    explain:
      'Secure properties are encrypted in the file only. Once read, the value is plain text, and a Logger writes what it gets, at any level and with any category. Remove the line, and if the credential was logged, rotate it.',
  },
  {
    id: 'log-5010',
    kind: 'write',
    situation:
      'A Scheduler runs a mail server check every 5 minutes, so each check has its own event and correlation ID. The SMTP connection worked. Write the INFO line. vars.durationMs holds how long the check took.',
    available: [`p('mule.env')`, `p('smtp.host')`, `p('smtp.user')`, `p('secure::smtp.password')`, 'vars.durationMs', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/connect|reached|ready|verified|check passed/i, 'Mail server connection verified'),
      { must: /smtp\.host|host\s*=/i, say: `Name the mail server, such as host=$(p('smtp.host')).` },
      noSecureProp,
      noSecrets,
      corr,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: `#["Mail server connection verified env=$(p('mule.env')) host=$(p('smtp.host')) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]`,
    },
    explain:
      'The line proves the app reached the right server in the right environment. The host is enough to find it. The credential never goes in, at any level.',
  },

  // ---------- lg-093 Brightpath Insurance: Validation module errors ----------
  {
    id: 'log-5011',
    kind: 'level',
    situation:
      'In the Brightpath car quote API, validation:is-not-blank-string fails on vehicle.registration and raises VALIDATION:BLANK_STRING. An On Error Propagate returns 400 to the caller.',
    answer: ['WARN'],
    explain:
      'The caller sent bad data and the API handled it with a 400. Nothing is broken on your side, so WARN. Many of them in a short time can point to a broken client.',
  },
  {
    id: 'log-5012',
    kind: 'choice',
    situation:
      'Which line fits best in the handler for VALIDATION:INVALID_SIZE, raised because driver.licenceNumber has the wrong length?',
    options: [
      '#["Quote request rejected: driver.licenceNumber has wrong length errorType=$(error.errorType) quoteRef=$(vars.quoteRef) status=400 correlationId=$(correlationId)"]',
      '#["Bad licence number $(payload.driver.licenceNumber) for $(payload.driver.fullName)"]',
      '#["User sent garbage again!!!"]',
      '#[error]',
    ],
    answer: 0,
    explain:
      'Name the field and the check, not the value. A licence number and a name are personal data. No blame: the caller team reads these lines too.',
  },
  {
    id: 'log-5013',
    kind: 'multi',
    situation:
      'A validation:all scope checks four fields of a quote request. Two fail, so it raises VALIDATION:MULTIPLE, and the handler returns 400. What is wrong with its logger?',
    code: '<logger level="ERROR" message="#[payload]" />',
    options: [
      'ERROR pages the on-call team for a caller mistake that the API handled. WARN fits',
      'The whole quote request, with names and dates of birth, goes to the log',
      'It does not say which fields failed, while error.childErrors holds the individual failures',
      'VALIDATION:MULTIPLE cannot be caught by an error handler',
      'A request that gets a 400 must never be logged',
    ],
    answers: [0, 1, 2],
    explain:
      'VALIDATION:MULTIPLE is caught like any error, and a 400 deserves one WARN line. For this type the individual failures are in error.childErrors, so map them to a short list of field names, and add a reference and correlationId, not the payload.',
  },
  {
    id: 'log-5014',
    kind: 'multi',
    situation: 'A new developer on the quote API asks about the errors of the Validation module. Which statements are right?',
    options: [
      'error.errorType.namespace is VALIDATION for these errors',
      'error.errorType.identifier tells you which check failed, such as BLANK_STRING',
      'A failed validation stops the flow and goes to the error handler, like any other error',
      'error.cause holds the field value that failed, so log error.cause to see it',
      'Mule logs validation errors on its own, so they need no handler',
    ],
    answers: [0, 1, 2],
    explain:
      'error.cause is the underlying Java exception, not the value, and an unhandled validation error returns 500 instead of 400. Catch VALIDATION errors, log the identifier and error.description, and return 400.',
  },
  {
    id: 'log-5015',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for VALIDATION errors of the quote API. It returns 400. vars.quoteRef holds the quote reference.',
    available: ['vars.quoteRef', 'error.errorType.identifier', 'error.description', 'payload', 'payload.driver.dateOfBirth', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|invalid|failed validation|not valid/i, 'Quote request rejected'),
      { must: /error\.(errorType|description)/, say: 'Add which check failed: error.errorType.identifier and error.description.' },
      labelled('quoteRef'),
      status(400),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Quote request rejected check=$(error.errorType.identifier) reason=$(error.description) quoteRef=$(vars.quoteRef) status=400 correlationId=$(correlationId)"]',
    },
    explain:
      'The identifier says which rule failed and error.description says which field. With the quote reference, support can answer the caller without seeing the personal data.',
  },

  // ---------- lg-094 Pinecrest Libraries: Raise Error for business rules ----------
  {
    id: 'log-5016',
    kind: 'level',
    situation:
      'The Pinecrest Libraries Loans API refuses a loan because the member already has 10 books, the maximum. A Raise Error with type LOANS:LIMIT_REACHED goes to an On Error Propagate that returns 409.',
    answer: ['WARN', 'INFO'],
    explain:
      'The rule worked as designed and nothing needs fixing, so this is no ERROR. WARN lets the team count refusals. INFO is also fair, since a refused loan is a normal business event.',
  },
  {
    id: 'log-5017',
    kind: 'level',
    situation:
      'While building the loan limit rule in dev, you want a line before the Raise Error with the member ID, the current loan count and the limit, for every loan request.',
    answer: ['DEBUG'],
    explain:
      'Detail for building and checking a rule is DEBUG. It runs on every request, so at INFO it would fill the production log with lines nobody needs.',
  },
  {
    id: 'log-5018',
    kind: 'choice',
    situation: 'Which line fits best in the handler for LOANS:LIMIT_REACHED?',
    options: [
      '#["Loan refused"]',
      '#["Loan refused memberName=$(payload.member.name) memberAddress=$(payload.member.address)"]',
      '#["Loan refused: limit reached errorType=$(error.errorType) memberId=$(vars.memberId) loans=$(vars.loanCount) limit=10 status=409 correlationId=$(correlationId)"]',
      '#["MULE:UNKNOWN in loans flow"]',
    ],
    answer: 2,
    explain:
      'Your own error type, LOANS:LIMIT_REACHED, already says what happened. Add the member ID, the count and the limit, so the line explains itself. Names and addresses stay out.',
  },
  {
    id: 'log-5019',
    kind: 'multi',
    situation: 'A developer wrote this Raise Error for the loan limit. Which statements are right?',
    code: '<raise-error type="MULE:LIMIT" description="Too many loans" />',
    options: [
      'There is no MULE:LIMIT error type, and you can raise a core type only if it already exists. Use your own, such as LOANS:LIMIT_REACHED',
      'The description becomes error.description, so put the facts a reader needs in it, such as the limit',
      'A raised error cannot be caught by On Error Propagate',
      'Raise Error writes the payload to the log',
    ],
    answers: [0, 1],
    explain:
      'Raise Error accepts a core type that already exists, which is why the reference itself shows <raise-error type="MULE:CONNECTIVITY"/>, but MULE:LIMIT does not exist, so it is invalid. Connector namespaces such as HTTP or FILE cannot be raised at all. A raised error goes to the error handler like any other, and it logs nothing until a Logger or the default handler writes it.',
  },
  {
    id: 'log-5020',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for LOANS:LIMIT_REACHED. It returns 409. vars.memberId and vars.loanCount are set.',
    available: ['vars.memberId', 'vars.loanCount', 'error.errorType', 'error.description', 'payload.member.email', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/refused|rejected|limit|not allowed|denied/i, 'Loan refused: limit reached'),
      labelled('memberId'),
      { must: /vars\.loanCount/, say: 'Add how many loans the member has: loans=$(vars.loanCount).' },
      status(409),
      corr,
      noPersonal,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Loan refused: limit reached memberId=$(vars.memberId) loans=$(vars.loanCount) limit=10 errorType=$(error.errorType) status=409 correlationId=$(correlationId)"]',
    },
    explain:
      'A business refusal is not a failure, so WARN or INFO. The member ID lets a librarian look up the account, and the count shows the rule worked as it should.',
  },

  // ---------- lg-095 Copperleaf Coffee: Try scopes ----------
  {
    id: 'log-5021',
    kind: 'level',
    situation:
      'At Copperleaf Coffee, a Try scope wraps the call that adds loyalty points after a sale. Its On Error Continue catches HTTP:TIMEOUT, stores the points for a later run, and the sale goes on as normal.',
    answer: ['WARN'],
    explain:
      'The sale worked and the points will be added later, so nothing is lost. A WARN lets the team see when the loyalty system is often slow.',
  },
  {
    id: 'log-5022',
    kind: 'choice',
    situation: 'Which line fits best in the On Error Continue of that Try scope?',
    options: [
      '#["Try failed"]',
      '#["Loyalty error " ++ write(error)]',
      '#["Loyalty points not added cardNumber=$(payload.loyaltyCardNumber)"]',
      '#["Loyalty points not added yet: Loyalty API timed out errorType=$(error.errorType) saleId=$(vars.saleId) points=$(vars.points) next=queued for retry correlationId=$(correlationId)"]',
    ],
    answer: 3,
    explain:
      'Say what did not happen, why, and what comes next. write(error) tries to serialise the whole error object, which is not a structure DataWeave can write, so that line is more likely to fail than to tell you anything. A loyalty card number identifies a person, so log the sale ID.',
  },
  {
    id: 'log-5023',
    kind: 'multi',
    situation: 'A reviewer reads the Try scope around the loyalty call. Which are problems?',
    code: '<try>\n  <http:request config-ref="loyaltyApi" path="/points" method="POST" />\n  <error-handler>\n    <on-error-continue type="ANY">\n      <logger level="INFO" message="Loyalty skipped" />\n    </on-error-continue>\n  </error-handler>\n</try>',
    options: [
      'type="ANY" also swallows HTTP:UNAUTHORIZED, a setup fault that a later retry will not fix',
      'INFO hides a handled failure among normal events. WARN fits',
      '"Loyalty skipped" has no sale ID, no error type and no correlation ID',
      'An error inside a Try scope always ends the whole flow',
      'A Logger is not allowed inside the error handler of a Try scope',
    ],
    answers: [0, 1, 2],
    explain:
      'With On Error Continue in a Try, the flow goes on after the Try scope, which is the point here. Catch only the errors you expect, such as HTTP:TIMEOUT, and let the others propagate so they are seen.',
  },
  {
    id: 'log-5024',
    kind: 'write',
    situation:
      'Write the logger in the On Error Continue of the loyalty Try scope, for HTTP:TIMEOUT. The points are queued for a later run. vars.saleId and vars.points are set.',
    available: ['vars.saleId', 'vars.points', 'error.errorType', 'error.description', 'payload', 'payload.loyaltyCardNumber', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/not added|failed|timed out|timeout|could not/i, 'Loyalty points not added'),
      errorFacts,
      labelled('saleId'),
      nextStep(/next\s*=|queued|later|retry/i, 'next=queued for retry'),
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Loyalty points not added: Loyalty API timed out saleId=$(vars.saleId) points=$(vars.points) errorType=$(error.errorType) error=$(error.description) next=queued for retry correlationId=$(correlationId)"]',
    },
    explain:
      'The sale is safe and the points are queued, so WARN. The next= part tells support they do not have to add points by hand.',
  },
  {
    id: 'log-5025',
    kind: 'write',
    situation:
      'After the Try scope, the sale flow ends. vars.loyaltyStatus is ADDED or QUEUED, set inside the Try. Write the last INFO line of the flow.',
    available: ['vars.saleId', 'vars.storeId', 'vars.loyaltyStatus', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/completed|recorded|finished|sale (saved|closed)/i, 'Sale completed'),
      { must: /vars\.loyaltyStatus/, say: 'Add how the loyalty step ended: loyalty=$(vars.loyaltyStatus).' },
      labelled('saleId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Sale completed saleId=$(vars.saleId) storeId=$(vars.storeId) loyalty=$(vars.loyaltyStatus) correlationId=$(correlationId)"]',
    },
    explain:
      'One closing line shows the result of the whole flow, including the part that the Try scope handled. Counting QUEUED against ADDED shows how often the loyalty system lets you down.',
  },

  // ---------- lg-096 Kestrel Freight: global error handler and error mapping ----------
  {
    id: 'log-5026',
    kind: 'level',
    situation:
      'The Kestrel Freight tracking app has a global error handler, set with defaultErrorHandler-ref. It catches a MULE:EXPRESSION error from a broken DataWeave script that no flow handled, and returns 500.',
    answer: ['ERROR'],
    explain:
      'An unhandled error that reaches the global handler is a bug or an outage nobody planned for. The request failed and a developer must look, so ERROR.',
  },
  {
    id: 'log-5027',
    kind: 'choice',
    situation:
      'An error mapping turns HTTP:NOT_FOUND from the carrier call into TRACKING:UNKNOWN_SHIPMENT. Which line fits best in the On Error Propagate for TRACKING:UNKNOWN_SHIPMENT, which returns 404?',
    options: [
      '#["HTTP:NOT_FOUND"]',
      '#["Shipment not found at carrier errorType=$(error.errorType) shipmentId=$(vars.shipmentId) status=404 correlationId=$(correlationId)"]',
      '#["Shipment not found " ++ write(error.errorMessage.payload)]',
      '#["Tracking failed for $(attributes.headers.authorization)"]',
    ],
    answer: 1,
    explain:
      'The mapped type says in your own words what went wrong. error.errorMessage holds the carrier response, which can be large and full of customer data, and an authorization header never goes in a log.',
  },
  {
    id: 'log-5028',
    kind: 'multi',
    situation: 'The global error handler of the Kestrel Freight app is used by all 12 flows. What is wrong with its only logger?',
    code: `<logger level="ERROR" message="#['Error: ' ++ error.description]" />`,
    options: [
      'It does not log error.errorType, so you cannot count failures by type',
      'It does not say which flow failed. Add flow.name',
      'It has no correlation ID',
      'A global error handler cannot read error.description',
      'A global error handler only catches errors from the first flow in the app',
    ],
    answers: [0, 1, 2],
    explain:
      'The global handler catches errors from every flow that has no handler of its own, so the line must say which flow and which error type. Without correlationId you cannot find the rest of the request.',
  },
  {
    id: 'log-5029',
    kind: 'write',
    situation: 'Write the logger of the global error handler. It returns 500 for any error that reached it.',
    available: ['flow.name', 'error.errorType', 'error.description', 'error.detailedDescription', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/unhandled|not handled|failed/i, 'Unhandled error'),
      errorFacts,
      { must: /flow\.name/, say: 'Add which flow failed: flow=$(flow.name).' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Unhandled error flow=$(flow.name) errorType=$(error.errorType) error=$(error.description) status=500 correlationId=$(correlationId)"]',
    },
    explain:
      'This is the last safety net. The flow name and error type tell a developer where to add a proper handler, and correlationId finds the lines that came before.',
  },
  {
    id: 'log-5030',
    kind: 'write',
    situation:
      'An error mapping turns HTTP:SERVICE_UNAVAILABLE from the carrier into TRACKING:CARRIER_DOWN. Its On Error Propagate returns 503. vars.carrier and vars.shipmentId are set. Write the logger.',
    available: ['vars.carrier', 'vars.shipmentId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/unavailable|carrier down|failed|could not/i, 'Tracking failed: carrier unavailable'),
      errorFacts,
      labelled('carrier'),
      labelled('shipmentId'),
      status(503),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Tracking failed: carrier unavailable carrier=$(vars.carrier) shipmentId=$(vars.shipmentId) errorType=$(error.errorType) error=$(error.description) status=503 correlationId=$(correlationId)"]',
    },
    explain:
      'The carrier name shows at once if one carrier or all of them are down. ERROR fits when customers get no tracking, and WARN is fair if the outage is short and on the carrier side.',
  },

  // ---------- lg-097 Meadowbrook Pharmacy: Until Successful ----------
  {
    id: 'log-5031',
    kind: 'level',
    situation:
      'At Meadowbrook Pharmacy, an Until Successful scope sends a prescription refill to the Dispensing API. You log a line before each attempt, including the first one, which works almost every time.',
    answer: ['DEBUG'],
    explain:
      'A line before every call adds nothing in production when the call works. Keep it at DEBUG, and log failed attempts and the final result at higher levels.',
  },
  {
    id: 'log-5032',
    kind: 'choice',
    situation:
      'The Until Successful has maxRetries="4". All attempts failed and Mule raised MULE:RETRY_EXHAUSTED. Which line fits best in its handler?',
    options: [
      '#["Retry exhausted"]',
      '#["Refill failed, will retry"]',
      '#["Refill not sent to Dispensing API after 5 attempts errorType=$(error.errorType) cause=$(error.description) refillId=$(vars.refillId) next=pharmacist alerted correlationId=$(correlationId)"]',
      '#["Refill failed for patient $(payload.patient.name) born $(payload.patient.dateOfBirth)"]',
    ],
    answer: 2,
    explain:
      'maxRetries="4" means one call and 4 retries, so 5 attempts. No retry is left, so "will retry" misleads. Say what failed, how often it tried and what happens next, with an ID and no patient data.',
  },
  {
    id: 'log-5033',
    kind: 'multi',
    situation: 'A reviewer reads this refill flow. Which are problems?',
    code: `<until-successful maxRetries="4" millisBetweenRetries="3000">\n  <http:request config-ref="dispensingApi" path="/refills" method="POST" />\n  <logger level="ERROR" message="#['Refill call attempt']" />\n</until-successful>`,
    options: [
      'The logger runs only after a call that worked, yet it logs at ERROR',
      'It says nothing about which refill it is or which attempt',
      'When all attempts fail, Mule raises MULE:RETRY_EXHAUSTED, and nothing here logs it',
      'maxRetries="4" means the call is made 4 times in total',
      'The runtime already logs each failed attempt at ERROR, so a WARN of your own per attempt adds nothing',
    ],
    answers: [0, 1, 2],
    explain:
      'The call is made up to 5 times: once, then 4 retries. The runtime does log every failed attempt at ERROR, with text such as "Retrying execution of event, attempt 1 of 5", but that line carries none of your context: no correlation ID, no refill ID, no next= step. So add a handler for MULE:RETRY_EXHAUSTED, and a WARN of your own for each failed attempt.',
  },
  {
    id: 'log-5034',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for MULE:RETRY_EXHAUSTED. The refill was not sent after 5 attempts and a pharmacist is alerted. vars.refillId and vars.pharmacyId are set.',
    available: ['vars.refillId', 'vars.pharmacyId', 'error.errorType', 'error.description', 'payload', 'payload.patient.dateOfBirth', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/not sent|failed|gave up|exhausted|could not/i, 'Refill not sent after 5 attempts'),
      errorFacts,
      labelled('refillId'),
      { must: /attempt|retries|tries/i, say: 'Say how many times it tried, such as attempts=5.' },
      nextStep(/next\s*=|alert|manual|pharmacist/i, 'next=pharmacist alerted'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Refill not sent to Dispensing API refillId=$(vars.refillId) pharmacyId=$(vars.pharmacyId) attempts=5 errorType=$(error.errorType) error=$(error.description) next=pharmacist alerted correlationId=$(correlationId)"]',
    },
    explain:
      'A patient may wait for medicine, so ERROR. error.description of RETRY_EXHAUSTED carries the last failure. The refill ID is enough for the pharmacist; the patient data stays out.',
  },
  {
    id: 'log-5035',
    kind: 'write',
    situation:
      'The team put a Try scope inside the Until Successful. Its On Error Propagate logs each failed attempt and passes the error on, so Until Successful retries. The team keeps the attempt number in vars.attempt. Write that logger.',
    available: ['vars.attempt', 'vars.refillId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/attempt|failed|retry|timed out/i, 'Dispensing API call failed, will retry'),
      { must: /vars\.attempt/, say: 'Add which attempt this was: attempt=$(vars.attempt).' },
      errorFacts,
      labelled('refillId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Dispensing API call failed, will retry attempt=$(vars.attempt) maxAttempts=5 refillId=$(vars.refillId) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'A failed attempt that will be retried is handled, so WARN. The attempt number shows how close the refill came to running out of retries.',
  },

  // ---------- lg-098 Silverline Telecom: reconnection strategies ----------
  {
    id: 'log-5036',
    kind: 'level',
    situation:
      'At Silverline Telecom, the staff lookup flow wraps the LDAP search in an Until Successful. The first search fails with LDAP:CONNECTIVITY while the connection is being opened again, the retry 5 seconds later works, and vars.attempt holds 2. You log one line for the lookup that needed 2 attempts.',
    answer: ['WARN'],
    explain:
      'The lookup worked in the end, so this is not an ERROR. But it needed a second attempt, which is unexpected, and the flow knows that because it caught the first failure itself. A WARN helps spot a directory server that is getting slow to answer.',
  },
  {
    id: 'log-5037',
    kind: 'choice',
    situation:
      'All reconnection attempts to LDAP failed during a staff lookup and the operation raised LDAP:CONNECTIVITY. Which line fits best in the handler, which returns 503?',
    options: [
      '#["Staff lookup failed: LDAP not reachable after reconnection errorType=$(error.errorType) error=$(error.description) staffId=$(vars.staffId) status=503 correlationId=$(correlationId)"]',
      `#["LDAP bind failed for cn=svc-mule,ou=apps with $(p('secure::ldap.password'))"]`,
      '#["Error occurred in LDAP, please check"]',
      '#["Staff lookup failed " ++ write(error)]',
    ],
    answer: 0,
    explain:
      'Say which work failed, the error type and description, and what the caller got. The bind credential never goes in a log, and a vague line sends support looking in the wrong place.',
  },
  {
    id: 'log-5038',
    kind: 'multi',
    situation: 'The LDAP connection of the staff app has this reconnection strategy. Which statements are right?',
    code: '<reconnection failsDeployment="true">\n  <reconnect frequency="5000" count="3" />\n</reconnection>',
    options: [
      'It retries opening the connection. It does not retry a request that the server answered with an error',
      'When the attempts run out, the operation fails with an error, such as LDAP:CONNECTIVITY, that your handler should log',
      'count="3" means the app stops after 3 failed requests and never connects again',
      'With a reconnection strategy, a failed connection never shows in the log',
      'failsDeployment="true" makes a deployment fail when LDAP cannot be reached, and the deployment log shows why',
    ],
    answers: [0, 1, 4],
    explain:
      'A reconnection strategy is about the connection, not about the answers. Each new operation tries to connect again, so count="3" is per attempt to connect. failsDeployment="true" stops a broken app from looking healthy after a deployment.',
  },
  {
    id: 'log-5039',
    kind: 'write',
    situation:
      'Write the logger in the On Error Propagate for LDAP:CONNECTIVITY in the staff lookup flow. It returns 503. vars.staffId is set.',
    available: ['vars.staffId', 'error.errorType', 'error.description', `p('ldap.url')`, `p('secure::ldap.password')`, 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not reachable|unreachable|could not|lost/i, 'Staff lookup failed: LDAP not reachable'),
      errorFacts,
      labelled('staffId'),
      status(503),
      noSecureProp,
      noSecrets,
      corr,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Staff lookup failed: LDAP not reachable after reconnection staffId=$(vars.staffId) errorType=$(error.errorType) error=$(error.description) status=503 correlationId=$(correlationId)"]',
    },
    explain:
      'The reconnection strategy already tried, so the directory is really down and staff cannot be looked up. ERROR, with the error facts and what the caller got.',
  },
  {
    id: 'log-5040',
    kind: 'write',
    situation:
      'A health flow notices that the LDAP connection works again after an outage. vars.downSeconds holds how long it was down. Write the line.',
    available: [`p('ldap.url')`, 'vars.downSeconds', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/recovered|restored|reconnected|back|available again/i, 'LDAP connection restored'),
      { must: /vars\.downSeconds/, say: 'Add how long it was down: downSeconds=$(vars.downSeconds).' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: `#["LDAP connection restored url=$(p('ldap.url')) downSeconds=$(vars.downSeconds) correlationId=$(correlationId)"]`,
    },
    explain:
      'The end of an outage matters as much as the start: it tells the team they can stand down, and how long it lasted. INFO or WARN both fit.',
  },

  // ---------- lg-099 Caldera Pay: card data ----------
  {
    id: 'log-5041',
    kind: 'level',
    situation:
      'In the Caldera Pay checkout app, the card gateway authorised a payment. You log the payment ID, the authorisation code, the last 4 card digits and the amount.',
    answer: ['INFO'],
    explain:
      'A payment that worked is a normal event you want in production. The last 4 digits are allowed under PCI DSS; the full number never is.',
  },
  {
    id: 'log-5042',
    kind: 'choice',
    situation: 'The gateway returns cardLast4 in its answer, and the flow keeps it in vars.cardLast4. Which line fits best after the charge?',
    options: [
      '#["Card charged card=$(payload.card.number) cvv=$(payload.card.cvv)"]',
      '#["Card charged card=$(payload.card.number[0 to 11])"]',
      '#["Card charged"]',
      '#["Card charged paymentId=$(vars.paymentId) cardLast4=$(vars.cardLast4) amount=$(vars.amount) currency=$(vars.currency) correlationId=$(correlationId)"]',
    ],
    answer: 3,
    explain:
      'The last 4 digits are enough to answer "which card?". The first 12 digits plus the last 4 the receipt shows rebuild the whole number, and the CVV may never be stored, not even in a log.',
  },
  {
    id: 'log-5043',
    kind: 'multi',
    situation:
      'Before the gateway call, payload holds card.number, card.expiry, card.cvv and amount. Which statements about this line are right?',
    code: `<logger level="DEBUG" category="com.lumenpay.checkout" message="#['Gateway request: ' ++ write(payload)]" />`,
    options: [
      'The full card number and CVV reach the log whenever DEBUG is on for this category',
      'PCI DSS forbids storing the CVV after authorisation, and a log line is stored data',
      'CloudHub drops DEBUG lines, so this is safe',
      'Log a payment ID and the last 4 digits instead, never the card fields',
      'write() encrypts the payload before the Logger writes it',
    ],
    answers: [0, 1, 3],
    explain:
      'DEBUG lines are written whenever the category is set to DEBUG, in any environment. write() turns data into text, it encrypts nothing. Card fields must never reach a log line.',
  },
  {
    id: 'log-5044',
    kind: 'write',
    situation:
      'The gateway declined the card. The flow returns 402 to the shop. vars.paymentId, vars.cardLast4 and vars.declineCode are set. Write the logger.',
    available: ['vars.paymentId', 'vars.cardLast4', 'vars.declineCode', 'payload.card.number', 'payload.card.cvv', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/declined|refused|not authori[sz]ed/i, 'Card payment declined'),
      labelled('paymentId'),
      { must: /vars\.declineCode/, say: 'Add why the bank declined it: declineCode=$(vars.declineCode).' },
      noSecrets,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Card payment declined paymentId=$(vars.paymentId) cardLast4=$(vars.cardLast4) declineCode=$(vars.declineCode) status=402 correlationId=$(correlationId)"]',
    },
    explain:
      'A decline is a normal answer from the bank, so WARN or INFO, not ERROR. The decline code tells support why, without any card data.',
  },
  {
    id: 'log-5045',
    kind: 'write',
    situation:
      'In dev, a developer wants to see the shape of the gateway request. An earlier step built vars.maskedRequest, a copy of the request with card.number and card.cvv replaced by ****. Write the DEBUG line.',
    available: ['vars.maskedRequest', 'vars.paymentId', 'payload', 'payload.card.cvv', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/request|sending|built/i, 'Gateway request built'),
      { must: /vars\.maskedRequest/, say: 'Log the masked copy: vars.maskedRequest.' },
      noPayload,
      noSecrets,
      corr,
    ],
    model: {
      level: 'DEBUG',
      message: `#["Gateway request built paymentId=$(vars.paymentId) request=$(write(vars.maskedRequest, 'application/json', {indent: false})) correlationId=$(correlationId)"]`,
    },
    explain:
      'Mask first, then log. The masked copy shows the shape of the request, and DEBUG keeps it out of normal production logs. Even then, no card field reaches the line.',
  },

  // ---------- lg-100 Fjordvik Clinics: personal data and GDPR ----------
  {
    id: 'log-5046',
    kind: 'level',
    situation:
      'At Fjordvik Clinics a patient asked to be forgotten. The erasure flow deleted their records in 3 systems. You log the result for the data protection team.',
    answer: ['INFO'],
    explain:
      'The erasure worked, and the team needs proof that it ran. That is a normal event you keep in production, so INFO, with a request ID and no personal data.',
  },
  {
    id: 'log-5047',
    kind: 'choice',
    situation: 'Which line fits best when a booking is created in the patient booking app?',
    options: [
      '#["Booking created bookingId=$(vars.bookingId) patientRef=$(vars.patientRef) clinicId=$(vars.clinicId) correlationId=$(correlationId)"]',
      '#["Booking created for $(payload.patient.firstName) $(payload.patient.lastName), born $(payload.patient.dateOfBirth)"]',
      '#["Booking created patientId=$(vars.patientId) email=$(payload.patient.email)"]',
      '#["Booking created " ++ write(payload.patient)]',
    ],
    answer: 0,
    explain:
      'A reference that only the clinic systems can resolve is enough to find the patient when needed. Names, birth dates and email addresses in logs spread to every tool that reads them.',
  },
  {
    id: 'log-5048',
    kind: 'multi',
    situation: 'The Fjordvik data protection officer reviews the logging rules. Which statements are right?',
    options: [
      'A patient ID is still personal data under GDPR if it can be linked to the person, so keep access to logs limited',
      'Logs kept for years with names in them make an erasure request very hard to honour',
      'Health data in logs is fine when the level is DEBUG',
      'Masking with a DataWeave function before the Logger keeps names and contact details out of the line',
      'GDPR applies only to databases, not to log files',
    ],
    answers: [0, 1, 3],
    explain:
      'GDPR covers personal data wherever it is stored, logs included, at any level. The fewer personal fields reach a log, the less you must find and delete later.',
  },
  {
    id: 'log-5049',
    kind: 'write',
    situation:
      'Write the line at the end of the erasure flow. vars.erasureRequestId holds the request ID and vars.systemsCleared the number of systems cleared.',
    available: ['vars.erasureRequestId', 'vars.patientRef', 'vars.systemsCleared', 'payload.patient.email', 'payload.patient.fullName', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/erased|deleted|removed|erasure (completed|finished)/i, 'Patient data erased'),
      labelled('erasureRequestId'),
      { must: /vars\.systemsCleared/, say: 'Add how many systems were cleared: systems=$(vars.systemsCleared).' },
      { not: /fullName|firstName|lastName/i, say: 'Leave out the name. The request ID is enough.' },
      noPersonal,
      corr,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Patient data erased erasureRequestId=$(vars.erasureRequestId) systems=$(vars.systemsCleared) correlationId=$(correlationId)"]',
    },
    explain:
      'The request ID proves the erasure ran, without writing down whose data it was. A name in this very line would undo part of the erasure.',
  },
  {
    id: 'log-5050',
    kind: 'write',
    situation:
      'The SMS reminder step finds no consent field at all in the patient record, not yes and not no. It skips the SMS and the booking goes on. vars.bookingId and vars.patientRef are set. Write the logger.',
    available: ['vars.bookingId', 'vars.patientRef', 'payload.patient.mobile', 'payload.patient.email', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/skip|no consent|not sent|missing/i, 'SMS reminder skipped: consent missing'),
      labelled('bookingId'),
      noPersonal,
      noPayload,
      corr,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["SMS reminder skipped: consent field missing bookingId=$(vars.bookingId) patientRef=$(vars.patientRef) correlationId=$(correlationId)"]',
    },
    explain:
      'The data is not as expected, so WARN: someone should fix the record. The mobile number is the very thing you may not use without consent, so it stays out of the log too.',
  },

  // ---------- lg-101 Alder Bank: log4j2.xml on a customer-hosted runtime ----------
  {
    id: 'log-5051',
    kind: 'choice',
    situation:
      'The category org.mule.service.http.impl.service.HttpMessageLogger writes full HTTP request and response bodies when it is at DEBUG. Which entry belongs in the production log4j2.xml of Alder Bank?',
    options: [
      '<AsyncLogger name="org.mule.service.http.impl.service.HttpMessageLogger" level="DEBUG" />',
      '<AsyncLogger name="org.mule.service.http.impl.service.HttpMessageLogger" level="TRACE" />',
      '<AsyncLogger name="org.mule.service.http.impl.service.HttpMessageLogger" level="WARN" />',
      '<AsyncRoot level="DEBUG">\n  <AppenderRef ref="file" />\n</AsyncRoot>',
    ],
    answer: 2,
    explain:
      'Any threshold above DEBUG keeps the wire logs off, and WARN still lets a real HTTP problem through. DEBUG and TRACE both write every body and header, with tokens and card data in them. A root at DEBUG turns the wire logs on along with everything else. Raise this one category to DEBUG only in a lower environment, for a short time.',
  },
  {
    id: 'log-5052',
    kind: 'choice',
    situation:
      'Alder Bank sets levels per package in log4j2.xml, under com.alderbank.payments. Which logger fits the fraud check result best?',
    options: [
      `<logger level="INFO" message="#['Fraud check done']" />`,
      `<logger level="INFO" category="com.alderbank.payments.fraud" message='#["Fraud check passed paymentId=$(vars.paymentId) score=$(vars.fraudScore) correlationId=$(correlationId)"]' />`,
      `<logger level="INFO" category="mylogger" message='#["Fraud check passed paymentId=$(vars.paymentId)"]' />`,
      `<logger level="ERROR" category="com.alderbank.payments.fraud" message='#["Fraud check passed paymentId=$(vars.paymentId) correlationId=$(correlationId)"]' />`,
    ],
    answer: 1,
    explain:
      'A category under the package lets operations raise only fraud logging in log4j2.xml. "mylogger" fits no package rule, and ERROR for a check that passed would fill the alerts.',
  },
  {
    id: 'log-5053',
    kind: 'multi',
    situation: 'This is part of the production log4j2.xml of the payments app, found after a disk-full alert. Which statements are right?',
    code: '<Loggers>\n  <AsyncLogger name="com.alderbank" level="DEBUG" />\n  <AsyncLogger name="org.mule.service.http.impl.service.HttpMessageLogger" level="DEBUG" />\n  <AsyncRoot level="INFO">\n    <AppenderRef ref="file" />\n  </AsyncRoot>\n</Loggers>',
    options: [
      'com.alderbank at DEBUG turns on every DEBUG line of the bank flows in production',
      'The HTTP wire logger at DEBUG writes full request and response bodies, with card data and headers',
      'AsyncRoot level="INFO" means the DEBUG lines above are dropped',
      'AsyncLogger cannot be used together with AsyncRoot',
      'Set both back to INFO or WARN, and raise one narrow category only for a short time when needed',
    ],
    answers: [0, 1, 4],
    explain:
      'A named logger has its own level, so it wins over the root for its package. AsyncLogger and AsyncRoot are meant to be used together. Two DEBUG categories in production fill disks and leak data.',
  },
  {
    id: 'log-5054',
    kind: 'multi',
    situation: 'The payments app writes to this appender on its own Mule runtime. Which statements are right?',
    code: '<RollingFile name="file" fileName="${sys:mule.home}/logs/payments.log"\n             filePattern="${sys:mule.home}/logs/payments-%i.log">\n  <PatternLayout pattern="%d [%t] %-5p %c - %m%n" />\n  <SizeBasedTriggeringPolicy size="10 MB" />\n  <DefaultRolloverStrategy max="10" />\n</RollingFile>',
    options: [
      'When payments.log reaches 10 MB, it is renamed and a new file starts',
      'At most 10 old files are kept, so about 110 MB in total, and older lines are deleted',
      'This appender keeps every log line forever',
      'At a high log volume, 10 files may cover only a few hours, so lines from yesterday can be gone',
      '%c in the pattern prints the correlation ID',
    ],
    answers: [0, 1, 3],
    explain:
      '%c prints the logger category, which is why categories matter. A rolling file keeps a fixed size, so noisy logging shortens how far back you can look. Forward logs to a central tool if you need more.',
  },
  {
    id: 'log-5055',
    kind: 'write',
    situation:
      'Operations raised com.alderbank.payments.refunds to DEBUG for one hour to trace a wrong refund amount. Write the DEBUG line that shows the refund calculation.',
    available: ['vars.refundId', 'vars.originalAmount', 'vars.feeAmount', 'vars.refundAmount', 'payload', 'payload.account.iban', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/refund/i, 'Refund calculated'),
      labelled('refundId'),
      { must: /vars\.refundAmount/, say: 'Add the result of the calculation: refundAmount=$(vars.refundAmount).' },
      { not: /iban|account/i, say: 'Leave out the account number. The refund ID is enough.' },
      noPayload,
      corr,
      noVague,
    ],
    model: {
      level: 'DEBUG',
      message:
        '#["Refund calculated refundId=$(vars.refundId) originalAmount=$(vars.originalAmount) feeAmount=$(vars.feeAmount) refundAmount=$(vars.refundAmount) correlationId=$(correlationId)"]',
    },
    explain:
      'The inputs and the result of the calculation show where the amount goes wrong. It is DEBUG, so it only appears while the category is raised. The account number is never needed for that.',
  },

  // ---------- lg-102 Tidewater Retail: log volume and cost ----------
  {
    id: 'log-5056',
    kind: 'level',
    situation:
      'The Tidewater Price API takes 300 requests per second. A developer wants to log, for each request, the list of the 50 product IDs it returned.',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'At that rate one long line per request is many gigabytes a day. Log the count at INFO and keep the list at DEBUG or TRACE for when you troubleshoot.',
  },
  {
    id: 'log-5057',
    kind: 'choice',
    situation: 'Which line fits best at the end of each request of the high-volume Price API?',
    options: [
      '#["Prices returned count=$(sizeOf(payload)) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
      '#["Prices returned skus=$(write(payload.*sku)) correlationId=$(correlationId)"]',
      '#["Prices returned " ++ write(payload)]',
      '#["Prices returned"]',
    ],
    answer: 0,
    explain:
      'A count and a duration are short and still answer the usual questions. The list of SKUs or the whole payload makes every line long, and the log tool bill grows with it.',
  },
  {
    id: 'log-5058',
    kind: 'level',
    situation:
      'The load balancer calls the /health endpoint of each Tidewater app every 5 seconds. The flow answers status=UP and logs one line every time it is called. Which level fits that line?',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'A call every 5 seconds is over 17,000 lines a day per app that say nothing new. Keep the healthy answer at DEBUG or lower. When the health check fails, that is the line worth an INFO or WARN.',
  },
  {
    id: 'log-5059',
    kind: 'multi',
    situation: 'Tidewater runs 40 apps on CloudHub 1.0 and sends logs to a paid log tool. Which statements are right?',
    options: [
      'Runtime Manager keeps an app\'s logs for up to 30 days or 100 MB per application per worker, whichever comes first, so a noisy app loses old lines sooner',
      'To forward logs to an outside tool, you disable CloudHub logs and add your own appenders in log4j2.xml. Keep the CloudHub appender too, so MuleSoft Support can still see the application logs',
      'DEBUG lines cost nothing in a log tool because they are compressed',
      'Most log tools charge by the volume they take in, so a big line on every request costs money every month',
      'CloudHub keeps logs forever when the app runs in production',
    ],
    answers: [0, 1, 3],
    explain:
      'On CloudHub 1.0 those limits are per application per worker, and on CloudHub 2.0 they are per deployment. Once CloudHub logging is disabled, Runtime Manager shows only system logs, so the CloudHub appender is kept for MuleSoft Support, not for Runtime Manager. Paid tools charge by volume, and a DEBUG line costs the same as any other line once it is written.',
  },
  {
    id: 'log-5060',
    kind: 'write',
    situation:
      'The Price API used to write 6 lines per request. The team keeps only one INFO line, at the end. vars.storeId and vars.durationMs are set. Write it.',
    available: ['vars.storeId', 'vars.durationMs', 'sizeOf(payload)', 'payload', 'attributes.headers', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/returned|answered|sent/i, 'Prices returned'),
      { must: /sizeOf\(payload\)|count/i, say: 'Add how many prices you return: count=$(sizeOf(payload)).' },
      { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' },
      labelled('storeId'),
      { not: /attributes\.headers/, say: 'Leave out the headers. They are large and can hold credentials.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Prices returned storeId=$(vars.storeId) count=$(sizeOf(payload)) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'One short line per request answers "did it work, how much, how fast" and cuts the volume to a sixth. sizeOf(payload) is a number, so it is fine where the payload itself is not.',
  },

  // ---------- lg-103 Bluewing Travel: timeouts and fallbacks ----------
  {
    id: 'log-5061',
    kind: 'level',
    situation:
      'In the Bluewing Travel fare search, the Rates API timed out after 2000 ms. The flow uses cached exchange rates that are 40 minutes old. The business allows rates up to 6 hours old.',
    answer: ['WARN'],
    explain:
      'The customer still gets prices that are within the rules, so the fallback handled it. WARN shows how often the fallback runs, before the cache gets too old.',
  },
  {
    id: 'log-5062',
    kind: 'choice',
    situation: 'Which line fits best when the fare search falls back to cached exchange rates?',
    options: [
      '#["Using cache"]',
      '#["Rates API timed out " ++ write(error)]',
      '#["Exchange rates taken from cache: Rates API timed out timeoutMs=2000 cacheAgeMinutes=$(vars.cacheAgeMinutes) errorType=$(error.errorType) correlationId=$(correlationId)"]',
      '#["ERROR rates broken!!!"]',
    ],
    answer: 2,
    explain:
      'Say what the flow did instead, why, and how old the fallback data is. The age tells the reader how close the search is to failing for real.',
  },
  {
    id: 'log-5063',
    kind: 'multi',
    situation:
      'The fare search must answer within 3 seconds. The Rates API call has this setting, and its handler logs a WARN for HTTP:TIMEOUT. Which statements are right?',
    code: '<http:request config-ref="ratesApi" path="/rates" method="GET" responseTimeout="60000" />',
    options: [
      'With a 60 second timeout, the caller gives up first, and the WARN line comes long after the customer left',
      'Set responseTimeout below the time the caller waits, such as 2000, so the fallback runs in time',
      'Put the timeout value in the WARN line, so the reader knows which limit was hit',
      'HTTP:TIMEOUT is raised only after the Rates API answers',
      'responseTimeout is in seconds',
    ],
    answers: [0, 1, 2],
    explain:
      'responseTimeout is in milliseconds, and HTTP:TIMEOUT is raised because no answer came in time. A timeout longer than the caller waits makes the fallback, and its log line, useless.',
  },
  {
    id: 'log-5064',
    kind: 'write',
    situation:
      'Write the logger for the fallback: the Rates API timed out and the flow uses cached rates. vars.cacheAgeMinutes holds the age of the cache and vars.currencyPair the pair, such as GBP-EUR.',
    available: ['vars.cacheAgeMinutes', 'vars.currencyPair', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/cache|fallback/i, 'Exchange rates taken from cache'),
      errorFacts,
      { must: /vars\.cacheAgeMinutes/, say: 'Add how old the cached rates are: cacheAgeMinutes=$(vars.cacheAgeMinutes).' },
      labelled('currencyPair'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Exchange rates taken from cache: Rates API timed out currencyPair=$(vars.currencyPair) cacheAgeMinutes=$(vars.cacheAgeMinutes) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'The fallback kept the search working, so WARN. Without the cache age nobody can tell if the prices shown were fine or close to the limit.',
  },
  {
    id: 'log-5065',
    kind: 'write',
    situation:
      'The Rates API is still down and the cache is now older than the 6 hour limit (360 minutes). The fare search returns 503 for foreign currency fares. Write the logger.',
    available: ['vars.cacheAgeMinutes', 'vars.currencyPair', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/no usable|too old|stale|failed|unavailable/i, 'No usable exchange rates'),
      { must: /vars\.cacheAgeMinutes/, say: 'Add how old the cache is: cacheAgeMinutes=$(vars.cacheAgeMinutes).' },
      { must: /360|limit|max/i, say: 'Add the limit, such as maxAgeMinutes=360.' },
      labelled('currencyPair'),
      status(503),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["No usable exchange rates: cache too old currencyPair=$(vars.currencyPair) cacheAgeMinutes=$(vars.cacheAgeMinutes) maxAgeMinutes=360 errorType=$(error.errorType) status=503 correlationId=$(correlationId)"]',
    },
    explain:
      'Now customers cannot book, so ERROR. The age against the limit shows that the fallback ran out, and the WARN lines before it show how long the outage has lasted.',
  },

  // ---------- lg-104 Orbit Mobile: security errors ----------
  {
    id: 'log-5066',
    kind: 'level',
    situation:
      'The Orbit Mobile Billing System API answers 401 to every call your app makes. The client credentials were rotated and production still has the old ones.',
    answer: ['ERROR'],
    explain:
      'This is not a caller mistake: your own app cannot work until someone fixes its settings. Every request fails, so ERROR.',
  },
  {
    id: 'log-5067',
    kind: 'choice',
    situation:
      'A caller sent a username with line breaks in it, which made fake lines appear in the log of the sign-in API. This sign-in failed because the password was wrong for an account that exists, so vars.accountId holds that account. Which line fits best?',
    options: [
      '#["Sign-in failed user=$(payload.username)"]',
      '#["Sign-in failed accountId=$(vars.accountId) reason=$(error.errorType.identifier) clientId=$(vars.clientId) correlationId=$(correlationId)"]',
      '#["Sign-in failed user=$(payload.username) password=$(payload.password)"]',
      '#["Sign-in failed"]',
    ],
    answer: 1,
    explain:
      'Text a caller controls can carry line breaks that forge log lines, and a username is often an email. An account ID set by your own code is safe and still finds the account. When no account matches the username at all, there is no account ID, so that line logs the reason and the client ID alone.',
  },
  {
    id: 'log-5068',
    kind: 'multi',
    situation: 'This line is in the handler for HTTP:BASIC_AUTHENTICATION of the sign-in API. What is wrong with it?',
    code: `<logger level="WARN" message="#['Access denied for ' ++ payload.username ++ ' with key ' ++ attributes.headers.'x-api-key']" />`,
    options: [
      'The API key from the x-api-key header reaches the log',
      'The username can be personal data, and a caller can put line breaks in it to fake log lines',
      'There is no correlation ID and no error type',
      'WARN is never right for a refused request',
      'Mule removes header values from lines written in an error handler',
    ],
    answers: [0, 1, 2],
    explain:
      'One refused request is handled, so WARN is fine. Mule removes nothing from what a Logger writes. Log the client ID and the error type, never the key.',
  },
  {
    id: 'log-5069',
    kind: 'write',
    situation:
      'A flow counts failed sign-ins per client in an Object Store. After 20 failures in 5 minutes it blocks that client. vars.clientId, vars.failCount and vars.blockMinutes are set. Write the line for the moment the block starts.',
    available: ['vars.clientId', 'vars.failCount', 'vars.blockMinutes', 'payload.username', 'payload.password', 'attributes.headers.authorization', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/block|locked|suspended|throttl/i, 'Client blocked after failed sign-ins'),
      labelled('clientId'),
      { must: /vars\.failCount/, say: 'Add how many sign-ins failed: failures=$(vars.failCount).' },
      { must: /vars\.blockMinutes/, say: 'Add how long the block lasts: blockMinutes=$(vars.blockMinutes).' },
      { not: /username/i, say: 'Leave out the username. It can be an email, and a caller controls it.' },
      noSecrets,
      noPersonal,
      corr,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Client blocked after failed sign-ins clientId=$(vars.clientId) failures=$(vars.failCount) blockMinutes=$(vars.blockMinutes) correlationId=$(correlationId)"]',
    },
    explain:
      'This can be an attack or a broken client, and the security team wants to see it. WARN fits, ERROR too if it should page someone. The line holds who was blocked and for how long, nothing the attacker typed.',
  },
  {
    id: 'log-5070',
    kind: 'write',
    situation:
      `The Billing System API answered 401 to your app's own call: HTTP:UNAUTHORIZED. The client ID is in p('billing.clientId'), which is not a secret. Write the logger in the handler. vars.invoiceId is set.`,
    available: ['vars.invoiceId', 'error.errorType', 'error.description', `p('billing.clientId')`, `p('secure::billing.clientSecret')`, 'attributes.headers', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/rejected|refused|unauthori[sz]ed|401|not accepted/i, 'Billing API rejected our credentials'),
      errorFacts,
      { must: /billing\.clientId/, say: `Add which client ID was used: clientId=$(p('billing.clientId')).` },
      labelled('invoiceId'),
      noSecureProp,
      noSecrets,
      corr,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: `#["Billing API rejected our credentials status=401 clientId=$(p('billing.clientId')) invoiceId=$(vars.invoiceId) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]`,
    },
    explain:
      'The client ID tells the team which credentials to check, often enough to spot an old one after a rotation. The client secret never goes in the line.',
  },

  // ---------- lg-105 Granite Energy: a redeploy that went wrong ----------
  {
    id: 'log-5071',
    kind: 'level',
    situation:
      'During a rolling redeploy of the Granite Energy meter readings app on CloudHub 2.0 with 2 replicas, a start-up flow logs the app version, the Mule version and the environment once per replica.',
    answer: ['INFO'],
    explain:
      'One line per start is small and very useful: during a rollout it shows which replica runs which version. INFO keeps it in production.',
  },
  {
    id: 'log-5072',
    kind: 'choice',
    situation: 'Which start-up line fits best for the meter readings app?',
    options: [
      '#["Started"]',
      `#["App started config=$(write(p('secure::db.password')))"]`,
      `#["App started app=$(app.name) version=$(p('app.version')) env=$(p('mule.env')) runtime=$(mule.version)"]`,
      '#["App started " ++ write(app)]',
    ],
    answer: 2,
    explain:
      'Name, version, environment and runtime answer "what is running where" after a deployment. A start-up line has no triggering event, so it has no correlation ID to add. write(app) dumps far more than you need, and a secure property never belongs in a log.',
  },
  {
    id: 'log-5073',
    kind: 'multi',
    situation:
      "After a redeploy the meter readings app does not start. The deployment log says: Couldn't find configuration property value for key ${meter.api.url}. Which statements are right?",
    options: [
      'The property is missing for this environment. Add it to the properties file of that environment or to the Runtime Manager properties',
      'Read the deployment log first. The app loggers never ran, so they cannot help here',
      'Set the root logger to DEBUG and redeploy to find the missing key',
      'Mule used an empty string for the missing value, so the app is running without it',
      'A start-up line with env= and the properties file name makes this quicker to spot next time',
    ],
    answers: [0, 1, 4],
    explain:
      'A missing property stops the deployment, so the app never runs and your own loggers write nothing. The message already names the key, so DEBUG adds only noise.',
  },
  {
    id: 'log-5074',
    kind: 'write',
    situation:
      'Write the start-up line of the meter readings app. It runs once, when the app starts, so there is no triggering event and no correlation ID to log.',
    available: [`p('app.version')`, `p('mule.env')`, 'mule.version', 'app.name', `p('secure::db.password')`],
    level: ['INFO'],
    checks: [
      says(/started|deployed|running|ready/i, 'App started'),
      { must: /app\.version/, say: `Add the version you deployed: version=$(p('app.version')).` },
      { must: /mule\.env/, say: `Add the environment: env=$(p('mule.env')).` },
      { must: /app\.name|mule\.version/, say: 'Name what is running, such as app=$(app.name) or runtime=$(mule.version).' },
      noSecureProp,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: `#["App started app=$(app.name) version=$(p('app.version')) env=$(p('mule.env')) runtime=$(mule.version)"]`,
    },
    explain:
      'After a deployment the first question is "is the new version running, and where?". This line answers it in one search. A correlation ID belongs to an event, and a start-up line has none.',
  },
  {
    id: 'log-5075',
    kind: 'write',
    situation:
      'A Scheduler runs a check flow one minute after start-up, so the check has its own event and correlation ID. It calls the meter API once to confirm it can be reached, and failed with HTTP:CONNECTIVITY. The app keeps running, but readings will fail. Write the logger.',
    available: [`p('app.version')`, `p('meter.api.url')`, 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/check failed|failed|not reachable|could not/i, 'Start-up check failed: meter API not reachable'),
      errorFacts,
      { must: /app\.version/, say: `Add the version: version=$(p('app.version')).` },
      { must: /meter\.api\.url/, say: `Add where it tried to connect: url=$(p('meter.api.url')).` },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: `#["Start-up check failed: meter API not reachable url=$(p('meter.api.url')) version=$(p('app.version')) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]`,
    },
    explain:
      'The app looks healthy but cannot do its work, so ERROR right at start. The URL and version show at once if the new release points to the wrong place.',
  },
]
