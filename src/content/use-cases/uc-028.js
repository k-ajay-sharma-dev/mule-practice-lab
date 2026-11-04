import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-028',
  category: 'use-cases',
  title: 'School Attendance Alerts to the Parent App',
  level: 'BEGINNER',
  tags: ['event-driven', 'push-notifications', 'idempotency', 'education'],
  estMinutes: 15,
  diagram: {
    task: 'draw the attendance-alert flow: the SMS webhook into a queue, the latest-status store for the debounce window, the scheduled run that looks up guardians and sends, the idempotency store, the parent app and the DLQ.',
    checks: [
      { label: 'SMS webhooks are acknowledged fast and queued', rule: { type: 'path', from: { type: ['saas', 'legacy', 'database'], label: ['school', 'sms', 'management'] }, via: ['queue', 'topic', 'event-stream'], to: 'process-api' } },
      { label: 'The latest status per pupil + date is held for a debounce window', rule: { type: 'edge', to: { type: ['cache', 'database'], label: ['latest', 'status', 'debounce', 'pupil'] } } },
      { label: 'A scheduled run sends alerts only after the window closes', rule: { type: 'path', from: 'batch-job', to: { type: ['external-api', 'saas', 'notification'], label: 'parent' } } },
      { label: 'Guardians are looked up in the SMS only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'legacy', 'database'], label: ['school', 'sms', 'management'] }, from: 'system-api' } },
      { label: 'Idempotency keys stop duplicate notifications', rule: { type: 'edge', from: ['process-api', 'system-api', 'batch-job'], to: { type: ['cache', 'database'], label: ['idempot', 'key', 'sent'] } } },
      { label: 'The parent app is reached only through a System API', rule: { type: 'only-via', target: { type: ['external-api', 'saas', 'notification'], label: 'parent' }, from: 'system-api' } },
      { label: 'Messages that keep failing go to a DLQ', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        sms: ['saas', 'School management system'],
        e: ['experience-api', 'exp-attendance-events-api'],
        q: ['queue', 'attendance-events-q'],
        p: ['process-api', 'prc-attendance-alerts'],
        state: ['cache', 'Latest status per pupil+date'],
        job: ['batch-job', 'Debounce run (09:30, then every 10 min)'],
        ssms: ['system-api', 'sys-sms-guardians-api'],
        nq: ['queue', 'parent-notifications-q'],
        send: ['process-api', 'prc-notification-sender'],
        idem: ['cache', 'Sent-notification keys'],
        sapp: ['system-api', 'sys-parent-app-api'],
        app: ['external-api', 'Parent app vendor'],
        dlq: ['dlq', 'parent-notifications-dlq'],
      },
      [
        'sms -> e', 'e ~> q', 'q ~> p', 'p -> state', 'job -> state', 'job -> ssms', 'ssms -> sms', 'job ~> nq', 'nq ~> send',
        'nq ~> dlq', 'send -> idem', 'send -> sapp', 'sapp -> app',
      ],
    ),
  },
  description: `
A school district with **60 schools and 45,000 pupils** wants parents to be notified when their child is marked **absent or late** in morning registration.

Facts:
- Teachers take attendance in the **school management system (SMS)**. It can send a **webhook** (JSON) whenever an attendance mark is saved or changed; it also has a REST API to read pupils and their guardians.
- The **parent app** is a mobile app run by a vendor; it exposes \`POST /notifications\` (by guardian ID) and handles push delivery itself.
- Morning registration closes at **09:15**; ~1,500 absences/day, with a peak of ~600 webhooks in 10 minutes.
- Teachers often correct marks ("absent" → "present, arrived late") within minutes. Parents complained in a pilot that they got **two contradictory messages**.
- A pupil can have up to **4 guardians**; some must not be contacted (court orders flagged in the SMS).

**Describe your solution:**
- How do you receive the events and look up who to notify?
- How do you avoid spamming parents when teachers correct marks?
- How do you respect the "do not contact" flag?
- What happens if the parent app is down at 09:20?
`,
  answerTemplate: `## Receiving events

## Guardian lookup

## Handling corrections

## Delivery and errors
`,
  keyPoints: [
    'HTTP listener receives SMS webhooks, validates them, acknowledges fast and puts them on a queue (Anypoint MQ / VM) for processing.',
    'Guardians fetched from the SMS API (cached briefly) and filtered by the do-not-contact flag before any message is built.',
    'Short delay/debounce window (e.g. 10 minutes, or until registration closes) so the latest mark per pupil per day wins; corrections cancel pending alerts.',
    'Idempotency key pupil + date + status so each guardian gets at most one message of a kind per day.',
    'Retries with backoff and a dead-letter queue if the parent app is down; alerts still delivered later in the morning.',
  ],
  solution: `
**Receiving events.** An Experience/System API exposes \`POST /attendance-events\` for the SMS webhook (secured with a shared secret or client ID enforcement). It validates the payload (pupil ID, school, date, status), returns **202** immediately and publishes to an **Anypoint MQ** queue. The peak of 600 events in 10 minutes is trivial for a queue and keeps the SMS from timing out.

**Handling corrections.** Instead of notifying instantly, store the latest status per **pupil + date** in an Object Store and schedule processing after a short **debounce window** (e.g. 10 minutes after the last change, or a Scheduler run at 09:30 for the main wave plus every 10 minutes after). When the window ends, the flow reads the final status:
- still absent/late → notify;
- corrected to present → do nothing.

If a parent was already notified and the mark changes later (e.g. absent → late), send one follow-up "update" message rather than a new alert.

**Guardian lookup.** Call the SMS API for the pupil's guardians (cache in Object Store for a few hours). **Filter out guardians with the do-not-contact flag** before building messages; if no contactable guardian remains, log it for the school office.

**Delivery and errors.** DataWeave maps to the parent app payload (guardian ID, pupil first name, school, status, time). An **idempotency key** (pupil + date + status + guardian) stored in Object Store stops duplicates on retries. On 5xx or timeout, retry with exponential backoff; after the retries are exhausted the message goes to a DLQ and the support team is alerted. Because the work is queued, an outage at 09:20 only delays messages; nothing is lost.

**Privacy.** Logs contain pupil IDs, not names or reasons for absence.
`,
  followUps: [
    { q: 'Why not just send the notification directly from the webhook?', a: 'Direct sending is simpler but produces the contradictory messages from the pilot and couples the SMS to the parent app\'s availability. A queue plus a short delay solves both.' },
    { q: 'What if the SMS does not support webhooks?', a: 'Poll the attendance API every few minutes with a watermark on the last-modified time; the rest of the design (debounce, lookup, idempotency) stays the same.' },
  ],
}
