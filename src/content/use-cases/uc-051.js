import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-051',
  category: 'use-cases',
  title: 'API-Led: University Course Registration across SIS, Finance and LMS',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'application-network', 'higher-education', 'event-driven', 'decomposition'],
  estMinutes: 30,
  diagram: {
    task: 'draw the API-led network for course registration: the three channels and their Experience APIs, the catalogue, registration and fulfilment Process APIs, the System APIs and back ends, and the event that decouples LMS enrolment from registration.',
    checks: [
      { label: 'Portal, mobile app and adviser dashboard each call their own Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Browse traffic is served from a cache, away from the SIS', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Registration publishes a "RegistrationCreated" event asynchronously', rule: { type: 'edge', from: 'process-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'A fulfilment Process API consumes the event (LMS, fees) so a slow LMS never blocks registration', rule: { type: 'edge', from: ['topic', 'queue', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'SIS, finance and Canvas are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'saas', 'database', 'legacy'], from: 'system-api' } },
      { label: 'Failed fulfilment messages go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Student portal'],
        mob: ['mobile-app', 'Student mobile app'],
        adv: ['internal-app', 'Adviser dashboard'],
        ep: ['experience-api', 'exp-student-portal'],
        em: ['experience-api', 'exp-student-mobile'],
        ea: ['experience-api', 'exp-adviser-dashboard'],
        pcat: ['process-api', 'prc-module-catalogue'],
        preg: ['process-api', 'prc-course-registration'],
        pful: ['process-api', 'prc-registration-fulfilment'],
        ex: ['topic', 'RegistrationCreated exchange'],
        dlq: ['dlq', 'fulfilment-dlq'],
        cache: ['cache', 'Module + seat cache'],
        ssis: ['system-api', 'sys-sis-academics'],
        sfin: ['system-api', 'sys-finance-accounts'],
        slms: ['system-api', 'sys-lms-canvas'],
        sis: ['erp', 'SIS (Banner)'],
        fin: ['erp', 'Finance system'],
        lms: ['saas', 'Canvas LMS'],
      },
      [
        'portal -> ep', 'mob -> em', 'adv -> ea', 'ep -> pcat', 'ep -> preg', 'em -> pcat', 'em -> preg', 'ea -> preg',
        'pcat -> cache', 'pcat -> ssis', 'preg -> ssis', 'preg -> sfin', 'preg ~> ex', 'ex ~> pful', 'ex ~> dlq',
        'pful -> slms', 'pful -> sfin', 'ssis -> sis', 'sfin -> fin', 'slms -> lms',
      ],
    ),
  },
  description: `
A university with 35,000 students is replacing a batch-driven registration process. Students should register for modules in real time and have access in the LMS within minutes.

| Channel | Users | Needs |
|---|---|---|
| **Student portal** (web) | Students | Browse modules with free seats, check holds, register/drop, see timetable |
| **Student mobile app** | Students | Same, compact; push when waitlist place frees |
| **Adviser dashboard** (internal web app) | 400 academic advisers | View an advisee's registrations, approve **prerequisite overrides** |

| System | Holds | Interface |
|---|---|---|
| **Student Information System (SIS)** — e.g. Ellucian Banner | Students, programmes, modules, sections, seats, registrations, prerequisites | Oracle DB + Banner Ethos REST APIs |
| **Finance system** (e.g. Oracle Fusion / Unit4) | Tuition fees, **financial holds** | REST |
| **LMS** (Canvas) | Courses, enrolments | REST, rate-limited |
| **Identity** (Microsoft Entra ID) | Student accounts, groups | Microsoft Graph |

Facts:
- Registration opens on a fixed day at 09:00: **~20,000 students in the first hour**, peaks of **400 req/s** on browse and **80 registrations/s**.
- Registration must be blocked if the student has a **finance hold** or misses **prerequisites** (unless an adviser has approved an override).
- LMS enrolment must follow within **15 minutes**; the LMS being slow must **not** slow registration.
- Fees for extra modules are calculated in the finance system after registration.

**Questions:** decompose the API network, describe the registration sequence, and explain which parts are synchronous vs event-driven and why.
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Interactions & sequence (sync vs async)

## Peak-load strategy

## Reuse

## NFRs
`,
  keyPoints: [
    'System APIs: sys-sis-academics (modules, sections, seats, registrations), sys-finance-accounts (holds, fee charges), sys-lms-canvas, sys-identity-graph.',
    'prc-course-registration owns the synchronous decision: holds + prerequisites/overrides + seat availability → register in SIS.',
    'Downstream effects (LMS enrolment, fee calculation, group membership) are event-driven via Anypoint MQ from a "registration created" event, so a slow LMS never blocks registration.',
    'A separate read-optimised path (prc-module-catalogue with cache) absorbs the 400 req/s browse peak away from the SIS.',
    'Adviser overrides are a separate resource stored in the SIS and checked by the same Process API — no duplicated rules in the adviser app.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-student-portal** | \`GET /me/modules?term=\`, \`POST /me/registrations\`, \`DELETE /me/registrations/{id}\`, \`GET /me/timetable\` | Web shaping, student ID from token | Portal |
| Experience | **exp-student-mobile** | same, compact + device registration for push | Mobile shaping | App |
| Experience | **exp-adviser-dashboard** | \`GET /advisees/{studentId}/registrations\`, \`POST /advisees/{studentId}/overrides\` | Adviser auth (role), only own advisees | Adviser app |
| Process | **prc-module-catalogue** | \`GET /terms/{term}/modules\`, \`GET /sections/{id}/availability\` | Read model of modules + seats, heavily cached (seats with short TTL) | Experience APIs |
| Process | **prc-course-registration** | \`POST /registrations\`, \`DELETE /registrations/{id}\`, \`POST /overrides\` | Hold check, prerequisite/override check, seat reservation, register in SIS, publish event | Experience APIs |
| Process | **prc-registration-fulfilment** (event consumer, no public HTTP resources) | Anypoint MQ subscriber | LMS enrolment, Entra group membership, fee recalculation trigger | — |
| System | **sys-sis-academics** | \`GET /students/{id}/academic-record\`, \`GET /sections\`, \`POST /registrations\`, \`POST /prerequisite-overrides\` | Wrap Banner Ethos/DB | Process APIs |
| System | **sys-finance-accounts** | \`GET /students/{id}/holds\`, \`POST /students/{id}/fee-assessments\` | Wrap finance REST | Process APIs |
| System | **sys-lms-canvas** | \`POST /courses/{id}/enrolments\`, \`DELETE ...\` | Wrap Canvas, throttle | fulfilment |
| System | **sys-identity-graph** | \`POST /groups/{id}/members\` | Wrap Microsoft Graph | fulfilment |

\`\`\`
 [Portal]        [Mobile]         [Adviser app]
    |               |                   |
 exp-student-   exp-student-    exp-adviser-dashboard          Experience
 portal         mobile                  |
    +---------------+-------+-----------+
                            v
   prc-module-catalogue   prc-course-registration              Process
          |                 |       |        |
          |                 |       |   publish "RegistrationCreated"
          |                 |       |        v
          |                 |       |   [Anypoint MQ exchange]
          |                 |       |        v
          |                 |       |   prc-registration-fulfilment
          |                 |       |     |          |         |
   sys-sis-academics <------+  sys-finance-  sys-lms-   sys-identity-   System
                               accounts      canvas     graph
\`\`\`

**Sequence — student registers for a module**
1. Portal → exp-student-portal \`POST /me/registrations { sectionId }\` (JWT from Entra ID validated by policy).
2. → prc-course-registration \`POST /registrations { studentId, sectionId, channel }\`.
3. **Synchronously, in parallel**: sys-finance-accounts holds; sys-sis-academics academic record (completed modules) + overrides.
4. If a hold exists → 409 with reason \`FINANCE_HOLD\`; if prerequisites are missing and no override → 409 \`PREREQUISITE_MISSING\`.
5. sys-sis-academics \`POST /registrations\` — the SIS decrements seats atomically (the SIS is the authority on seats; the Process API never trusts the cached count). Full section → 409 \`SECTION_FULL\` + waitlist option.
6. Publish \`RegistrationCreated\` to an Anypoint MQ **exchange**, return **201** to the student. Total target < 1.5 s.
7. Asynchronously, prc-registration-fulfilment consumes the event: enrol in Canvas, add to Entra group, ask finance to assess fees. Each step retried with backoff; failures go to a **DLQ** with alerting; the 15-minute SLA is monitored.

**Why this split.** The student needs an immediate yes/no that depends on holds, prerequisites and seats — that must be synchronous. LMS, identity and fees are consequences; making them asynchronous isolates registration from a rate-limited LMS and lets them catch up after the 09:00 peak.

**Peak strategy.** prc-module-catalogue serves browse traffic from cache (module data TTL hours, seat counts TTL ~10 s, shown as "approximately"), keeping the SIS for actual registrations. Scale Process/Experience replicas before 09:00; Spike Control on sys-sis-academics to protect the DB; queue-based fulfilment levels load on Canvas.

**Reuse.** sys-sis-academics and sys-finance-accounts are the backbone for later projects (graduation audit, accommodation booking). The \`RegistrationCreated\` event lets new consumers (library, timetabling) subscribe without changing the registration API.

**Errors and NFRs.** Business errors use a consistent error model with codes the Experience APIs translate into friendly messages. Correlation ID flows through MQ message properties. Student data is personal data: TLS everywhere, no names/grades in logs, adviser access restricted to their advisees (checked in exp-adviser-dashboard against the SIS adviser assignment).
`,
  followUps: [
    { q: 'Why is the fulfilment logic a Process API if it has no HTTP resources?', a: 'Layer is about responsibility, not transport: it orchestrates several System APIs to implement a business process. It is triggered by events instead of HTTP calls, which is common in API-led networks.' },
    { q: 'What if Canvas is down for an hour on registration day?', a: 'Registrations continue; events stay in the queue and are retried, with the DLQ catching permanently failing messages. Once Canvas recovers the backlog drains, and the 15-minute SLA alert tells the team it was breached.' },
    { q: 'Why an exchange rather than a single queue?', a: 'An Anypoint MQ exchange fans the event out to one queue per consumer, so LMS, identity and finance consumers fail and retry independently and new subscribers can be added later.' },
  ],
}
