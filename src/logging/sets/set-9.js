// Logging Lab exercises, set 9. See ../exercises.js for the format.
// Theme: lines that keep running services healthy. Bounced statements, retiring an API version, health checks,
// partner file uploads and queue backlogs.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
const noHeaders = { not: /attributes\.headers/, say: 'Do not log the headers. They carry the client secret.' }

export const SET_9 = [
  // ---------- lg-131 Larchmont Lettings: monthly statements ----------
  {
    id: 'log-9001',
    kind: 'level',
    situation:
      'Larchmont Lettings sends 3,000 monthly statements to landlords. One message bounced because the mailbox does not exist, and a paper copy is queued instead. The rest were sent.',
    answer: ['WARN'],
    explain:
      'The run handled it with a fallback, so it is not an ERROR. WARN lets the team count bounced landlords and fix their contact details.',
  },
  {
    id: 'log-9002',
    kind: 'choice',
    situation: 'Which line should Larchmont log for a statement that bounced?',
    options: [
      'Email failed',
      'Statement not delivered landlordId=L-4410 statementId=ST-2026-11-4410 reason=mailbox does not exist next=paper copy queued correlationId=7f3c2a',
      'Email to jane.doe@example.com failed: 550 user unknown',
      'SMTP error',
    ],
    answer: 1,
    explain:
      'IDs let support find the landlord in the CRM without putting the address in the logs. The reason and the next step say what to fix and what already happened.',
  },
  {
    id: 'log-9003',
    kind: 'multi',
    situation: 'Which facts belong on the last line of the Larchmont statement run?',
    options: [
      'How many statements were sent',
      'How many failed',
      'How long the run took',
      'Every address the run wrote to',
      'The full text of the first statement',
    ],
    answers: [0, 1, 2],
    explain:
      'Counts and duration show whether the run was normal, night after night. Addresses are personal data and the statement text holds financial details.',
  },
  {
    id: 'log-9004',
    kind: 'write',
    situation:
      'A Larchmont statement bounced, and a paper copy is queued. vars.landlordId and vars.statementId hold the IDs, vars.email the address. Write the line.',
    available: ['vars.landlordId', 'vars.statementId', 'vars.email', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/not (sent|delivered)|fail|could not|bounced/i, 'Statement not delivered'),
      labelled('landlordId'),
      labelled('statementId'),
      errorFacts,
      next('next=paper copy queued'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Statement not delivered landlordId=$(vars.landlordId) statementId=$(vars.statementId) errorType=$(error.errorType) error=$(error.description) next=paper copy queued correlationId=$(correlationId)"]',
    },
    explain:
      'The landlord ID is enough to look up the address in the CRM. The next field tells support the landlord will still get the statement.',
  },
  {
    id: 'log-9005',
    kind: 'write',
    situation:
      'The Larchmont statement run finished. vars.runId, vars.sent, vars.failed and vars.durationMs hold the results. Write the summary line.',
    available: ['vars.runId', 'vars.sent', 'vars.failed', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/statement run|finished|complet/i, 'Statement run finished'),
      labelled('runId'),
      labelled('sent'),
      labelled('failed'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Statement run finished runId=$(vars.runId) sent=$(vars.sent) failed=$(vars.failed) durationMs=$(vars.durationMs)"]',
    },
    explain:
      'One line per run with labelled counts can be charted month by month, and a jump in failed shows a problem with the mail service or the data.',
  },

  // ---------- lg-132 Cobalt Parcels: retiring API version 1 ----------
  {
    id: 'log-9006',
    kind: 'level',
    situation:
      'Cobalt Parcels will retire version 1 of its parcel API in 60 days. The first call each day from each client still using v1 gets one line, so the team can chase them.',
    answer: ['INFO', 'WARN'],
    explain:
      'The call worked and the retirement is planned, so nothing is broken yet. INFO fits. WARN is fine if the team wants these lines on its warning dashboard.',
  },
  {
    id: 'log-9007',
    kind: 'choice',
    situation: 'Which line should Cobalt log for a client still calling v1?',
    options: [
      'Deprecated API version called clientId=app-118 path=/v1/parcels retireOn=2027-01-31 correlationId=7f3c2a',
      'v1 used',
      'Old API!!!',
      'Deprecated call, headers={client_id=app-118, client_secret=...}',
    ],
    answer: 0,
    explain:
      'The client ID, path and date are what the team needs to contact the client. The last line leaks the client secret.',
  },
  {
    id: 'log-9008',
    kind: 'multi',
    situation: 'Which facts help Cobalt move every client off v1 before the date?',
    options: [
      'The client ID',
      'The endpoint path the client calls',
      'A count of v1 calls per client per day',
      'The client secret',
      'The full request body',
    ],
    answers: [0, 1, 2],
    explain:
      'Who, which endpoint and how much tell the team whom to call and what they need to change. Secrets and bodies do not help and add risk.',
  },
  {
    id: 'log-9009',
    kind: 'write',
    situation:
      'A client called Cobalt v1. vars.clientId holds the client, vars.retireOn the retirement date, and attributes.requestPath the path. Write the line.',
    available: ['vars.clientId', 'vars.retireOn', 'attributes.requestPath', 'attributes.headers', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/deprecat|old version/i, 'Deprecated API version called'),
      labelled('clientId'),
      labelled('path', 'path=$(attributes.requestPath)'),
      labelled('retireOn'),
      corr,
      noHeaders,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Deprecated API version called clientId=$(vars.clientId) path=$(attributes.requestPath) retireOn=$(vars.retireOn) correlationId=$(correlationId)"]',
    },
    explain:
      'A search for these lines grouped by clientId is the chase list. The date on each line reminds anyone reading it how much time is left.',
  },
  {
    id: 'log-9010',
    kind: 'write',
    situation:
      'v1 is now retired and answers 410 Gone. A Cobalt client called it again. vars.clientId holds the client and attributes.requestPath the path. Write the line.',
    available: ['vars.clientId', 'attributes.requestPath', 'attributes.headers', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/retired|gone|410/i, 'Call to retired API version rejected'),
      labelled('clientId'),
      labelled('status', 'status=410'),
      corr,
      noHeaders,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Call to retired API version rejected clientId=$(vars.clientId) path=$(attributes.requestPath) status=410 correlationId=$(correlationId)"]',
    },
    explain:
      'The client is now failing, so WARN, and support can call them at once with the client ID and path.',
  },

  // ---------- lg-133 Pelham Energy: health checks ----------
  {
    id: 'log-9011',
    kind: 'level',
    situation:
      'The load balancer calls the Pelham Energy meter API /health endpoint every 10 seconds. The database and the queue are both up. You want a line for each probe while you test the endpoint.',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'A probe every 10 seconds is 8,640 lines a day that say all is well. Keep them at DEBUG or TRACE, and log at INFO or above only when a status changes.',
  },
  {
    id: 'log-9012',
    kind: 'choice',
    situation: 'The Pelham meter database became unreachable. Which line should the health check log?',
    options: [
      'Health check failed',
      'Dependency status changed dependency=meter-db from=UP to=DOWN errorType=DB:CONNECTIVITY',
      'meter-db DOWN (logged again on every probe, every 10 seconds)',
      'Health: full config dump with the database URL, user name and password',
    ],
    answer: 1,
    explain:
      'One line when the status changes, with the dependency and the error, is enough to alert on. Repeating it every probe floods the logs, and the last line leaks the configuration.',
  },
  {
    id: 'log-9013',
    kind: 'multi',
    situation: 'Which choices keep the Pelham health check logs useful?',
    options: [
      'Log only when a dependency changes status',
      'On recovery, log how long the dependency was down',
      'Log one INFO line on every probe',
      'Name the dependency on every line',
      'Log the connection string so support can test it',
    ],
    answers: [0, 1, 3],
    explain:
      'Status changes with names and outage length tell the story in two lines. Probe lines bury it, and connection strings may hold secrets.',
  },
  {
    id: 'log-9014',
    kind: 'write',
    situation:
      'A Pelham dependency went from UP to DOWN, so the app now reports itself unhealthy and the load balancer stops sending it traffic. vars.dependency names it and vars.previous holds its last status. Write the line.',
    available: ['vars.dependency', 'vars.previous', 'error.errorType', 'error.description', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/status changed|down|unreachable|fail/i, 'Dependency status changed'),
      labelled('dependency'),
      labelled('to', 'to=DOWN'),
      errorFacts,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Dependency status changed dependency=$(vars.dependency) from=$(vars.previous) to=DOWN errorType=$(error.errorType) error=$(error.description)"]',
    },
    explain:
      'The app has taken itself out of service, so ERROR. One line per change is what the alert should fire on.',
  },
  {
    id: 'log-9015',
    kind: 'write',
    situation:
      'The Pelham dependency is back up. vars.dependency names it and vars.downMs holds how long it was down in ms. Write the line.',
    available: ['vars.dependency', 'vars.downMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/recover|back up|status changed/i, 'Dependency recovered'),
      labelled('dependency'),
      labelled('downMs', 'downMs=$(vars.downMs)'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Dependency recovered dependency=$(vars.dependency) to=UP downMs=$(vars.downMs)"]',
    },
    explain:
      'The outage length on the recovery line saves anyone from working it out from two timestamps, and it can be summed for availability reports.',
  },

  // ---------- lg-134 Sandford Pharmaceuticals: partner file uploads ----------
  {
    id: 'log-9016',
    kind: 'level',
    situation:
      'Every night Sandford Pharmaceuticals uploads an orders file to a distributor over SFTP. The upload finished. You log the file name, size, checksum and how long it took.',
    answer: ['INFO'],
    explain:
      'One upload a night is a normal event that support needs to see, so INFO.',
  },
  {
    id: 'log-9017',
    kind: 'choice',
    situation: 'Which line should Sandford log when the upload finishes?',
    options: [
      'File sent',
      'Upload complete: see attached',
      'Partner file uploaded fileName=orders-20261118.csv sizeBytes=4813220 checksum=9c1f7a... remotePath=/in/orders durationMs=8120',
      'Uploaded to sftp://sandford:<the real password>@sftp.distributor.example/in',
    ],
    answer: 2,
    explain:
      'Size and checksum let both sides prove the file arrived whole. The last line puts a password in the logs.',
  },
  {
    id: 'log-9018',
    kind: 'multi',
    situation: 'The distributor says last night\'s Sandford file was incomplete. Which facts in the logs settle it fast?',
    options: [
      'The size in bytes that was sent',
      'A checksum of the file that was sent',
      'The remote path it was written to',
      'The SFTP password',
      'The full file contents',
    ],
    answers: [0, 1, 2],
    explain:
      'If the distributor\'s size and checksum differ from the logged ones, the file changed on their side or in transit. The password and contents do not belong in logs.',
  },
  {
    id: 'log-9019',
    kind: 'write',
    situation:
      'The Sandford upload finished. vars.fileName, vars.sizeBytes, vars.checksum, vars.remotePath and vars.durationMs hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.sizeBytes', 'vars.checksum', 'vars.remotePath', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/upload|sent|transferred/i, 'Partner file uploaded'),
      labelled('fileName'),
      labelled('sizeBytes'),
      labelled('checksum'),
      durationVar,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Partner file uploaded fileName=$(vars.fileName) sizeBytes=$(vars.sizeBytes) checksum=$(vars.checksum) remotePath=$(vars.remotePath) durationMs=$(vars.durationMs)"]',
    },
    explain:
      'The size and checksum answer most "your file was wrong" questions, and durationMs shows when transfers start to slow down.',
  },
  {
    id: 'log-9020',
    kind: 'write',
    situation:
      'The Sandford upload failed after its retries. The file stays in the outbox for the 02:00 retry. vars.fileName holds the file. Write the line.',
    available: ['vars.fileName', 'error.errorType', 'error.description', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/fail|not (uploaded|sent)|could not/i, 'Partner file not uploaded'),
      labelled('fileName'),
      errorFacts,
      next('next=kept in outbox for the 02:00 retry'),
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Partner file not uploaded fileName=$(vars.fileName) errorType=$(error.errorType) error=$(error.description) next=kept in outbox for the 02:00 retry"]',
    },
    explain:
      'The distributor will not get its orders on time, so ERROR. The next field tells support the file is safe and when it will be tried again.',
  },

  // ---------- lg-135 Grayling Distribution: queue backlogs ----------
  {
    id: 'log-9021',
    kind: 'level',
    situation:
      'Grayling Distribution checks its orders-in queue every minute. The oldest message has waited 25 minutes, and the target is under 10 minutes. You log one line when the backlog goes above target.',
    answer: ['WARN'],
    explain:
      'Orders are late but not lost, and the consumers are still working. WARN is the signal to add consumers or look at a slow downstream system.',
  },
  {
    id: 'log-9022',
    kind: 'choice',
    situation: 'Which line should Grayling log when the queue backlog goes above target?',
    options: [
      'Queue is big',
      'WARN WARN',
      'Backlog: [first 100 messages ...]',
      'Queue backlog above target queue=orders-in depth=18450 oldestAgeS=1500 targetS=600 consumers=2',
    ],
    answer: 3,
    explain:
      'Depth, the age of the oldest message against the target, and the number of consumers say how bad it is and what to try. Message bodies say nothing about the backlog.',
  },
  {
    id: 'log-9023',
    kind: 'multi',
    situation: 'Which numbers help Grayling decide whether to add consumers?',
    options: [
      'Queue depth',
      'Age of the oldest message',
      'Messages consumed per minute',
      'The message bodies',
      'Customer names in the waiting orders',
    ],
    answers: [0, 1, 2],
    explain:
      'If depth grows while the consume rate is steady, more consumers help. If the consume rate dropped, a slow downstream system is the cause.',
  },
  {
    id: 'log-9024',
    kind: 'write',
    situation:
      'The Grayling backlog went above target. vars.queue, vars.depth, vars.oldestAgeS and vars.targetS hold the facts. Write the line.',
    available: ['vars.queue', 'vars.depth', 'vars.oldestAgeS', 'vars.targetS', 'payload'],
    level: ['WARN'],
    checks: [
      says(/backlog|behind|above target/i, 'Queue backlog above target'),
      labelled('queue'),
      labelled('depth'),
      labelled('oldestAgeS'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Queue backlog above target queue=$(vars.queue) depth=$(vars.depth) oldestAgeS=$(vars.oldestAgeS) targetS=$(vars.targetS)"]',
    },
    explain:
      'The age against the target is what customers feel. One line when it crosses the target is the alert, not a line every minute.',
  },
  {
    id: 'log-9025',
    kind: 'write',
    situation:
      'The Grayling backlog is back under target. vars.queue, vars.depth and vars.backlogMinutes (how long it was above target) hold the facts. Write the line.',
    available: ['vars.queue', 'vars.depth', 'vars.backlogMinutes', 'payload'],
    level: ['INFO'],
    checks: [
      says(/clear|back (to|under|within)|recovered/i, 'Queue backlog cleared'),
      labelled('queue'),
      labelled('depth'),
      labelled('backlogMinutes'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Queue backlog cleared queue=$(vars.queue) depth=$(vars.depth) backlogMinutes=$(vars.backlogMinutes)"]',
    },
    explain:
      'The pair of lines, above target and cleared, shows each backlog as one event with a length.',
  },
]
