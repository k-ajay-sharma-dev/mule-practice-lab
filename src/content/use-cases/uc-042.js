import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-042',
  category: 'use-cases',
  title: 'Product Review Moderation Pipeline',
  level: 'ADVANCED',
  tags: ['pipeline', 'async', 'ai-moderation', 'human-in-the-loop', 'e-commerce'],
  estMinutes: 30,
  diagram: {
    task: 'draw the review moderation pipeline: submission intake, the async Moderation Process API with its parallel checks, the moderation record, the review platform, the human/dispute case tool and failure handling.',
    checks: [
      { label: 'Reviews are submitted through an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'experience-api' } },
      { label: 'The Experience API acknowledges and queues the review (async)', rule: { type: 'each', of: 'experience-api', edgeTo: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Moderation Process API consumes the queue', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The Process API runs the independent checks through several System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Text and image moderation services are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Check results, decisions and the audit trail are persisted', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Human review and seller disputes go to a case / moderation tool', rule: { type: 'path', from: 'process-api', to: { type: ['crm', 'saas'], label: ['case', 'moderation tool', 'dispute', 'human'] } } },
      { label: 'Poison messages go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website / app review form'],
        exp: ['experience-api', 'exp-reviews-api'],
        q: ['queue', 'reviews-to-moderate'],
        dlq: ['dlq', 'reviews-dlq'],
        prc: ['process-api', 'prc-review-moderation-api'],
        rec: ['database', 'Moderation record + audit log'],
        stxt: ['system-api', 'sys-text-moderation-api'],
        simg: ['system-api', 'sys-image-moderation-api'],
        sord: ['system-api', 'sys-order-history-api'],
        srev: ['system-api', 'sys-review-platform-api'],
        scase: ['system-api', 'sys-moderation-case-api'],
        txt: ['external-api', 'Text moderation API'],
        img: ['external-api', 'Image moderation API'],
        ord: ['erp', 'Order system'],
        rp: ['saas', 'Review platform (publish / reject)'],
        case: ['crm', 'Moderation & dispute cases'],
      },
      [
        'web -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> rec', 'prc -> stxt', 'prc -> simg', 'prc -> sord', 'prc -> srev', 'prc -> scase',
        'stxt -> txt', 'simg -> img', 'sord -> ord', 'srev -> rp', 'scase -> case',
      ],
    ),
  },
  description: `
A marketplace receives customer **product reviews** (text + up to 5 photos) on its website and app. Reviews must be moderated before they are published.

Facts:
- ~40,000 reviews/day, peaks after holiday deliveries of 15,000/hour.
- Today a team of 10 moderators approves everything manually; backlog is **4 days**. Target: **90% published or rejected automatically within 10 minutes**, the rest reviewed by humans within 24 hours.
- Checks required:
  - profanity/abuse and personal data (phone numbers, emails) in text;
  - **verified purchase** (customer bought the product — order system API);
  - spam/fake patterns (same text across products, many reviews from one account in a short time);
  - images: no inappropriate content, no faces of other people, no competitor branding.
- Available services: a third-party **text moderation API**, a cloud **image moderation API**, the **order history API**, and the review platform's API (publish / reject / flag).
- Sellers may **dispute** a negative review; disputes go to a human.
- Moderation rules change frequently; legal requires an **audit trail** of every decision.

**Describe your solution:**
- How do you structure the pipeline (sync vs async, steps, parallelism)?
- How do you combine the results into a decision?
- How do you handle failures of individual moderation services?
- How do you integrate human moderation and seller disputes?
`,
  answerTemplate: `## Intake

## Pipeline design

## Decision engine

## Human-in-the-loop

## Failure handling

## Audit and metrics
`,
  keyPoints: [
    'Submission stored as pending and acknowledged immediately; moderation runs asynchronously via queues.',
    'Independent checks (text, images, verified purchase, spam heuristics) run in parallel (Scatter-Gather or parallel queue steps) and write results to a moderation record.',
    'Decision engine with configurable rules/thresholds combines scores into publish / reject / human review, recording rule version.',
    'Failed or timed-out checks never auto-publish: retry, then route to human review; vendor outages degrade to manual review, not to "approve all".',
    'Human review queue and seller disputes handled in a moderation tool; human decisions override and feed back for tuning.',
    'Full audit trail per review (inputs, check results, rule version, decision, actor) and metrics on automation rate and latency.',
  ],
  solution: `
**Intake.** The review platform calls a \`POST /reviews\` Experience API (or emits an event). The review and photo references are stored with status **PENDING** and a message is put on **Anypoint MQ**; the customer sees "Thanks, your review is being checked".

**Pipeline design.** A Moderation Process API consumer runs checks **in parallel** (Scatter-Gather with per-route timeouts, or fan-out to separate queues if checks are slow):
- **Text**: moderation API (toxicity, profanity) + local regex for phone numbers/emails/URLs (masking or reject).
- **Images**: each photo to the image moderation API (adult/violent content, faces, logos) — images processed concurrently but with a concurrency limit to respect quotas.
- **Verified purchase**: order API — did this customer buy this product (and has it been delivered)?
- **Spam heuristics**: text hash compared with recent reviews (Object Store/DB), number of reviews per account per hour, account age.

Each check writes its result to a **moderation record** (database) so partial results survive restarts.

**Decision engine.** Rules in configuration (rule table or a rules service), e.g.:
- any hard fail (abuse score > 0.9, inappropriate image, personal data unmaskable) → **reject** with reason code;
- all checks clean, verified purchase, spam score low → **publish**;
- otherwise → **human review** with the reasons highlighted.

The decision and the **rule version** are stored; the review platform API is called to publish/reject. Customers get a reason when rejected.

**Human-in-the-loop.** Review queue in a moderation tool (case management in Salesforce/Zendesk or the platform's moderation UI) prioritised by age and product popularity. Moderator decisions are sent back through the same publish/reject API and logged. **Seller disputes** create a case with the review and the automated results; outcome updates the review.

**Failure handling.** Each external check: timeout + retry with backoff for 5xx/429. A check that still fails → mark "unavailable" → review goes to **human review**, never auto-published. If the text API is down for long, a circuit breaker routes everything to manual review and alerts ops (graceful degradation). Poison messages go to a DLQ.

**Audit and metrics.** Immutable audit log per review: input hash, check results, rule version, decision, actor (system or moderator), timestamps. Dashboards: automation rate (target 90%), p95 time to decision, false-positive rate measured from disputes and moderator overrides — used to tune thresholds.
`,
  followUps: [
    { q: 'How do you handle a rule change that would have rejected already-published reviews?', a: 'Rules apply to new reviews by default; if needed, run a back-scan job over published reviews with the new rule version and send matches to human review rather than auto-removing.' },
    { q: 'Why not one big synchronous call at submission?', a: 'Several slow external services with different quotas would make the customer wait and fail on any outage. Async with persisted state lets each step retry and degrade independently.' },
  ],
}
