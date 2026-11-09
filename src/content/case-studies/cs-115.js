import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-115',
  category: 'case-studies',
  title: 'Container Shipping Line Onboarding 300 Freight Forwarders for Bookings and Status Messages',
  level: 'ADVANCED',
  tags: ['logistics', 'b2b', 'edi', 'edifact', 'x12', 'partner-manager', 'onboarding', 'canonical-model', 'legacy'],
  estMinutes: 55,
  diagram: {
    task: 'draw booking intake from AS2, SFTP and API forwarders into one canonical queue, an exp-booking Experience API behind the gateway for API forwarders, a booking Process API in front of the mainframe System API, and status events published once and sent back to forwarders through Partner Manager.',
    checks: [
      { label: 'AS2 forwarders send into Partner Manager', rule: { type: 'edge', from: { type: 'partner', label: 'as2' }, to: { type: 'experience-api', label: 'partner manager' } } },
      { label: 'Partner Manager collects files from the forwarder SFTP drop', rule: { type: 'link', from: { type: 'experience-api', label: 'partner manager' }, to: 'sftp-server' } },
      { label: 'API forwarders reach the booking Experience API only through the gateway', rule: { type: 'only-via', target: { type: 'experience-api', label: 'exp-booking' }, from: 'api-gateway' } },
      { label: 'EDI, file and API bookings all land on one canonical booking queue', rule: { type: 'each', of: 'queue', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Accepting a booking never waits on the mainframe (no synchronous chain from a forwarder)', rule: { type: 'no-path', from: 'partner', to: 'legacy', kind: 'sync' } },
      { label: 'Partner Manager and the booking Experience API never call a System API directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The mainframe booking system is reached only through its System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Port, container and party codes are translated with shared code lists', rule: { type: 'edge', from: { type: 'process-api', label: 'booking' }, to: ['cache', 'database'] } },
      { label: 'Status changes are published once from the booking System API', rule: { type: 'edge', from: 'system-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Status events from the topic reach the AS2 forwarders', rule: { type: 'path', from: ['topic', 'event-stream'], to: { type: 'partner', label: 'as2' } } },
      { label: 'Only Partner Manager sends messages to AS2 forwarders', rule: { type: 'only-via', target: { type: 'partner', label: 'as2' }, from: { type: 'experience-api', label: 'partner manager' } } },
      { label: 'Bookings that cannot be processed go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        as2: ['partner', 'Large forwarders (AS2, EDIFACT and X12)'],
        sftp: ['sftp-server', 'Forwarder SFTP drop'],
        api: ['partner', 'Digital forwarders (JSON API)'],
        gw: ['api-gateway', 'Client ID per forwarder + rate limit'],
        pm: ['experience-api', 'Partner Manager inbound (EDIFACT, X12 to canonical)'],
        eapi: ['experience-api', 'exp-booking-api'],
        bq: ['queue', 'canonical-bookings'],
        dlq: ['dlq', 'rejected-bookings DLQ'],
        pb: ['process-api', 'prc-booking-api'],
        xref: ['cache', 'Port, container and party code lists'],
        sb: ['system-api', 'sys-ocean-booking-api'],
        mf: ['legacy', 'Booking system (z/OS, CICS)'],
        st: ['topic', 'shipment-status'],
        sq: ['queue', 'status-out'],
        ps: ['process-api', 'prc-status-distribution-api'],
        pmo: ['experience-api', 'Partner Manager outbound (IFTSTA, X12 315)'],
      },
      [
        'as2 -> pm', 'pm -> sftp', 'api -> gw', 'gw -> eapi', 'pm ~> bq', 'eapi ~> bq', 'bq ~> pb', 'bq ~> dlq', 'pb -> xref',
        'pb -> sb', 'sb -> mf', 'sb ~> st', 'st ~> sq', 'sq ~> ps', 'ps -> pmo', 'pmo -> as2', 'pmo -> sftp',
      ],
    ),
  },
  description: `
**Context.** A container shipping line takes about 25,000 bookings and shipping instructions a day from **300 freight forwarders**, and sends back 1.2 million container status messages a day (gate in, loaded, discharged, gate out).

| Forwarder group | Count | Channel | Formats |
|---|---|---|---|
| Large global forwarders | 40 | AS2 | EDIFACT IFTMBF, IFTMIN; ANSI X12 300, 304 |
| Mid-size forwarders | 180 | SFTP | EDIFACT and CSV |
| Digital forwarders and platforms | 80 | REST API | JSON |

The booking system runs on **z/OS with CICS** and is reached through IBM MQ; it can take about 15 bookings per second.

**Problems today**
- Each forwarder has hand-written maps in a vendor B2B gateway that reaches end of support next year. Onboarding a forwarder takes **8 weeks**; 45 are waiting.
- Forwarders use their own codes for ports, container types and parties; mapping tables are copied into each map and are out of date.
- Status messages are sent from a nightly batch, so forwarders call the customer service desk instead.

**Goals**
- Onboard a standard forwarder in **5 working days** through configuration, not new code.
- Status messages to forwarders within 15 minutes of the event.
- Reject bad bookings with a clear functional acknowledgement (CONTRL or 997) and a business response (APERAK or 301).

**Constraints**
- The line has bought **Anypoint Partner Manager** for B2B.
- Monday mornings bring 4,000 bookings in the first hour.
- Forwarders retry on any failure, so duplicates are common.

**Your task.** Design intake, processing and status distribution, and describe the onboarding process.
`,
  answerTemplate: `## Intake channels

## Canonical booking and code lists

## Processing and the mainframe

## Status distribution

## Acknowledgements and errors

## Onboarding in 5 days
`,
  keyPoints: [
    'Partner Manager receives AS2 and SFTP traffic, validates EDI, sends functional acknowledgements and maps each format to one canonical booking.',
    'API forwarders use a booking Experience API behind client ID enforcement; all channels write to one canonical booking queue.',
    'A booking Process API translates codes using shared code lists, removes duplicates, and calls the mainframe System API at the rate it can take.',
    'Status events are published once by the booking System API to a topic and mapped back to each forwarder’s format by Partner Manager outbound.',
    'Onboarding is configuration in Partner Manager (partner profile, AS2 or SFTP endpoint, format version, code list entries) plus a test exchange, with no new code for a standard forwarder.',
  ],
  solution: `
**Intake.** Partner Manager handles AS2 (certificates, MDNs) and polls the SFTP drop. It validates each EDIFACT or X12 interchange, returns CONTRL or 997, and maps the message to the canonical booking JSON, which goes to \`canonical-bookings\`. \`exp-booking-api\` validates JSON bookings against the RAML type and writes them to the same queue, returning \`202\` with a booking request ID.

**Processing.** \`prc-booking-api\` consumes with concurrency sized to the mainframe's 15 per second. It translates partner codes to line codes using shared code lists (UN/LOCODE, ISO container types, party IDs) cached from a reference data table, checks duplicates by forwarder and booking reference, and sends to \`sys-ocean-booking-api\`, which talks to CICS through IBM MQ. Business rejections produce an APERAK or 301 through Partner Manager; technical failures retry and then go to the DLQ.

**Monday peak.** 4,000 bookings in an hour is about 1.1 per second, well under 15 per second; the queue protects the mainframe from short bursts.

**Status.** \`sys-ocean-booking-api\` reads status events from the mainframe's MQ queue and publishes canonical events to \`shipment-status\`. \`prc-status-distribution-api\` filters by forwarder subscriptions and passes each event to Partner Manager outbound, which maps to IFTSTA or X12 315 and sends by AS2 or SFTP. API forwarders get webhooks from the same Process API.

**Onboarding.** A checklist: partner profile, identifiers, endpoint and certificates, chosen message versions, code list additions, then a test exchange in the sandbox environment. Standard forwarders need no new map; only unusual formats go to the integration team.
`,
  followUps: [
    { q: 'Why map every format to one canonical booking?', a: 'The Process API and mainframe logic are written once. A new forwarder or message version only needs a map to the canonical, not changes downstream.' },
    { q: 'What is the difference between CONTRL and APERAK?', a: 'CONTRL is a syntax acknowledgement saying the interchange was received and is well formed. APERAK is an application response saying whether the booking itself was accepted or rejected for business reasons.' },
    { q: 'How do you handle duplicate bookings from retries?', a: 'Keep the forwarder ID and booking reference as an idempotency key. A repeat with the same content is acknowledged without a second booking, and a changed one is treated as an amendment.' },
    { q: 'Why keep code lists outside the maps?', a: 'Codes change often and are shared by every forwarder. One maintained list avoids stale copies and lets the business update codes without a map release.' },
  ],
}
