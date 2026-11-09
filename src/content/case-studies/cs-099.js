import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-099',
  category: 'case-studies',
  title: 'Power Network Operator Keeping Customers Informed During Storm Outages',
  level: 'INTERMEDIATE',
  tags: ['utilities', 'outage-management', 'events', 'pub-sub', 'caching', 'notifications', 'peak-traffic', 'activemq'],
  estMinutes: 40,
  diagram: {
    task: 'draw outage communications: OMS events leave the OMS on a queue; a Process API looks up affected customers in the CRM and publishes outage notices to a topic; one consumer sends SMS and email, another keeps a status cache up to date; the outage map, the app and the IVR all read the cache through one status Experience API and never touch the OMS.',
    checks: [
      { label: 'Outage events leave the OMS as async messages', rule: { type: 'edge', from: 'legacy', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Process API turns OMS events into outage notices on a topic', rule: { type: 'path', from: ['queue', 'event-stream'], via: 'process-api', to: 'topic' } },
      { label: 'Affected customers and contact preferences come from the CRM through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'crm' } },
      { label: 'The CRM is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Each notice is used by at least two consumers (notifications and status)', rule: { type: 'path', from: 'topic', to: 'process-api', min: 2 } },
      { label: 'Customers get SMS or email from the notices', rule: { type: 'path', from: 'topic', to: 'notification' } },
      { label: 'The status page reads outage status from a cache', rule: { type: 'path', from: 'web-app', to: 'cache' } },
      { label: 'The status page, app and IVR never reach the OMS', rule: { type: 'no-path', from: ['web-app', 'mobile-app', 'chatbot'], to: 'legacy' } },
      { label: 'All channels share one status Experience API', rule: { type: 'node', match: 'experience-api', max: 1 } },
      { label: 'The status cache is updated from the notices', rule: { type: 'path', from: 'topic', to: 'cache' } },
    ],
    reference: diagram(
      {
        oms: ['legacy', 'Outage management system (OMS)'],
        oq: ['queue', 'oms.outage-events (ActiveMQ)'],
        pout: ['process-api', 'prc-outage-events'],
        scrm: ['system-api', 'sys-crm-customer-api'],
        crm: ['crm', 'CRM (customers, contact preferences)'],
        top: ['topic', 'outage-notices'],
        pnot: ['process-api', 'prc-customer-notifications'],
        pstat: ['process-api', 'prc-outage-status'],
        notif: ['notification', 'SMS and email provider'],
        cache: ['cache', 'Outage status cache'],
        web: ['web-app', 'Outage map and status page'],
        mob: ['mobile-app', 'Customer app'],
        ivr: ['chatbot', 'IVR and voice bot'],
        eout: ['experience-api', 'exp-outage-status-api'],
      },
      [
        'oms ~> oq', 'oq ~> pout', 'pout -> scrm', 'scrm -> crm', 'pout ~> top', 'top ~> pnot', 'top ~> pstat',
        'pnot -> notif', 'pstat -> cache', 'web -> eout', 'mob -> eout', 'ivr -> eout', 'eout -> cache',
      ],
    ),
  },
  description: `
**Context.** An electricity distribution network operator serves 3.1 million homes and businesses. Its outage management system (OMS) predicts outages from smart-meter "last gasp" alarms and customer calls, assigns crews and estimates restoration times. The OMS publishes outage created, updated and restored events on an ActiveMQ queue.

**The problem today.** During storms the call centre receives 40,000 calls an hour, mostly asking "when will my power be back?". The outage map on the website queries the OMS database directly. In the last major storm the map slowed the OMS so much that dispatchers could not assign crews for 40 minutes. Customers who registered for SMS updates got none, because the SMS process ran from a nightly CRM export.

**Goals**
- Affected customers get an SMS or email within 10 minutes of an outage being confirmed, and again when the estimate changes or power is back.
- The outage map, the app and the IVR show the same status and restoration estimate.
- Nothing customer-facing touches the OMS.
- Customers on the priority services register (medical equipment at home) are identified for a phone call.

**Constraints**
| Item | Detail |
|---|---|
| Peak | Up to 300,000 customers affected in an hour; status lookups rise 50 times above normal |
| OMS | Vendor product; publishes events on ActiveMQ; its database must not be queried by other systems |
| Customer data | CRM holds premises, contact details, notification preferences and the priority services flag |
| Network model | Premises are linked to a transformer and feeder; an outage event lists affected transformers |
| Opt-in | SMS only to customers who opted in; regulatory reporting needs proof of each notification |

**Your task.** Design the event flow from the OMS to customers and the status channels.
`,
  answerTemplate: `## Events from the OMS

## Finding affected customers

## Notifications

## Status for map, app and IVR

## Storm peaks

## Priority customers and reporting
`,
  keyPoints: [
    'The OMS publishes events; one Process API expands them to affected premises using the CRM through a System API, and publishes outage notices.',
    'Notices go to a topic so notifications, status and later consumers (regulatory reporting, priority calls) each subscribe without changing the producer.',
    'Customer channels read a status cache through one Experience API; nothing customer-facing ever reaches the OMS.',
    'Notifications respect opt-in, are de-duplicated per outage and customer, and are throttled to the SMS provider\'s rate.',
    'Storm peaks are handled by the cache (status) and the queue (notifications), not by scaling the OMS.',
  ],
  solution: `
**Events.** The OMS publishes to \`oms.outage-events\`. \`prc-outage-events\` consumes them in order per outage id, resolves the affected transformers to premises and customers through \`sys-crm-customer-api\` (with a cached premises-by-transformer index refreshed nightly), and publishes one notice per outage to \`outage-notices\`: outage id, status, estimated restoration, affected premises count and the list of customer ids.

**Notifications.** \`prc-customer-notifications\` subscribes to the topic. For each customer who opted in, it sends SMS or email through the provider, at most one message per outage change, and records each send for regulatory reporting. It throttles to the provider's limit; a queue holds the rest. Priority services customers are flagged to a call list instead of SMS only.

**Status.** \`prc-outage-status\` subscribes to the same topic and writes outage status keyed by outage id and premises to the status cache. \`exp-outage-status-api\` serves the map, the app and the IVR from the cache only, with HTTP caching and a CDN in front of the map tiles.

**Storms.** At 300,000 affected customers the status reads are served from the cache, and notifications wait on the queue in front of the SMS provider. The OMS only produces events.

**Later.** Regulatory reporting and the priority call list become more subscribers to \`outage-notices\`.
`,
  followUps: [
    { q: 'Why publish outage notices to a topic instead of calling the SMS sender directly?', a: 'Several consumers need the same notice: SMS, status, reporting and priority calls. A topic lets each subscribe and fail independently.' },
    { q: 'How do you avoid sending the same customer five texts in an hour?', a: 'Keep the last message sent per customer and outage. Only send again when the status or the estimate changes by more than an agreed amount.' },
    { q: 'Why one Experience API for the map, the app and the IVR?', a: 'They all need the same status from the same cache. One API keeps the answers consistent across channels.' },
    { q: 'How would you prove to the regulator that customers were notified?', a: 'Record every send with customer, outage, channel, time and provider delivery status. Report from that record, not from the provider portal.' },
  ],
}
