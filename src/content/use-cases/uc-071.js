import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-071',
  category: 'use-cases',
  title: 'Gift Card Balance, Activation and Redemption across Channels',
  level: 'ADVANCED',
  tags: ['myproject', 'retail', 'gift-cards', 'omnichannel', 'pos', 'idempotency', 'oracle', 'activemq', 'reconciliation', 'security'],
  estMinutes: 45,
  diagram: {
    task: 'draw the gift-card platform: POS, web and app through the gateway to separate store and digital Experience APIs, one gift-card Process API with an idempotency store, the processor behind a System API, timed-out redemptions reversed through a queue, the Oracle gift-card ledger updated asynchronously, and the daily settlement reconciliation.',
    checks: [
      { label: 'Every channel goes through the gateway', rule: { type: 'each', of: ['pos', 'web-app', 'mobile-app'], min: 3, edgeTo: 'api-gateway' } },
      { label: 'Stores and digital channels have separate Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'The gift-card processor is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The Process API keeps an idempotency store for retried requests', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Timed-out redemptions trigger reversals through a queue', rule: { type: 'edge', from: 'process-api', to: 'queue', kind: 'async' } },
      { label: 'The Oracle ledger is updated asynchronously from the transaction flow', rule: { type: 'path', from: 'process-api', via: ['topic', 'queue'], to: 'database' } },
      { label: 'The Oracle ledger is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'A daily job reconciles the processor settlement file', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store POS (800 stores)'],
        web: ['web-app', 'Website checkout'],
        mob: ['mobile-app', 'Mobile app'],
        gw: ['api-gateway', 'Gateway (mTLS, rate limits)'],
        expp: ['experience-api', 'exp-pos-giftcard', { vCores: '1' }],
        expd: ['experience-api', 'exp-digital-giftcard', { vCores: '0.5', rateLimit: 150 }],
        prc: ['process-api', 'prc-giftcard', { replicas: 2, vCores: '1' }],
        job: ['batch-job', 'Daily settlement reconciliation'],
        idem: ['cache', 'Idempotency store (Object Store)'],
        rq: ['queue', 'GIFTCARD.REVERSALS'],
        tt: ['topic', 'GIFTCARD.TRANSACTIONS'],
        sgc: ['system-api', 'sys-giftcard-processor', { replicas: 2, vCores: '1' }],
        sled: ['system-api', 'sys-giftcard-ledger'],
        gc: ['external-api', 'Gift card processor'],
        ora: ['database', 'Gift card ledger (Oracle)'],
        sftp: ['file-store', 'Settlement files (SFTP)'],
      },
      [
        'pos -> gw', 'web -> gw', 'mob -> gw', 'gw -> expp', 'gw -> expd', 'expp -> prc', 'expd -> prc', 'prc -> idem', 'prc -> sgc', 'sgc -> gc',
        'prc ~> rq', 'rq ~> prc', 'prc ~> tt', 'tt ~> sled', 'sled -> ora', 'job -> sftp', 'job -> sled',
      ],
    ),
    simulation: {
      systems: [
        { match: 'external-api', latencyMs: 300, maxRps: 500 },
        { match: 'cache', hitRatio: 0 }, // the idempotency store never answers a balance check
      ],
      tests: [
        {
          name: 'December peak',
          about: 'In December the tills send 300 gift card transactions a second and the website and app 100. Every transaction is answered within 800 ms.',
          traffic: [
            { name: 'tills', from: 'pos', rps: 300, to: 'external-api', kind: 'write', via: { label: 'exp-pos-giftcard' } },
            { name: 'digital', from: ['web-app', 'mobile-app'], rps: 100, to: 'external-api', kind: 'write', via: { label: 'exp-digital-giftcard' } },
          ],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 800 }] },
        },
        {
          name: 'Brute force from the website',
          about: 'The tills send 300 transactions a second while a bot tries 1,000 card numbers a second on the website. The processor takes at most 500 a second. The digital API answers 429 above 150 a second, so the tills keep working.',
          traffic: [
            { name: 'tills', from: 'pos', rps: 300, to: 'external-api', kind: 'write', via: { label: 'exp-pos-giftcard' } },
            { name: 'bot', from: 'web-app', rps: 1000, to: 'external-api', via: { label: 'exp-digital-giftcard' } },
          ],
          expect: { answers: [{ flow: 'tills', minSuccess: 0.99 }], peakRps: [{ node: 'external-api', max: 500 }] },
        },
      ],
    },
  },
  description: `
A department-store group sells and accepts **gift cards** in 800 stores, on the website, in the app and at the call centre. Card balances are held by an external **gift-card processor** (stored-value platform); the group must keep its own **ledger in Oracle** for finance (outstanding liability, breakage, inter-company settlement between brands).

Operations: **balance inquiry, activation** (when sold), **redemption** (full or partial), **reload, void/reversal**.

Facts and NFRs:
- Peak in December: **400 transactions/second**, half of them balance inquiries.
- Till and checkout need a response in **< 800 ms p95**; the processor's own SLA is 500 ms p95, but it occasionally takes 10+ seconds.
- POS terminals retry automatically if they get no answer in 5 seconds, and today this sometimes **redeems twice**.
- If a redemption times out, the processor rules say the merchant must send a **timeout reversal** within 60 seconds and retry it until accepted.
- Card number + PIN are sensitive: they must never appear in logs and must be protected against **brute-force balance checking** from the website.
- The processor accepts at most 500 calls a second. At the December peak the tills send 300 transactions a second and digital 100, and a bot could try 1,000 card numbers a second.
- Each night the processor drops a **settlement file** on SFTP with every transaction; finance must reconcile it with the Oracle ledger.

**Questions:**
1. Draw the architecture and the APIs per channel.
2. How do you prevent double redemption and handle timeouts correctly?
3. How is the Oracle ledger kept accurate?
4. How do you protect card data and stop brute-force attacks?
`,
  answerTemplate: `## Architecture and APIs

## Redemption flow

## Idempotency and timeout reversals

## Ledger and settlement reconciliation

## Security

## NFRs
`,
  keyPoints: [
    'Separate Experience APIs for stores and digital channels (different auth, rate limits and fields) over one prc-giftcard and one sys-giftcard-processor.',
    'Every mutating request carries a client transaction ID; the Process API stores request → result in an idempotency store so POS retries return the first result.',
    'Redemption timeouts trigger a reversal message on a persistent queue, retried with back-off until the processor accepts it (as the processor\'s rules require).',
    'Each completed transaction is published as an event and written to the Oracle ledger asynchronously; the nightly settlement file is reconciled against it.',
    'Card number tokenised/masked in logs, PIN never stored, rate limiting and lock-out on balance inquiries, captcha/bot protection on the web.',
  ],
  solution: `
\`\`\`
 POS -----> gateway -> exp-pos-giftcard ----\\
 Web/App -> gateway -> exp-digital-giftcard -> prc-giftcard -> idempotency store
                                                   |-> sys-giftcard-processor -> processor
                                                   ~> [GIFTCARD.REVERSALS] ~> prc-giftcard (retry reversal)
                                                   ~> [GIFTCARD.TRANSACTIONS] ~> sys-giftcard-ledger -> Oracle
 Settlement job -> SFTP file + sys-giftcard-ledger (reconcile)
\`\`\`

**APIs.** \`GET /giftcards/{token}/balance\`, \`POST /giftcards/{token}/activations\`, \`/redemptions\`, \`/reloads\`, \`/reversals\`. The store API uses mTLS per store and accepts store/terminal IDs; the digital API uses OAuth and requires the PIN for balance checks.

**Redemption flow.**
1. The POS sends \`POST /redemptions\` with \`clientTxnId\` (store + terminal + sequence).
2. prc-giftcard checks the idempotency store: if the ID exists, return the stored result (or 409 "in progress").
3. Otherwise store "in progress", call the processor with a 3-second timeout, store the result, return it.
4. Publish the transaction event for the ledger.

**Timeouts.** If the processor call times out (\`HTTP:TIMEOUT\`) the outcome is unknown. The API answers the till "declined, use another tender", and publishes a **reversal** message (persistent, with original transaction reference). The reversal consumer calls the processor until it is accepted, with back-off, and alerts if it is still failing after 60 seconds. A late POS retry with the same \`clientTxnId\` sees the stored "reversed" outcome, never a second redemption.

**Ledger.** sys-giftcard-ledger consumes transaction events and MERGEs them into the Oracle ledger on processor transaction ID (idempotent). Liability per brand is computed from the ledger.

**Settlement reconciliation.** The nightly job reads the settlement file from SFTP and compares it line by line with the ledger: missing in ledger (insert and flag), missing in file (investigate), amount mismatch (finance case). Results feed the inter-company settlement between brands.

**Security.** Card numbers are tokenised at the edge or masked (last 4) before logging; PINs are only passed through, never logged or stored. The digital Experience API has a rate limit of about 150 a second: with the tills' 300 a second the processor stays under its 500, and a bot gets 429s. Rate limiting per client and per card token on balance inquiries; after 5 wrong PINs the token is blocked for 30 minutes. Bot protection on the website.

**NFRs.** 400 TPS: the Process API is stateless apart from the idempotency store (shared Object Store or Redis-style cache), horizontally scaled; processor connections pooled; circuit breaker behaviour when the processor is slow so tills fail fast.
`,
  followUps: [
    { q: 'Why not retry the redemption on timeout?', a: 'A timeout does not mean it failed; the processor may have redeemed. Retrying risks a double charge; the safe pattern is reverse first, then the customer can retry as a new transaction.' },
    { q: 'Where would you store the idempotency keys and for how long?', a: 'In a shared store all workers see (Object Store v2 or a cache), keyed by clientTxnId, with a TTL longer than the POS retry window, typically 24 hours.' },
    { q: 'How do you test the timeout-reversal logic?', a: 'With a processor stub that delays or drops responses, verifying that one reversal is sent, retried until accepted, and that retries of the original request return the reversed outcome.' },
  ],
}
