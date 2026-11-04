export default {
  id: 'inc-068',
  category: 'incidents',
  title: 'Black Friday Prices Go Live on Thanksgiving Afternoon',
  level: 'EXPERT',
  tags: ['retail', 'pricing', 'promotions', 'time-zones', 'oracle', 'dataweave', 'pos'],
  estMinutes: 45,
  investigation: {
    logs: [
      { text: '2026-11-20 10:00:00 INFO  [deploy] promo-distribution v5.0.0: POS v5 API needs ISO-8601 dates with offset', relevant: true, why: 'The release changed how promotion start and end times are formatted for the stores.' },
      { text: '2026-11-25 22:00:01 INFO  [promo] PROMO BF26: PROMO_START=2026-11-27 00:00:00 (Oracle DATE, store local) -> effectiveFrom=2026-11-27T00:00:00Z', relevant: true, why: 'A local "midnight in the store" with no time zone was sent as midnight UTC.' },
      { text: '2026-11-25 22:00:03 INFO  [promo] Published BF26 to 840 stores via PRICE.PROMO topic', relevant: false },
      { text: '2026-11-26 16:00:12 INFO  [pos-0412 America/Los_Angeles] Promotion BF26 activated (local 16:00)', relevant: true, why: 'Midnight UTC is 16:00 the previous day in Pacific time: the promotion started 8 hours early.' },
      { text: '2026-11-26 19:00:09 INFO  [pos-0118 America/New_York] Promotion BF26 activated (local 19:00)', relevant: true, why: 'Eastern stores 5 hours early: the error differs per time zone, which points at a missing per-store zone.' },
      { text: '2026-11-26 19:05:00 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '2026-11-26 19:20:44 INFO  [runtime] JVM default time zone: UTC (CloudHub)', relevant: false },
      { text: '2026-11-26 20:15:00 INFO  [orders] Ship-from-store order W-88120 allocated to store 0118', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the Black Friday promotion start on Thanksgiving afternoon?',
        options: [
          'Promotion times are stored as store-local DATE values without a time zone, and v5.0.0 sent them as UTC, so each store started early by its UTC offset',
          'The POS clocks are wrong',
          'Marketing entered the wrong start date',
          'The topic delivered the promotion too early',
        ],
        answer: 0,
        explain: 'Pacific stores started at 16:00 (8 h early) and Eastern at 19:00 (5 h early): the error equals each store\'s UTC offset, so a local time was mislabelled as UTC.',
      },
      {
        type: 'single',
        prompt: 'It is Thursday 19:30 Eastern. What is the best **immediate** action?',
        options: [
          'Republish BF26 with correct per-store start times (or deactivate it until local midnight), starting with the stores still open',
          'Restart all POS systems',
          'Shift every store\'s clock by 8 hours',
          'Do nothing; it is only a few hours',
        ],
        answer: 0,
        explain: 'Stop the margin loss quickly with a corrected or deactivating message per store. The end time has the same bug, so check it before Monday too.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Attach each store\'s IANA time zone (from the store master) to the local promotion time before converting to an offset, so DST is handled',
          'Store promotion windows explicitly as local time plus zone (or as TIMESTAMP WITH TIME ZONE) and document the meaning',
          'Contract tests that check effective times for stores in several time zones around DST changes',
          'Set the CloudHub JVM time zone to America/New_York',
          'Pre-flight check before a promotion goes out: show local start/end per region for approval',
        ],
        answer: [0, 1, 2, 4],
        explain: 'Make the time zone explicit per store and test it. Changing the JVM zone just fixes one zone and breaks the others.',
      },
      {
        type: 'match',
        prompt: 'Match each value to what it means.',
        pairs: [
          ['2026-11-27T00:00:00', 'Local date-time: no zone, ambiguous on its own'],
          ['2026-11-27T00:00:00Z', 'Midnight UTC: one instant for every store'],
          ['2026-11-27T00:00:00-08:00', 'Midnight in Pacific Standard Time'],
        ],
        explain: 'A promotion that starts "at midnight in each store" is a different instant per zone, so it needs a local time plus each store\'s zone.',
      },
    ],
  },
  description: `
## Symptoms
- Thursday (Thanksgiving) 19:30 ET: store managers report that **Black Friday promotion BF26** prices are already active. Pacific stores started at **16:00**, Eastern stores at **19:00**, Hawaii at 14:00.
- Stores open on Thursday evening are selling TVs at Black Friday prices a day early. Marketing estimates the margin loss in the hundreds of thousands.

## Change / Context
- Promotions are planned in Oracle: \`PROMO_START\` and \`PROMO_END\` are \`DATE\` columns meaning **midnight in each store's local time** (BF26: 2026-11-27 00:00 to 2026-11-30 23:59).
- Until last week, \`promo-distribution\` (CloudHub, JVM in UTC) sent \`"2026-11-27 00:00"\` with no zone and the POS treated it as local.
- Release **v5.0.0** (20 November) moved to the POS v5 API, which requires ISO-8601 with an offset. The DataWeave mapping now coerces the value to DateTime and formats it with \`XXX\`.
- The store master table has an IANA time zone per store (\`STORES.TZ_NAME\`).

## Logs
\`\`\`
2026-11-25 22:00:01 INFO  [promo] PROMO BF26: PROMO_START=2026-11-27 00:00:00 (Oracle DATE, store local)
  -> effectiveFrom=2026-11-27T00:00:00Z
2026-11-26 16:00:12 INFO  [pos-0412 America/Los_Angeles] Promotion BF26 activated (local 16:00)
2026-11-26 19:00:09 INFO  [pos-0118 America/New_York] Promotion BF26 activated (local 19:00)
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'PROMO_START is a store-local wall-clock time without a zone; v5.0.0 coerced it to DateTime in a UTC JVM and sent 00:00Z.',
    'Each store started early by its UTC offset (Pacific 8 h, Eastern 5 h, Hawaii 10 h); the end time has the same bug.',
    'Immediate: per-store corrected messages (or deactivate until local midnight), prioritise open stores, fix PROMO_END before Monday, quantify affected sales.',
    'Fix: combine local time with each store\'s IANA zone (DST-aware) before formatting; make the data model explicit (local + zone or TIMESTAMP WITH TIME ZONE).',
    'Prevention: multi-zone and DST contract tests, a pre-flight view of local start/end per region, never rely on the JVM default zone.',
  ],
  solution: `
**Diagnosis.** \`PROMO_START\` means "midnight on the wall clock of each store", but the column is an Oracle **DATE**, which has no time zone. The v5.0.0 mapping coerced it to a DataWeave DateTime; with the CloudHub JVM in UTC the value became **2026-11-27T00:00:00Z** and was sent to every store. For Pacific stores that is 16:00 on Thursday, for Eastern 19:00, for Hawaii 14:00: each store started early by exactly its UTC offset. \`PROMO_END\` has the same bug, so Cyber Monday would end early too.

**Immediate mitigation.**
- Generate corrected messages per store: effectiveFrom = local midnight 27 Nov in that store's zone (e.g. \`2026-11-27T00:00:00-08:00\` for Los Angeles), and publish them, starting with stores still open. If the POS cannot change an active promotion, deactivate BF26 and republish it with the right start.
- Fix \`PROMO_END\` in the same messages.
- Quantify sales at promo price before local midnight for finance and decide (with the business) whether any action is needed; honour prices already charged.

**Root cause.** A local time without a zone was treated as an instant. The previous API hid the problem because the POS interpreted the value as local; the new API made the zone explicit, and the code picked the JVM's.

**Permanent fix.**
- Read \`STORES.TZ_NAME\` and combine the local date-time with that **IANA zone** before formatting, so each store gets its own correct offset including DST.
- Make the meaning explicit in the data model: keep local time plus zone, or store \`TIMESTAMP WITH TIME ZONE\` with documented semantics.
- Never depend on the runtime's default time zone in mappings.

**Prevention.** Contract tests with stores in several zones, including DST change weekends; a pre-flight report that shows local start and end per region for the pricing team to approve before a big promotion; monitor first activation times reported by POS against the plan.
`,
  followUps: [
    { q: 'Why not send UTC and let each POS convert?', a: 'You can, but then the UTC value must be calculated per store from its zone; sending one UTC instant for all stores is exactly the bug. Sending local time plus zone keeps the business meaning visible.' },
    { q: 'Why use an IANA zone like America/Los_Angeles instead of a fixed offset?', a: 'Offsets change with daylight saving time; the IANA zone gives the right offset for the specific date, so a promotion spanning a DST change is still correct.' },
    { q: 'How does an Oracle DATE differ from TIMESTAMP WITH TIME ZONE?', a: 'DATE stores date and time to the second with no zone; TIMESTAMP WITH TIME ZONE stores fractional seconds and the zone or offset, so the instant is unambiguous.' },
  ],
}
