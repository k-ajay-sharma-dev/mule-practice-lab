export default {
  id: 'inc-018',
  category: 'incidents',
  title: 'Slow Memory Leak: Worker Restarts Every Five Days',
  level: 'ADVANCED',
  tags: ['memory', 'caching', 'object-store', 'heap-dump', 'jvm'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '2026-10-12 10:00:00.004 INFO  [pricing] quoteCache stats hits=402,118 misses=71,002 (85.0%)', relevant: false },
      { text: '2026-10-13 09:12:44.010 DEBUG [pricing] POST /prices/quote body={"sku":"A-12","qty":3,"requestId":"9e4c...","requestedAt":"2026-10-13T09:12:43Z"}', relevant: true, why: 'Since three weeks ago the body contains a unique requestId and timestamp, and the cache key hashes the whole body.' },
      { text: '2026-11-01 00:00:00.004 INFO  [pricing] quoteCache stats hits=0 misses=412,881 (0.0%)', relevant: true, why: 'Every request is a miss, so every request adds a new entry to a cache with no maxEntries or TTL.' },
      { text: '2026-11-02 12:00:00.000 INFO  [metrics] heap.afterGC=2.61 GB (+148 MB/24h)', relevant: true, why: 'Live heap grows steadily and never returns to baseline: a leak, not a traffic spike.' },
      { text: '2026-11-02 21:14:55.310 WARN  [pricing] Slow response POST /prices/quote 2,140 ms corrId=0c9e', relevant: false },
      { text: '2026-11-02 22:00:00.004 INFO  [health] GET /health 200 (12 ms)', relevant: false },
      { text: '2026-11-02 23:41:07.902 ERROR [pricing] java.lang.OutOfMemoryError: Java heap space', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is causing the slow memory leak?',
        options: [
          'The cache key hashes the whole body, which now includes a unique requestId, so every request adds an entry to an unbounded in-memory store',
          'A memory leak in the Mule runtime version',
          'Traffic doubled three weeks ago',
          'The GC settings are wrong for 1 vCore',
        ],
        answer: 0,
        explain: 'The hit ratio fell to 0% exactly when requestId and requestedAt were added. The store has no maxEntries or entryTtl, so nothing is evicted; about 400k entries a day matches the ~150 MB/day growth.',
      },
      {
        type: 'single',
        prompt: 'Which **hotfix** stops the leak fastest, even before the key is changed?',
        options: [
          'Add maxEntries, entryTtl and expirationInterval to quoteCache and redeploy',
          'Increase the worker to 2 vCores',
          'Make the object store persistent',
          'Disable GC logging',
        ],
        answer: 0,
        explain: 'Bounding the store caps memory. A bigger worker only delays the crash; a persistent store moves the unbounded growth elsewhere.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Key only on fields that determine the price (sku, quantity, currency, tier)',
          'Always bound caches with maxEntries and entryTtl',
          'Move tracing data such as requestId to headers',
          'Alerts on heap-after-GC trend and cache hit ratio',
          'Schedule a weekly restart permanently',
        ],
        answer: [0, 1, 2, 3],
        explain: 'A scheduled restart is a stopgap that hides the leak; the fixes remove its cause and detect the next one.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Correlate the heap staircase with the 0% hit ratio and the client change',
          'Take a heap dump to prove what retains the heap',
          'Plan a rolling restart before the next predicted OOM',
          'Deploy the bounded-cache hotfix',
          'Change the cache key and add heap and hit-ratio alerts',
        ],
        explain: 'Diagnose, capture evidence before restart destroys it, buy time, stop the leak, then fix the real cause.',
      },
    ],
  },
  description: `
## Symptoms
- \`pricing-papi\` (2 workers, 1 vCore) has been **restarted by the platform** with \`OutOfMemoryError: Java heap space\` roughly **every 5 days** for the last three weeks.
- Anypoint Monitoring: heap *after GC* climbs steadily (~150 MB/day) — a staircase that never returns to baseline. GC pauses get longer in the last day before each crash; p95 latency goes from 80 ms to 2 s.
- Traffic is flat. No large files or batch jobs in this app.
- The **cache hit ratio** of the price cache, logged hourly, dropped from ~85% to **0%** three weeks ago.

## Change / Context
- Three weeks ago the web shop team added a \`requestId\` (UUID) and \`requestedAt\` timestamp to the JSON body of every \`POST /prices/quote\` call "for tracing".
- \`pricing-papi\` caches quotes with a **Cache scope** using a custom caching strategy:
  - key: \`#[dw::Crypto::SHA1(write(payload, "application/json") as Binary)]\` (hash of the whole request body)
  - object store: \`<os:object-store name="quoteCache" persistent="false"/>\` — **no** \`maxEntries\`, **no** \`entryTtl\`.

## Logs
\`\`\`
2026-11-01 00:00:00.004 INFO  [pricing] quoteCache stats hits=0 misses=412,881 (0.0%)
2026-11-02 21:14:55.310 WARN  [pricing] Slow response POST /prices/quote 2,140 ms corrId=0c9e
2026-11-02 23:41:07.902 ERROR [pricing] java.lang.OutOfMemoryError: Java heap space
2026-11-02 23:41:30.000 INFO  [platform] Worker restarted (out of memory)
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again (and how would you *prove* the cause)?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Identifies an unbounded in-memory object store as the leak: no maxEntries/entryTtl, so every cached quote stays on the heap forever.',
    'Connects the start of the leak to the client change: requestId/requestedAt make every body unique, so the hash key is always new — 0% hits and one new entry per request.',
    'Explains the heap-after-GC staircase, longer GC pauses and rising latency as classic signs of a leak (live objects retained), not of a load spike.',
    'Proves it with a heap dump (e.g. Eclipse MAT dominator tree / histogram showing the object store map with millions of entries), or by comparing two heap dumps a day apart.',
    'Immediate: rolling restart before the predicted crash, and/or quick config change adding maxEntries and entryTtl.',
    'Permanent fix: build the cache key only from fields that affect the price (e.g. sku, customerTier, currency, quantity), bound the store (maxEntries, entryTtl, expirationInterval), and alert on heap-after-GC trend and cache hit ratio.',
  ],
  solution: `
