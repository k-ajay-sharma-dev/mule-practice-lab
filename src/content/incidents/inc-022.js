export default {
  id: 'inc-022',
  category: 'incidents',
  title: 'CPU at 100% From a Single Customer Record',
  level: 'ADVANCED',
  tags: ['cpu', 'regex', 'dataweave', 'thread-dump', 'validation'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '13:20:01.442 INFO  [onboarding] POST /customers partnerId=P-77 corrId=c0de companyName="Northwind Global Logistics Trading Holdings International Group Ltd!"', relevant: true, why: 'A long name that almost matches the pattern but fails at the final "!": the worst case for backtracking.' },
      { text: '13:20:05.010 INFO  [onboarding] GET /customers/C-2210 200 (48 ms)', relevant: false },
      { text: '13:20:31.442 WARN  [onboarding] Request still in progress after 30000 ms corrId=c0de', relevant: true, why: 'One request runs for more than 30 s with no I/O: it is burning CPU.' },
      { text: '"[MuleRuntime].uber.07: [customer-onboarding-papi].createCustomer" RUNNABLE at java.util.regex.Pattern$Curly.match / Pattern$Loop.match ...', relevant: true, why: 'Threads are RUNNABLE deep inside regex matching: catastrophic backtracking on the nested quantifier.' },
      { text: '13:20:40.000 INFO  [metrics] cpu=100% heap=44%', relevant: false },
      { text: '13:21:05.901 ERROR [onboarding] HTTP:TIMEOUT calling crm-sapi (unrelated request) corrId=7aa1', relevant: false },
      { text: '13:30:01.500 INFO  [onboarding] POST /customers partnerId=P-77 corrId=d1f0 (retry)', relevant: true, why: 'The partner portal retries every 10 minutes, which is why CPU returns to 100% about 10 minutes after each restart.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'Catastrophic backtracking (ReDoS) in the companyName regex with a nested quantifier on a long almost-matching value',
          'A memory leak causing constant GC',
          'A traffic spike from all partners',
          'The CRM System API is slow',
        ],
        answer: 0,
        explain: 'Threads are RUNNABLE in java.util.regex frames, traffic and memory are normal, and the pattern ([A-Za-z0-9]+\\s?)+ can split letters in exponentially many ways before failing.',
      },
      {
        type: 'single',
        prompt: 'Why does a restart only help for about 10 minutes?',
        options: [
          'The partner retries the same failing request every 10 minutes',
          'The JVM needs 10 minutes to warm up',
          'The regex is cached for 10 minutes',
          'A scheduler runs every 10 minutes',
        ],
        answer: 0,
        explain: 'The restart kills the stuck threads, but the trigger arrives again with the next retry.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **immediate mitigation**?',
        options: [
          'Ask partner P-77 to pause retries, or block that client temporarily in API Manager',
          'Hotfix a cheap length/character check before the regex runs and return 400',
          'Restart the workers to free threads stuck in regex matching',
          'Add more vCores and wait',
        ],
        answer: [0, 1, 2],
        explain: 'Stop the trigger, reject the bad input cheaply, then clear the stuck threads. More CPU only lets the regex burn more.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Rewrite the pattern without ambiguity, e.g. ^[A-Za-z0-9]+(\\s[A-Za-z0-9]+)*$',
          'maxLength and pattern in the RAML/OAS type so APIkit rejects bad input at the edge',
          'Unit tests with long non-matching strings and a ReDoS check in CI',
          'Run the regex in a Scatter-Gather to parallelise it',
        ],
        answer: [0, 1, 2],
        explain: 'An unambiguous pattern runs in linear time, and spec validation bounds input before any flow logic runs.',
      },
    ],
  },
  description: `
## Symptoms
- At 13:20 \`customer-onboarding-papi\` went to **100% CPU on both workers**. Latency for all endpoints rose to tens of seconds and the load balancer started returning 504s.
- A restart brought CPU down — for about 10 minutes, then 100% again.
- Traffic volume is normal. Memory is normal.

## Change / Context
- Last week a validation was added in DataWeave to check the \`companyName\` field before creating the customer:
\`\`\`
payload.companyName matches /^([A-Za-z0-9]+\\s?)+$/
\`\`\`
- A partner's onboarding portal retries failed requests automatically every 10 minutes.
- The app runs on a Mule 4 runtime on **Java 8**.
- Thread dump taken during the incident (excerpt, many threads look like this):
\`\`\`
"[MuleRuntime].uber.07: [customer-onboarding-papi].createCustomer..." RUNNABLE
   at java.util.regex.Pattern$Curly.match(...)
   at java.util.regex.Pattern$GroupTail.match(...)
   at java.util.regex.Pattern$Loop.match(...)
   at java.util.regex.Pattern$GroupHead.match(...)
   ... (hundreds of similar frames)
\`\`\`

## Logs
\`\`\`
13:20:01.442 INFO  [onboarding] POST /customers partnerId=P-77 corrId=c0de
   companyName="Northwind Global Logistics Trading Holdings International Group Ltd!"
13:20:31.442 WARN  [onboarding] Request still in progress after 30000 ms corrId=c0de
13:21:05.901 ERROR [onboarding] HTTP:TIMEOUT calling crm-sapi (unrelated request) corrId=7aa1
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
    'Identifies catastrophic backtracking: the nested quantifier ([A-Za-z0-9]+\\s?)+ on a long string that ultimately fails (the trailing "!") makes the regex engine try exponentially many ways to split the input.',
    'Uses the thread dump as proof: many RUNNABLE threads deep in java.util.regex.Pattern frames inside the createCustomer flow.',
    'Explains why the restart only helped for ~10 minutes: the partner retries the same request every 10 minutes, and the stuck regex threads can\'t be interrupted.',
    'Immediate: block or reject that request (e.g. a policy or a quick length/character check before the regex, or ask the partner to stop retries), then restart to kill stuck threads.',
    'Permanent fix: rewrite the regex without nested quantifiers (e.g. ^[A-Za-z0-9]+(\\s[A-Za-z0-9]+)*$), enforce a max length before matching, and validate at the API edge (RAML/OAS maxLength and pattern).',
    'Prevention: review/lint regexes for ReDoS, test with long non-matching inputs, and monitor CPU with thread-dump capture on alerts.',
  ],
  solution: `
