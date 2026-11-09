import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-089',
  category: 'case-studies',
  title: 'Bank Sending Real-Time Balance and Transaction Alerts to Six Million Customers',
  level: 'ADVANCED',
  tags: ['banking', 'events', 'kafka', 'cdc', 'notifications', 'caching', 'dlq'],
  estMinutes: 50,
  diagram: {
    task: 'draw the alert platform: postings captured from the core and published to Kafka, an alert rules Process API that reads preferences from a cache and puts each alert on its own channel queue, channel System APIs for push, SMS and email, a DLQ, and the app changing preferences through the API layers.',
    checks: [
      { label: 'Captured postings are published to the event stream', rule: { type: 'edge', from: 'batch-job', to: ['event-stream', 'topic'], kind: 'async' } },
      { label: 'The alert rules Process API consumes the postings from the stream', rule: { type: 'edge', from: ['event-stream', 'topic'], to: { type: 'process-api', label: ['rule'] }, kind: 'async' } },
      { label: 'Preferences are read from a cache on the hot path', rule: { type: 'edge', from: { type: 'process-api', label: ['rule'] }, to: 'cache' } },
      { label: 'Push, SMS and email each have their own queue', rule: { type: 'each', of: { type: 'system-api', label: ['push', 'sms', 'email'] }, min: 3, edgeFrom: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'The rules Process API never calls a provider synchronously', rule: { type: 'no-path', from: { type: 'process-api', label: ['rule'] }, to: 'notification', kind: 'sync' } },
      { label: 'Notification providers are reached only through System APIs', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
      { label: 'The rules Process API never calls the core banking system', rule: { type: 'no-path', from: { type: 'process-api', label: ['rule'] }, to: 'legacy' } },
      { label: 'Customers change preferences through the Experience API and a System API', rule: { type: 'path', from: 'mobile-app', via: 'experience-api', to: { type: 'system-api', label: ['prefer'] } } },
      { label: 'Alerts that keep failing end up on a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Banking app'],
        exp: ['experience-api', 'exp-alert-settings-api'],
        pset: ['process-api', 'prc-alert-settings'],
        cdc: ['batch-job', 'CDC capture (posting journal)'],
        ks: ['event-stream', 'core.postings (key = account)'],
        rules: ['process-api', 'prc-alert-rules'],
        cache: ['cache', 'Preference cache'],
        qpush: ['queue', 'alerts.push'],
        qsms: ['queue', 'alerts.sms'],
        qmail: ['queue', 'alerts.email'],
        dlq: ['dlq', 'alerts DLQ'],
        spref: ['system-api', 'sys-alert-preferences-api'],
        spush: ['system-api', 'sys-push-api'],
        ssms: ['system-api', 'sys-sms-api'],
        smail: ['system-api', 'sys-email-api'],
        core: ['legacy', 'Core banking (DB2 on z/OS)'],
        prefdb: ['database', 'Preferences DB'],
        push: ['notification', 'Push service (APNs / FCM)'],
        sms: ['notification', 'SMS aggregator'],
        mail: ['notification', 'Email service'],
      },
      [
        'mob -> exp', 'exp -> pset', 'pset -> spref', 'spref -> prefdb', 'pset -> cache',
        'cdc -> core', 'cdc ~> ks', 'ks ~> rules', 'rules -> cache', 'rules -> spref',
        'rules ~> qpush', 'rules ~> qsms', 'rules ~> qmail', 'qpush ~> spush', 'qsms ~> ssms', 'qmail ~> smail',
        'spush -> push', 'ssms -> sms', 'smail -> mail', 'qpush ~> dlq', 'qsms ~> dlq', 'qmail ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A retail bank with 6 million customers wants to send alerts within 10 seconds of a card payment, a salary credit, a low balance or a large debit. Today alerts are sent from an overnight batch, and customers compare the bank badly with app-only banks.

**Systems**
- Core banking on z/OS with DB2. Every posting is written to a posting journal table. The core team will not add new code to the posting programs and limits read load during the day.
- A Kafka platform run by the data team (managed service).
- An SMS aggregator (paid per message, 100 messages per second limit), a push service (APNs and FCM), and an email service.

**Volumes.** 25 million postings a day, peak 1,200 per second at lunchtime and on payday. About 15% of postings trigger an alert.

**Requirements**
- Customers choose alerts and channels in the app (for example push for every card payment, SMS for balance below 100 EUR) and quiet hours.
- An alert is sent at most once per posting and channel.
- An SMS outage or rate limit must not delay push alerts.
- The core must not be called to decide on an alert.

**Your task.** Design the alert platform.
`,
  answerTemplate: `## Capturing postings without touching the core

## Event stream design

## Rules and preferences

## Channel delivery and isolation

## Duplicates, ordering and quiet hours

## Preferences management

## Risks
`,
  keyPoints: [
    'Postings are captured from the DB2 posting journal by change data capture and published to Kafka keyed by account, with no change to core programs.',
    'The rules Process API decides on alerts using the posting and the customer\'s preferences from a cache, never calling the core.',
    'Each channel has its own queue and System API, so an SMS slowdown or outage only delays SMS.',
    'Deduplication uses posting ID plus channel; consumers are idempotent because Kafka and queues deliver at least once.',
    'Preferences are changed through Experience, Process and System APIs, and the cache entry is updated on change.',
  ],
  solution: `
**Capture.** A CDC tool reads the DB2 log for the posting journal table and publishes each new row to \`core.postings\`, keyed by account number so postings for one account stay in order. This adds no load to the posting programs and little to the database.

**Rules.** \`prc-alert-rules\` runs several replicas in one consumer group. For each posting it looks up the customer's preferences in the cache (loaded on a miss from \`sys-alert-preferences-api\`), checks quiet hours and thresholds, and builds an alert per chosen channel. Low balance alerts use the balance after posting carried in the event.

**Delivery.** Alerts go to \`alerts.push\`, \`alerts.sms\` and \`alerts.email\`. Each channel System API consumes its own queue at the rate its provider allows: SMS at 100 per second, push at thousands. A provider outage fills only its queue. After 5 failed attempts a message moves to the DLQ and an alert is raised.

**Duplicates.** The message ID is \`postingId + channel\`. Each channel System API keeps sent IDs for 48 hours and skips repeats.

**Quiet hours.** Alerts in quiet hours are delayed with a scheduled delivery time, except fraud related ones.

**Preferences.** The app calls \`exp-alert-settings-api\`, which goes through \`prc-alert-settings\` to the preferences database. On change the Process API updates the cache so the next posting uses the new setting.

**Capacity.** 1,200 postings per second at peak and 15% alert rate gives about 180 alerts per second; SMS is a share of that, so the queue absorbs peaks above 100 per second for a few minutes.

**Risks.** CDC lag on payday (monitor lag and alert above 30 seconds), cache cold start after a deployment (preload top customers), SMS cost growth (default to push and let customers opt in to SMS).
`,
  followUps: [
    { q: 'Why change data capture instead of a trigger or a call from the core?', a: 'The core team does not allow new code in the posting programs. CDC reads the database log, so the core is untouched and day-time load stays low.' },
    { q: 'Why key the Kafka topic by account number?', a: 'All postings for one account land in the same partition and stay in order. A low balance alert then reflects the right sequence of debits.' },
    { q: 'How do you stop an SMS outage from delaying push alerts?', a: 'Give each channel its own queue and consumer. SMS messages pile up on their queue while push carries on.' },
    { q: 'A consumer restarts and reprocesses postings. How do you avoid duplicate alerts?', a: 'Use posting ID plus channel as the message ID and keep sent IDs for two days. The channel API skips any ID it has already sent.' },
  ],
}
