export default {
  id: 'ms-004',
  category: 'mulesoft',
  title: 'Object Store: Persistent vs In-Memory and TTL',
  level: 'INTERMEDIATE',
  tags: ['object-store', 'cloudhub', 'caching', 'state'],
  estMinutes: 15,
  quiz: [
    {
      type: 'multi',
      prompt: 'An in-memory (`persistent="false"`) object store is used on CloudHub 2.0 with 2 replicas, without clustering. What are the consequences?',
      options: [
        'Entries are lost on restart or redeploy',
        'Each replica has its own separate copy of the entries',
        'Entries are automatically synced to Object Store v2 every minute',
        'An ID stored on replica A is unknown to replica B',
      ],
      answer: [0, 1, 3],
      explain: 'In-memory stores live in the replica JVM heap: not shared, not durable. That explains both the full re-send after redeploy and the duplicates slipping through on one replica.',
    },
    {
      type: 'match',
      prompt: 'Match each state need to the best store setup.',
      pairs: [
        ['Workday OAuth token (valid 60 min)', 'In-memory or persistent, entryTtl about 55 minutes'],
        ['ServiceNow polling watermark', 'Persistent, no short TTL'],
        ['Webhook dedup IDs, duplicates within 48 h', 'Persistent, entryTtl about 3 days'],
      ],
      explain: 'A lost token just costs one extra fetch; a lost watermark causes re-sends; dedup IDs must be shared across replicas and expire a bit after the duplicate window.',
    },
    {
      type: 'order',
      prompt: 'Put the watermark steps of the polling flow in the correct order.',
      items: [
        '`os:retrieve` the watermark with a default value for the first run',
        'Query ServiceNow for incidents updated after the watermark',
        'Process and deliver the incidents',
        '`os:store` the max updated timestamp',
      ],
      explain: 'Store the new watermark only **after** successful processing; storing it earlier means a failure silently skips data.',
    },
    {
      type: 'single',
      prompt: 'Both replicas run the 5-minute Scheduler and race on the same watermark. What is the fix on CloudHub 2.0?',
      options: [
        'Use an in-memory object store so each replica has its own watermark',
        'Enable clustering so the Scheduler runs on the primary node only',
        'Set the Scheduler frequency to 10 minutes',
        'Add an Async scope around the Scheduler flow',
      ],
      answer: 1,
      explain: 'With clustering enabled, a Scheduler source runs only on the primary node, so one replica polls. Separate watermarks would make both replicas send the same incidents.',
    },
    {
      type: 'single',
      prompt: 'Which statement about Object Store v2 is accurate?',
      options: [
        'It is a database that supports queries across keys',
        'Every operation is a remote call, and there are limits on retention, value size and request rate',
        'Entries never expire unless you call `os:remove`',
        'Persistent stores are shared by every application in the business group by default',
      ],
      answer: 1,
      explain: 'OSv2 is a key-value service with a maximum TTL of 30 days, per-value size and rate limits. Persistent stores are scoped to the application; other apps need the Object Store REST API.',
    },
  ],
  description: `
An integration runs on **CloudHub 2.0 with 2 replicas** and has three state needs:

1. **OAuth token cache** for a Workday API — token valid 60 minutes, fetched ~once an hour, used on every request.
2. **Watermark** for a scheduler that polls ServiceNow every 5 minutes for incidents updated since the last run. Losing it means re-sending a full day of incidents.
3. **Processed-message IDs** for de-duplication of webhook events — ~200k events/day, duplicates arrive within 48 hours.

A developer used a single \`<os:object-store>\` with \`persistent="false"\` for all three. After a redeploy, the scheduler re-sent thousands of incidents, and duplicates are still slipping through on one replica.

**Questions**
- What exactly is lost or not shared with a non-persistent (in-memory) object store on CloudHub?
- Which store type and TTL would you use for each of the three needs, and why?
- What limits or behaviours of Object Store v2 should you keep in mind?
- Which Object Store connector operations would you use for the watermark?
`,
  answerTemplate: `## In-memory store problems

## Token cache

## Watermark

## Processed-message IDs

## Object Store v2 considerations

## Operations for the watermark
`,
  keyPoints: [
    'Without clustering, in-memory object stores live in the replica JVM: lost on restart/redeploy and not shared between replicas (with CloudHub 2.0 clustering, object stores are replicated and shared).',
    'Object Store v2 is shared by all replicas of the same application and survives redeploys; on CloudHub 2.0 local disk is cleared on restart, so persistent="true" is only durable when the store is Object Store v2.',
    'Watermark → persistent store with no short TTL; read with Retrieve (default value) and update with Store only after a successful run.',
    'Dedup IDs → persistent store with an entry TTL slightly above the 48 h duplicate window (e.g. 3 days) so the store does not grow forever.',
    'Token cache → either is acceptable; TTL just under the token lifetime (e.g. 55 min); in-memory means each replica fetches its own token.',
    'OSv2 has limits (per-key value size, a maximum retention/TTL, API rate limits) and is not a database — no queries across keys.',
  ],
  solution: `
**In-memory store problems:** \`persistent="false"\` keeps entries in the replica's heap. A redeploy/restart wipes them (the watermark was lost → full re-send), and each of the 2 replicas has its own copy (an ID stored on replica A is unknown to replica B → duplicates slip through).

**Token cache:** a small store with \`entryTtl\` ≈ 55 minutes (below the 60-minute token lifetime). In-memory is acceptable — the worst case is one extra token request per replica after a restart. Persistent works too and shares the token across replicas, at the cost of a network call to OSv2 per read.

**Watermark:** **persistent** object store, no expiry (or the longest allowed). Pattern:
1. \`os:retrieve\` key \`snow-incidents-watermark\` with a *default value* (e.g. now minus 1 day) for the first run.
2. Query ServiceNow with \`sys_updated_on > watermark\`.
3. After successful processing, \`os:store\` the max updated timestamp. Don't store it before processing completes, or a failure skips data.
Also make sure only one replica polls (e.g. enable clustering on CloudHub 2.0 so the Scheduler runs on the primary node only), otherwise two replicas race on the same watermark.

**Processed-message IDs:** **persistent** store shared across replicas, \`entryTtl\` of ~3 days (covers the 48 h window with margin). Usually paired with the Idempotent Message Validator pointing at this store. 200k keys/day × 3 days ≈ 600k keys — fine for OSv2, but watch API usage.

**Object Store v2 considerations:**
- Persistent stores are scoped to the application (all replicas); other apps need the Object Store REST API.
- There is a maximum TTL of 30 days, a per-value size limit (10 MB), and request-rate limits depending on subscription.
- Every operation is a remote HTTP call — don't use it as a high-throughput database.
- Set expiry explicitly with \`entryTtl\` / \`entryTtlUnit\` on the store definition rather than relying on platform defaults.

**Watermark operations:** \`os:retrieve\` (with default value), \`os:store\` (overwrite/\`failIfPresent=false\`), optionally \`os:contains\` and \`os:remove\` for resets.
`,
}