**Diagnosis.** The thread dump shows worker threads **RUNNABLE inside \`java.util.regex.Pattern\`** frames, deep in recursion, in the \`createCustomer\` flow. The regex \`^([A-Za-z0-9]+\\s?)+$\` has a **nested quantifier**: an inner \`+\` inside an outer \`+\`, with the space optional. Take a long name that *almost* matches but fails at the end (the \`!\`). The engine backtracks through an **exponential** number of ways to split the letters between the inner and outer loops. One request can burn a CPU core for minutes or longer. This is **catastrophic backtracking (ReDoS)**. It depends on the JVM: newer JDK regex engines remember failed positions for patterns like this one, and on Java 17 this exact pattern and value fail instantly, so test on the Java version the runtime uses. Other requests slow down because CPU is saturated, so even unrelated calls time out. The **partner retries every 10 minutes**, which matches the "restart helps for 10 minutes" pattern.

**Immediate mitigation.**
1. Stop the trigger: ask partner P-77 to pause retries, and/or deploy a hotfix that **rejects** \`companyName\` longer than, say, 100 characters or containing characters outside the allowed set **before** the regex runs (a cheap check). An API Manager policy blocking that client temporarily also works.
2. **Restart** the workers — threads stuck in regex matching won't stop on their own.
3. Reply to the partner with a 400 and the reason.

**Root cause.** A regex vulnerable to catastrophic backtracking, applied to unbounded user input with no length limit, in a synchronous request path.

**Permanent fix.**
- Rewrite the pattern without ambiguity: \`^[A-Za-z0-9]+(\\s[A-Za-z0-9]+)*$\` — each character can be matched in only one way, so it runs in linear time. (Also rethink: do company names really exclude \`&\`, \`.\`, \`-\` and accents?)
- **Bound input size** first: \`maxLength\` in the RAML/OAS type so APIkit rejects long values before any flow logic.
- Prefer API-spec validation (\`pattern\`, \`maxLength\`) at the edge over ad-hoc regexes in the middle of flows.

**Prevention.** Regex review checklist (no nested quantifiers like \`(a+)+\`, \`(a|a)*\`, overlapping alternations); unit tests with long non-matching strings; static ReDoS checkers in CI; alerting on sustained CPU with automatic thread-dump capture so the next incident is diagnosed in minutes.
`,
  followUps: [
    { q: 'Why is a thread dump the key evidence for a CPU problem?', a: 'It shows what each thread is executing right now. Several dumps a few seconds apart showing the same threads RUNNABLE in the same code (here regex matching) pinpoint the hot spot without a profiler.' },
    { q: 'Why does the restart not fix it permanently?', a: 'It only kills the threads currently stuck. The same input (here via partner retries) triggers the same exponential work again, so the root cause is the pattern plus unbounded input.' },
    { q: 'How do you prove the regex is the culprit offline?', a: 'Run the same pattern against the logged companyName in a unit test on the same Java version as the runtime, and time it while adding characters: runtime roughly doubling per extra character confirms exponential backtracking.' },
  ],
}
