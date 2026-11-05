import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-037',
  category: 'use-cases',
  title: 'Social Media Mentions to Marketing and Support',
  level: 'INTERMEDIATE',
  tags: ['polling', 'routing', 'rate-limiting', 'marketing', 'enrichment'],
  estMinutes: 25,
  diagram: {
    task: 'draw the social-mention pipeline: the polling job with its watermark store, the router, and the separate routes to Zendesk, Slack and the data lake.',
    checks: [
      { label: 'A scheduled poller reads mentions from the listening platform through a System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: ['external-api', 'saas'] } },
      { label: 'The poller keeps its watermark and seen mention IDs in a persistent store', rule: { type: 'edge', from: 'batch-job', to: ['cache', 'database'] } },
      { label: 'The poller publishes each mention to a queue asynchronously', rule: { type: 'edge', from: 'batch-job', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'The router fans out to a separate queue per destination', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async', min: 3 } },
      { label: 'The router keeps author + product → open case keys to avoid duplicate cases', rule: { type: 'edge', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'Zendesk is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: ['zendesk', 'support', 'ticket'] }, from: 'system-api' } },
      { label: 'Every mention reaches the data lake', rule: { type: 'path', from: 'batch-job', to: ['data-warehouse', 'file-store'] } },
    ],
    reference: diagram(
      {
        poll: ['batch-job', 'Mention poller (every 2 min)'],
        ssoc: ['system-api', 'sys-social-listening-api'],
        soc: ['external-api', 'Social listening API (60 req/min)'],
        os: ['cache', 'Watermark, seen IDs, case keys'],
        q: ['queue', 'mentions'],
        prc: ['process-api', 'prc-mention-router'],
        qs: ['queue', 'route-support'],
        qi: ['queue', 'route-influencer'],
        ql: ['queue', 'route-data-lake'],
        szd: ['system-api', 'sys-zendesk-api'],
        zd: ['saas', 'Zendesk (support tickets)'],
        sslack: ['system-api', 'sys-slack-api'],
        slack: ['notification', 'Slack #marketing'],
        lw: ['batch-job', 'Hourly lake writer'],
        lake: ['data-warehouse', 'Marketing data lake'],
      },
      [
        'poll -> ssoc', 'ssoc -> soc', 'poll -> os', 'poll ~> q', 'q ~> prc', 'prc -> os',
        'prc ~> qs', 'prc ~> qi', 'prc ~> ql', 'qs ~> szd', 'szd -> zd', 'qi ~> sslack', 'sslack -> slack', 'ql ~> lw', 'lw -> lake',
      ],
    ),
  },
  description: `
A consumer electronics brand wants to react faster to what people say about it online.

Facts:
- A **social listening platform** aggregates mentions from several networks and exposes a REST API (search mentions since a timestamp, paginated, **60 requests/minute**). It can also push webhooks, but only for the premium plan, which the company does not have.
- ~20,000 mentions/day; spikes of 10× during product launches.
- Each mention has text, author handle, network, language, sentiment score (from the platform), and a link.
- Requirements:
  - **Negative mentions about a product problem** → create a case in the support tool (Zendesk) within **15 minutes**.
  - **Influencer mentions** (> 50,000 followers) → Slack alert to the marketing channel.
  - All mentions → the marketing data lake (daily partitioned JSON files) for reporting.
  - Same author posting 5 times about the same issue → one case, not five.
- The brand's own posts must be ignored.

**Describe your solution:**
- How do you get mentions reliably without webhooks?
- How do you route each mention to the right destinations?
- How do you avoid duplicate cases?
- How do you cope with launch-day spikes and the rate limit?
`,
  answerTemplate: `## Polling and watermark

## Classification and routing

## Case creation and dedupe

## Data lake

## Scaling and limits
`,
  keyPoints: [
    'Scheduler polls with a stored watermark (and small overlap), paginates, and dedupes by mention ID.',
    'Routing rules (sentiment, keywords/product list, follower count, own accounts) are configurable and evaluated in a Process API; one mention can go to several targets.',
    'Support case dedupe by author + topic within a time window: append comments to the open case instead of creating new ones.',
    'Every mention written to the data lake in batches (e.g. hourly files per day partition), independent of other routes.',
    'Polling interval and page size tuned to stay under 60 req/min; downstream processing decoupled by queues for spikes.',
  ],
  solution: `
**Polling and watermark.** A Scheduler every 2 minutes calls \`search mentions since <watermark>\`, paginating until done. The watermark (last mention timestamp) is kept in a persistent Object Store; query with a **small overlap** (e.g. 2 minutes back) because mentions may be indexed late, and drop duplicates by **mention ID** (Object Store with TTL of a few days). Use the Scheduler's single-execution behaviour (or cluster primary-only) so two polls never overlap. Each mention is published to **Anypoint MQ**.

**Classification and routing.** A consumer applies routing rules (stored as config):
- ignore authors in the brand's own account list;
- sentiment below threshold **and** matching product/problem keywords (e.g. "broken", "won't charge", product names) → *support*;
- follower count above 50,000 → *influencer alert*;
- all → *data lake*.

Rules may send one mention to several routes, so routing publishes to separate queues per destination.

**Case creation and dedupe.** Support route: build a key of **author + network + product** and look for an open case created in the last 72 hours. Store case ID by key in Object Store, or search Zendesk by an external ID/tag. Found → add a comment with the new mention; not found → create a ticket with the text, link, sentiment, product tag and a "social" channel tag. 15-minute target: polling every 2 minutes plus queue processing takes well under that.

**Influencer alerts.** Post to Slack via the Slack connector or an incoming webhook, with author, followers, text and link; throttle to avoid flooding the channel during launches (group into a digest if more than N per 10 minutes).

**Data lake.** The data-lake consumer aggregates mentions (e.g. by Batch Aggregator or a time-based buffer) and writes **hourly files** to \`mentions/date=YYYY-MM-DD/\`, so reporting does not depend on support or Slack.

**Scaling and limits.** 20,000/day at 100 per page is ~200 calls/day — trivial. On launch days (200,000/day) polling every 2 minutes with 100-item pages is still far below 60 req/min. If backlog builds, increase page size, never concurrency of polls. Downstream consumers scale independently via queues; Zendesk 429s are retried with backoff.
`,
  followUps: [
    { q: 'Would you upgrade to webhooks if offered?', a: 'Yes for latency, but keep the polling job as a slower reconciliation safety net, since webhooks can be missed.' },
    { q: 'Can you trust the platform sentiment score?', a: 'It is a heuristic; combine it with keyword rules and review false positives with support, or call an NLP service for a second opinion on borderline cases.' },
  ],
}
