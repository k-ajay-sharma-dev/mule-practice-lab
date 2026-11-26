// Logging Lab exercises, set 7. See ../exercises.js for the format.
// Theme: lines for the things that go wrong between systems. Retries in Until Successful, duplicate messages,
// partner rate limits, OAuth tokens and nightly reconciliation jobs.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=|queue|dlq|dead.?letter|resent|sent again/i,
  say: `Say what happens next, such as ${example}.`,
})

export const SET_7 = [
  // ---------- lg-121 Copperfield Freight: retries in Until Successful ----------
  {
    id: 'log-7001',
    kind: 'level',
    situation:
      'Copperfield Freight books loads with a carrier through Until Successful. The Carrier API call timed out on attempt 2 of 5, and the scope will try again in 10 seconds. You log one line for the failed attempt.',
    answer: ['WARN'],
    explain:
      'The app is handling it, so it is not an ERROR yet. WARN lets the team count retries per carrier, and a rise in them warns of trouble before bookings start to fail.',
  },
  {
    id: 'log-7002',
    kind: 'choice',
    situation: 'Which line should Copperfield Freight log for each failed attempt inside Until Successful?',
    options: [
      'Carrier booking failed, will retry shipmentId=SH-9001 errorType=HTTP:TIMEOUT carrier=northline timeoutMs=30000 correlationId=7f3c2a',
      'Carrier booking failed, will retry shipmentId=SH-9001 carrier=northline attempt=2 maxAttempts=5 errorType=HTTP:TIMEOUT correlationId=7f3c2a',
      'Carrier booking failed after all retries shipmentId=SH-9001 attempt=2 maxAttempts=5 errorType=HTTP:TIMEOUT correlationId=7f3c2a',
      'Carrier booking failed, will retry shipmentId=SH-9001 attempt=2 maxAttempts=5 errorType=MULE:RETRY_EXHAUSTED correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'It names the shipment, which attempt this is out of how many, and why it failed. The line with timeoutMs=30000 has no attempt number, so nobody can tell how close the booking is to giving up. "After all retries" is wrong on attempt 2 of 5. MULE:RETRY_EXHAUSTED is raised only once the last attempt fails; each attempt fails with the error of the call.',
  },
  {
    id: 'log-7003',
    kind: 'multi',
    situation:
      'The retry lines Until Successful writes carry none of your IDs, so Copperfield Freight counts the attempts in vars.attempt and writes its own line for each failed attempt. Which facts belong on that line?',
    options: [
      'A timestamp of the attempt, as a field in the message',
      'The attempt number and the maximum number of attempts',
      'The shipment ID',
      "The carrier's response body, to see what the carrier said",
      'The error type and description',
    ],
    answers: [1, 2, 4],
    explain:
      'The attempt number shows how close the booking is to giving up. The shipment ID and error say which load and why. The pattern layout already puts a timestamp on every line. On a timeout no response arrived, so there is no carrier body to log.',
  },
  {
    id: 'log-7004',
    kind: 'write',
    situation:
      'Inside Until Successful, the Carrier API call failed and the scope will try again. vars.shipmentId holds the load and vars.attempt the attempt number. Write the line for the failed attempt.',
    available: ['vars.shipmentId', 'vars.attempt', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/retry|attempt/i, 'Carrier booking failed, will retry'),
      labelled('shipmentId'),
      { must: /vars\.attempt/, say: 'Add the attempt number: attempt=$(vars.attempt).' },
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Carrier booking failed, will retry shipmentId=$(vars.shipmentId) attempt=$(vars.attempt) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'WARN, because the scope is still trying. With the attempt number and the error on each line, one search shows the whole story of a booking.',
  },
  {
    id: 'log-7005',
    kind: 'write',
    situation:
      'All 5 attempts failed and Until Successful raised MULE:RETRY_EXHAUSTED. The error handler puts the shipment on the manual booking queue. vars.shipmentId holds the load. Write the line in that handler, with the number of attempts and where the shipment went.',
    available: ['vars.shipmentId', 'vars.attempt', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|not booked|exhausted/i, 'Carrier booking failed after all retries'),
      labelled('shipmentId'),
      labelled('attempts?', 'attempts=5'),
      errorFacts,
      next('next=sent to manual booking queue'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Carrier booking failed after all retries shipmentId=$(vars.shipmentId) attempts=5 errorType=$(error.errorType) error=$(error.description) next=sent to manual booking queue correlationId=$(correlationId)"]',
    },
    explain:
      'Now the work has failed and a person must book the load, so ERROR. The next field tells support where the shipment waits.',
  },

  // ---------- lg-122 Larkspur Pharmacy: duplicate messages ----------
  {
    id: 'log-7006',
    kind: 'level',
    situation:
      'Larkspur Pharmacy reads prescriptions from a queue. The Idempotent Message Validator rejects a message that was already processed, and the flow catches MULE:DUPLICATE_MESSAGE and drops the copy. It happens a few times a day after the broker reconnects.',
    answer: ['INFO', 'WARN'],
    explain:
      'A copy after a reconnect is expected with at least once delivery, and the app handled it. INFO is enough. WARN is fine too if the team wants to count them, since there are only a few a day.',
  },
  {
    id: 'log-7007',
    kind: 'choice',
    situation: 'Which line should Larkspur Pharmacy log when it drops a duplicate prescription message?',
    options: [
      'MULE:DUPLICATE_MESSAGE raised by the Idempotent Message Validator in flow prescription-consumer',
      'Duplicate prescription message skipped messageId=msg-7781 queue=rx-inbound source=prescriber-gateway deliveryCount=2 correlationId=7f3c2a',
      'Duplicate prescription message skipped prescriptionId=RX-55120 messageId=msg-7781 deliveryCount=2 correlationId=7f3c2a',
      'Duplicate prescription message processed prescriptionId=RX-55120 messageId=msg-7781 deliveryCount=2 correlationId=7f3c2a',
    ],
    answer: 2,
    explain:
      'It says what happened and which prescription and message it was, with the delivery count. The line with queue=rx-inbound has no prescription ID, so a pharmacist who asks about one prescription cannot find it. "processed" says the copy was handled again, the opposite of what happened. The error type line names no prescription or message.',
  },
  {
    id: 'log-7008',
    kind: 'multi',
    situation:
      'A pharmacist says one Larkspur prescription was filled twice. Which log lines help prove whether the duplicate check worked?',
    options: [
      'A line when each message arrives, with messageId and prescriptionId',
      'A count of messages read per minute, logged once a minute',
      'The duplicate skipped line, with messageId',
      'A line with the queue depth each time the broker reconnects',
      'A line when the Pharmacy System confirms the fill, with prescriptionId',
    ],
    answers: [0, 2, 4],
    explain:
      'Arrival, skip and fill lines with the same IDs show whether one message was filled twice, or two different messages arrived for one prescription. A count per minute and the queue depth describe the traffic, but neither ties to one prescription.',
  },
  {
    id: 'log-7009',
    kind: 'write',
    situation:
      'The Larkspur flow caught MULE:DUPLICATE_MESSAGE and drops the copy. vars.prescriptionId, vars.messageId and vars.deliveryCount hold the facts. Write the line.',
    available: ['vars.prescriptionId', 'vars.messageId', 'vars.deliveryCount', 'payload', 'payload.patient.dateOfBirth', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/duplicate/i, 'Duplicate prescription message skipped'),
      labelled('prescriptionId'),
      labelled('messageId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Duplicate prescription message skipped prescriptionId=$(vars.prescriptionId) messageId=$(vars.messageId) deliveryCount=$(vars.deliveryCount) correlationId=$(correlationId)"]',
    },
    explain:
      'The prescription and message IDs let support match this line to the first delivery. The delivery count shows it came from a redelivery.',
  },
  {
    id: 'log-7010',
    kind: 'write',
    situation:
      'The Pharmacy System API answered 500 on the fifth delivery of a Larkspur prescription message. The message has used all its deliveries and goes to the dead letter queue. vars.prescriptionId and vars.deliveryCount are set. Write the line, with the delivery count and where the message went.',
    available: ['vars.prescriptionId', 'vars.deliveryCount', 'error.errorType', 'error.description', 'payload', 'payload.patient.name', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|not filled/i, 'Prescription not filled'),
      labelled('prescriptionId'),
      labelled('deliveryCount'),
      errorFacts,
      next('next=sent to DLQ'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Prescription not filled after last delivery prescriptionId=$(vars.prescriptionId) deliveryCount=$(vars.deliveryCount) errorType=$(error.errorType) error=$(error.description) next=sent to DLQ correlationId=$(correlationId)"]',
    },
    explain:
      'A prescription is stuck and a person must act, so ERROR. Saying it went to the DLQ tells support where to find it and replay it.',
  },

  // ---------- lg-123 Brambleton Travel: partner rate limits ----------
  {
    id: 'log-7011',
    kind: 'level',
    situation:
      'The Brambleton Travel hotel search calls a partner Hotel API. About 1 call in 2,000 gets 429 Too Many Requests. The flow waits the Retry-After seconds and the next call works.',
    answer: ['WARN'],
    explain:
      'It is handled, so not ERROR. But a 429 means Brambleton is close to the partner limit, and WARN lets the team see when that starts to happen more often.',
  },
  {
    id: 'log-7012',
    kind: 'choice',
    situation: 'Which line should Brambleton Travel log when the Hotel API answers 429?',
    options: [
      'Hotel API rate limit hit, waiting before retry hotelId=H-2201 status=429 retryAfterMs=30 correlationId=7f3c2a',
      'Hotel API rate limit hit, waiting before retry hotelId=H-2201 status=429 retryAfter=30 searchHotelIds=H-2201,H-2202,H-2207,H-2215,H-2230,H-2241 correlationId=7f3c2a',
      'Hotel API call failed, giving up hotelId=H-2201 status=429 retryAfter=30 correlationId=7f3c2a',
      'Hotel API rate limit hit, waiting before retry hotelId=H-2201 status=429 retryAfter=30 correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It says what happened, which hotel, the status and how long the flow waits. Retry-After is in seconds, so retryAfterMs=30 gives the wrong unit. "giving up" is wrong when the flow waits and tries again. The list of every hotel in the search says nothing about this one call, and it makes each line grow with the size of the search.',
  },
  {
    id: 'log-7013',
    kind: 'multi',
    situation:
      'The partner says Brambleton Travel calls the Hotel API too fast. Which facts in the logs let the team check that?',
    options: [
      'The response time of each call, labelled as durationMs',
      'A count of calls sent each minute, to compare with the partner limit',
      'The Retry-After value the partner sent with each 429',
      'The total number of calls since the app started, logged once at shutdown',
      'The status code, labelled, on each call line',
    ],
    answers: [1, 2, 4],
    explain:
      'Calls per minute against the limit, plus the 429s and their Retry-After values, show whether Brambleton goes over. Response time says how slow the partner is, not how often it is called. One total at shutdown hides the bursts that break a per minute limit.',
  },
  {
    id: 'log-7014',
    kind: 'write',
    situation:
      'The Hotel API answered 429. The flow waits the number of seconds in vars.retryAfter before it tries again. vars.hotelId holds the hotel and attributes.statusCode the status. Write the line with the hotel, the status and the wait.',
    available: ['vars.hotelId', 'vars.retryAfter', 'attributes.statusCode', 'attributes.headers', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rate limit|429|too many/i, 'Hotel API rate limit hit'),
      labelled('hotelId'),
      labelled('status', 'status=$(attributes.statusCode)'),
      labelled('retryAfter', 'retryAfter=$(vars.retryAfter)'),
      corr,
      { not: /attributes\.headers(?![.\["'\w])/, say: 'Do not log every header. They carry the API key.' },
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Hotel API rate limit hit, waiting before retry hotelId=$(vars.hotelId) status=$(attributes.statusCode) retryAfter=$(vars.retryAfter) correlationId=$(correlationId)"]',
    },
    explain:
      'The wait time on the line explains slow searches, and a count of these lines over a day shows how close Brambleton runs to the limit.',
  },
  {
    id: 'log-7015',
    kind: 'write',
    situation:
      'A scheduler in the Brambleton app logs one line a minute with the Hotel API calls sent in the last minute (vars.callsSent), how many got 429 (vars.rateLimited) and the partner limit (vars.partnerLimit). Write that line.',
    available: ['vars.callsSent', 'vars.rateLimited', 'vars.partnerLimit', 'payload'],
    level: ['INFO'],
    checks: [
      says(/calls|rate/i, 'Hotel API calls last minute'),
      labelled('callsSent'),
      labelled('rateLimited'),
      labelled('limit', 'limit=$(vars.partnerLimit)'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Hotel API calls last minute callsSent=$(vars.callsSent) rateLimited=$(vars.rateLimited) limit=$(vars.partnerLimit)"]',
    },
    explain:
      'One line a minute is a small volume, and a chart of callsSent against limit shows the partner, in numbers, whether Brambleton goes over.',
  },

  // ---------- lg-124 Kestrel Insurance: OAuth tokens ----------
  {
    id: 'log-7016',
    kind: 'level',
    situation:
      'The Kestrel Insurance claims app gets a new OAuth access token for the Claims Core API every 55 minutes. You log that a new token was fetched and when it expires.',
    answer: ['INFO', 'DEBUG'],
    explain:
      'About 26 lines a day is small. INFO helps when calls start failing with 401, because it shows when the last token was fetched. DEBUG is fine if the team only needs it while troubleshooting.',
  },
  {
    id: 'log-7017',
    kind: 'choice',
    situation:
      'The Kestrel claims app fetches a new access token every 55 minutes, and the provider answers with expires_in=3600. Which line should it log?',
    options: [
      'Access token requested from identity provider clientId=claims-intake expiresIn=3600',
      'Access token refreshed for Claims Core API clientId=claims-intake scope=claims.write',
      'Access token refreshed for Claims Core API clientId=claims-intake expiresIn=3300',
      'Access token refreshed for Claims Core API clientId=claims-intake expiresIn=3600',
    ],
    answer: 3,
    explain:
      'It says what happened, which client and when the token expires, as the provider gave it. expiresIn=3300 is the 55 minute refresh timer of the app, not the life of the token, so it hides how long the token stays valid. The line with scope=claims.write leaves out expiresIn, so when calls fail with 401 you cannot tell if the token had run out. "requested" is written before the answer, when expiresIn is not known yet.',
  },
  {
    id: 'log-7018',
    kind: 'multi',
    situation:
      'At 02:00 the Kestrel token call failed with 401 and no claims were sent for an hour. Which facts in the logs would have shown the cause fast?',
    options: [
      'The status code of the token call',
      'The expiry time of the last token that worked',
      'The error description from the identity provider, such as invalid_client',
      'The number of claims waiting to be sent',
      'The client ID used, which is not a secret',
    ],
    answers: [0, 2, 4],
    explain:
      'The status, the provider error and the client ID point at an expired or rotated secret. A 401 on the token call means the credentials were refused, so the expiry of the old token does not explain it. The queue size shows the impact, not the cause.',
  },
  {
    id: 'log-7019',
    kind: 'write',
    situation:
      'The Kestrel token call failed. Claims are held until the next attempt. vars.clientId holds the client ID and vars.clientSecret the secret. Write the line in the error handler.',
    available: ['vars.clientId', 'vars.clientSecret', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|not (get|fetch|obtain)/i, 'Could not get access token for Claims Core API'),
      labelled('clientId'),
      errorFacts,
      { not: /secret/i, say: 'Never log the client secret.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Could not get access token for Claims Core API clientId=$(vars.clientId) errorType=$(error.errorType) error=$(error.description) next=claims held until the next attempt correlationId=$(correlationId)"]',
    },
    explain:
      'No claims go out until this is fixed, so ERROR. The client ID and the provider error are enough to see a rotated or expired secret, without logging the secret.',
  },
  {
    id: 'log-7020',
    kind: 'write',
    situation:
      'The Kestrel claims app fetched a new access token. vars.clientId holds the client ID, vars.expiresIn the seconds until it expires, and vars.accessToken the token. Write the line.',
    available: ['vars.clientId', 'vars.expiresIn', 'vars.accessToken', 'payload'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/refresh|fetched|new access token/i, 'Access token refreshed'),
      labelled('clientId'),
      labelled('expiresIn'),
      { not: /vars\.accessToken|access_token/, say: 'Never log the token itself. Log when it expires.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Access token refreshed for Claims Core API clientId=$(vars.clientId) expiresIn=$(vars.expiresIn)"]',
    },
    explain:
      'When calls fail with 401, this line shows when the last token was fetched and how long it was valid, with nothing an attacker could use.',
  },

  // ---------- lg-125 Ashgrove Utilities: nightly reconciliation ----------
  {
    id: 'log-7021',
    kind: 'level',
    situation:
      'The Ashgrove Utilities nightly job compared 480,000 meter readings between the head-end system and billing. 12 were missing in billing and were sent again. You log one summary line at the end with the counts.',
    answer: ['INFO'],
    explain:
      'The end of a job is a normal event, so INFO with the counts. Each missing reading gets its own WARN line when it is found.',
  },
  {
    id: 'log-7022',
    kind: 'choice',
    situation: 'Which summary line should the Ashgrove reconciliation job log at the end?',
    options: [
      'Meter reconciliation finished runDate=2026-11-16 compared=480000 matched=479988 missing=12 resent=12 durationMs=812000',
      'Meter reconciliation finished runDate=2026-11-16 missing=12 resent=12 durationMs=812000',
      'Meter reconciliation finished runDate=2026-11-16 compared=480000 matched=479988 missing=12 resent=12 duration=13m32s',
      'Meter reconciliation finished region=north-west feed=amr compared=480000 matched=479988 missing=12 resent=12 durationMs=812000',
    ],
    answer: 0,
    explain:
      'Labelled counts can be charted night after night, and the run date ties the line to one run. The line with region=north-west has the same counts but no run date, so a rerun of last night cannot be told apart from tonight. Without compared and matched, a chart cannot show the share that went missing. "13m32s" is text that a chart cannot plot.',
  },
  {
    id: 'log-7023',
    kind: 'multi',
    situation: 'Which choices keep the Ashgrove reconciliation logs useful?',
    options: [
      'Every reading logged at INFO, so any meter can be looked up later',
      'One summary line at INFO with the counts',
      'One ERROR line per missing reading, since a missing reading is lost data',
      'One WARN line per missing reading, with meterId and readingDate',
      'The run date, labelled, on every line, so two runs are not mixed up',
    ],
    answers: [1, 3, 4],
    explain:
      'A summary plus a line per problem keeps the volume small and the problems findable. The job resends the missing readings, so they are handled, which is WARN and not ERROR. 480,000 lines a night for every reading bury the 12 that matter.',
  },
  {
    id: 'log-7024',
    kind: 'write',
    situation:
      'The Ashgrove job found a meter reading in the head-end system that is missing in billing, and sends it again. vars.meterId, vars.readingDate and vars.runDate hold the facts. Write the line.',
    available: ['vars.meterId', 'vars.readingDate', 'vars.runDate', 'payload', 'payload.customer.address', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/missing/i, 'Reading missing in billing'),
      labelled('meterId'),
      labelled('readingDate'),
      labelled('runDate'),
      next('next=resent to billing'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Reading missing in billing meterId=$(vars.meterId) readingDate=$(vars.readingDate) runDate=$(vars.runDate) next=resent to billing correlationId=$(correlationId)"]',
    },
    explain:
      'The job fixed it, so WARN, not ERROR. The meter and reading date let billing confirm the resend arrived, and the run date ties the line to tonight.',
  },
  {
    id: 'log-7025',
    kind: 'write',
    situation:
      'The Ashgrove reconciliation job finished. vars.runDate, vars.compared, vars.matched, vars.missing and vars.durationMs hold the results. Write the summary line.',
    available: ['vars.runDate', 'vars.compared', 'vars.matched', 'vars.missing', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/reconcil/i, 'Meter reconciliation finished'),
      labelled('runDate'),
      labelled('compared'),
      labelled('matched'),
      labelled('missing'),
      { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Meter reconciliation finished runDate=$(vars.runDate) compared=$(vars.compared) matched=$(vars.matched) missing=$(vars.missing) durationMs=$(vars.durationMs)"]',
    },
    explain:
      'A chart of missing over many nights shows whether the feed to billing is getting worse, and durationMs warns when the job starts to run into the morning.',
  },
]
