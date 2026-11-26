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
      'Statement not delivered landlordId=L-4410 statementId=ST-2026-11-4410 reason=mailbox does not exist next=email resent in 1 hour correlationId=7f3c2a',
      'Statement not delivered landlordId=L-4410 statementId=ST-2026-11-4410 reason=mailbox does not exist next=paper copy queued correlationId=7f3c2a',
      'Statement not delivered landlordId=L-4410 statementId=ST-2026-11-4410 reason=mailbox does not exist next=paper copy queued sent=2999 failed=1 correlationId=7f3c2a',
      'Statement not delivered landlordId=L-4410 statementId=ST-2026-11-4410 reason=mailbox does not exist correlationId=7f3c2a',
    ],
    answer: 1,
    explain:
      'IDs let support find the landlord in the CRM without putting the address in the logs. The reason and the next step say what to fix and what already happened. Sending again to a mailbox that does not exist bounces again, so that next step is wrong. The line without next= leaves support unable to tell whether the landlord will get the statement at all. Run totals such as sent= and failed= belong on the summary line at the end; written mid run they are not final, and a search that sums them counts the run many times.',
  },
  {
    id: 'log-9003',
    kind: 'multi',
    situation: 'Which facts belong on the last line of the Larchmont statement run?',
    options: [
      'The landlord ID of every statement that was sent',
      'How many statements were sent',
      'How many failed',
      'How long the run took',
      "The mail server's host and port, from the SMTP settings",
    ],
    answers: [1, 2, 3],
    explain:
      'Counts and duration show whether the run was normal, night after night. A list of every landlord ID makes one huge line; the per statement lines already hold them. The mail server settings are the same every night and say nothing about the run.',
  },
  {
    id: 'log-9004',
    kind: 'write',
    situation:
      'A Larchmont statement email failed with an error because the mailbox does not exist, and a paper copy is queued. vars.landlordId and vars.statementId hold the IDs, vars.email the address. Write the line.',
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
      'Deprecated API version called path=/v1/parcels retireOn=2027-01-31 remoteIp=198.51.100.24 userAgent=okhttp/4.12.0 correlationId=7f3c2a',
      'Deprecated API version called clientId=app-118 path=/v1/parcels retireOn=2027-01-31 status=410 correlationId=7f3c2a',
      'Deprecated API version called clientId=app-118 path=/v1/parcels retiredOn=2027-01-31 correlationId=7f3c2a',
    ],
    answer: 0,
    explain:
      'The client ID, path and date are what the team needs to contact the client. An IP address and a user agent do not name the client: many apps share one IP behind a gateway, and many use the same HTTP library. v1 still answers until it is retired, so status=410 Gone is false. retiredOn says the version is already gone, while the client is still calling it and the date is still ahead.',
  },
  {
    id: 'log-9008',
    kind: 'multi',
    situation: 'Which facts help Cobalt move every client off v1 before the date?',
    options: [
      'The client ID',
      "The caller's IP address, to tell which app is calling",
      'The endpoint path the client calls',
      'A count of v1 calls per client per day',
      'The response time of each v1 call',
    ],
    answers: [0, 2, 3],
    explain:
      'Who, which endpoint and how much tell the team whom to call and what they need to change. IP addresses change and many apps share one behind a gateway, so they do not name the client. Response time says nothing about who must move.',
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
      'Dependency status changed dependency=meter-db from=UP to=DOWN checkedAt=2026-11-18T02:10:00Z',
      'Dependency status changed dependency=meter-db from=UP to=DOWN errorType=DB:CONNECTIVITY checkedAt=2026-11-18T02:10:00Z',
      'Dependency check dependency=meter-db status=DOWN errorType=DB:CONNECTIVITY probeIntervalS=10',
      'Dependency status changed dependency=meter-db from=DOWN to=UP errorType=DB:CONNECTIVITY',
    ],
    answer: 1,
    explain:
      'One line when the status changes, with the dependency and the error, is enough to alert on. The status change line without errorType, so nobody can tell a network fault from a failed login. The "Dependency check" line is the one written on every probe, every 10 seconds, which floods the logs. from=DOWN to=UP is the recovery, not the failure.',
  },
  {
    id: 'log-9013',
    kind: 'multi',
    situation: 'Which choices keep the Pelham health check logs useful?',
    options: [
      'Log one INFO line on every probe',
      'Log only when a dependency changes status',
      'Name the dependency on every line',
      'On recovery, log how long the dependency was down',
      'Write the status as words in the message, such as "database looks down"',
    ],
    answers: [1, 2, 3],
    explain:
      'Status changes with names and outage length tell the story in two lines. Probe lines bury it, and a status in free words cannot be searched or alerted on as a field.',
  },
  {
    id: 'log-9014',
    kind: 'write',
    situation:
      'A Pelham dependency went from UP to DOWN, so the app now reports itself unhealthy and the load balancer stops sending it traffic. vars.dependency names it and vars.previous holds its last status. Write the line with the dependency, its old status and its new status.',
    available: ['vars.dependency', 'vars.previous', 'error.errorType', 'error.description', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/status changed|down|unreachable|fail/i, 'Dependency status changed'),
      labelled('dependency'),
      { must: /=\s*"?DOWN\b/i, say: 'Label the new status, such as to=DOWN.' },
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
      'Partner file uploaded fileName=orders-20261118.csv host=sftp.distributor.example sftpUser=sandford remotePath=/in/orders durationMs=8120',
      'Partner file uploaded fileName=orders-20261118.csv sizeBytes=4813220 rowCount=18220 remotePath=/in/orders durationMs=8120',
      'Partner file uploaded fileName=orders-20261118.csv sizeBytes=4813220 rowCount=18220 checksum=9c1f7a... remotePath=/in/orders durationMs=8120',
      'Partner file upload started fileName=orders-20261118.csv sizeBytes=4813220 checksum=9c1f7a... remotePath=/in/orders host=sftp.distributor.example',
    ],
    answer: 2,
    explain:
      'Size and checksum let both sides prove the file arrived whole and unchanged. The line with sftpUser=sandford has neither, so it cannot settle a claim that the file was cut short. With size but no checksum, a file damaged in transit can still show the same size. A "started" line is written before the write, so it cannot show the upload finished.',
  },
  {
    id: 'log-9018',
    kind: 'multi',
    situation: 'The distributor says last night\'s Sandford file was incomplete. Which facts in the logs settle it fast?',
    options: [
      'The SFTP user name the upload logged in with',
      'The size in bytes that was sent',
      'The SFTP host name, taken from the connector config',
      'A checksum of the file that was sent',
      'The remote path it was written to',
    ],
    answers: [1, 3, 4],
    explain:
      "If the distributor's size and checksum differ from the logged ones, the file changed on their side or in transit, and the path shows which file to compare. The user and the host are the same every night, and a file that arrived at all was not sent to the wrong account.",
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
      'Queue backlog above target queue=orders-in depth=18450 consumers=2 prefetch=10 broker=anypoint-mq',
      'Queue backlog above target queue=orders-in depth=18450 targetDepth=5000 consumers=2',
      'Queue backlog cleared queue=orders-in depth=18450 oldestAgeS=1500 targetS=600 consumers=2',
      'Queue backlog above target queue=orders-in depth=18450 oldestAgeS=1500 targetS=600 consumers=2',
    ],
    answer: 3,
    explain:
      'Depth, the age of the oldest message against the target, and the number of consumers say how bad it is and what to try. The lines with prefetch=10 and targetDepth=5000 give the depth but not how long orders have waited, which is what the target is about. "cleared" is false while the oldest message is over its target.',
  },
  {
    id: 'log-9023',
    kind: 'multi',
    situation:
      'In one hour the Grayling orders-in depth went from 2000 to 18450. The consumer summary lines show consumedPerMin falling from 400 to 120 over that hour, and the ERP call lines show durationMs rising from 500 to 3000. Which conclusions do these numbers support?',
    options: [
      'Adding consumers is the fix, since each new consumer adds about 60 messages a minute',
      'The consumers slowed down because the ERP calls slowed down, so fewer messages left the queue',
      'Orders arrive faster than before, since the depth grew while the consumers kept their pace',
      'More consumers would send more calls to the slow ERP, so look at the ERP before scaling out',
      'The age of the oldest message alone would have shown the cause, so consumedPerMin adds nothing',
    ],
    answers: [1, 3],
    explain:
      'The consume rate fell while each ERP call got six times slower, so the consumers are waiting on the ERP. The depth grew because fewer messages left the queue, and the consumers did not keep their pace. Extra consumers would add calls to a system that is already slow, so they can make it worse. The age of the oldest message shows how bad the backlog is, but without the consume rate you cannot tell a slow consumer from a burst of new orders.',
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
