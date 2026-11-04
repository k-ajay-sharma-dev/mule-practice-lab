import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-034',
  category: 'use-cases',
  title: 'Leads from Web Forms and Ad Platforms into Salesforce',
  level: 'INTERMEDIATE',
  tags: ['salesforce', 'deduplication', 'webhooks', 'marketing', 'lead-routing'],
  estMinutes: 25,
  diagram: {
    task: 'draw how leads from the website, the ad platforms and trade-show CSV files reach Salesforce through one canonical, deduplicating flow that never makes the website wait.',
    checks: [
      { label: 'The website and the ad-platform webhooks each enter through an Experience API', rule: { type: 'each', of: ['web-app', 'partner'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Experience APIs publish canonical leads to a queue (website gets 202 immediately)', rule: { type: 'each', of: 'experience-api', edgeTo: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Lead Process API consumes the queue and does dedupe/upsert', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Salesforce is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Trade-show CSV files are picked up by a batch job', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'The batch job loads into Salesforce (Bulk API) end to end', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
      { label: 'Leads that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website backend'],
        li: ['partner', 'LinkedIn Lead Gen webhook'],
        ga: ['partner', 'Google Ads lead webhook'],
        ew: ['experience-api', 'exp-web-leads-api'],
        ea: ['experience-api', 'exp-ad-lead-webhooks'],
        q: ['queue', 'canonical-leads'],
        dlq: ['dlq', 'canonical-leads-dlq'],
        prc: ['process-api', 'prc-lead-api'],
        job: ['batch-job', 'Trade-show CSV batch'],
        fs: ['file-store', 'Trade-show uploads (S3/SFTP)'],
        ssf: ['system-api', 'sys-salesforce-api'],
        sf: ['crm', 'Salesforce'],
        mail: ['notification', 'Result report to event marketer'],
      },
      ['web -> ew', 'li -> ea', 'ga -> ea', 'ew ~> q', 'ea ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> ssf', 'ssf -> sf', 'job -> fs', 'job -> ssf', 'job -> mail'],
    ),
  },
  description: `
A B2B software company gets leads from several sources and wants them all in **Salesforce** quickly, without duplicates.

| Source | How leads arrive | Volume |
|---|---|---|
| Website forms (headless CMS) | HTTPS POST from the website backend | ~400/day |
| LinkedIn Lead Gen ads | Webhook / polling API | ~150/day |
| Google Ads lead forms | Webhook | ~100/day |
| Trade-show scanner app | CSV upload after each event | 500–3,000 per event |

Facts:
- Sales wants hot leads (demo requests) **in Salesforce within 2 minutes** and assigned to the right rep by country and company size.
- ~30% of leads are **people who already exist** as a Lead or Contact. Creating duplicates breaks attribution and annoys reps.
- Marketing needs the **source and campaign** on every lead, and existing records should get a new **Campaign Member** entry rather than being overwritten.
- Form data is messy: free-text country, personal email addresses, phone numbers in any format.
- Leads without marketing consent may be stored but must not be emailed.

**Describe your solution:**
- How do you receive leads from all sources into one flow?
- How do you detect duplicates and decide create vs update?
- How do you keep the website fast and not lose leads if Salesforce is down?
- How do you handle the CSV uploads?
`,
  answerTemplate: `## Intake per source

## Canonical lead and cleansing

## Dedupe and upsert

## Routing and campaign attribution

## Resilience

## Bulk CSV
`,
  keyPoints: [
    'Source-specific Experience APIs/listeners map each format into one canonical lead and publish to a queue; website gets 202 immediately.',
    'Cleansing in DataWeave: normalise email (lowercase/trim), phone (E.164), country to ISO code, company domain from email.',
    'Dedupe: match existing Contact first, then Lead, by normalised email (plus fuzzy company/name rules as a secondary check); update or add campaign membership instead of creating a duplicate.',
    'Do not overwrite good CRM data with blank or lower-quality values; store source/campaign as Campaign Member records.',
    'Queue + retries + DLQ protect against Salesforce outages; idempotency key per source lead ID.',
    'CSV uploads processed in batch (Batch Job / Bulk API) with the same canonical mapping and dedupe, plus a result report.',
  ],
  solution: `
**Intake per source.** Thin Experience APIs or listeners per source:
- website: \`POST /leads\` (client ID enforcement, schema validation, CAPTCHA/spam score passed from the site), returns **202** in milliseconds;
- LinkedIn/Google: webhook endpoints that verify signatures (or a Scheduler polling the lead API with a watermark);
- trade show: file upload to an SFTP/S3 location or an upload endpoint.

Each maps the source payload into a **canonical lead** (name, email, phone, company, country, source, campaign ID, consent, source lead ID, raw payload) and publishes to **Anypoint MQ**.

**Cleansing.** DataWeave: trim and lowercase emails; reject obvious junk; phone to E.164 using the country; free-text country to ISO 3166 via a lookup table; company domain extracted from email (ignore public domains like gmail.com when matching on domain).

**Dedupe and upsert (Lead Process API).**
1. Idempotency: source + source lead ID seen before? → skip (webhook retries).
2. Search **Contact** by email; then **Lead** by email (SOQL query via the Salesforce connector).
3. Found → update only empty or improvable fields (never overwrite rep-entered data with blanks) and add a **Campaign Member** with the source/campaign.
4. Not found → create Lead with Lead Source, campaign membership and consent fields.

Optionally rely on Salesforce **duplicate rules** as a second line of defence; handle their "duplicate detected" error by switching to the update path.

**Routing.** Assignment by country and company size via Salesforce assignment rules (set the assignment rule header on create) or a routing table in the Process API. Demo requests flagged high priority so a task or alert goes to the rep.

**Resilience.** Queue consumers retry with backoff on Salesforce 5xx or \`REQUEST_LIMIT_EXCEEDED\`; after retries, messages go to a DLQ with an alert. The website never waits for Salesforce. Normal path completes in seconds, meeting the 2-minute target.

**Bulk CSV.** Trade-show files go through a **Batch Job**: validate/cleanse records, dedupe within the file, then look up existing records in bulk (query emails in chunks) and upsert with the Bulk API. A result file (created, updated, rejected with reasons) is emailed to the event marketer.
`,
  followUps: [
    { q: 'Why not use email as an external ID and upsert directly?', a: 'Email can be shared, change or exist on both Lead and Contact objects; upsert by external ID only works on one object. A search-then-decide step handles both.' },
    { q: 'What about GDPR consent?', a: 'Map consent explicitly per source with timestamp and wording version; no consent means the lead is stored for sales follow-up per legitimate interest rules but flagged so marketing automation excludes it.' },
  ],
}
