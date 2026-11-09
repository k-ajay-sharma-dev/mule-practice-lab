export default {
  id: 'cs-092',
  category: 'case-studies',
  title: 'Bank Running Instant Payments Integration 24/7 With No Maintenance Window',
  level: 'EXPERT',
  tags: ['banking', 'payments', 'instant-payments', 'high-availability', 'resilience', 'timeouts', 'idempotency', 'cloudhub-2'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The scheme rejects a payment if the bank does not answer within 5 seconds. How should the Mule timeouts on the inbound credit path be set?',
      options: [
        'Use the default HTTP response timeout of 60 seconds everywhere so no call fails early',
        'Budget the 5 seconds across steps (screening, fraud, posting) with each timeout below its share, and answer with a reject before the scheme deadline if a step runs out',
        'Set every timeout to 5 seconds',
        'Remove timeouts and rely on the scheme to cancel',
      ],
      answer: 1,
      explain: 'Each step gets a share of the budget, leaving margin for the network and the reply. A late answer is worse than a clean reject because the scheme has already timed out the payment. Setting every step to 5 seconds lets the total exceed the deadline.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The posting to core banking timed out on an outgoing instant payment. The scheme may or may not have settled it. What should the flow do?',
      options: [
        'Send the payment to the scheme again with a new transaction ID',
        'Mark it as unknown, query the scheme for the status of the original transaction ID, and decide from the answer; never resend under a new ID',
        'Reverse the debit at once and tell the customer it failed',
        'Do nothing; the end-of-day reconciliation will fix it',
      ],
      answer: 1,
      explain: 'An unknown outcome must be resolved by asking, using the original ID. Resending under a new ID can pay twice; reversing at once can refund a payment that was settled. Reconciliation is the last safety net, not the first response.',
    },
    {
      type: 'multi',
      prompt: 'Which three practices let the bank deploy new versions of the instant payment apps on CloudHub 2.0 without downtime?',
      options: [
        'Run at least two replicas and use rolling updates so old replicas serve until new ones are ready',
        'Make the readiness of a replica depend on its connections to the scheme and core being established',
        'Keep API and message contracts backward compatible so old and new versions can run side by side',
        'Deploy only at 03:00 on Sundays',
        'Stop the scheme connection during deployment',
      ],
      answer: [0, 1, 2],
      explain: 'Rolling updates with several replicas, honest readiness and compatible contracts let traffic move without a gap. A 24/7 scheme has no quiet window, and stopping the connection is an outage.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each component to the resilience design it needs in this scenario.',
      pairs: [
        ['Scheme connectivity (TLS client certificate)', 'Certificate rotation with overlapping validity, tested before expiry'],
        ['Inbound credit Process API', 'Replicas in several availability zones and a second region on standby'],
        ['Core banking posting', 'Idempotency key on the scheme transaction ID'],
        ['Sanctions screening service', 'Strict timeout with a hold or reject rule when it is down'],
      ],
      explain: 'Certificate expiry, zone loss, duplicate posting and a slow dependency are the classic instant payment outages. Each gets a design control.',
    },
    {
      type: 'order',
      prompt: 'The primary region fails at 02:00. Order the steps of the failover runbook.',
      items: [
        'Detect the failure from health checks and scheme error rates, and declare the incident',
        'Stop processing in the primary region if it is partly alive, to avoid two active writers',
        'Activate the standby region and point the scheme connection at it',
        'Resolve payments that were in flight at the failure time by status inquiry',
        'Confirm normal traffic and inform the scheme and the business',
      ],
      explain: 'Fencing the failed side before activating the other prevents double processing. In-flight payments are resolved by inquiry, never by resending.',
    },
    {
      type: 'single',
      prompt: 'The team proposes putting an Anypoint MQ queue between the scheme listener and core posting on the inbound path, to absorb load. What is the main problem?',
      options: [
        'Anypoint MQ cannot carry XML',
        'The scheme expects an accept or reject within seconds, and a queue decouples the answer from the posting, so the bank may accept a credit it then fails to post, or answer too late',
        'Queues are not allowed in banks',
        'It would make the flow too fast',
      ],
      answer: 1,
      explain: 'Instant payments need the decision and the posting inside the scheme deadline. A queue is fine for side work (notifications, reporting) but not between the scheme answer and the ledger.',
    },
  ],
  description: `
**Context.** A bank processes 1.8 million instant payments a month (peak 250 per second on paydays). Instant payments run 24/7/365. The scheme gives the bank 5 seconds to accept or reject an incoming credit, and it measures availability: more than 2 minutes of unavailability in a month leads to a review.

**Integration today**
- Mule apps on CloudHub 2.0 in one region, 2 replicas each: scheme connector, inbound credit Process API, outbound payment Process API, and System APIs for core banking, sanctions and fraud.
- Deployments happen on Sunday nights with a 20 minute window that the scheme does not recognise.
- Last year: an expired client certificate stopped the scheme connection for 47 minutes; a core banking timeout led to 312 payments posted twice after manual resends.

**Goals**
- No planned downtime at all, including deployments and certificate changes.
- Survive the loss of an availability zone with no impact, and of a region within 10 minutes.
- Never post or pay twice; resolve every unknown outcome.

**Your task.** Answer the questions on timeouts, unknown outcomes, deployments and failover.
`,
  answerTemplate: `## Time budget per step

## Unknown outcomes and idempotency

## Deployments without downtime

## Certificates and secrets

## Zone and region failure

## Monitoring and evidence
`,
  keyPoints: [
    'Split the 5 second scheme deadline into budgets per step and reject cleanly before the deadline.',
    'Treat timeouts as unknown outcomes: query by the original transaction ID and use it as the idempotency key for posting; never resend under a new ID.',
    'Deploy with rolling updates across several replicas, honest readiness probes and backward compatible contracts.',
    'Rotate certificates with overlapping validity and alerts weeks before expiry.',
    'Spread replicas across zones and keep a standby region with a fenced, rehearsed failover.',
  ],
  solution: `
**Budget.** Network and parsing 300 ms, sanctions 1,200 ms, fraud 400 ms, posting 1,500 ms, reply 300 ms, margin 1,300 ms. Each timeout is set below its share.

**Unknown outcomes.** Every step records the scheme transaction ID; the core posting is idempotent on it; an inquiry job resolves any unknown state within minutes.

**Deployments.** 3 replicas, rolling updates, readiness tied to scheme and core connectivity, contract changes added in a compatible way first.

**Certificates.** Secrets manager with expiry alerts at 60, 30 and 7 days; new certificate registered with the scheme before the old one expires.

**Failover.** Replicas over three zones; standby region with configuration in Git and a quarterly drill; fencing before activation.
`,
  followUps: [
    { q: 'Why is a clean reject better than a late accept?', a: 'After the deadline the scheme has already timed out the payment. A late accept leaves the bank and the sender with different views of the same money.' },
    { q: 'How do you test certificate rotation without downtime?', a: 'Install the new certificate alongside the old one in a test environment connected to the scheme test service, switch traffic, and repeat the same steps in production weeks before expiry.' },
    { q: 'What makes a readiness probe honest?', a: 'It reports ready only when the replica can reach the scheme and core banking, so traffic never goes to a replica that would fail it.' },
  ],
}
