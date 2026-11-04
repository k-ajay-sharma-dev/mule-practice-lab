import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-015',
  category: 'use-cases',
  title: 'Clinic Appointment Booking across Calendars',
  level: 'INTERMEDIATE',
  tags: ['booking', 'calendar', 'concurrency', 'healthcare', 'caching'],
  estMinutes: 25,
  diagram: {
    task: 'draw the booking platform: web and mobile channels, the Booking Experience and Process APIs, the availability cache and slot-lock store, System APIs for the PMS and Microsoft Graph, and asynchronous notifications.',
    checks: [
      { label: 'Web and mobile call a Booking Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Experience APIs go through the Booking Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Process API combines PMS and Outlook via two System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The PMS is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api', 'database'], label: ['pms', 'practice'] }, from: 'system-api' } },
      { label: 'Microsoft 365 / Graph is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: ['365', 'graph', 'outlook', 'calendar'] }, from: 'system-api' } },
      { label: 'Computed availability is cached with a short TTL', rule: { type: 'edge', from: ['process-api', 'experience-api', 'system-api'], to: 'cache' } },
      { label: 'Confirmations are sent asynchronously from booking events', rule: { type: 'path', from: 'process-api', via: ['queue', 'topic', 'event-stream'], to: 'notification' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Patient website'],
        mob: ['mobile-app', 'Patient app'],
        e: ['experience-api', 'exp-booking-api'],
        p: ['process-api', 'prc-booking-api'],
        cache: ['cache', 'Availability cache (1-2 min TTL)'],
        lock: ['database', 'Bookings table (slot lock / unique key)'],
        spms: ['system-api', 'sys-pms-api'],
        sgraph: ['system-api', 'sys-m365-calendar-api'],
        pms: ['saas', 'Practice management system'],
        m365: ['saas', 'Microsoft 365 / Graph'],
        ev: ['topic', 'booking-events'],
        nproc: ['process-api', 'prc-booking-notifications'],
        send: ['notification', 'Email / SMS provider'],
      },
      [
        'web -> e', 'mob -> e', 'e -> p', 'p -> cache', 'p -> lock', 'p -> spms', 'p -> sgraph', 'spms -> pms', 'sgraph -> m365',
        'p ~> ev', 'ev ~> nproc', 'nproc -> send',
      ],
    ),
  },
  description: `
A chain of 60 physiotherapy clinics wants patients to **book appointments online** (web and mobile). Availability lives in different places:

- 40 clinics use a **practice management system (PMS)** with a REST API (slots, bookings).
- 20 clinics (acquired last year) use **Microsoft 365 / Outlook calendars** per therapist (Microsoft Graph API).
- Therapists also have personal blocks (training, holidays) in Outlook even in PMS clinics.

Requirements:
- Patients search by clinic, treatment type (30 or 60 minutes) and date; results in **under 2 seconds**.
- ~3,000 searches/hour, ~400 bookings/day; Monday mornings are busy.
- **No double bookings** — two patients may try the same slot at the same moment.
- Booking confirmation by email/SMS; cancellations up to 24 hours before must free the slot everywhere.
- Patient data is health-related (special category data under GDPR).

**Describe your solution:**
- What APIs do you build and how do you combine availability from both kinds of system?
- How do you meet the 2-second target?
- How do you prevent double bookings?
- How do cancellations and notifications work?
`,
  answerTemplate: `## API design

## Computing availability

## Performance

## Booking and double-booking prevention

## Cancellations, notifications and data protection
`,
  keyPoints: [
    'Experience API for channels, a Booking Process API, and System APIs for PMS and Microsoft Graph, returning one canonical slot model.',
    'Availability = working hours minus existing bookings minus Outlook busy blocks, computed per therapist; Graph free/busy (getSchedule) used instead of reading full calendar details.',
    'Short-TTL cache of computed availability (e.g. 1–2 minutes) invalidated on booking/cancel, plus parallel calls (scatter-gather/parallel foreach) per therapist.',
    'Booking re-checks the slot at write time with an atomic create (PMS rejects conflicts) or a short-lived lock per therapist+slot in Object Store/DB.',
    'Cancellations release the slot in the system of record and invalidate cache; notifications sent asynchronously; minimal health data passed and logged.',
  ],
  solution: `
**API design.**
- **Booking Experience API** (web/mobile): \`GET /availability?clinicId&treatment&date\`, \`POST /bookings\`, \`DELETE /bookings/{id}\`.
- **Booking Process API**: knows which clinic uses which system, computes free slots, enforces booking rules.
- **System APIs**: \`pms-sapi\` (slots/bookings), \`m365-calendar-sapi\` (Microsoft Graph: free/busy and creating events), plus a notification API.
All return a **canonical slot**: clinicId, therapistId, start, end, treatment types.

**Computing availability.**
- *PMS clinics:* PMS returns free slots; subtract the therapist's **Outlook busy blocks** (training, holidays) fetched via Graph \`getSchedule\` (free/busy) — this avoids reading private event details.
- *Outlook clinics:* working hours (from a config table per therapist) minus busy times from Graph, cut into 30/60-minute slots in DataWeave.
- Calls for multiple therapists run in parallel (**Parallel For Each** or Scatter-Gather) with timeouts.

**Performance.** Cache computed availability per clinic+date in an **Object Store with a short TTL** (1–2 minutes) and invalidate it on any booking/cancellation through our API. Most searches then hit the cache; the risk of a stale slot is covered by the re-check at booking time. Graph has throttling limits, so caching also keeps you under them.

**Booking and double-booking prevention.** On \`POST /bookings\`:
1. Acquire a short **lock** for therapist+slot (e.g. Object Store \`store\` with fail-if-present semantics, or a unique constraint in a bookings table) — the second request for the same slot fails immediately with **409 Conflict** and the app shows the next free slots.
2. **Re-check** availability live against the system of record (not the cache).
3. Create the booking in the PMS (which itself rejects conflicts) or create the Outlook event on the therapist's calendar (Graph) and record it in our bookings table.
4. Release the lock, invalidate the cache, publish \`BookingCreated\`.
Use the client's request ID as an idempotency key so a retried POST does not create two appointments.

**Cancellations, notifications and data protection.** Cancellation (≥ 24 h before) deletes/cancels the booking in the system of record, invalidates the cache, and publishes \`BookingCancelled\`. A notification flow consumes these events and sends email/SMS through the provider — asynchronous so booking stays fast. Health data: only the minimum (treatment type, not diagnosis) goes to calendars; Outlook event titles show a booking reference, not the patient's condition. No patient details in logs; HTTPS everywhere; tokens for Graph via an app registration with least privilege (calendar scopes only).
`,
  followUps: [
    { q: 'A therapist adds a holiday in Outlook directly. When do patients stop seeing those slots?', a: 'Within the cache TTL; for faster reaction subscribe to Graph change notifications on the therapist calendars and invalidate the cache on change.' },
    { q: 'What if Microsoft Graph is slow or throttled (429)?', a: 'Honour Retry-After, serve slightly stale cached availability for searches, but never confirm a booking without a successful live check.' },
    { q: 'How would you handle no-shows or reminders?', a: 'A scheduled flow sends reminders 24 hours before from the bookings table; no-shows are recorded back in the PMS by the clinic. Both are separate, asynchronous flows.' },
  ],
}
