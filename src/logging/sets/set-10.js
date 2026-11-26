// Logging Lab exercises, set 10. See ../exercises.js for the format.
// Theme: lines that keep a service safe and trusted. Account lockouts, price change audit, feature flags, exchange
// rates that go stale, and stopping an app for a redeploy without losing work.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }

export const SET_10 = [
  // ---------- lg-136 Pinecrest Credit Union: failed logins and lockouts ----------
  {
    id: 'log-10001',
    kind: 'level',
    situation:
      'Pinecrest Credit Union locks a member account for 30 minutes after five wrong passwords in a row. A member has hit the limit and the account is now locked.',
    answer: ['WARN'],
    explain:
      'The app did what it should, so it is not an ERROR. A lockout is still worth seeing: many of them at once can mean an attack, and support needs it when the member calls.',
  },
  {
    id: 'log-10002',
    kind: 'choice',
    situation: 'Which line should Pinecrest log when an account is locked?',
    options: [
      'Account locked userId=M-20417 failedAttempts=5 lockedUntil=2026-11-18T10:45:00Z correlationId=7f3c2a',
      'Login failed for ann.lee@example.com with password Winter2026',
      'User locked out after too many tries, they should call support',
      'Account locked userId=M-20417 failedAttempts=5 channel=web correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'The member ID, the count and the end of the lock are what support needs. The line with channel=web has no lockedUntil, so support cannot tell the member when to try again. The "Login failed" line writes the email and the password typed, which must never reach a log.',
  },
  {
    id: 'log-10003',
    kind: 'multi',
    situation: 'Which facts belong on the Pinecrest lockout line?',
    options: [
      'The password the member typed, masked after the first two characters',
      'The member ID',
      'How many attempts failed',
      'The username, when the username is an email address',
      'When the lock ends',
    ],
    answers: [1, 2, 4],
    explain:
      'A wrong password is often one letter away from the right one, so it is as secret as the real password. An email is personal data. The member ID finds the account without either.',
  },
  {
    id: 'log-10004',
    kind: 'write',
    situation:
      'A Pinecrest account was locked. vars.userId holds the member ID, vars.failedAttempts the count, and vars.lockedUntil when the lock ends. Write the line.',
    available: ['vars.userId', 'vars.failedAttempts', 'vars.lockedUntil', 'payload.username', 'payload.password', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/lock/i, 'Account locked'),
      labelled('userId'),
      labelled('failedAttempts'),
      labelled('lockedUntil'),
      corr,
      noSecrets,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Account locked userId=$(vars.userId) failedAttempts=$(vars.failedAttempts) lockedUntil=$(vars.lockedUntil) correlationId=$(correlationId)"]',
    },
    explain: 'Support can tell the member when the lock ends. Security can count lockouts per hour without reading any personal data.',
  },
  {
    id: 'log-10005',
    kind: 'write',
    situation:
      'In one minute, 400 failed logins came from one source for many different accounts. Pinecrest blocks the source for an hour. vars.sourceIp, vars.failures, vars.accounts and vars.windowSeconds hold the facts. Write the line.',
    available: ['vars.sourceIp', 'vars.failures', 'vars.accounts', 'vars.windowSeconds', 'payload.username', 'payload.password'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/repeated|many|suspicious|possible|blocked|failed logins|brute|attack/i, 'Repeated failed logins from one source'),
      labelled('sourceIp'),
      labelled('failures'),
      labelled('accounts'),
      labelled('windowSeconds'),
      next('next=source blocked for 1 hour'),
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Repeated failed logins from one source sourceIp=$(vars.sourceIp) failures=$(vars.failures) accounts=$(vars.accounts) windowSeconds=$(vars.windowSeconds) next=source blocked for 1 hour"]',
    },
    explain:
      'One line for the pattern is better than 400 lines. Security logs often keep the source IP, which counts as personal data in some places, so keep these lines only as long as your retention rules allow.',
  },

  // ---------- lg-137 Fernhill Grocers: price changes to stores ----------
  {
    id: 'log-10006',
    kind: 'level',
    situation: 'Fernhill Grocers sends a new shelf price to a store system. The store accepts it, and the new price starts tomorrow.',
    answer: ['INFO'],
    explain: 'A price change is a normal business event that someone may need to prove later. INFO keeps it in production.',
  },
  {
    id: 'log-10007',
    kind: 'choice',
    situation: 'Which line best records a Fernhill price change?',
    options: [
      'Price changed sku=40012 storeId=S-118 newPrice=2.19 effectiveFrom=2026-11-19 currency=GBP source=pricing-hub reason=promo promoCode=W11 correlationId=7f3c2a',
      'Price changed sku=40012 storeId=S-118 oldPrice=2.49 newPrice=2.19 effectiveFrom=2026-11-19 changeId=PC-7781 approvedBy=U-552 correlationId=7f3c2a',
      'New price file: <the whole file>',
      'Price changed by maria.santos@fernhill.example sku=40012 storeId=S-118 newPrice=2.19',
    ],
    answer: 1,
    explain:
      'An audit line says what changed, from what to what, from when, and who approved it by user ID. The line with promoCode=W11 has no old price and no change ID, so nobody can prove what changed or who approved it. The whole file is too big, and the email is personal data.',
  },
  {
    id: 'log-10008',
    kind: 'multi',
    situation: 'A store manager says the till charged the old price on Monday. Which facts on the price change lines help answer them?',
    options: [
      'The old and new price',
      'The date the new price starts',
      'The approver\'s name and phone number, to ask them about the change',
      'The change ID that links to the approval',
      'The store ID',
    ],
    answers: [0, 1, 3, 4],
    explain:
      'With these you can see whether the change reached that store and when it was meant to start. A phone number adds nothing and is personal data.',
  },
  {
    id: 'log-10009',
    kind: 'write',
    situation:
      'A Fernhill store accepted a new price. vars.sku, vars.storeId, vars.oldPrice, vars.newPrice and vars.changeId hold the facts. Write the line.',
    available: ['vars.sku', 'vars.storeId', 'vars.oldPrice', 'vars.newPrice', 'vars.changeId', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/price (changed|updated|applied)|new price/i, 'Price changed'),
      labelled('sku'),
      labelled('storeId'),
      labelled('oldPrice'),
      labelled('newPrice'),
      labelled('changeId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Price changed sku=$(vars.sku) storeId=$(vars.storeId) oldPrice=$(vars.oldPrice) newPrice=$(vars.newPrice) changeId=$(vars.changeId) correlationId=$(correlationId)"]',
    },
    explain: 'Old and new on one line means nobody has to compare two files to see what changed.',
  },
  {
    id: 'log-10010',
    kind: 'write',
    situation:
      'A Fernhill store system refused a new price because it is below cost. The change goes to the pricing team. vars.sku, vars.storeId, vars.newPrice and vars.reason hold the facts. Write the line.',
    available: ['vars.sku', 'vars.storeId', 'vars.newPrice', 'vars.reason', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rejected|refused|not applied/i, 'Price change rejected'),
      labelled('sku'),
      labelled('storeId'),
      labelled('reason'),
      next('next=sent to pricing team'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Price change rejected sku=$(vars.sku) storeId=$(vars.storeId) newPrice=$(vars.newPrice) reason=$(vars.reason) next=sent to pricing team correlationId=$(correlationId)"]',
    },
    explain: 'The store kept the old price and a person will decide. WARN with the reason and the next step tells everyone where the change is.',
  },

  // ---------- lg-138 Driftwood Travel: feature flags and configuration ----------
  {
    id: 'log-10011',
    kind: 'level',
    situation:
      'Driftwood Travel switches a feature flag at runtime. From now on, fare searches use the new fare engine. Nothing failed.',
    answer: ['INFO'],
    explain:
      'A flag change alters what the app does for every request. When results change, the first question is "what changed and when?", so INFO keeps the answer in production.',
  },
  {
    id: 'log-10012',
    kind: 'choice',
    situation: 'Which line should Driftwood log when the flag changes?',
    options: [
      'Config: {"newFareEngine":true,"db.password":"…","fareApi.secret":"…"}',
      'Feature flag changed flag=newFareEngine newValue=true environment=prod version=2.14.0',
      'Feature flag changed flag=newFareEngine oldValue=false newValue=true changedBy=U-204 source=config-service',
      'New fare engine switched on in production, watch the fares closely',
    ],
    answer: 2,
    explain: 'Which flag, from what, to what, and who. The line with environment=prod leaves out the old value and who changed it. The "Config:" line dumps the whole configuration with its secrets.',
  },
  {
    id: 'log-10013',
    kind: 'multi',
    situation: 'A developer logs the whole configuration at start-up "to help support". Which statements about this are true?',
    code: '<logger level="INFO" message="#[write(p(\'app.config\'), \'application/json\')]" />',
    options: [
      'The configuration often holds passwords and client secrets',
      'Mule refuses to deploy an app whose logger reads a property with p()',
      'It is a long line on every start that hides the useful ones',
      'The app version, environment and flag values are enough, logged by name',
    ],
    answers: [0, 2, 3],
    explain:
      'Log the facts support needs, by name: version, environment and the flags that change behaviour. Reading a property in a logger works fine, which is what makes the leak possible.',
  },
  {
    id: 'log-10014',
    kind: 'write',
    situation:
      'A Driftwood feature flag changed. vars.flag holds its name, vars.oldValue and vars.newValue the values, and vars.changedBy the user ID. Write the line.',
    available: ['vars.flag', 'vars.oldValue', 'vars.newValue', 'vars.changedBy', 'payload'],
    level: ['INFO'],
    checks: [
      says(/flag|switched|toggled/i, 'Feature flag changed'),
      labelled('flag'),
      labelled('oldValue'),
      labelled('newValue'),
      labelled('changedBy'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Feature flag changed flag=$(vars.flag) oldValue=$(vars.oldValue) newValue=$(vars.newValue) changedBy=$(vars.changedBy)"]',
    },
    explain: 'There is no request here, so no correlation ID. The time of the line, next to a graph of errors, shows whether the flag caused a change.',
  },
  {
    id: 'log-10015',
    kind: 'write',
    situation:
      'Driftwood reloads its configuration every 5 minutes. This time the new version could not be read, so the app keeps the version it has. vars.configVersion holds the version in use. Write the line.',
    available: ['vars.configVersion', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN'],
    checks: [
      says(/reload|refresh|config/i, 'Configuration reload failed'),
      labelled('configVersion'),
      errorFacts,
      next('next=kept previous configuration'),
      noSecrets,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Configuration reload failed configVersion=$(vars.configVersion) errorType=$(error.errorType) error=$(error.description) next=kept previous configuration"]',
    },
    explain: 'The app still works on the old version, so WARN. The version in use tells the team which settings are live right now.',
  },

  // ---------- lg-139 Harbour Exchange: exchange rates that go stale ----------
  {
    id: 'log-10016',
    kind: 'level',
    situation:
      'Harbour Exchange loads exchange rates every hour. The last three loads failed, so the rates are three hours old. Rates up to four hours old are allowed, and payments still go through.',
    answer: ['WARN'],
    explain: 'Nothing has failed for customers yet, but it will within the hour. WARN gives the team time to act before the limit.',
  },
  {
    id: 'log-10017',
    kind: 'choice',
    situation: 'Which line best warns that the rates are getting old?',
    options: [
      'Exchange rates stale ageMinutes=185 limitMinutes=240 lastLoaded=2026-11-18T07:00:00Z provider=fx-feed next=retry in 10 min',
      'Exchange rates stale ageMinutes=185 lastLoaded=2026-11-18T07:00:00Z provider=fx-feed currencies=162 checkedBy=rates-monitor',
      'FX feed broken, please check',
      'Rates: {"EUR":1.0842,"GBP":0.8571, … 160 more}',
    ],
    answer: 0,
    explain: 'How old, against what limit, since when, and what happens next. The team can see at a glance how much time is left. The line with checkedBy=rates-monitor has no limit and no next step, so the reader cannot tell how urgent it is.',
  },
  {
    id: 'log-10018',
    kind: 'multi',
    situation: 'Which facts belong on the line after a successful rate load?',
    options: [
      'The provider API key, to check which account was used',
      'How many currencies were loaded',
      'Every rate in the table, so a bad rate can be found later',
      'The time the provider says the rates are for',
      'How long the load took',
    ],
    answers: [1, 3, 4],
    explain:
      'A count that drops shows a partial load. The provider time shows rates that are fresh to you but old at the source. The table is long and belongs in the store, not the log.',
  },
  {
    id: 'log-10019',
    kind: 'write',
    situation:
      'Harbour Exchange loaded new rates. vars.currencies holds the count, vars.rateTime the time the provider gives, and vars.durationMs how long it took. Write the line.',
    available: ['vars.currencies', 'vars.rateTime', 'vars.durationMs', 'vars.apiKey', 'payload'],
    level: ['INFO'],
    checks: [
      says(/loaded|refreshed|updated/i, 'Exchange rates loaded'),
      labelled('currencies'),
      labelled('rateTime'),
      durationVar,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Exchange rates loaded currencies=$(vars.currencies) rateTime=$(vars.rateTime) durationMs=$(vars.durationMs)"]',
    },
    explain: 'One line an hour, the same shape every time. An alert can fire on a missing line or a lower count.',
  },
  {
    id: 'log-10020',
    kind: 'write',
    situation:
      'The rates are now older than the four hour limit. Harbour Exchange pauses payments in foreign currency until a load works. vars.ageMinutes and vars.limitMinutes hold the facts. Write the line.',
    available: ['vars.ageMinutes', 'vars.limitMinutes', 'error.errorType', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/stale|too old|expired|out of date/i, 'Exchange rates too old'),
      labelled('ageMinutes'),
      labelled('limitMinutes'),
      next('next=foreign currency payments paused'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Exchange rates too old ageMinutes=$(vars.ageMinutes) limitMinutes=$(vars.limitMinutes) next=foreign currency payments paused"]',
    },
    explain: 'Customers are now affected and someone must act, so ERROR. The next field tells support why foreign payments are on hold.',
  },

  // ---------- lg-140 Saltmarsh Logistics: stopping for a redeploy ----------
  {
    id: 'log-10021',
    kind: 'level',
    situation:
      'Saltmarsh Logistics redeploys its shipment app. The app is stopping and lets the 12 messages it is working on finish first.',
    answer: ['INFO'],
    explain: 'A planned stop is a normal event. The line marks the gap in the logs, so nobody mistakes it for a crash later.',
  },
  {
    id: 'log-10022',
    kind: 'choice',
    situation: 'Which line should the app log when it starts to stop?',
    options: [
      'Shutdown started reason=redeploy graceMs=30000 version=2.14.0 replica=2 requestedBy=U-204',
      'Shutdown started reason=redeploy inFlight=12 graceMs=30000 version=2.14.0',
      'Stopping the app now, please wait for the redeploy to finish',
      'Shutdown started, messages: <all 12 message bodies>',
    ],
    answer: 1,
    explain: 'Why it is stopping, how much work is in progress, how long it will wait, and which version. The line with requestedBy=U-204 has no in-progress count, so nobody can later check that all 12 messages finished. The bodies add size and risk.',
  },
  {
    id: 'log-10023',
    kind: 'multi',
    situation: 'After a redeploy, the team must show that no shipment was lost. Which lines help?',
    options: [
      'The shutdown start line with the count in progress',
      'A line with every message body, written as each one finishes',
      'The shutdown end line with how many finished and how many went back to the queue',
      'The start-up line of the new version',
    ],
    answers: [0, 2, 3],
    explain:
      'In progress at the start should equal finished plus returned at the end, and the new version should pick up the returned ones. Bodies do not prove anything the counts do not.',
  },
  {
    id: 'log-10024',
    kind: 'write',
    situation:
      'The Saltmarsh app has stopped. vars.completed holds how many messages finished, vars.returnedToQueue how many went back for redelivery, and vars.durationMs how long the stop took. Write the line.',
    available: ['vars.completed', 'vars.returnedToQueue', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/shutdown|stopp/i, 'Shutdown finished'),
      labelled('completed'),
      labelled('returnedToQueue'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Shutdown finished completed=$(vars.completed) returnedToQueue=$(vars.returnedToQueue) durationMs=$(vars.durationMs)"]',
    },
    explain: 'Completed plus returned should match the in-progress count from the start line. If it does not, a message needs looking for.',
  },
  {
    id: 'log-10025',
    kind: 'write',
    situation:
      'One shipment message did not finish before the grace period ended. It goes back to the queue, and the new version will take it. vars.messageId and vars.shipmentId hold the IDs. Write the line.',
    available: ['vars.messageId', 'vars.shipmentId', 'payload', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/not finished|interrupted|returned|stopped before/i, 'Message not finished before shutdown'),
      labelled('messageId'),
      labelled('shipmentId'),
      next('next=returned to queue'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Message not finished before shutdown messageId=$(vars.messageId) shipmentId=$(vars.shipmentId) next=returned to queue correlationId=$(correlationId)"]',
    },
    explain:
      'The message is safe, but its work may have started. The shipment ID lets the team check it was not handled twice when the new version took it.',
  },
]
