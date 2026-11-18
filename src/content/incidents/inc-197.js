export default {
  id: 'inc-197',
  category: 'incidents',
  title: 'A Nightly Export Cannot Resume After a Short Outage: the Partner Paging Cursor Expired After Ten Minutes',
  level: 'ADVANCED',
  tags: ['myproject', 'pagination', 'cursor', 'resume', 'partners', 'batch'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-18 01:00:00 INFO  [catalog-export] Export started pageSize=500', relevant: false },
      { text: '2026-11-18 01:31:12 INFO  [catalog-export] Page done page=184 saved cursor=c_9f12ab', relevant: true, why: 'The job saves the cursor after each page so it can resume.' },
      { text: '2026-11-18 01:31:15 ERROR [catalog-export] Database unavailable, job paused', relevant: true, why: 'The job stops for a short outage.' },
      { text: '2026-11-18 01:52:40 INFO  [catalog-export] Resuming from cursor=c_9f12ab', relevant: true, why: 'It resumes 21 minutes later with the saved cursor.' },
      { text: '2026-11-18 01:52:41 ERROR [catalog-export] Partner answered 400 {"error":"cursor expired","maxAgeSeconds":600}', relevant: true, why: 'The partner keeps cursors for 10 minutes only.' },
      { text: '2026-11-18 02:00:00 INFO  [scheduler] Next run 2026-11-19 01:00', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why can the job not resume?',
        options: [
          'The partner cursor lasts 10 minutes, and the job resumed after 21, so the cursor no longer exists',
          'The cursor was saved wrongly',
          'The partner deleted the catalogue',
          'The database is still down',
        ],
        answer: 0,
        explain: 'A cursor points at a snapshot the partner keeps for a short time. After that, it cannot be used.',
      },
      {
        type: 'single',
        prompt: 'What is a safer thing to save for resuming?',
        options: [
          'A stable position from the data itself, such as the last product ID or updated time, if the partner can filter on it',
          'The cursor, as now',
          'The page number',
          'Nothing, always start again',
        ],
        answer: 0,
        explain: 'A position in the data does not expire. The next request asks for items after it. Check the partner supports a filter and a stable sort.',
      },
      {
        type: 'multi',
        prompt: 'Which designs handle an expired cursor safely?',
        options: [
          'Start a new export from the start, writing pages so that repeats are harmless',
          'Resume from the last saved product ID with a filter and a stable sort',
          'Retry the expired cursor every minute',
          'Skip the rest of the catalogue',
        ],
        answer: [0, 1],
        explain: 'Starting again works when writes are idempotent. Resuming by data position works when the partner allows it. Retrying an expired cursor never works.',
      },
      {
        type: 'single',
        prompt: 'Why does a page number not help either?',
        options: [
          'Items added or removed while you page shift every later page, so page 185 now holds different items',
          'Page numbers are too long',
          'The partner forbids them',
          'Pages are sorted at random',
        ],
        answer: 0,
        explain: 'Offset paging over changing data skips or repeats items. That is why the partner uses cursors in the first place.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Run the export again from the start tonight, with idempotent writes',
          'Ask the partner which filters and sort orders are stable',
          'Save the last item position as well as the cursor',
          'On an expired cursor, resume from the item position',
          'Alert when an export does not finish by its deadline',
        ],
        explain: 'Get tonight\'s data, learn the options, change what you save, change how you resume, then watch the deadline.',
      },
    ],
  },
  description: `
## Symptoms
- The nightly catalogue export stopped at page 184 of about 400 and never finished.
- The downstream site shows yesterday's catalogue.

## Change / Context
- The partner API returns 500 products per page and a \`nextCursor\` for the next page.
- The export saves the cursor after each page so it can resume after a failure.
- Last night the local database was down for 21 minutes during the export.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:31:12 INFO  [catalog-export] Page done page=184 saved cursor=c_9f12ab
2026-11-18 01:52:40 INFO  [catalog-export] Resuming from cursor=c_9f12ab
2026-11-18 01:52:41 ERROR [catalog-export] Partner answered 400 {"error":"cursor expired","maxAgeSeconds":600}
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
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
    'A partner cursor is only valid for a short time.',
    'Saving the cursor alone cannot resume after a long pause.',
    'Save a stable position in the data as well, such as the last ID.',
    'Page numbers over changing data skip or repeat items.',
    'Idempotent writes make a full restart safe.',
    'Alert when an export misses its deadline.',
  ],
  solution: `
**Diagnosis.** The job resumed with a cursor 21 minutes old. The partner keeps cursors for 10 minutes, so it answered "cursor expired" and the job stopped.

**Immediate mitigation.** Run the export again from the start. Pages written twice are harmless if writes are upserts by product ID.

**Root cause.** The resume design trusted a short-lived cursor and had no other way to find its place.

**Permanent fix.**
- Save the last product ID or update time with each page.
- When a cursor has expired, ask the partner for items after that position, with a stable sort, if the API allows it.
- Otherwise restart from the beginning with idempotent writes.

**Prevention.** Read the partner limits, such as cursor age, into the design. Alert when the export has not finished by a set time.
`,
  followUps: [
    { q: 'Why do partners expire cursors?', a: 'A cursor often holds a snapshot or a position on their side. Keeping them forever costs them memory.' },
    { q: 'What makes a sort stable?', a: 'A unique field, or a unique field after the main sort, so two items never swap places between requests.' },
    { q: 'Could you speed up instead?', a: 'Faster paging helps, but any pause longer than the cursor age still breaks it. The resume design is the real fix.' },
    { q: 'How do you avoid duplicates on restart?', a: 'Write each product by its ID as an upsert, so a second write only replaces the first.' },
  ],
}
