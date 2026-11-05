import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-027',
  category: 'case-studies',
  title: 'Charity Connecting Donations, CRM and Finance',
  level: 'INTERMEDIATE',
  tags: ['non-profit', 'crm', 'system-api', 'scheduler', 'data-quality'],
  estMinutes: 25,
  diagram: {
    task: 'draw the target integration: online gifts via webhook, agency files via SFTP, one shared donations Process API, Salesforce and the finance system.',
    checks: [
      { label: 'Webhook gifts are acknowledged and published asynchronously to a queue', rule: { type: 'edge', from: ['system-api', 'experience-api', 'process-api'], to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The queued gifts are consumed by the shared donations Process API', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api' } },
      { label: 'Agency CSV files are picked up from SFTP by a scheduled/batch job', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Agency rows go through the same Process API (matching and consent rules written once)', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'Salesforce is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'The finance system is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'erp'], label: ['finance', 'ledger', 'accounting'] }, from: 'system-api' } },
      { label: 'Failed gifts land in a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'An online gift reaches Salesforce end to end', rule: { type: 'path', from: 'partner', to: 'crm' } },
    ],
    reference: diagram(
      {
        hook: ['partner', 'Donation platform (webhooks)'],
        sdp: ['system-api', 'sys-donation-platform-api'],
        dp: ['saas', 'Donation platform API'],
        q: ['queue', 'online-gifts'],
        dlq: ['dlq', 'online-gifts-dlq'],
        poll: ['batch-job', 'Hourly catch-up poll'],
        agency: ['batch-job', 'Agency file import'],
        sftp: ['file-store', 'Agency SFTP'],
        prc: ['process-api', 'prc-donations-api'],
        fin: ['batch-job', 'Nightly finance summary'],
        ssf: ['system-api', 'sys-salesforce-donors-api'],
        sf: ['crm', 'Salesforce (donors, gifts)'],
        sfin: ['system-api', 'sys-finance-api'],
        finance: ['saas', 'Cloud finance system'],
      },
      [
        'hook -> sdp', 'sdp ~> q', 'q ~> prc', 'q ~> dlq', 'poll -> sdp', 'sdp -> dp', 'poll -> prc',
        'agency -> sftp', 'agency -> prc', 'prc -> ssf', 'ssf -> sf', 'fin -> ssf', 'fin -> sfin', 'sfin -> finance',
      ],
    ),
  },
  description: `
**Context.** A national charity raises money through three channels:
- an online donation platform (SaaS, card and direct-debit gifts)
- street and event fundraising agencies (they send weekly CSV files by SFTP)
- a legacy gift-aid/tax-relief spreadsheet process

Donor records live in Salesforce (a non-profit data model). Money is posted to a cloud finance system.

**The problem today.** Two staff re-key data every Monday, duplicates are common, and thank-you emails go out days late.

**Goals**
- Every donation lands in Salesforce linked to the right donor, ideally within minutes for online gifts.
- Finance receives a daily, reconciled summary of income by fund/campaign.
- Duplicate donor records are reduced, not multiplied.

**Constraints**
- Small IT team (2 people), one new Mule developer, limited budget. Keep the design simple.
- Donor personal data and consent preferences (marketing opt-in) must be respected.
- Agency files vary in quality (missing postcodes, misspelled names).

| Channel | Volume | Delivery |
| --- | --- | --- |
| Online platform | ~800 gifts/day, spikes 10x during appeals | Webhooks + REST API |
| Agencies | ~5,000 rows/week | CSV via SFTP |
| Finance | 1 summary/day | REST API |

**Your task.** Propose the integration design, including how you handle duplicates, bad rows and consent.
`,
  answerTemplate: `## Overall flow and API layers

## Online donations (near real time)

## Agency files (batch)

## Donor matching and data quality

## Finance posting and reconciliation

## Risks
`,
  keyPoints: [
    'Separate flows per channel feeding one shared donations Process API so matching and consent rules are written once.',
    'Online gifts use the platform webhook (acknowledged quickly, processed asynchronously via a queue) with a scheduled catch-up poll for any missed events.',
    'Agency CSV files are validated row by row; bad rows go to an error report back to the agency instead of failing the whole file.',
    'Donor matching uses clear rules (email, then name + postcode) and creates a review task for uncertain matches instead of silently creating duplicates.',
    'Finance gets a daily aggregated summary that reconciles to the sum of individual donations, with idempotent posting so reruns do not double count.',
  ],
  solution: `
**Layers (kept small).** \`donation-platform-sapi\`, \`salesforce-donors-sapi\`, \`finance-sapi\` and one \`donations-papi\` that holds the matching, consent and campaign-mapping logic. No Experience API is needed yet — there are no external consumers.

**Online gifts.**
1. The donation platform calls a webhook endpoint; the flow validates the signature, publishes the payload to an Anypoint MQ queue and returns 200 immediately (protects against appeal-night spikes).
2. A consumer calls \`donations-papi\`: find-or-create donor, create the gift record with the platform's gift ID as an external ID (upsert, so redelivery is harmless).
3. A scheduler runs hourly to poll the platform API for gifts changed since the last watermark — catches anything the webhook missed.

**Agency files.** An SFTP listener (or scheduled poll) picks up files; DataWeave maps and validates each row (mandatory fields, amount > 0, postcode format). Valid rows go through the same \`donations-papi\`; invalid rows are written to a rejects CSV emailed/returned to the agency. A file-level control total (row count, sum) is checked before processing.

**Donor matching.** Exact email match → existing donor; otherwise name + postcode; if only a weak match, create the gift against a holding record and raise a Salesforce task for a supporter-care person to merge. Consent flags from the source are stored with source and timestamp — never overwritten with "opted in" by default.

**Finance.** A nightly job aggregates the day's gifts by fund/campaign, posts one journal per fund with a deterministic reference (date + fund) so a rerun updates rather than duplicates, and stores a reconciliation record (count/amount) that staff can check.

**Operations.** Alerts on DLQ depth and failed files; a simple runbook for the small team. Start with online gifts (biggest manual effort), then agencies, then finance.

**Risks.** Duplicate donors (matching rules + review task), appeal spikes (queue buffering), and data protection (only required fields flow, access to the integration logs restricted, no personal data in log messages).
`,
  followUps: [
    { q: 'Why not let each channel write directly to Salesforce?', a: 'Matching, consent and campaign rules would be implemented three times and drift apart. A single Process API keeps one set of rules and makes adding a new channel cheap.' },
    { q: 'How do you avoid double-counting if the webhook and the poll both see the same gift?', a: 'Both paths upsert on the platform gift ID as an external ID in Salesforce, so the second write is an update with no new record.' },
    { q: 'What would you log?', a: 'Correlation ID, source, gift ID, outcome and error code — not names, addresses or bank details. Personal data stays in the systems of record.' },
  ],
}
