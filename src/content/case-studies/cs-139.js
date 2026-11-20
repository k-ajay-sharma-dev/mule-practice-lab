export default {
  id: 'cs-139',
  category: 'case-studies',
  title: 'Housing Association Routing Repair Requests From Phone, Web and App to 40 Contractors',
  level: 'INTERMEDIATE',
  tags: ['routing', 'partners', 'status-updates', 'webhooks', 'public-sector'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Repairs come in by phone, web form and app. Where should they meet?',
      options: [
        'One Repairs API, called by every channel, that creates the job',
        'Each channel sends jobs straight to the matching contractor',
        'Web and app requests go to a shared mailbox for the call centre',
        'Each channel keeps its own job list, merged in a nightly report',
      ],
      answer: 0,
      explain: 'One entry point gives one list of jobs, one set of rules and one place to track status, whatever the channel. A mailbox keeps the retyping, and separate lists give no single status.',
    },
    {
      type: 'single',
      prompt: 'How do you pick the contractor for a job?',
      options: [
        'A routing table on trade, area and urgency, kept by the repairs team',
        'Routing rules written in the Repairs API code and changed by IT',
        'Send every job to all 40 contractors and take the first to accept',
        'Let the call centre pick the contractor for each job by hand',
      ],
      answer: 0,
      explain: 'A table the business owns lets them change contracts without a release. Rules in code wait for IT, sending to everyone ignores the contracts, and picking by hand does not work for web and app requests.',
    },
    {
      type: 'multi',
      prompt: 'Contractors connect in different ways. Which three options should you offer?',
      options: [
        'An API for contractors with their own job system',
        'A simple contractor portal for small firms with no system',
        'A file exchange for a few large firms that send batches',
        'One shared login to the housing system for all small contractors',
      ],
      answer: [0, 1, 2],
      explain: 'Meet each contractor where they are, with their own access to their own jobs. A shared login shows every job to every firm and leaves no record of who did what.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A tenant reports a gas smell. What is different about this job?',
      options: [
        'Route it at once to the on-call contractor, and escalate if not accepted',
        'Route it like any other job, with a higher priority flag on it',
        'Send it to every plumbing contractor in the area at the same time',
        'Route it to the contractor and email the duty officer a copy',
      ],
      answer: 0,
      explain: 'Emergencies must be accepted within 30 minutes, so they need a fast path and a person watching. A missed acceptance must reach a human quickly, which a flag or an email copy does not make sure of.',
    },
    {
      type: 'match',
      prompt: 'Match each status to who sets it.',
      pairs: [
        ['Reported', 'The Repairs API, when the job is created'],
        ['Accepted', 'The contractor, through the API or portal'],
        ['Appointment booked', 'The contractor, with the date and time'],
        ['Completed', 'The contractor, with notes and photos'],
      ],
      explain: 'Contractors own the work status. The housing system and the tenant see it through the same API.',
    },
    {
      type: 'order',
      prompt: 'Order the rollout.',
      items: [
        'Build the Repairs API over the housing system',
        'Add the routing table for trade, area and urgency',
        'Connect the largest contractors by API',
        'Open the portal for small contractors',
        'Move the web form and app to the Repairs API and show status to tenants',
      ],
      explain: 'Core first, then routing, then contractors big to small, then tenants.',
    },
  ],
  description: `
**Context.** A housing association owns **25,000 homes**. Tenants report repairs by phone, a web form and a new app. Work is done by **40 contractors**.

**Facts gathered so far**
- The housing system holds homes, tenants and repair jobs. It has an API.
- Today web forms arrive as emails, and call centre staff key them in.
- Five large contractors have their own job systems with APIs. Most are small firms with no system.
- Contracts cover trades such as plumbing, electrics and roofing, by area.
- Emergencies such as gas smells or floods must be accepted by a contractor within 30 minutes.
- Tenants often call to ask "when is someone coming?"

**Opinions**
- Repairs manager: "We change contractors every year. I cannot wait for IT."
- Small contractors: "We cannot build anything."
- Tenants' panel: "Tell us when someone is coming."

**Your task.** Design how repair requests flow from tenants to contractors and back, including emergencies and status updates.
`,
  answerTemplate: `## Decision

## Repairs API

## Routing

## Connecting contractors

## Emergencies

## Status for tenants

## Rollout

## Risks
`,
  keyPoints: [
    'One Repairs API for every channel.',
    'A routing table on trade, area and urgency, owned by the business.',
    'API, portal or file for contractors, each with its own access.',
    'Emergencies have a fast path and escalate to a person.',
    'Contractors set the status, and tenants see it.',
    'Roll out core first, then contractors, then tenant channels.',
  ],
  solution: `
**Decision.** One Repairs API creates and tracks every job in the housing system. A routing step picks the contractor. Contractors connect by API, portal or file.

**Repairs API.** Phone staff, the web form and the app all call it. It checks the home and tenant, creates the job, and returns a reference.

**Routing.** A table of trade, area, urgency and contractor, kept by the repairs team. The job is sent to the matched contractor.

**Connecting contractors.** Large firms receive jobs through their API and send status back by webhook or API. Small firms use a portal to accept, book and close jobs. A few firms exchange files.

**Emergencies.** Routed at once to the on-call contractor. If not accepted within the time limit, the job goes to a duty officer and the next contractor.

**Status for tenants.** Every status change updates the job. The app and the call centre show the same status and appointment time.

**Risks.** Contractors who do not update status, wrong routing rules, and emergencies reported through slow channels.
`,
  followUps: [
    { q: 'Why not send jobs to contractors by email?', a: 'Email gives no status back and no proof of acceptance. That is the gap tenants complain about.' },
    { q: 'How do you secure 40 contractors?', a: 'Each one gets its own client ID or portal login, with access only to its own jobs.' },
    { q: 'What if a contractor’s API is down?', a: 'Queue the job and retry. For emergencies, escalate to a person instead of waiting.' },
    { q: 'What do you measure?', a: 'Time to accept, time to complete, emergencies escalated, and status updates per contractor.' },
  ],
}
