import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-056',
  category: 'use-cases',
  title: 'API-Led Project 2: Extending Airline Check-in to Partner Airlines',
  level: 'ADVANCED',
  tags: ['api-led', 'reuse', 'versioning', 'airline', 'b2b', 'application-network'],
  estMinutes: 40,
  diagram: {
    task: 'draw the check-in network after Project 2: mobile app, kiosks and the new partner airlines, with the new partner Experience API, prc-checkin v1 and v2 side by side, and the reused System APIs (keep the Project 1 API names).',
    checks: [
      { label: 'Partner airlines call the new partner Experience API', rule: { type: 'each', of: 'partner', edgeTo: { type: 'experience-api', label: ['partner'] } } },
      { label: 'Mobile app, kiosks and partners each enter through an Experience API', rule: { type: 'each', of: ['mobile-app', 'device', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Partners never call Process or System APIs directly', rule: { type: 'no-edge', from: 'partner', to: ['process-api', 'system-api'] } },
      { label: 'The partner Experience API reuses prc-checkin (v2)', rule: { type: 'edge', from: { type: 'experience-api', label: ['partner'] }, to: { type: 'process-api', label: ['checkin', 'check-in'] } } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'prc-checkin v1 and v2 run side by side (kiosks stay on v1)', rule: { type: 'node', match: { type: 'process-api', label: ['checkin', 'check-in'] }, min: 2 } },
      { label: 'prc-checkin reuses the existing PSS, DCS and APIS System APIs', rule: { type: 'edge', from: { type: 'process-api', label: ['checkin', 'check-in'] }, to: 'system-api', min: 3 } },
      { label: 'PSS, DCS, APIS gateway and loyalty are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'saas', 'external-api', 'crm', 'erp', 'database'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        kiosk: ['device', 'Airport kiosks (CUSS)'],
        partner: ['partner', 'Partner airlines (x4)'],
        em: ['experience-api', 'exp-mobile-checkin v1.1'],
        ek: ['experience-api', 'exp-kiosk-checkin v1'],
        ep: ['experience-api', 'exp-partner-checkin (NEW)'],
        pv2: ['process-api', 'prc-checkin v2'],
        pv1: ['process-api', 'prc-checkin v1 (deprecated)'],
        ptrip: ['process-api', 'prc-trip-details'],
        spss: ['system-api', 'sys-pss-reservations v1.1'],
        sdcs: ['system-api', 'sys-dcs v1.1'],
        sapis: ['system-api', 'sys-apis-submission'],
        sloy: ['system-api', 'sys-loyalty'],
        pss: ['legacy', 'PSS (reservations)'],
        dcs: ['legacy', 'DCS (departure control)'],
        gov: ['external-api', 'Government APIS / Secure Flight'],
        loy: ['crm', 'Loyalty system'],
      },
      [
        'mob -> em', 'kiosk -> ek', 'partner -> ep', 'em -> pv2', 'em -> ptrip', 'ek -> pv1', 'ek -> ptrip', 'ep -> pv2',
        'pv2 -> spss', 'pv2 -> sdcs', 'pv2 -> sapis', 'pv1 -> spss', 'pv1 -> sdcs', 'pv1 -> sapis', 'ptrip -> spss', 'ptrip -> sloy',
        'spss -> pss', 'sdcs -> dcs', 'sapis -> gov', 'sloy -> loy',
      ],
    ),
  },
  description: `
An airline built **Project 1** two years ago: online check-in for its **mobile app** and **airport kiosks**. The existing application network:

| Layer | API | Version | Resources | Consumers |
|---|---|---|---|---|
| Experience | exp-mobile-checkin | v1 | \`GET /me/trips\`, \`POST /me/trips/{pnr}/checkin\`, \`GET /me/boarding-passes\` | Mobile app |
| Experience | exp-kiosk-checkin | v1 | \`POST /sessions\` (PNR + surname or passport scan), \`POST /sessions/{id}/checkin\`, \`POST /sessions/{id}/bag-tags\` | Kiosks (CUSS) |
| Process | prc-checkin | v1 | \`POST /bookings/{pnr}/checkin\` — checks in **all passengers on all eligible segments** of the PNR; response \`{ boardingPasses: [{ passenger, flight, seat, barcode }] }\` | both Experience APIs |
| Process | prc-trip-details | v1 | \`GET /bookings/{pnr}\`, \`GET /customers/{id}/bookings\` | both Experience APIs |
| System | sys-pss-reservations | v1 | \`GET /pnrs/{locator}\` | Process APIs |
| System | sys-dcs | v1 | \`POST /flights/{flight}/{date}/passengers/{id}/acceptance\`, \`POST .../seat\`, \`GET .../boarding-pass\` | prc-checkin |
| System | sys-apis-submission | v1 | \`POST /passenger-data\` (APIS / Secure Flight to governments) | prc-checkin |
| System | sys-loyalty | v1 | \`GET /members/{id}\` | prc-trip-details |

**Project 2 requirement.** The airline joins a partnership: **4 partner airlines** must be able to **through-check-in** passengers on connecting itineraries. A passenger checking in on a partner's app for *Partner flight → our flight* should get the boarding pass for **our** leg too.

Partner needs:
- Check in **a specific passenger on a specific segment** (not the whole PNR) — partners only know the passengers and segments in their own booking, referenced by our PNR locator **or** by ticket number.
- Send **travel document data (APIS)** they already collected, so the passenger isn't asked again.
- Receive the boarding pass as **IATA BCBP** barcode data plus structured fields; ours today returns only an opaque \`barcode\` image string.
- Expected volume: ~30,000 check-ins/day from partners; each partner is a separate company with its own SLA and security review.

Also: the mobile team wants per-passenger check-in too ("check in only me, not my colleague").

**Questions:**
1. Which APIs are **reused as-is**, which are **new**, and which **change**?
2. For each change, is it backward-compatible (minor) or breaking (major)? How do you roll out a major version without breaking app and kiosk?
3. Describe the partner through-check-in sequence.
4. What NFR and security concerns are new because the consumers are external?
`,
  answerTemplate: `## Reused as-is

## New APIs

## Changed APIs and versioning decisions

## Rollout / deprecation plan

## Interactions & sequence (partner through-check-in)

## External-consumer security and NFRs
`,
  keyPoints: [
    'New: exp-partner-checkin (B2B contract, OAuth client per partner, mTLS) — the only new Experience API; partners never touch Process APIs directly.',
    'prc-checkin needs per-passenger/per-segment check-in, APIS data input and structured BCBP output; the resource model change (and response structure change) is breaking → prc-checkin v2 deployed alongside v1.',
    'sys-dcs gains BCBP data retrieval as an additive operation (v1.x minor); sys-pss-reservations gains lookup by ticket number (additive, minor); sys-apis-submission is reused as-is.',
    'prc-trip-details, sys-loyalty, exp-kiosk-checkin are reused unchanged; exp-mobile-checkin migrates to prc-checkin v2 to get per-passenger check-in.',
    'Rollout: v1 and v2 run in parallel, consumers migrate at their own pace, v1 deprecated in Exchange with a sunset date, tracked via API Manager analytics of who still calls v1.',
    'Partner scoping: a partner may only check in passengers holding a ticket/segment marketed or operated within the partnership agreement — enforced in prc-checkin v2, not in the Experience API alone.',
  ],
  solution: `
**Classification**

| API | Project 2 status | Change type | Reason |
|---|---|---|---|
| **exp-partner-checkin** | **NEW** (v1) | — | External B2B contract for partners |
| exp-mobile-checkin | Changed | **minor** (v1.1, new optional resource) | Adds \`POST /me/trips/{pnr}/passengers/{paxId}/checkin\`, internally moves to prc-checkin v2 |
| exp-kiosk-checkin | Reused as-is | — | Stays on prc-checkin v1 until kiosk release cycle (slow, hardware certified) |
| **prc-checkin** | Changed | **MAJOR → v2** | New resource model (passenger × segment), new request body (APIS data), new response structure (BCBP fields); old clients would break |
| prc-trip-details | Reused as-is | — | — |
| sys-pss-reservations | Changed | minor (v1.1) | Additive: \`GET /tickets/{ticketNo}\` → PNR + passenger + segments |
| sys-dcs | Changed | minor (v1.1) | Additive: \`GET .../boarding-pass?format=bcbp\` returns BCBP string + fields |
| sys-apis-submission | Reused as-is | — | Already accepts passenger document data |
| sys-loyalty | Reused as-is | — | — |

**prc-checkin v2 resources**
- \`POST /checkins\` body: \`{ pnr | ticketNumber, passengers: [{ paxRef, segments: [...], travelDocument? }], channel, partnerCode? }\`
- \`GET /checkins/{id}\`
- Response: per passenger/segment \`{ status, seat, sequenceNumber, boardingPass: { bcbp, gate, boardingTime, zone } }\`
- v1 resource stays deployed (same codebase can implement v1 as a thin adapter calling v2 logic, or a separate deployment) until all v1 consumers migrate.

\`\`\`
 [Mobile app]     [Kiosks]          [Partner airlines x4]   <- new
      |               |                     | OAuth + mTLS
 exp-mobile-     exp-kiosk-         exp-partner-checkin (NEW)        Experience
 checkin v1.1    checkin v1                 |
      |               |                     |
      | v2            | v1                  | v2
      +------+        +------+       +------+
             v               v       v
          prc-checkin v2   prc-checkin v1 (deprecated)  prc-trip-details   Process
             |      |          |
 sys-pss-reservations v1.1   sys-dcs v1.1   sys-apis-submission v1     System
\`\`\`

**Rollout / deprecation.**
1. Publish prc-checkin **v2** spec in Exchange (new asset major version), implement, deploy alongside v1 (separate API instance in API Manager, base path \`/v2\`).
2. Mobile and the new partner API consume v2 from day one; kiosks remain on v1.
3. Mark v1 **deprecated** in Exchange/API Manager with a sunset date; API Manager analytics shows remaining v1 client apps; v1 removed after kiosks migrate.
4. Minor changes (sys-dcs, sys-pss-reservations v1.1) are additive and deployed in place — existing consumers unaffected.

**Sequence — partner through-check-in (Partner flight PX123 → our flight XY456)**
1. Partner DCS/app → exp-partner-checkin \`POST /v1/through-checkins\` with ticket number, passenger, our segment, travel document data. Policies: Client ID enforcement, JWT validation, mTLS, SLA-based rate limit per partner.
2. exp-partner-checkin maps the partner contract → prc-checkin v2 \`POST /checkins { ticketNumber, passengers, partnerCode }\`.
3. prc-checkin v2 → sys-pss-reservations \`GET /tickets/{ticketNo}\`: find PNR and segment; **verify the partner may act on this segment** (partnership agreement table: carrier codes, codeshare/interline rules) and that the ticket is valid for travel.
4. sys-apis-submission with the supplied travel document → government response (OK / inhibited).
5. sys-dcs acceptance + seat (auto-assign if none requested) → boarding pass in BCBP format.
6. Response to partner: status, seat, BCBP string, gate/boarding time. Partner prints/issues the boarding pass for our leg.
7. Errors are business codes (\`NOT_ELIGIBLE\`, \`APIS_INHIBITED\`, \`CHECKIN_CLOSED\`) mapped to the partner error contract.

**External-consumer security and NFRs.**
- Separate client application and contract per partner; scopes limit partners to through-check-in operations; IP allowlist where partners have fixed egress.
- Travel-document data is sensitive personal data: never logged; TLS + mTLS; data retention aligned with APIS regulations.
- exp-partner-checkin deployed with its own replicas so a partner retry storm cannot hurt the app/kiosk path; Spike Control in front of sys-dcs (DCS acceptance has strict throughput limits around departure waves).
- Idempotency: partner request ID → repeated requests return the existing check-in, never double acceptance.
- Contract tests per partner and a sandbox environment (Exchange mocking service for early partner development).
`,
  followUps: [
    { q: 'Could you avoid a major version by adding the new fields to prc-checkin v1?', a: 'Adding optional response fields would be minor, but changing the resource from whole-PNR check-in to passenger × segment and the response structure changes semantics for existing clients. If v1 behaviour cannot stay identical for old clients, it is a major version.' },
    { q: 'Why not let partners call prc-checkin v2 directly — it already has the right resources?', a: 'Process APIs are internal contracts that evolve with the business. Partners need a stable, separately secured and documented contract; the Experience API absorbs partner-specific mapping and protects internal APIs from external change requests.' },
    { q: 'How do you know when v1 can be retired?', a: 'API Manager analytics and contracts show which client applications still call v1; once traffic is zero (kiosks migrated) after the announced sunset date, the v1 instance is removed and the Exchange version marked deprecated/removed.' },
    { q: 'What about partners that only speak IATA EDIFACT (IATCI)?', a: 'Add another Experience-layer adapter that translates IATCI messages to the same prc-checkin v2 call — the Process and System layers stay unchanged, which is exactly the reuse API-led aims for.' },
  ],
}
