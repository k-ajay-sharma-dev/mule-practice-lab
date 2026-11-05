import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-013',
  category: 'use-cases',
  title: 'Incident Sync between ServiceNow and Jira',
  level: 'INTERMEDIATE',
  tags: ['servicenow', 'jira', 'bidirectional-sync', 'webhooks', 'id-mapping'],
  estMinutes: 25,
  diagram: {
    task: 'draw the two-way incident sync: the webhook endpoints for ServiceNow and Jira, the queues (including a P1 lane), the sync Process API with its mapping store, the System APIs, the DLQ and the nightly reconciliation.',
    checks: [
      { label: 'ServiceNow pushes changes to an endpoint you expose', rule: { type: 'edge', from: { type: ['saas', 'external-api'], label: ['servicenow', 'snow', 'itsm'] }, to: ['experience-api', 'system-api', 'process-api', 'api-gateway'] } },
      { label: 'Jira webhooks call an endpoint you expose', rule: { type: 'edge', from: { type: ['saas', 'external-api'], label: 'jira' }, to: ['experience-api', 'system-api', 'process-api', 'api-gateway'] } },
      { label: 'Webhook endpoints only enqueue; the work is asynchronous', rule: { type: 'edge', from: ['experience-api', 'system-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'P1 incidents get their own priority queue', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'A mapping store links incident ↔ Jira key', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['map', 'key', 'correlation', 'link'] } } },
      { label: 'ServiceNow and Jira are updated only through System APIs (integration user)', rule: { type: 'only-via', target: ['saas', 'external-api'], from: 'system-api' } },
      { label: 'Events that keep failing go to a DLQ', rule: { type: 'edge', to: 'dlq' } },
      { label: 'A reconciliation job catches missed webhooks', rule: { type: 'path', from: 'batch-job', to: ['saas', 'external-api'] } },
    ],
    reference: diagram(
      {
        sn: ['saas', 'ServiceNow'],
        jira: ['saas', 'Jira Cloud'],
        esn: ['experience-api', 'exp-servicenow-events-api'],
        ej: ['experience-api', 'exp-jira-webhooks-api'],
        qp: ['queue', 'incident-sync-p1-q'],
        q: ['queue', 'incident-sync-q'],
        dlq: ['dlq', 'incident-sync-dlq'],
        p: ['process-api', 'prc-incident-sync'],
        map: ['database', 'Incident ↔ Jira key mapping'],
        ssn: ['system-api', 'sys-servicenow-api'],
        sj: ['system-api', 'sys-jira-api'],
        recon: ['batch-job', 'Nightly reconciliation'],
      },
      [
        'sn -> esn', 'jira -> ej', 'esn ~> qp', 'esn ~> q', 'ej ~> q', 'qp ~> p', 'q ~> p', 'q ~> dlq', 'p -> map', 'p -> ssn',
        'p -> sj', 'ssn -> sn', 'sj -> jira', 'recon -> ssn', 'recon -> sj',
      ],
    ),
  },
  description: `
An insurance company's IT support uses **ServiceNow** (ITSM) for incidents. Development teams work in **Jira Cloud**. When an incident needs a code fix, support assigns it to a "Dev" assignment group and today they copy it into Jira by hand.

Requirements:
- When a ServiceNow incident is assigned to a Dev group, create a **Jira issue** in the matching project (group → project mapping, ~25 teams).
- Comments and **status** changes must flow both ways (status values differ: ServiceNow *New / In Progress / On Hold / Resolved*; Jira workflows differ per project).
- Attachments (screenshots, logs up to 20 MB) must be copied to Jira.
- Priority P1 incidents must appear in Jira within **1 minute**.
- ~400 incidents/month go to Dev; comment volume is low, but bursts happen during major incidents.
- Jira Cloud rate-limits API calls; ServiceNow is reachable only through its REST API with an integration user.

**Describe your solution:**
- How do you trigger the sync in each direction?
- How do you keep the link between the incident and the Jira issue?
- How do you map statuses and avoid ping-pong updates?
- How do you handle attachments and failures?
`,
  answerTemplate: `## Triggers

## Correlation

## Status mapping and loop prevention

## Attachments

## Failure handling
`,
  keyPoints: [
    'Event-driven both ways: ServiceNow outbound REST message/business rule (or flow) to a Mule endpoint; Jira webhooks for issue updated/comment created.',
    'Correlation stored in both systems (Jira issue key on the incident, incident number in a Jira field/label) plus a mapping store for fast lookups.',
    'Externalised mapping tables for group → project and status ↔ status per project, with only meaningful transitions synced.',
    'Loop prevention: changes made by the integration user are ignored and comments carry a marker like [from ServiceNow].',
    'Events queued (Anypoint MQ) with retries/backoff for 429s and a DLQ; a periodic reconciliation catches missed webhooks.',
  ],
  solution: `
**Triggers.**
- *ServiceNow → Jira:* a **business rule** on the incident table calls an **outbound REST message** to a Mule HTTPS endpoint. It fires on assignment group change to a Dev group, on comment and on state change. The endpoint is secured with basic auth/OAuth and IP allowlist. Payload: incident sys_id, number, changed fields.
- *Jira → ServiceNow:* **Jira webhooks** (issue updated, comment created) filtered with JQL to synced projects call another Mule endpoint (validate the webhook secret).
- Both endpoints only validate and **enqueue** (Anypoint MQ) then return 200 quickly. P1 messages go to a priority queue so they are never stuck behind a burst.

Mule calls ServiceNow through the **ServiceNow connector** / Table API and Jira through its REST API (a Jira connector or HTTP Requester with an API token/OAuth).

**Correlation.** On create, Mule stores the **Jira key** in a custom field on the incident (\`u_jira_key\`) and the **incident number** in a Jira custom field. A small mapping table (sys_id ↔ Jira key) gives quick lookups and survives field edits. Every later event resolves the counterpart through this mapping.

**Status mapping and loop prevention.**
- A configurable mapping per Jira project: e.g. Jira *In Progress* → SN *In Progress*; Jira *Done* → SN *Resolved* (with resolution notes from the last Jira comment); SN *On Hold* (awaiting user) → Jira label or comment only. Not every status needs a twin — agree which transitions matter.
- Jira status changes are applied via the **transitions** API (you cannot set status directly) — look up the transition ID valid from the current status.
- Loop prevention: Mule writes as an **integration user** in both systems; events whose author is the integration user are discarded. Comments are prefixed (\`[ServiceNow – J. Smith]\`) so people see their origin.

**Attachments.** On an attachment event, download it from ServiceNow's Attachment API as a stream and upload to Jira's attachments endpoint (multipart/form-data). Do this without loading 20 MB into memory more than needed (repeatable file-store stream). Skip if the same file name + size was already synced.

**Failure handling.** Consumers retry with exponential backoff on 429/5xx (respect Jira's \`Retry-After\`), then move to a **DLQ** with an alert. Events are processed **in order per incident** (e.g. single consumer per message group, or compare "updated" timestamps and ignore older events). A nightly reconciliation compares open linked items in both systems and fixes drift caused by missed webhooks.
`,
  followUps: [
    { q: 'A Jira project changes its workflow. What breaks?', a: 'Only the mapping for that project: transitions not found are logged as business errors and alerted, and the mapping table is updated without redeploying code.' },
    { q: 'Why not use a marketplace sync tool instead of Mule?', a: 'Off-the-shelf connectors (e.g. ServiceNow\'s own Jira spoke or marketplace apps) may be enough; Mule makes sense when the company already standardises integrations on Anypoint, needs custom rules or wants one monitoring place. Say you would evaluate first.' },
    { q: 'How do you secure the inbound webhook endpoints?', a: 'HTTPS only, authentication (shared secret/token or OAuth), IP allowlisting where the SaaS publishes ranges, and API Manager policies such as rate limiting.' },
  ],
}
