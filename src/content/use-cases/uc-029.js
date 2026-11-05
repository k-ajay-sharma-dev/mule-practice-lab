import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-029',
  category: 'use-cases',
  title: 'Contract Renewal Reminders from the CLM',
  level: 'BEGINNER',
  tags: ['scheduler', 'notifications', 'salesforce', 'legal'],
  estMinutes: 15,
  diagram: {
    task: 'draw the reminder solution: the daily and weekly jobs, the CLM they read, where sent milestones are recorded, the Salesforce opportunity upsert, the directory check for leavers, and the emails.',
    checks: [
      { label: 'A daily scheduled job selects contracts from the CLM', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'database', 'legacy'], label: ['clm', 'contract'] } } },
      { label: 'Sent milestones are recorded per contract to avoid duplicates', rule: { type: 'edge', from: 'batch-job', to: { type: ['cache', 'database', 'saas'], label: ['sent', 'milestone', 'flag'] } } },
      { label: 'Renewal opportunities are created in Salesforce', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
      { label: 'Salesforce is reached only through a System API (upsert by external ID)', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Daily reminders and the weekly legal digest are emailed', rule: { type: 'edge', from: 'batch-job', to: 'notification', min: 2 } },
      { label: 'Owners who have left are detected via the HR / identity directory', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'database', 'identity-provider'], label: ['directory', 'hr', 'identity', 'ldap'] } } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Daily reminder job (07:00)'],
        digest: ['batch-job', 'Weekly legal digest (Monday)'],
        sclm: ['system-api', 'sys-clm-api'],
        clm: ['saas', 'CLM tool'],
        sent: ['cache', 'Sent milestones per contract + term'],
        ssf: ['system-api', 'sys-salesforce-opportunity-api'],
        sf: ['crm', 'Salesforce'],
        sdir: ['system-api', 'sys-directory-api'],
        dir: ['saas', 'HR / identity directory'],
        mail: ['notification', 'Email (owners / legal)'],
      },
      ['job -> sclm', 'sclm -> clm', 'job -> sent', 'job -> ssf', 'ssf -> sf', 'job -> sdir', 'sdir -> dir', 'job -> mail', 'digest -> sclm', 'digest -> mail'],
    ),
  },
  description: `
A B2B services company manages ~6,000 customer and supplier contracts in a **contract lifecycle management (CLM)** tool. Contracts often **auto-renew** unless notice is given, and the company has lost money by missing notice periods.

Facts:
- The CLM has a REST API: search contracts by status and dates; each contract has an owner (email), counterparty, end date, **notice period in days** and an auto-renew flag.
- Customer contracts are linked to an **Account and Opportunity in Salesforce** (CLM stores the Salesforce Account ID).
- Requirement:
  - Remind the contract owner **90, 60 and 30 days before the notice deadline** (end date − notice period).
  - For customer contracts, create a **renewal Opportunity** in Salesforce at the 90-day point, assigned to the account owner.
  - A weekly digest to the legal team listing everything due in the next 30 days.
- Owners leave the company; ~3% of contracts have an owner that no longer exists.

**Describe your solution:**
- How do you find which contracts need a reminder today?
- How do you make sure nobody gets the same reminder twice or no reminder at all if a run fails?
- How do you create the Salesforce Opportunity safely?
- What about owners who have left?
`,
  answerTemplate: `## Trigger and selection

## Reminder logic

## Salesforce opportunity

## Edge cases and errors
`,
  keyPoints: [
    'Daily Scheduler queries the CLM for active contracts and computes the notice deadline in DataWeave (end date minus notice period).',
    'Reminders selected by "deadline minus today is at most 90/60/30 days and that milestone not yet sent", so a missed day catches up instead of skipping.',
    'Sent milestones recorded per contract (Object Store or a CLM custom field) to prevent duplicates.',
    'Renewal Opportunity created with an external ID (contract ID + term) via upsert so reruns do not duplicate it.',
    'Missing/inactive owners routed to the legal team; weekly digest built from the same selection logic.',
  ],
  solution: `
**Trigger and selection.** A Scheduler runs daily at 07:00. It pages through the CLM API for contracts with status *active* and end date within the next ~15 months. This is a bounded window, not all 6,000 every time, though 6,000 is still small. DataWeave computes for each contract:
- \`noticeDeadline\` = end date minus notice days, e.g. \`endDate - (("P" ++ noticeDays ++ "D") as Period)\`;
- \`daysLeft\` = days between today and the deadline.

**Reminder logic.** For each milestone (90, 60, 30), a reminder is due when \`daysLeft <= milestone\` **and** that milestone has not been sent. Using "less than or equal" plus a sent-flag (not "exactly equal to 90") means a failed or skipped run sends the reminder the next day instead of missing it. Sent milestones are stored per contract — ideally written back to a **custom field in the CLM** (visible to users), otherwise a persistent Object Store keyed by contract ID.

Emails go out via the Email connector (SMTP) or the company's notification API, using a template with contract name, counterparty, deadline and a deep link to the CLM.

**Salesforce opportunity.** At the 90-day milestone, for customer contracts with a Salesforce Account ID, **upsert** an Opportunity using an external ID field such as \`CLM_Contract_Term__c\` (contract ID + current term end). Owner = the Account owner, close date = notice deadline, type = Renewal. Upsert by external ID makes reruns safe.

**Edge cases and errors.**
- Owner email inactive (check against the HR/identity directory or bounce) → send to the legal team instead and flag the contract.
- Contracts without auto-renew still get reminders (to renegotiate) but with a different template.
- A failure for one contract is logged and does not stop the run; failed items are retried the next day automatically because their milestone is still not marked as sent.
- The **weekly digest** (Monday Scheduler) uses the same selection with a 30-day window and sends one table email to legal.
`,
  followUps: [
    { q: 'Could the CLM or Salesforce do this on their own?', a: 'Possibly — many CLMs have built-in alerts. Integration adds value when the Opportunity must be created in Salesforce and rules span both systems; check native features first.' },
    { q: 'What if a contract is renewed early?', a: 'Its end date changes in the CLM, so the deadline is recomputed and sent milestones should be reset for the new term (key the flags by contract ID + term end date).' },
  ],
}
