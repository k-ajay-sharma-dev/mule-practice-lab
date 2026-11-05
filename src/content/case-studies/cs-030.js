import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-030',
  category: 'case-studies',
  title: 'Publisher Syndicating Articles to Partner Platforms',
  level: 'INTERMEDIATE',
  tags: ['media', 'content-syndication', 'partners', 'transformation', 'async'],
  estMinutes: 30,
  diagram: {
    task: 'draw the syndication platform: CMS events turned into a canonical article, published once to an exchange with one queue per partner, push delivery (webhook, SFTP) and a pull feed API.',
    checks: [
      { label: 'The CMS is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The canonical article is published asynchronously to a topic/exchange', rule: { type: 'edge', from: 'process-api', to: 'topic', kind: 'async' } },
      { label: 'The exchange fans out to separate per-partner queues', rule: { type: 'edge', from: 'topic', to: 'queue', min: 2, kind: 'async' } },
      { label: 'Every partner queue has its own delivery consumer', rule: { type: 'each', of: 'queue', edgeTo: ['process-api', 'batch-job', 'system-api'] } },
      { label: 'Push partners receive content by webhook and SFTP', rule: { type: 'edge', from: ['process-api', 'batch-job', 'system-api'], to: ['external-api', 'file-store'], min: 2 } },
      { label: 'Undeliverable messages go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Pull partners reach the feed Experience API through the gateway', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
    ],
    reference: diagram(
      {
        pull: ['partner', 'Pull partners (aggregators)'],
        gw: ['api-gateway', 'API Manager (client ID, rate limit)'],
        feed: ['experience-api', 'exp-partner-feed-api'],
        scms: ['system-api', 'sys-cms-api'],
        cms: ['saas', 'CMS (publish/update/unpublish events)'],
        prc: ['process-api', 'prc-syndication-api'],
        cfg: ['database', 'Partner configuration'],
        ex: ['topic', 'articles-exchange'],
        qa: ['queue', 'partner-a-queue'],
        qb: ['queue', 'partner-b-queue'],
        qc: ['queue', 'partner-c-feed-queue'],
        dlq: ['dlq', 'partner-dlq'],
        da: ['process-api', 'prc-deliver-partner-a (webhook)'],
        db: ['process-api', 'prc-deliver-partner-b (SFTP)'],
        dc: ['process-api', 'prc-build-partner-c-feed'],
        wa: ['external-api', 'Partner A webhook'],
        sftp: ['file-store', 'Partner B SFTP'],
        sfeed: ['system-api', 'sys-feed-store-api'],
        store: ['database', 'Per-partner feed store'],
      },
      [
        'scms -> cms', 'scms -> prc', 'prc -> cfg', 'prc ~> ex', 'ex ~> qa', 'ex ~> qb', 'ex ~> qc',
        'qa ~> da', 'qb ~> db', 'qc ~> dc', 'qa ~> dlq', 'da -> wa', 'db -> sftp', 'dc -> sfeed', 'sfeed -> store',
        'pull -> gw', 'gw -> feed', 'feed -> sfeed',
      ],
    ),
  },
  description: `
**Context.** A news publisher produces ~1,500 articles a day in its content management system (CMS). It has licensing deals with 12 partners: news aggregators, a mobile carrier's news app, and two regional newspapers.
- Each partner wants content in a different format (JSON, RSS/Atom, a NewsML-style XML).
- Some only want certain sections (sport, business).

**The problem today.** A developer maintains 12 separate scripts that run on a server under a desk.

**Goals**
- Publish once in the CMS; partners receive their content within 5 minutes.
- Corrections and takedowns (legal removals) reach partners quickly and reliably.
- Adding a new partner should take days, not weeks.

**Constraints**
- Some partners pull (they poll an endpoint), others want push (webhook or SFTP).
- Licensing: a partner must only receive sections and image rights they paid for.
- The CMS emits a "published/updated/unpublished" event per article.

**Your task.** Propose a design that replaces the scripts and makes partner onboarding straightforward.
`,
  answerTemplate: `## Overall architecture

## Content model and transformation

## Push vs pull partners

## Licensing rules and takedowns

## Onboarding a new partner

## Risks
`,
  keyPoints: [
    'CMS events are captured once and published to a topic/exchange; each partner has its own queue so a slow or broken partner does not block others.',
    'A canonical article model is created once; per-partner DataWeave transformations produce their formats.',
    'Partner rules (sections, image rights, format, delivery method) are configuration, not code, so onboarding is mainly configuration plus a mapping.',
    'Pull partners get an API (with client ID and rate limits) serving their filtered feed; push partners get webhook/SFTP delivery with retries.',
    'Takedowns are high-priority events that must be delivered and confirmed; failures are alerted immediately.',
  ],
  solution: `
**Architecture.** \`cms-sapi\` receives CMS events → \`syndication-papi\` builds the canonical article (text, metadata, section, image references with rights) → publishes to an Anypoint MQ exchange. Each partner has a queue bound to the exchange; a partner-delivery flow consumes its queue, filters, transforms and delivers.

**Transformation.** One DataWeave module per partner format (JSON, RSS/Atom, XML). Shared functions (dates, author, image URLs) live in a reusable DataWeave library published to Exchange.

**Push vs pull.**
- *Push*: webhook (HTTP POST with retries and backoff) or SFTP upload. After retries are exhausted, the message moves to a partner DLQ and the partner manager is alerted.
- *Pull*: \`partner-feed-eapi\` with \`GET /feeds/{partnerId}?since=...\` reading a per-partner feed store; client ID enforcement and rate limiting in API Manager.

**Licensing and takedowns.** A partner configuration record holds allowed sections, image-rights categories, format, delivery method and endpoint. Articles or images outside the licence are filtered out before delivery. Unpublish/correction events carry a priority flag; for push partners they are delivered first, for pull partners the feed returns a "removed" entry. Each takedown delivery is logged as evidence.

**Onboarding.** New partner = configuration record + client app (pull) or endpoint credentials (push) + mapping (reuse an existing one if the format matches) + test in a sandbox environment. Target: under a week.

**Risks.** Large image payloads (send URLs, not binaries), partner endpoints down (per-partner queues isolate them), rights mistakes (rules owned by the licensing team, tested with sample articles).
`,
  followUps: [
    { q: 'Why one queue per partner instead of one shared queue?', a: 'Isolation: if one partner endpoint is down, its messages wait in its own queue while the other eleven keep receiving content on time.' },
    { q: 'How would you prove a takedown was delivered?', a: 'Record the delivery attempt, response code and timestamp per partner for every takedown event, and alert on any takedown not confirmed within the agreed time.' },
    { q: 'Where would you store partner configuration?', a: 'In a small database or config service owned by the syndication team, cached in the Mule app — not in properties files that need a redeploy for every change.' },
  ],
}