**Diagnosis.** A classic slow leak: live heap grows every day and never returns to baseline, GC works harder and harder, latency rises, then OOM. The growth started exactly when the web shop added \`requestId\` and \`requestedAt\` to the body. The cache key is a **hash of the whole body**, so every request now produces a **unique key**: the hit ratio drops to 0% and **every request adds a new entry**. The store is in-memory with **no \`maxEntries\` and no \`entryTtl\`**, so nothing is ever evicted. ~400k quotes/day × a few hundred bytes each ≈ the observed ~150 MB/day.

**Immediate mitigation.**
- Schedule a **rolling restart** of the workers before the next predicted OOM (heap trend tells you when) — buys days, fixes nothing.
- Hotfix config: add \`maxEntries\` (e.g. 50,000), \`entryTtl\` (e.g. 10 min) and an \`expirationInterval\` to \`quoteCache\` and redeploy. This stops the leak even before the key is fixed.
- Capture a **heap dump** before restarting if possible (on CloudHub via MuleSoft support / diagnostics; on RTF or on-prem with \`jcmd <pid> GC.heap_dump\`), to prove the cause.

**Root cause.** An unbounded cache, plus a cache key that depends on fields the response does not depend on. The client's harmless-looking change turned a working cache into a memory leak.

**Permanent fix.**
- **Key only on what determines the price**: e.g. \`sku\`, \`quantity\`, \`currency\`, \`customerTier\`, \`priceListDate\` — not tracing fields. Hit ratio returns to ~85%.
- **Always bound caches**: \`maxEntries\`, \`entryTtl\`, \`expirationInterval\`; size them from expected cardinality and memory budget.
- Move tracing data to headers (\`X-Request-Id\`) as per API standards.

**Prevention.** Alerts on **heap used after GC** trending up and on cache hit ratio; code review checklist: "every object store/cache has a bound"; contract tests that check the API rejects or ignores unknown fields consistently; soak tests (24–72 h) for apps that cache.

**How to prove it.** Two heap dumps a day apart (or one before crash): Eclipse MAT's *Dominator Tree* / *Leak Suspects* shows the object-store map retaining most of the heap with millions of entries; the entry count grows between dumps. Then the hotfix makes heap-after-GC flat — confirmation.
`,
  followUps: [
    { q: 'How do you tell a memory leak from the app simply needing more memory?', a: 'Look at heap used after full GC over time. If it rises steadily with flat traffic and never drops, live objects are retained — a leak. If it is high but stable, the app needs a bigger heap or less in-flight data.' },
    { q: 'Why not just move to a bigger worker?', a: 'With an unbounded leak a bigger heap only changes the crash interval from five days to ten. It also costs more and delays finding the real problem.' },
    { q: 'What other common sources of leaks are there in Mule apps?', a: 'Unbounded object stores or static maps in custom Java code, accumulating variables in long-running loops, unclosed streams/connections, and listeners or threads created per request and never stopped.' },
  ],
}
