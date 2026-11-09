import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-114',
  category: 'case-studies',
  title: 'Broadcaster Enforcing Content Rights Windows Across Its Streaming and Partner Platforms',
  level: 'ADVANCED',
  tags: ['media', 'content-rights', 'event-driven', 'pub-sub', 'scheduler', 'reconciliation', 'compliance'],
  estMinutes: 55,
  diagram: {
    task: 'draw how a window start or end, or a rights edit, becomes one availability decision published once to every platform, with a queue per platform, an audit store, and a nightly reconciliation that compares what is live with the rights.',
    checks: [
      { label: 'The rights database is reached only through its System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Window start and end times are triggered by a scheduler that puts them on a queue', rule: { type: 'edge', from: { type: 'batch-job', label: ['schedul', 'window'] }, to: 'queue', kind: 'async' } },
      { label: 'Rights edits also reach the availability Process API as async messages', rule: { type: 'path', from: { type: 'system-api', label: 'rights' }, via: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'Each availability decision is published once and fans out to at least two consumers', rule: { type: 'edge', from: ['topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'No platform System API is fed straight from the topic (each platform has its own queue)', rule: { type: 'no-edge', from: ['topic', 'event-stream'], to: 'system-api' } },
      { label: 'No queue is shared between two platform System APIs', rule: { type: 'each', of: 'queue', edgeTo: 'system-api', count: 0, max: 1 } },
      { label: 'The streaming platform and partner platforms are updated only through System APIs', rule: { type: 'only-via', target: ['saas', 'partner'], from: 'system-api' } },
      { label: 'The decisions reach the partner platforms through the topic', rule: { type: 'path', from: ['topic', 'event-stream'], via: 'queue', to: 'partner' } },
      { label: 'An audit store records every availability decision for the studios', rule: { type: 'edge', from: ['topic', 'event-stream', 'process-api'], to: 'data-warehouse' } },
      { label: 'A nightly reconciliation compares the rights with what a platform has live', rule: { type: 'each', of: { type: 'batch-job', label: 'reconcil' }, edgeTo: 'system-api', count: 2 } },
      { label: 'Platform updates that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Lines to and from queues and topics are async messages', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        rdb: ['sql-server', 'Rights management DB'],
        sr: ['system-api', 'sys-rights-api'],
        sched: ['batch-job', 'window-scheduler (every 5 min)'],
        rcq: ['queue', 'availability-triggers'],
        p: ['process-api', 'prc-content-availability-api'],
        tp: ['topic', 'availability-changed'],
        qott: ['queue', 'ott-availability'],
        qpart: ['queue', 'partner-availability'],
        sott: ['system-api', 'sys-ott-platform-api'],
        ott: ['saas', 'OTT video platform'],
        spart: ['system-api', 'sys-partner-feed-api'],
        part: ['partner', 'Partner platforms (TV makers, app stores)'],
        audit: ['data-warehouse', 'Rights compliance audit store'],
        dlq: ['dlq', 'Platform DLQs'],
        recon: ['batch-job', 'nightly-reconciliation'],
        alert: ['notification', 'Rights desk alerts'],
      },
      [
        'sr -> rdb', 'sched -> sr', 'sched ~> rcq', 'sr ~> rcq', 'rcq ~> p', 'p -> sr', 'p ~> tp', 'tp ~> qott', 'tp ~> qpart',
        'tp ~> audit', 'qott ~> sott', 'qpart ~> spart', 'sott -> ott', 'spart -> part', 'qott ~> dlq', 'qpart ~> dlq',
        'recon -> sr', 'recon -> sott', 'recon -> alert',
      ],
    ),
  },
  description: `
**Context.** A European broadcaster licenses about 60,000 titles from studios and distributors. Each licence defines **windows**: a title may be shown in certain territories, on certain platforms (own streaming service, partner platforms such as smart TV makers and app stores, free ad-supported channels), between a start and an end date and time.

**Systems**
- **Rights management system**: a vendor product on SQL Server, 400,000 window records, about 5,000 edits a day by the rights team.
- **OTT video platform** (SaaS) behind the broadcaster's own streaming service, with an API to publish, geo-restrict and unpublish titles.
- **Partner platforms**: 14 partners receive a daily XML feed; 6 of them also accept an API call to remove a title at once.
- Many windows open or close at midnight local time: up to 12,000 changes within minutes on the first day of a month.

**Problems**
- Titles are published and taken down by an operations team working from spreadsheets exported from the rights system.
- Last year 37 titles stayed online after their window ended. One studio charged a penalty of 250,000 EUR and now asks for an **audit trail** that proves every takedown time.
- New windows often open a day late, losing viewing in the first hours of a release.

**Requirements**
- Content must be withdrawn from every platform within **60 minutes** of a window ending or a right being removed.
- Every decision (title, territory, platform, action, time sent, time confirmed) must be kept for 7 years.
- Operations must see every day where a platform does not match the rights.

**Your task.** Design the integration that turns rights into availability on every platform, and how you prove compliance.
`,
  answerTemplate: `## Triggers: time and edits

## Availability decision

## Distribution to platforms

## Audit and reconciliation

## Midnight peaks and failure handling
`,
  keyPoints: [
    'Two triggers feed one queue: a scheduler that finds windows starting or ending in the next minutes, and rights edits captured by the rights System API.',
    'One availability Process API turns a trigger into a decision per title, territory and platform, and publishes it once to a topic.',
    'Each platform has its own queue and System API, so a slow partner cannot delay the takedown on the streaming platform; failures go to a DLQ with an alert.',
    'Every decision and every platform confirmation is written to an audit store kept for 7 years.',
    'A nightly reconciliation compares the rights with what each platform reports as live and alerts the rights desk on any difference.',
  ],
  solution: `
**Triggers.**
- \`window-scheduler\` runs every 5 minutes and asks \`sys-rights-api\` for windows starting or ending in the next 15 minutes, so takedowns are queued ahead of time and sent at the exact time.
- \`sys-rights-api\` reads the change log of the rights database (a change table populated by the vendor's audit triggers) and publishes edits that remove or shorten a right.
Both write to \`availability-triggers\`.

**Decision.** \`prc-content-availability-api\` reads the full window set for the title from \`sys-rights-api\`, decides the target state per territory and platform (available, geo-restricted, unavailable), and publishes one \`AvailabilityChanged\` event per title and platform to \`availability-changed\`. Each event has a decision ID and a sequence number per title, so consumers ignore older events.

**Distribution.** Per-platform queues fed from the topic:
- \`ott-availability\` → \`sys-ott-platform-api\` publishes or unpublishes and records the platform confirmation.
- \`partner-availability\` → \`sys-partner-feed-api\` calls the takedown API for partners that offer one, and adds the change to the next feed for the others (feeds move from daily to hourly to meet 60 minutes).
Failures retry with backoff, then go to the DLQ and alert the rights desk, because a takedown may not be lost.

**Audit.** The topic also feeds the audit store; System APIs add confirmation records. A report per studio shows decision and confirmation times.

**Reconciliation.** \`nightly-reconciliation\` lists what is live on the OTT platform and on partners that offer a catalogue API, compares it with the rights, and alerts on differences.

**Midnight peak.** 12,000 changes are queued from 23:45 and released on time; per-platform queues let each platform go at its own speed.
`,
  followUps: [
    { q: 'Why does the scheduler look 15 minutes ahead?', a: 'Takedowns are prepared and queued before the deadline. At midnight the work is releasing messages, not finding them, which keeps the 60 minute promise during peaks.' },
    { q: 'Why one queue per platform behind the topic?', a: 'Platforms differ in speed and reliability. A partner that is down only builds its own backlog, while the streaming platform keeps taking titles down on time.' },
    { q: 'How do you stop an old decision overwriting a newer one?', a: 'Every decision carries a sequence number per title and platform. A System API ignores any event older than the last one applied.' },
    { q: 'What does reconciliation catch that events do not?', a: 'Manual changes on a platform, lost confirmations and bugs in mapping. Comparing actual state with rights finds them no matter how they happened.' },
  ],
}
