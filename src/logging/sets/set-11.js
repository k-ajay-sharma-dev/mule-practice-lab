// Logging Lab exercises, set 11. See ../exercises.js for the format.
// Theme: lines for everyday business services. Profile changes, stock holds, outbound webhooks, slow searches, order
// states, certificate expiry, quota use, job locks, approvals and overload.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }

export const SET_11 = [
  // ---------- lg-141 Bramble Insurance: customer profile changes ----------
  {
    id: 'log-11001',
    kind: 'level',
    situation: 'A Bramble Insurance customer changes their postcode and contact number in the app. The change is saved.',
    answer: ['INFO'],
    explain: 'A saved change is a normal event, and insurers must be able to show when details changed. INFO keeps it in production.',
  },
  {
    id: 'log-11002',
    kind: 'choice',
    situation:
      'Bramble Insurance saves a profile change from the app: the customer changed postcode and contact number. A complaint later asks when the number was changed and from which channel. Which line should be logged?',
    options: [
      'Customer profile updated customerId=C-48120 fields=2 channel=app correlationId=7f3c2a',
      'Customer profile updated customerId=C-48120 fields=postcode,contactNumber channel=crm correlationId=7f3c2a',
      'Customer profile updated customerId=C-48120 fields=postcode,contactNumber channel=app correlationId=7f3c2a',
      'Customer profile updated customerName=Sam Reid fields=postcode,contactNumber channel=app correlationId=7f3c2a',
    ],
    answer: 2,
    explain: 'Field names answer which fields changed and when, and the customer ID finds the record. channel=crm names the system that stores the profile, not where the change came from, so it gives the complaint the wrong answer. fields=2 shows that something changed, not whether the number did. A name is personal data and is not unique, so it is a poor key.',
  },
  {
    id: 'log-11003',
    kind: 'multi',
    situation: 'The privacy team reviews the Bramble profile change line. Which facts may stay on it?',
    options: [
      'The new postcode, since a postcode is not a secret',
      'The customer ID',
      'The customer’s email address, to contact them if the change fails',
      'The names of the fields that changed',
      'The channel the change came from',
    ],
    answers: [1, 3, 4],
    explain: 'The customer ID, the names of the changed fields and the channel answer what changed and how. A postcode is not a secret, but it is personal data, and with a customer ID it points to one home. An email address is personal data too, and the system that owns the profile can find it from the ID.',
  },
  {
    id: 'log-11004',
    kind: 'write',
    situation:
      'A Bramble profile change was saved. vars.customerId holds the customer, vars.changedFields the names of the changed fields, and vars.channel where it came from. Write the line.',
    available: ['vars.customerId', 'vars.changedFields', 'vars.channel', 'payload.contactNumber', 'payload.postcode', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/profile (updated|changed|saved)|details (updated|changed)/i, 'Customer profile updated'),
      labelled('customerId'),
      labelled('fields', 'fields=$(vars.changedFields)'),
      labelled('channel'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Customer profile updated customerId=$(vars.customerId) fields=$(vars.changedFields) channel=$(vars.channel) correlationId=$(correlationId)"]',
    },
    explain: 'Names of fields, never their values. If a customer asks when their number changed, this line answers it.',
  },
  {
    id: 'log-11005',
    kind: 'write',
    situation:
      'A Bramble profile change was refused because the postcode is not valid. The customer sees a message to fix it. vars.customerId and vars.field hold the facts. Write the line.',
    available: ['vars.customerId', 'vars.field', 'payload.postcode', 'error.description', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/rejected|refused|invalid|not saved/i, 'Profile change rejected'),
      labelled('customerId'),
      labelled('field'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Profile change rejected customerId=$(vars.customerId) field=$(vars.field) reason=invalid format correlationId=$(correlationId)"]',
    },
    explain: 'The field name is enough to count which checks customers trip over. The value they typed may be personal data.',
  },

  // ---------- lg-142 Copperleaf Electronics: stock holds that expire ----------
  {
    id: 'log-11006',
    kind: 'level',
    situation:
      'Copperleaf Electronics holds stock for 15 minutes while a customer pays. A hold ran out because the customer left, and the stock went back on sale.',
    answer: ['INFO', 'DEBUG'],
    explain: 'Abandoned baskets are normal. INFO is fine for a count, and DEBUG fits when there are thousands a day and only the total matters.',
  },
  {
    id: 'log-11007',
    kind: 'choice',
    situation:
      'Copperleaf holds stock for 15 minutes while a customer pays. A hold ran out because the customer left, and the stock went back on sale. Support often asks why an item left a basket and then sold out. Which line best records it?',
    options: [
      'Stock hold expired holdId=H-77120 sku=TV-5501 qty=1 heldForSec=900 next=retry release',
      'Stock hold expired holdId=H-77120 sku=TV-5501 stockOnHand=14 next=stock released',
      'Stock hold expired holdId=H-77120 sku=TV-5501 qty=1 heldForSec=900 next=stock released',
      'Stock hold ended holdId=H-77120 sku=TV-5501 qty=1 next=stock released',
    ],
    answer: 2,
    explain: 'The line says the hold expired, which hold, how many units, how long and that the units went back on sale. A next step of retry release describes a failed release, not this one. stockOnHand counts the shelf, not the hold, so it hides how many units came back. "Hold ended" does not say whether it was paid, cancelled or expired.',
  },
  {
    id: 'log-11008',
    kind: 'multi',
    situation: 'Copperleaf items show as sold out while the warehouse has them. Which lines help find the cause?',
    options: [
      'A line for each page view of the item',
      'A line when each hold is created, with the hold ID and quantity',
      'A line when each hold ends, saying paid, expired or cancelled',
      'An ERROR line each time an item shows as sold out',
      'A count of open holds per item every 10 minutes',
    ],
    answers: [1, 2, 4],
    explain: 'Holds that start but never end are the usual cause. Created and ended lines that share a hold ID, and a count of open holds, show them. Page views say nothing about stock. Sold out is a normal state, so an ERROR line for it adds noise and still does not show which holds are stuck.',
  },
  {
    id: 'log-11009',
    kind: 'write',
    situation:
      'A Copperleaf hold ran out, and the stock went back on sale. vars.holdId, vars.sku, vars.qty and vars.heldForSec hold the facts. Write the line.',
    available: ['vars.holdId', 'vars.sku', 'vars.qty', 'vars.heldForSec', 'vars.basket', 'payload'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/expired|ran out|timed out|released/i, 'Stock hold expired'),
      labelled('holdId'),
      labelled('sku'),
      labelled('qty'),
      next('next=stock released'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Stock hold expired holdId=$(vars.holdId) sku=$(vars.sku) qty=$(vars.qty) heldForSec=$(vars.heldForSec) next=stock released"]',
    },
    explain: 'The hold ID ties this line to the one that created the hold. Released stock is the next fact support needs.',
  },
  {
    id: 'log-11010',
    kind: 'write',
    situation:
      'The stock system did not answer when Copperleaf tried to release a hold. A cleanup job will try again in 5 minutes. vars.holdId and vars.sku hold the IDs. Write the line.',
    available: ['vars.holdId', 'vars.sku', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN'],
    checks: [
      says(/not released|release failed|(could not|failed to|unable to) release/i, 'Stock hold not released'),
      labelled('holdId'),
      labelled('sku'),
      errorFacts,
      next('next=cleanup job retries in 5 min'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stock hold not released holdId=$(vars.holdId) sku=$(vars.sku) errorType=$(error.errorType) error=$(error.description) next=cleanup job retries in 5 min"]',
    },
    explain: 'The stock is stuck for now but will be freed. WARN, with the next step, tells support not to release it by hand.',
  },

  // ---------- lg-143 Quayside Payments: outbound webhooks to merchants ----------
  {
    id: 'log-11011',
    kind: 'level',
    situation:
      'Quayside Payments sends a webhook to a merchant when a payment settles. The merchant answered 503. Quayside will try again in 1 minute, then 5, then 30.',
    answer: ['WARN'],
    explain: 'The first failure is handled by a retry, so it is not an ERROR yet. WARN lets the team see which merchants often fail.',
  },
  {
    id: 'log-11012',
    kind: 'choice',
    situation:
      'Quayside Payments sends a payment.settled webhook to merchant M-3310. The merchant answered 503. Quayside tries 4 times in all, waiting 1, 5 and 30 minutes. Which line best records this first failed attempt?',
    options: [
      'Webhook delivery failed merchantId=M-3310 eventId=ev_88120 status=503 attempt=1 of 4 next=given up',
      'Webhook delivery failed merchantId=M-3310 paymentId=pay_441 status=503 attempt=1 of 4 next=retry in 60s',
      'Webhook delivery failed merchantId=M-3310 eventId=ev_88120 status=503 attempt=1 of 4 retriesLeft=3 next=retry in 5 min',
      'Webhook delivery failed merchantId=M-3310 eventId=ev_88120 status=503 attempt=1 of 4 next=retry in 60s',
    ],
    answer: 3,
    explain: 'Merchant, event, status, the attempt out of how many and the next step. The merchant searches by event ID, and one payment can raise several events, so a payment ID does not pin down the delivery. next=given up is wrong after the first of four tries. The first wait is 1 minute; 5 minutes is the wait after the second attempt, so that line tells the merchant the wrong time to expect a resend.',
  },
  {
    id: 'log-11013',
    kind: 'multi',
    situation:
      'Merchant M-3310 says it never got event ev_88120. Your lines show four attempts, all answered 503. Which facts on those lines settle the dispute?',
    options: [
      'The event ID the merchant can search for',
      'The full webhook body, so the merchant can see what it missed',
      'Each attempt with its time and the status the merchant answered',
      'Whether delivery finally worked or was given up',
      'The payment amount, to show which payment the event was for',
    ],
    answers: [0, 2, 3],
    explain: 'The event ID, each attempt with its time and the 503 it got, and the final outcome show the merchant was reached and answered 503 each time. The body holds payment details and can be resent from the dashboard. The amount says nothing about whether the delivery reached the merchant.',
  },
  {
    id: 'log-11014',
    kind: 'write',
    situation:
      'A Quayside webhook attempt failed and will be retried. vars.merchantId, vars.eventId, vars.attempt and vars.retryInSec hold the facts, and attributes.statusCode the merchant\'s answer. Write the line.',
    available: ['vars.merchantId', 'vars.eventId', 'vars.attempt', 'vars.retryInSec', 'attributes.statusCode', 'vars.signature', 'payload'],
    level: ['WARN'],
    checks: [
      says(/webhook/i, 'Webhook delivery failed'),
      labelled('merchantId'),
      labelled('eventId'),
      labelled('status', 'status=$(attributes.statusCode)'),
      labelled('attempt'),
      next('next=retry in $(vars.retryInSec)s'),
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Webhook delivery failed merchantId=$(vars.merchantId) eventId=$(vars.eventId) status=$(attributes.statusCode) attempt=$(vars.attempt) next=retry in $(vars.retryInSec)s"]',
    },
    explain: 'One line per attempt, the same shape each time. Searching the event ID shows the whole story of one webhook.',
  },
  {
    id: 'log-11015',
    kind: 'write',
    situation:
      'All four attempts failed. Quayside stops trying and the event waits in the merchant\'s dashboard for a manual resend. vars.merchantId, vars.eventId and vars.attempts hold the facts. Write the line.',
    available: ['vars.merchantId', 'vars.eventId', 'vars.attempts', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/gave up|given up|failed after|not delivered|undelivered|abandon/i, 'Webhook not delivered'),
      labelled('merchantId'),
      labelled('eventId'),
      labelled('attempts'),
      next('next=available for manual resend'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Webhook not delivered merchantId=$(vars.merchantId) eventId=$(vars.eventId) attempts=$(vars.attempts) next=available for manual resend"]',
    },
    explain: 'The merchant will miss the event unless someone acts. ERROR fits, and WARN is fine if your team treats merchant outages as theirs to fix.',
  },

  // ---------- lg-144 Larkspur Books: slow searches ----------
  {
    id: 'log-11016',
    kind: 'level',
    situation: 'Larkspur Books\' search API answered in 3.2 seconds. The target is 1 second. The result was correct.',
    answer: ['WARN'],
    explain: 'It worked, but well past the target. WARN on slow requests gives a list to work on before customers give up.',
  },
  {
    id: 'log-11017',
    kind: 'choice',
    situation:
      'Larkspur Books wants to group slow searches by cause. A search took 3.2 seconds against a 1 second target, and the customer got the results. Which line best records it?',
    options: [
      'Search timed out durationMs=3210 targetMs=1000 filters=3 sort=price results=412 page=1 correlationId=7f3c2a',
      'Slow search durationMs=3210 targetMs=1000 filters=3 sort=price results=412 page=1 correlationId=7f3c2a',
      'Slow search durationMs=3210 targetMs=1000 responseBytes=184220 customerId=C-2201 correlationId=7f3c2a',
      'Slow search durationMs=3210 targetMs=1000 filters=3 sort=price results=412 page=1 q="gift for my wife Jane" correlationId=7f3c2a',
    ],
    answer: 1,
    explain: 'Time, target and the shape of the query (filters, sort, results and page) let slow cases be grouped. The search answered with a correct result, so "timed out" is false and would be counted with the real timeouts. Response size and a customer ID do not say what kind of search it was. The typed text adds nothing the shape does not give, and it can hold personal details such as a name.',
  },
  {
    id: 'log-11018',
    kind: 'multi',
    situation: 'Which facts help find why some Larkspur searches are slow, without logging what customers typed?',
    options: [
      'The customer ID, to see which customers search slowly',
      'How many filters and which sort order',
      'Which page was asked for',
      'The search text with names removed by a regular expression',
      'How many results matched',
    ],
    answers: [1, 2, 4],
    explain: 'Deep pages, heavy sorts and huge result sets are the usual causes, and the shape of the query shows them. Slowness depends on the query, not on who asked, so a customer ID adds personal data without a cause. A regular expression cannot reliably find every name or address in free text.',
  },
  {
    id: 'log-11019',
    kind: 'write',
    situation:
      'A Larkspur search was slow. vars.durationMs, vars.filters, vars.sort, vars.results and vars.page hold the facts. The target is 1000 ms. Write the line.',
    available: ['vars.durationMs', 'vars.filters', 'vars.sort', 'vars.results', 'vars.page', 'attributes.queryParams.q', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/slow/i, 'Slow search'),
      durationVar,
      labelled('sort'),
      labelled('results'),
      labelled('page'),
      corr,
      { not: /queryParams\.q\b/, say: 'Leave out the words the customer typed. They can hold personal details.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Slow search durationMs=$(vars.durationMs) targetMs=1000 filters=$(vars.filters) sort=$(vars.sort) results=$(vars.results) page=$(vars.page) correlationId=$(correlationId)"]',
    },
    explain: 'Group these lines by sort and page and the slow cases usually stand out in minutes.',
  },
  {
    id: 'log-11020',
    kind: 'write',
    situation:
      'The search engine did not answer within 5 seconds. Larkspur shows a "try again" page. vars.durationMs holds the time waited. Write the line.',
    available: ['vars.durationMs', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/timed out|timeout|no answer|did not answer/i, 'Search engine timed out'),
      durationVar,
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Search engine timed out durationMs=$(vars.durationMs) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain: 'The customer got no result, so the request failed. Many of these at once point at the engine, not at one query.',
  },

  // ---------- lg-145 Northgate Furniture: order states ----------
  {
    id: 'log-11021',
    kind: 'level',
    situation:
      'Northgate Furniture orders move from PLACED to PAID to PICKED to SHIPPED. A message tries to move an order from PLACED straight to SHIPPED. The app refuses it.',
    answer: ['WARN', 'ERROR'],
    explain: 'The app protected the data, but an upstream system is sending a step it should not. WARN at least, and ERROR if it means an order is stuck.',
  },
  {
    id: 'log-11022',
    kind: 'choice',
    situation:
      'Northgate orders go PLACED, PAID, PICKED, SHIPPED. A message from the warehouse system tries to move order NF-20117 from PLACED to SHIPPED, and the app refuses it. The fix needs the team that sent it. Which line best records the refusal?',
    options: [
      'Order status change refused orderId=NF-20117 to=SHIPPED source=wms reason=not allowed correlationId=7f3c2a',
      'Order status change refused orderId=NF-20117 from=PLACED to=SHIPPED reason=not allowed host=mule-worker-2 correlationId=7f3c2a',
      'Order status changed orderId=NF-20117 from=PLACED to=SHIPPED source=wms correlationId=7f3c2a',
      'Order status change refused orderId=NF-20117 from=PLACED to=SHIPPED source=wms reason=not allowed correlationId=7f3c2a',
    ],
    answer: 3,
    explain: 'The line names the order, both statuses, the sender and the reason. Without from, the reader cannot see which steps were skipped. host names the replica that refused it, not the system that sent it. "Order status changed" reads as if the change happened.',
  },
  {
    id: 'log-11023',
    kind: 'multi',
    situation: 'Northgate order NF-20117 was marked SHIPPED twice. Which lines let you rebuild its life from the logs?',
    options: [
      'A DEBUG dump of the whole order at every step',
      'One line for each status change, with from, to and the source',
      'A line only when a change fails, since success is the normal case',
      'One line for each refused change, with the reason',
      'The order ID on every line',
    ],
    answers: [1, 3, 4],
    explain: 'Changes and refusals, each with the order ID, give a timeline that shows the second SHIPPED and its source. A dump of every field at every step is noise and copies customer data. Logging only failures leaves out the two successful SHIPPED changes, which are the evidence.',
  },
  {
    id: 'log-11024',
    kind: 'write',
    situation:
      'A Northgate order moved to a new status. vars.orderId, vars.fromStatus, vars.toStatus and vars.source hold the facts. Write the line.',
    available: ['vars.orderId', 'vars.fromStatus', 'vars.toStatus', 'vars.source', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/status (change|update)|moved/i, 'Order status changed'),
      labelled('orderId'),
      { must: /\bfrom(Status)?\s*"?\s*[=:]/i, say: 'Label the old status, such as from=$(vars.fromStatus).' },
      { must: /\bto(Status)?\s*"?\s*[=:]/i, say: 'Label the new status, such as to=$(vars.toStatus).' },
      labelled('source'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Order status changed orderId=$(vars.orderId) from=$(vars.fromStatus) to=$(vars.toStatus) source=$(vars.source) correlationId=$(correlationId)"]',
    },
    explain: 'From and to on one line show the step. Searching the order ID lists every step in order.',
  },
  {
    id: 'log-11025',
    kind: 'write',
    situation:
      'A Northgate status change was refused because the step is not allowed. The message goes to a review queue. vars.orderId, vars.fromStatus, vars.toStatus and vars.source hold the facts. Write the line.',
    available: ['vars.orderId', 'vars.fromStatus', 'vars.toStatus', 'vars.source', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/refused|rejected|not allowed|invalid/i, 'Order status change refused'),
      labelled('orderId'),
      { must: /\bfrom(Status)?\s*"?\s*[=:]/i, say: 'Label the old status, such as from=$(vars.fromStatus).' },
      { must: /\bto(Status)?\s*"?\s*[=:]/i, say: 'Label the new status, such as to=$(vars.toStatus).' },
      labelled('source'),
      next('next=sent to review queue'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Order status change refused orderId=$(vars.orderId) from=$(vars.fromStatus) to=$(vars.toStatus) source=$(vars.source) next=sent to review queue correlationId=$(correlationId)"]',
    },
    explain: 'The order did not change, and a person will look. The next field tells support where the message waits.',
  },

  // ---------- lg-146 Elmstead Council: certificates that expire ----------
  {
    id: 'log-11026',
    kind: 'level',
    situation: 'Elmstead Council checks its partner certificates every morning. One certificate expires in 21 days.',
    answer: ['WARN'],
    explain: 'Nothing is broken yet, but 21 days is inside the usual 30 day renewal window. WARN puts it on the team\'s list. INFO fits only while more than a month is left.',
  },
  {
    id: 'log-11027',
    kind: 'choice',
    situation:
      'Elmstead Council checks its partner certificates each morning. The client certificate for the planning portal expires in 21 days. After the renewal the team must retest every app that uses it. Which line best warns them?',
    options: [
      'Certificate expires soon alias=planning-portal-client expiresOn=2026-12-09 daysLeft=21 keystorePath=/opt/mule/certs/client.jks',
      'Certificate check finished certificates=14 expiringSoon=1 nextCheck=tomorrow 06:00',
      'Certificate expires soon alias=planning-portal-client expiresOn=2026-12-09 daysLeft=21 usedBy=planning-sync',
      'Certificate expired alias=planning-portal-client expiresOn=2026-12-09 usedBy=planning-sync',
    ],
    answer: 2,
    explain: 'Which certificate, when it expires, how long is left and which app uses it. The keystore path says where the file is, not which apps to retest. A summary count does not name the certificate. "Certificate expired" is wrong for one with 21 days left and would call the team out for an outage that has not happened.',
  },
  {
    id: 'log-11028',
    kind: 'multi',
    situation: 'Which facts belong on the Elmstead daily certificate expiry line?',
    options: [
      'The alias or name of the certificate',
      'The keystore password with all but the first three characters masked',
      'The expiry date and days left',
      'Which apps use it',
      'The number of certificates checked that morning',
    ],
    answers: [0, 2, 3],
    explain: 'Name, date and the apps that will break let the team renew and retest in time. A partly masked password still leaks part of a secret and helps a guess. The number checked belongs on the summary line of the check, not on the line for one certificate.',
  },
  {
    id: 'log-11029',
    kind: 'write',
    situation:
      'An Elmstead certificate expires in 21 days. vars.alias, vars.expiresOn, vars.daysLeft and vars.usedBy hold the facts. Write the line.',
    available: ['vars.alias', 'vars.expiresOn', 'vars.daysLeft', 'vars.usedBy', 'vars.keystorePassword'],
    level: ['WARN'],
    checks: [
      says(/expir/i, 'Certificate expires soon'),
      labelled('alias'),
      labelled('expiresOn'),
      labelled('daysLeft'),
      labelled('usedBy'),
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Certificate expires soon alias=$(vars.alias) expiresOn=$(vars.expiresOn) daysLeft=$(vars.daysLeft) usedBy=$(vars.usedBy)"]',
    },
    explain: 'An alert on daysLeft below 30 gives a month to renew. The usedBy field tells the team what to retest.',
  },
  {
    id: 'log-11030',
    kind: 'write',
    situation:
      'An Elmstead certificate has expired, and calls to the planning portal now fail. vars.alias, vars.expiresOn and vars.usedBy hold the facts. Write the line.',
    available: ['vars.alias', 'vars.expiresOn', 'vars.usedBy', 'error.errorType', 'error.description'],
    level: ['ERROR'],
    checks: [
      says(/expired/i, 'Certificate expired'),
      labelled('alias'),
      labelled('expiresOn'),
      labelled('usedBy'),
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Certificate expired alias=$(vars.alias) expiresOn=$(vars.expiresOn) usedBy=$(vars.usedBy)"]',
    },
    explain: 'Calls are failing and someone must act now. The alias tells the on-call engineer exactly what to renew.',
  },

  // ---------- lg-147 Tidewater Data: API quota use ----------
  {
    id: 'log-11031',
    kind: 'level',
    situation:
      'Tidewater Data sells API plans with a monthly quota. A client has used 80% of this month\'s quota with 10 days left.',
    answer: ['INFO', 'WARN'],
    explain: 'Nothing is blocked yet. INFO records it, and WARN fits if your team contacts clients at this point.',
  },
  {
    id: 'log-11032',
    kind: 'choice',
    situation:
      'Tidewater Data sells API plans with a monthly quota. Client app-2210 has used 80% of its quota with 10 days left. Sales wants to know whether the client will run out before the quota resets. Which line best records the 80% mark?',
    options: [
      'Quota threshold reached clientId=app-2210 plan=standard used=80000 quota=100000 percent=80 periodEnds=2026-11-30 requestsToday=4120',
      'Quota threshold reached clientId=app-2210 plan=standard used=80000 quota=100000 percent=80 requestsToday=4120',
      'Quota threshold reached clientName=Orchard Analytics plan=standard percent=80 periodEnds=2026-11-30 contact=ops@orchard.example',
      'Quota exceeded clientId=app-2210 plan=standard used=80000 quota=100000 percent=80 periodEnds=2026-11-30',
    ],
    answer: 0,
    explain: 'Who, which plan, how much of how much and when it resets. Without periodEnds nobody can tell whether 10 days at this rate runs out first. A contact email is personal data, and that line has no usage numbers. "Quota exceeded" is wrong at 80%, and an alert on it would tell sales the client is already blocked.',
  },
  {
    id: 'log-11033',
    kind: 'multi',
    situation:
      'Tidewater serves 2 million calls a day across 300 clients. When should it log quota use for each client?',
    options: [
      'On every request, with used and quota',
      'Once when each threshold is first crossed, such as 80% and 100%',
      'In one summary per client per day',
      'Only when a client is blocked with 429',
      'When a client’s plan or quota changes',
    ],
    answers: [1, 2, 4],
    explain: 'Threshold lines warn before the client is blocked, a daily summary shows the trend, and a line when the quota changes explains a jump in percent. A line per request repeats the request log 2 million times a day. Logging only at 429 tells sales too late.',
  },
  {
    id: 'log-11034',
    kind: 'write',
    situation:
      'A Tidewater client crossed 80% of its quota. vars.clientId, vars.plan, vars.used, vars.quota and vars.periodEnds hold the facts. Write the line.',
    available: ['vars.clientId', 'vars.plan', 'vars.used', 'vars.quota', 'vars.periodEnds', 'attributes.headers'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/quota|threshold/i, 'Quota threshold reached'),
      labelled('clientId'),
      labelled('plan'),
      labelled('used'),
      labelled('quota'),
      labelled('periodEnds'),
      { not: /attributes\.headers/, say: 'Do not log the headers. They carry the client secret.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Quota threshold reached clientId=$(vars.clientId) plan=$(vars.plan) used=$(vars.used) quota=$(vars.quota) percent=80 periodEnds=$(vars.periodEnds)"]',
    },
    explain: 'Logged once when the line is crossed, not on every call after it. That keeps one line per client per threshold.',
  },
  {
    id: 'log-11035',
    kind: 'write',
    situation:
      'A Tidewater client used its whole quota. Further calls get 429 until the period ends. vars.clientId, vars.plan and vars.periodEnds hold the facts. Write the line.',
    available: ['vars.clientId', 'vars.plan', 'vars.periodEnds', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/quota (used|exhausted|reached|exceeded)|limit reached|out of quota/i, 'Quota used up'),
      labelled('clientId'),
      labelled('plan'),
      labelled('periodEnds'),
      next('next=calls get 429 until period ends'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Quota used up clientId=$(vars.clientId) plan=$(vars.plan) periodEnds=$(vars.periodEnds) next=calls get 429 until period ends"]',
    },
    explain: 'The app is working as sold, so not ERROR. The line explains every 429 the client sees until the reset.',
  },

  // ---------- lg-148 Ridgeway Utilities: a lock for a scheduled job ----------
  {
    id: 'log-11036',
    kind: 'level',
    situation:
      'Ridgeway Utilities runs a billing job on two replicas. Each run first takes a lock, so only one replica does the work. This replica did not get the lock, so it skips the run.',
    answer: ['DEBUG', 'INFO'],
    explain: 'Skipping is the expected outcome on every replica but one. DEBUG avoids a line per replica per run, and INFO is fine when runs are rare.',
  },
  {
    id: 'log-11037',
    kind: 'choice',
    situation:
      'Ridgeway runs the billing job on two replicas. Each run first takes a lock in the object store, keyed by the run date, with a time to live of one hour. Which line best records that replica-2 took the lock?',
    options: [
      'Job lock acquired job=billing-run holder=replica-2 ttlSec=3600 acquiredAt=2026-11-18T01:00:00Z',
      'Job lock acquired job=billing-run lockKey=billing-2026-11-18 holder=mule-app ttlSec=3600',
      'Job lock acquired job=billing-run lockKey=billing-2026-11-18 holder=replica-2 objectStore=billing-locks',
      'Job lock acquired job=billing-run lockKey=billing-2026-11-18 holder=replica-2 ttlSec=3600 acquiredAt=2026-11-18T01:00:00Z',
    ],
    answer: 3,
    explain: 'Which job, which run, which replica and how long the lock lasts. Without the lock key the line cannot be tied to one run. holder=mule-app is the same on both replicas, so two holders look like one. Without the time to live nobody can tell when another replica may take the lock over.',
  },
  {
    id: 'log-11038',
    kind: 'multi',
    situation:
      'A Ridgeway bill run happened twice last month, though only one replica should get the lock. Which lines would show how?',
    options: [
      'Each lock acquired, with the lock key and the holder',
      'The CPU use of each replica during the run',
      'Each lock released, with how long the run took',
      'The full list of customers billed',
      'Any lock taken over because it had passed its time to live',
    ],
    answers: [0, 2, 4],
    explain: 'Two acquisitions of one key, or a takeover while the first run was still going, explain a double run. A run longer than the time to live, followed by a takeover, is the usual story. CPU use and a list of customers billed show that two runs happened, not how.',
  },
  {
    id: 'log-11039',
    kind: 'write',
    situation:
      'A Ridgeway replica took the lock for the billing run. vars.job, vars.lockKey, vars.holder and vars.ttlSec hold the facts. Write the line.',
    available: ['vars.job', 'vars.lockKey', 'vars.holder', 'vars.ttlSec', 'payload'],
    level: ['INFO'],
    checks: [
      says(/lock (acquired|taken|obtained)|(acquired|took|obtained) (the )?(job )?lock/i, 'Job lock acquired'),
      labelled('job'),
      labelled('lockKey'),
      labelled('holder'),
      labelled('ttlSec'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Job lock acquired job=$(vars.job) lockKey=$(vars.lockKey) holder=$(vars.holder) ttlSec=$(vars.ttlSec)"]',
    },
    explain: 'The lock key names the run. Searching it shows who held it and for how long.',
  },
  {
    id: 'log-11040',
    kind: 'write',
    situation:
      'A Ridgeway replica found a lock older than its time to live and took it over. The old holder may have crashed. vars.job, vars.lockKey, vars.oldHolder and vars.holder hold the facts. Write the line.',
    available: ['vars.job', 'vars.lockKey', 'vars.oldHolder', 'vars.holder', 'payload'],
    level: ['WARN'],
    checks: [
      says(/took over|taken over|stale|expired lock/i, 'Stale job lock taken over'),
      labelled('job'),
      labelled('lockKey'),
      labelled('oldHolder'),
      labelled('holder'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stale job lock taken over job=$(vars.job) lockKey=$(vars.lockKey) oldHolder=$(vars.oldHolder) holder=$(vars.holder)"]',
    },
    explain: 'If the old holder was slow, not dead, two runs now overlap. WARN makes sure someone checks the old holder\'s run.',
  },

  // ---------- lg-149 Ashby Building Society: refunds that need a second approver ----------
  {
    id: 'log-11041',
    kind: 'level',
    situation:
      'At Ashby Building Society, a refund over 5,000 needs a second person to approve it. The second approver approved a refund, and it was paid.',
    answer: ['INFO'],
    explain: 'This is a normal, controlled event that auditors will ask about. INFO keeps it, with who did what.',
  },
  {
    id: 'log-11042',
    kind: 'choice',
    situation:
      'At Ashby Building Society a refund over 5,000 needs a second person to approve it. U-311 requested refund RF-90117 for 7,250.00 and U-482 approved it. An auditor will check the two-person rule from the logs. Which line best records the approval?',
    options: [
      'Refund approved refundId=RF-90117 amount=7250.00 approvedBy=U-482 approverRole=finance correlationId=7f3c2a',
      'Refund approved refundId=RF-90117 amount=7250.00 requestedBy=U-311 approvedBy=U-482 correlationId=7f3c2a',
      'Refund approved refundId=RF-90117 amount=7250.00 requestedBy=U-482 approvedBy=U-482 correlationId=7f3c2a',
      'Refund approved refundId=RF-90117 amount=7250.00 requestedBy=U-311 approvedBy=U-482 account=12345678 sortCode=20-00-00',
    ],
    answer: 1,
    explain: 'The refund, the amount and both people by user ID prove two different people acted. Without requestedBy the line cannot show the approver was someone else. requestedBy=U-482 takes the user of the approval call, not the person who raised the refund, so the line shows one person on both sides and fails the audit. Bank details are not needed for the audit and stay out of logs.',
  },
  {
    id: 'log-11043',
    kind: 'multi',
    situation:
      'An auditor asks Ashby to prove the two-person rule was followed for every refund over 5,000 last quarter. Which facts must the lines hold?',
    options: [
      'The refund ID and amount',
      'The user ID of the person who requested the refund',
      'The customer’s account number',
      'The user ID of the person who approved it',
      'The approver’s name, so the auditor can read it',
    ],
    answers: [0, 1, 3],
    explain: 'Two different user IDs on one refund ID, with an amount over 5,000, prove the rule. The customer’s account number adds bank data the audit does not need. A name is not unique, so two people with one name, or one person with two spellings, break the proof.',
  },
  {
    id: 'log-11044',
    kind: 'write',
    situation:
      'An Ashby refund was approved by a second person. vars.refundId, vars.amount, vars.requestedBy and vars.approvedBy hold the facts. Write the line.',
    available: ['vars.refundId', 'vars.amount', 'vars.requestedBy', 'vars.approvedBy', 'vars.accountNumber', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/approved/i, 'Refund approved'),
      labelled('refundId'),
      labelled('amount'),
      labelled('requestedBy'),
      labelled('approvedBy'),
      { not: /accountNumber/, say: 'Leave out the account number. The refund ID finds it.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Refund approved refundId=$(vars.refundId) amount=$(vars.amount) requestedBy=$(vars.requestedBy) approvedBy=$(vars.approvedBy) correlationId=$(correlationId)"]',
    },
    explain: 'Requested and approved by two IDs on one line is the proof an auditor wants.',
  },
  {
    id: 'log-11045',
    kind: 'write',
    situation:
      'Someone tried to approve their own Ashby refund. The app refused. vars.refundId and vars.userId hold the facts. Write the line.',
    available: ['vars.refundId', 'vars.userId', 'vars.amount', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/refused|rejected|not allowed|denied/i, 'Self approval refused'),
      labelled('refundId'),
      labelled('userId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Self approval refused refundId=$(vars.refundId) userId=$(vars.userId) reason=requester cannot approve correlationId=$(correlationId)"]',
    },
    explain: 'The control worked, but the attempt matters to the risk team. WARN at least, so it is counted and reviewed.',
  },

  // ---------- lg-150 Greyfriars Ticketing: too much traffic ----------
  {
    id: 'log-11046',
    kind: 'level',
    situation:
      'At an on-sale, Greyfriars Ticketing turns away requests it cannot take with 503 and a Retry-After header. In one minute, 12,000 requests were turned away.',
    answer: ['WARN'],
    explain: 'The app is protecting itself as designed, but customers are waiting. WARN, with a count per minute rather than a line per request.',
  },
  {
    id: 'log-11047',
    kind: 'choice',
    situation:
      'At a Greyfriars on-sale, the app turns away requests over its limit of 400 in flight, with 503 and Retry-After 5. In one minute 12,000 were turned away and 48,000 accepted. Which line best records it?',
    options: [
      'Request shed status=503 retryAfterSec=5 path=/tickets clientIp=203.0.113.7 correlationId=7f3c2a',
      'Requests shed windowSec=60 rejected=12000 accepted=48000 rejectedPct=20 maxConcurrent=400 retryAfterSec=5',
      'Requests shed windowSec=60 rejected=12000 retryAfterSec=5 maxConcurrent=400 heapUsedMb=1710',
      'Requests shed windowSec=60 rejected=12000 accepted=48000 maxConcurrent=400 status=429',
    ],
    answer: 1,
    explain: 'One line a minute with both counts and the limit shows how far demand went past capacity. A line per rejected request writes 12,000 lines a minute at the worst moment. Without accepted, nobody can tell 12,000 of 13,000 from 12,000 of 60,000. The app answers 503, so status=429 records a status no client got.',
  },
  {
    id: 'log-11048',
    kind: 'multi',
    situation:
      'During the Greyfriars on-sale an engineer proposes one WARN line per rejected request, about 200 a second. Which reasons argue against it?',
    options: [
      'Shedding is expected, so a WARN line for each rejection would raise false alerts',
      'Writing logs costs CPU and I/O at the moment the app is overloaded',
      'WARN lines are not forwarded to the log tool',
      'The log forwarder may drop or delay lines, hiding the useful ones',
      'A count per minute holds the same facts',
    ],
    answers: [1, 3, 4],
    explain: 'Logging costs CPU and I/O when the app has none to spare, and a flood can make the forwarder drop or delay the useful lines. A count per minute keeps the facts. WARN fits a request the app had to turn away, and alerts are set on rates, not single lines. WARN lines are forwarded like any other level the logger lets through.',
  },
  {
    id: 'log-11049',
    kind: 'write',
    situation:
      'Write the Greyfriars summary line, logged once a minute while requests are being turned away. vars.windowSec, vars.rejected, vars.accepted and vars.maxConcurrent hold the facts.',
    available: ['vars.windowSec', 'vars.rejected', 'vars.accepted', 'vars.maxConcurrent', 'attributes.headers', 'payload'],
    level: ['WARN'],
    checks: [
      says(/shed|rejected|turned away|overload/i, 'Requests shed'),
      labelled('windowSec'),
      labelled('rejected'),
      labelled('accepted'),
      labelled('maxConcurrent'),
      { not: /attributes\.headers/, say: 'Leave the headers out. A count is all this line needs.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Requests shed windowSec=$(vars.windowSec) rejected=$(vars.rejected) accepted=$(vars.accepted) maxConcurrent=$(vars.maxConcurrent)"]',
    },
    explain: 'Rejected against accepted shows how far demand is past capacity, minute by minute.',
  },
  {
    id: 'log-11050',
    kind: 'write',
    situation:
      'The on-sale load has dropped and Greyfriars has stopped turning requests away. vars.rejectedTotal and vars.durationMs hold how many were turned away in all and for how long. Write the line.',
    available: ['vars.rejectedTotal', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/ended|stopped|recovered|back to normal|over/i, 'Load shedding ended'),
      labelled('rejectedTotal'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Load shedding ended rejectedTotal=$(vars.rejectedTotal) durationMs=$(vars.durationMs)"]',
    },
    explain: 'One closing line gives the size and length of the event for the review after the on-sale.',
  },
]
