import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-081',
  category: 'use-cases',
  title: 'Loyalty Points Expiry and Tier Change Notifications',
  level: 'INTERMEDIATE',
  tags: ['loyalty', 'retail', 'notifications', 'batch', 's3', 'throttling', 'consent'],
  estMinutes: 25,
  diagram: {
    task: 'draw the notification run: the loyalty engine export, the nightly job that selects members, the sent log, the queue that feeds a throttled sender, the CRM for consent and channel, and the email, SMS and push providers.',
    checks: [
      { label: 'The job reads the nightly export file', rule: { type: 'edge', from: 'batch-job', to: ['s3-bucket', 'file-store', 'sftp-server', 'azure-blob'] } },
      { label: 'The job does not call the loyalty engine API member by member', rule: { type: 'no-path', from: 'batch-job', to: 'saas', kind: 'sync', unless: ['s3-bucket', 'file-store', 'sftp-server', 'azure-blob'] } },
      { label: 'Due notifications are queued, so sending is throttled apart from selection', rule: { type: 'edge', from: 'batch-job', to: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'Sent reminders are recorded per member and expiry date', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: { type: ['database', 'cache'], label: ['sent', 'log', 'history'] } } },
      { label: 'Consent and preferred channel come from the CRM', rule: { type: 'path', from: 'process-api', to: 'crm' } },
      { label: 'Email, SMS and push are reached only through a System API', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
      { label: 'The CRM is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        le: ['saas', 'Loyalty engine'],
        s3: ['s3-bucket', 'Nightly balances export (S3)'],
        job: ['batch-job', 'Expiry and tier job (01:00)'],
        sent: ['database', 'Sent notifications log'],
        q: ['queue', 'member-notifications'],
        dlq: ['dlq', 'member-notifications-dlq'],
        snd: ['process-api', 'prc-member-notify (throttled)'],
        scrm: ['system-api', 'sys-crm-preferences'],
        crm: ['crm', 'CRM (consent, preferred channel)'],
        snot: ['system-api', 'sys-notifications'],
        msg: ['notification', 'Email, SMS and app push'],
      },
      ['le -> s3', 'job -> s3', 'job -> sent', 'job ~> q', 'q ~> snd', 'q ~> dlq', 'snd -> scrm', 'scrm -> crm', 'snd -> snot', 'snot -> msg'],
    ),
  },
  description: `
A supermarket runs a loyalty programme with **3.2 million members**. Two rules cause complaints:
- Points **expire 24 months** after they were earned, and members say nobody warned them.
- **Tiers** (Green, Silver, Gold) are recalculated on the 1st of each month from 12 months of spend, and members do not know when they move.

The business wants:
- A warning **30 days** and **7 days** before expiry, for members with **more than 500 points** expiring.
- A message on the 1st of the month to members whose tier changed.
- The member's **preferred channel** (email, SMS or app push), and only with **marketing consent**. Both live in the CRM.
- Sends only between **09:00 and 20:00**.

Facts:
- The loyalty engine (SaaS) has a REST API limited to **50 calls a second**. It also writes a **nightly export** to S3 at 00:30: one row per member with balance, points by expiry month and tier.
- Peak days produce about **250,000 messages**. The SMS provider accepts **100 messages a second**; email 500 a second.
- The CRM API allows 200 calls a second.

**Questions:**
1. How do you find who needs a message without 3.2 million API calls?
2. How do you make sure a member gets each warning once, even if the job is rerun?
3. How do you respect the provider limits and the send window?
4. Where do consent and channel come from?
`,
  answerTemplate: `## Selecting members

## Sent log

## Queue and throttled sender

## Consent and channel

## Errors and reruns
`,
  keyPoints: [
    'The nightly job streams the S3 export instead of calling the loyalty API for 3.2 million members.',
    'Selection runs in DataWeave: points expiring in 30 or 7 days above 500, and tier different from last month.',
    'A sent log keyed by member, type and expiry month makes reruns safe.',
    'Due messages go to a queue; a sender with fixed threads keeps SMS under 100 a second and stops outside 09:00 to 20:00.',
    'The sender reads consent and channel from the CRM through a System API, with a short cache.',
  ],
  solution: `
**Selecting members.** A Scheduler at 01:00 reads the export file from S3 as a **stream** (the file is about 1 GB, so it is never loaded into memory at once). DataWeave keeps members where:
- points expiring in exactly 30 or 7 days add up to more than 500, or
- on the 1st, the tier differs from the previous month's tier (both are in the export).
Calling the loyalty API for 3.2 million members at 50 a second would take 18 hours.

**Sent log.** Before queueing, the job checks the **sent notifications log** (a database table) for member ID plus type plus expiry month. Rows already there are skipped. A rerun after a crash at 03:00 therefore only queues the rest. The job inserts the row when it queues the message, in the same batch step.

**Queue and throttled sender.** Due messages go to **member-notifications** with member ID, type, points and date. prc-member-notify consumes with a fixed number of threads:
- SMS sends are spread so they stay under 100 a second; 250,000 messages fit within the day.
- Outside 09:00 to 20:00 the consumer is stopped (or messages are not acknowledged and redelivered later), so nothing goes out at night.

**Consent and channel.** For each message the sender calls sys-crm-preferences for consent and preferred channel. No consent means drop the message and mark it as suppressed in the log. The channel decides the template. sys-notifications sends through the email, SMS or push provider.

**Errors and reruns.** Provider errors are retried by redelivery with backoff. After 5 deliveries the message goes to **member-notifications-dlq**. A daily report shows queued, sent, suppressed and failed counts per type.
`,
  followUps: [
    { q: 'Why not let the loyalty engine send these messages itself?', a: 'Check that first, since many engines can. Here consent and channel live in the CRM, so the engine cannot honour them without an integration anyway.' },
    { q: 'Why record the sent log when queueing and not when sending?', a: 'The log stops the next run from queueing the same message again. The sender records its own result, so failures stay visible.' },
    { q: 'How would you test the selection rule?', a: 'Run it in MUnit against a small export with members on each boundary: 500 points, 501 points, 29 and 30 days.' },
    { q: 'What if the export is late?', a: 'The job checks the file date first. If the export is missing, it waits and retries every 15 minutes until 06:00, then alerts.' },
  ],
}
