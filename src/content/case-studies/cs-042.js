import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-042',
  category: 'case-studies',
  title: 'Automaker Building a Connected-Car Services Platform',
  level: 'ADVANCED',
  tags: ['automotive', 'connected-car', 'event-driven', 'api-management', 'security'],
  estMinutes: 50,
  diagram: {
    task: 'draw the connected-car service layer: owner app and partners through API Manager, remote commands with ownership checks and audit, consent enforcement, curated vehicle events driving dealer service bookings, and the vehicle cloud behind a System API.',
    checks: [
      { label: 'The owner authenticates with OIDC (MFA for sensitive commands)', rule: { type: 'edge', from: 'mobile-app', to: 'identity-provider' } },
      { label: 'The owner app and partners all enter through API Manager', rule: { type: 'each', of: ['mobile-app', 'partner'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'The vehicle cloud is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api', 'legacy'], label: ['vehicle', 'telematics'] }, from: 'system-api' } },
      { label: 'Every remote command is written to an immutable audit log', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'file-store', 'monitoring'], label: ['audit', 'command'] } } },
      { label: 'Partner calls are checked against a consent service', rule: { type: 'path', from: 'partner', to: { type: ['process-api', 'system-api', 'database'], label: ['consent'] } } },
      { label: 'Mule consumes curated vehicle events (not raw telemetry) asynchronously', rule: { type: 'edge', from: ['event-stream', 'topic', 'queue'], to: 'process-api', kind: 'async' } },
      { label: 'Fault events lead to a booking in the dealer system', rule: { type: 'path', from: ['event-stream', 'topic'], to: { type: ['legacy', 'erp', 'saas'], label: ['dms', 'dealer'] } } },
      { label: 'Dealer systems are reached only through DMS System APIs', rule: { type: 'only-via', target: { type: ['legacy', 'erp', 'saas'], label: ['dms', 'dealer'] }, from: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Owner app'],
        ins: ['partner', 'Insurers / fleet customers'],
        idp: ['identity-provider', 'OIDC + MFA'],
        gw: ['api-gateway', 'API Manager (scopes, SLA tiers)'],
        eown: ['experience-api', 'exp-owner-app-api'],
        epart: ['experience-api', 'exp-partner-insurance-api'],
        vs: ['process-api', 'prc-vehicle-services-api'],
        sb: ['process-api', 'prc-service-booking-api'],
        cons: ['process-api', 'prc-consent-api'],
        evt: ['event-stream', 'Curated vehicle events (faults, trips, charging)'],
        q: ['queue', 'dealer-bookings (throttled)'],
        svc: ['system-api', 'sys-vehicle-cloud-api'],
        sdms: ['system-api', 'sys-dms-a-api'],
        vc: ['saas', 'Vehicle cloud (telematics)'],
        dms: ['legacy', 'Dealer DMS'],
        audit: ['database', 'Command audit log (immutable)'],
      },
      [
        'app -> idp', 'app -> gw', 'ins -> gw', 'gw -> eown', 'gw -> epart', 'eown -> vs', 'epart -> cons', 'epart -> vs',
        'vs -> cons', 'vs -> audit', 'vs -> svc', 'svc -> vc', 'vc ~> evt', 'evt ~> vs', 'evt ~> sb', 'sb ~> q', 'q ~> sdms', 'sdms -> dms',
      ],
    ),
  },
  description: `
**Context.** A car manufacturer has 2 million connected vehicles on the road. Each vehicle talks to the manufacturer's telematics backend (vehicle cloud) built by a specialist team. The business wants to launch services on top: remote lock/unlock and pre-heating in the owner app, usage-based insurance with partner insurers, proactive service bookings at dealers when a vehicle reports a fault, and EV charging-session data for fleet customers.

**Goals**
- A secure, reusable API layer over the vehicle cloud for internal apps and external partners.
- Fault events from vehicles create service-booking suggestions at the right dealer within minutes.
- Partners only access data for vehicles whose owners consented, for the purposes agreed.

**Constraints**
- The vehicle cloud processes ~50,000 messages/s of telemetry; it exposes commands, a vehicle-state API and an event stream.
- Remote commands affect physical vehicles — strict authorisation and audit.
- Dealer systems are diverse (several dealer management systems, varying API quality).
- Data-protection rules treat location and driving behaviour as personal data.

**Your task.** Propose the service architecture, consent model, event flows, and security for commands.
`,
  answerTemplate: `## Responsibilities: vehicle cloud vs integration layer

## API layers and consumers

## Remote commands: security and audit

## Fault-to-service-booking event flow

## Partner access and consent

## Scale and operations

## Risks
`,
  keyPoints: [
    'The vehicle cloud keeps raw telemetry and device connectivity; the integration layer consumes curated events and exposes governed business APIs.',
    'Remote commands require owner/driver authorisation (OAuth with strong user authentication), vehicle-ownership checks, rate limits and an immutable audit trail; commands are asynchronous with status tracking.',
    'Fault events are filtered/enriched and routed to the owner\'s preferred dealer via dealer adapters (one System API per dealer management system type).',
    'A consent service records per-vehicle, per-purpose, per-partner consent; partner APIs enforce it on every call and stop data flows on revocation.',
    'Partner APIs expose derived data (e.g. a driving score, charging session totals) rather than raw location traces where possible.',
  ],
  solution: `
**Responsibilities.** Vehicle cloud: device connectivity, 50k msg/s telemetry, raw storage, command delivery to vehicles. Integration layer (Mule + API Manager): business APIs, partner exposure, dealer integration, consent enforcement, orchestration. Mule does not sit on the raw telemetry firehose; it subscribes to curated event topics (faults, trips summarised, charging sessions).

**Layers.** \`owner-app-eapi\`, \`partner-insurance-eapi\`, \`fleet-eapi\` → \`vehicle-services-papi\`, \`service-booking-papi\`, \`consent-papi\` → \`vehicle-cloud-sapi\`, \`dms-<type>-sapi\`, \`crm-sapi\`.

**Remote commands.**
- Owner authenticates in the app (OAuth 2.0/OIDC with MFA for sensitive actions); the token identifies the user.
- \`vehicle-services-papi\` verifies the user is an authorised driver/owner of that VIN (ownership registry), applies per-vehicle rate limits, and submits the command to the vehicle cloud.
- Commands are asynchronous: return \`202\` with a command ID; status (delivered, executed, failed) comes back via events and is pushed to the app.
- Every command is logged immutably (who, VIN, command, time, outcome).

**Fault → service booking.** Vehicle cloud publishes \`DiagnosticTroubleCode\` events → filtered by severity rules → \`service-booking-papi\` enriches with owner preferences (CRM) and preferred dealer → creates a booking suggestion in the dealer's DMS via the relevant adapter (or a dealer portal task where the DMS has no API) → notifies the owner. Idempotency by VIN + fault code + time window to avoid repeated suggestions for the same fault.

**Partners and consent.** Owners grant consent in the app per partner and purpose (e.g. "share driving score with Insurer X"). \`consent-papi\` is checked on every partner call and on every outbound push; revocation stops flows immediately. Partners get derived data (monthly driving score, mileage) rather than raw GPS. API Manager enforces client credentials, scopes, and SLA tiers per partner.

**Scale and operations.** Curated event volume is far smaller than raw telemetry but bursts (e.g. a firmware issue triggering faults across a model) are possible — queue and throttle towards dealers. Monitoring of command success rates and end-to-end latency.

**Risks.** Unauthorised remote commands (ownership checks, MFA, anomaly detection), consent errors (central service, tests), dealer integration variety (adapters plus fallback portal), fault storms flooding dealers (aggregation and throttling).
`,
  followUps: [
    { q: 'Why are remote commands asynchronous?', a: 'The vehicle may be asleep or out of coverage; delivery can take seconds to minutes. Returning a command ID and pushing status avoids long-held connections and gives a clear audit trail.' },
    { q: 'How do you handle a change of vehicle owner?', a: 'The ownership registry is updated on sale (dealer or owner flow); consents and authorised drivers tied to the previous owner are revoked automatically, and the new owner must grant their own.' },
    { q: 'Why not give insurers raw trip data?', a: 'Data minimisation: the insurer needs a risk score, not location traces. Derived data reduces privacy risk and exposure if a partner is breached.' },
  ],
}
