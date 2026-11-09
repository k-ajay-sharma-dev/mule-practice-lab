import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-106',
  category: 'use-cases',
  title: 'Cache-Aside for Policy Summaries from a Slow Mainframe',
  level: 'BEGINNER',
  tags: ['caching', 'cache-aside', 'object-store', 'api-led', 'performance', 'insurance'],
  estMinutes: 20,
  diagram: {
    task: 'draw the policy summary read path: the agent portal and customer app, the Experience API, the Process API that owns the cache, the cache itself, the System API in front of the mainframe, and the change messages that evict stale entries.',
    checks: [
      { label: 'Both channels call the Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'experience-api', min: 2 } },
      { label: 'The Process API reads and fills the cache (cache-aside)', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Only the Process API touches the cache', rule: { type: 'only-via', target: 'cache', from: 'process-api' } },
      { label: 'On a miss the Process API loads the policy through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'legacy' } },
      { label: 'The mainframe is reached only through the System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The Experience API never skips the Process API and its cache', rule: { type: 'no-edge', from: 'experience-api', to: ['system-api', 'legacy'] } },
      { label: 'Policy change messages reach the Process API to evict entries', rule: { type: 'path', from: 'legacy', via: ['queue', 'topic'], to: 'process-api' } },
      { label: 'Cache reads and writes are sync calls', rule: { type: 'lines', touching: 'cache', kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Agent portal'],
        mob: ['mobile-app', 'Customer app'],
        exp: ['experience-api', 'exp-policy-summary-api'],
        prc: ['process-api', 'prc-policy-summary'],
        cache: ['cache', 'Policy summary cache (Object Store v2, TTL 15 min)'],
        sys: ['system-api', 'sys-policy-admin-api'],
        mf: ['legacy', 'Policy admin mainframe (CICS)'],
        chg: ['queue', 'policy-changed'],
      },
      ['web -> exp', 'mob -> exp', 'exp -> prc', 'prc -> cache', 'prc -> sys', 'sys -> mf', 'mf ~> chg', 'chg ~> prc'],
    ),
  },
  description: `
An insurer shows a **policy summary** (cover, premium, next payment, open claims count) on its **agent portal** and its **customer app**. The data lives in the **policy admin mainframe**, reached through a CICS web service.

Facts:
- The mainframe call takes **3 to 6 seconds** and every call costs MIPS, which the insurer pays for.
- Peak load is **40 summary reads per second** on Monday mornings. About 70 % of reads are for the same 5,000 policies (agents open the same customers again and again).
- A policy changes a few times a year. Business accepts data that is up to **15 minutes old**, except right after a change the customer made.
- The mainframe already writes a message to an MQ queue \`policy-changed\` (policy number only) whenever a policy is updated.
- Target: **p95 under 500 ms** for the summary API.

**Describe your solution:**
- Where does the cache live and who reads and writes it?
- What is the key, what is the TTL, and how are stale entries removed?
- What happens on a miss, and when the mainframe is down?
`,
  answerTemplate: `## Read path

## Cache key and TTL

## Eviction on change

## Mainframe down

## Monitoring
`,
  keyPoints: [
    'Cache-aside: the Process API looks in the cache first; on a miss it calls the System API, stores the result with a TTL and returns it.',
    'The cache key is the policy number plus a version of the response shape, so a new field does not read old entries.',
    'A 15 minute TTL limits staleness, and the policy-changed message evicts the entry at once so a customer sees their own change.',
    'Only the Process API touches the cache; the Experience API and the System API stay free of caching rules.',
    'When the mainframe is down a stale entry can be served with a "last updated" time, while a miss returns a clear 503.',
  ],
  solution: `
\`\`\`
 Agent portal / Customer app -> exp-policy-summary-api -> prc-policy-summary -> cache (Object Store v2)
                                                                       -> sys-policy-admin-api -> mainframe
 mainframe ~> [policy-changed] ~> prc-policy-summary (evict)
\`\`\`

**Read path.** The Process API is where the summary is built, so it owns the cache:
1. Look up \`policy:{number}:v1\` in the cache.
2. Hit: return it. That takes a few milliseconds.
3. Miss: call sys-policy-admin-api, map the answer to the summary, store it with a **15 minute TTL**, return it.
In Mule 4 this is the **Cache scope** with an Object Store caching strategy, or explicit Object Store \`retrieve\` / \`store\` operations. Use **Object Store v2** (or a shared persistent store on Runtime Fabric) so all replicas share one cache. An in-memory store per worker would give each replica its own misses.

**Cache key and TTL.** Key on the policy number and a schema version. Never key on the caller, because the same summary serves agents and customers; access rules are checked before the cache lookup. 15 minutes matches the business rule. With 70 % of reads on 5,000 policies the hit rate should be above 80 %, which cuts mainframe calls from 40/s to under 8/s.

**Eviction on change.** A small flow in the Process API listens on \`policy-changed\` and removes \`policy:{number}:v1\`. The next read reloads it. Evict instead of reloading, so a burst of batch updates does not turn into a burst of mainframe calls.

**Mainframe down.** Keep a second, longer-lived copy (24 hours) as a fallback. If the System API times out (set the timeout to 8 s, not the default), return the fallback copy with \`lastUpdated\` so the app can show "as of 09:10". On a miss with no fallback, return 503 with a retry hint.

**Stampede.** When a popular entry expires, many requests miss at once. Lock per key (the Object Store caching strategy can synchronise loads of the same key) or refresh popular entries a little before expiry.

**Monitoring.** Track hit rate, miss latency and mainframe calls per minute in Anypoint Monitoring; a falling hit rate is the first sign that keys or TTL are wrong.
`,
  followUps: [
    { q: 'Why put the cache in the Process API and not in the Experience API?', a: 'The summary is assembled in the Process API, so one cached copy serves every channel. A cache in each Experience API would repeat the logic and miss more often.' },
    { q: 'Why evict on a change message instead of writing the new value into the cache?', a: 'Eviction is safe even when change messages arrive out of order. The next read loads the current state from the mainframe.' },
    { q: 'What is a cache stampede and how do you avoid it here?', a: 'Many requests miss the same expired key at once and all call the mainframe. Serialise loads per key or refresh hot entries shortly before they expire.' },
    { q: 'Why Object Store v2 rather than an in-memory object store?', a: 'Object Store v2 is shared by all replicas and survives restarts. In-memory stores give each replica its own copy, so the hit rate drops as you scale out.' },
  ],
}
