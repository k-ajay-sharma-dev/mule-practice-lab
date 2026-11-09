import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-104',
  category: 'use-cases',
  title: 'Month-End Close Orchestration across Six ERPs',
  level: 'EXPERT',
  tags: ['orchestration', 'event-driven', 'sap', 'oracle-ebs', 'netsuite', 'consolidation', 'audit', 'governance', 'finance'],
  estMinutes: 50,
  diagram: {
    task: 'draw the close platform: the controllers\' cockpit and its Experience API, the close orchestrator with its step state, the event topic that starts work per entity, the GL worker and one System API per ERP, the consolidation tool, the FX rate source, the evidence store and the dead-letter queue.',
    checks: [
      { label: 'Controllers drive the close through an Experience API', rule: { type: 'path', from: 'internal-app', via: 'experience-api', to: 'process-api' } },
      { label: 'All ERPs are reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'At least three ERPs, each with exactly one System API', rule: { type: 'each', of: 'erp', edgeFrom: 'system-api', count: 1, max: 1, min: 3 } },
      { label: 'The consolidation tool is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Close steps and their state are kept in a database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'ERP work is started by events, so one entity can rerun alone', rule: { type: 'path', from: 'process-api', via: ['topic', 'queue', 'event-stream'], to: 'erp' } },
      { label: 'The orchestrator and the workers do not call each other directly', rule: { type: 'no-edge', from: 'process-api', to: 'process-api' } },
      { label: 'The cockpit never waits on an ERP in one synchronous chain', rule: { type: 'no-path', from: 'internal-app', to: 'erp', kind: 'sync' } },
      { label: 'Month-end FX rates come through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Close evidence is kept in a write-once store', rule: { type: 'edge', from: 'process-api', to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'Events that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['topic', 'queue', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        cal: ['internal-app', 'Close cockpit (controllers)'],
        exp: ['experience-api', 'exp-close-cockpit-api'],
        orch: ['process-api', 'prc-close-orchestrator'],
        state: ['database', 'Close calendar and step state'],
        topic: ['topic', 'close-events (Anypoint MQ exchange)'],
        dlq: ['dlq', 'close-events-dlq'],
        gl: ['process-api', 'prc-erp-gl-worker'],
        s1: ['system-api', 'sys-sap-gl-api'],
        erp1: ['erp', 'SAP S/4HANA (EU, APAC)'],
        s2: ['system-api', 'sys-oracle-ebs-gl-api'],
        erp2: ['erp', 'Oracle EBS (US)'],
        s3: ['system-api', 'sys-netsuite-gl-api'],
        erp3: ['erp', 'NetSuite (acquired entities)'],
        scons: ['system-api', 'sys-consolidation-api'],
        cons: ['saas', 'Consolidation tool (OneStream)'],
        sfx: ['system-api', 'sys-fx-rates-api'],
        fx: ['external-api', 'Month-end FX rate provider'],
        ev: ['file-store', 'SOX evidence store (write once)'],
      },
      [
        'cal -> exp', 'exp -> orch', 'orch -> state', 'orch ~> topic', 'topic ~> gl', 'topic ~> orch', 'topic ~> dlq',
        'gl -> s1', 'gl -> s2', 'gl -> s3', 's1 -> erp1', 's2 -> erp2', 's3 -> erp3', 'gl ~> topic',
        'orch -> scons', 'scons -> cons', 'orch -> sfx', 'sfx -> fx', 'orch -> ev',
      ],
    ),
  },
  description: `
A global industrial group with **22 legal entities** runs **six ERP instances**: two SAP S/4HANA (EU and APAC), one Oracle EBS 12.2 (US), two NetSuite accounts (acquired companies) and one Dynamics 365 Finance (Brazil). Consolidation runs in a SaaS tool (OneStream). The close takes **9 working days**; the CFO wants **4**.

Today controllers email spreadsheets: "AP is closed in Brazil", "trial balance uploaded", "FX rates loaded". Steps are missed, trial balances are loaded twice, and auditors spend a week rebuilding evidence.

The close calendar has about **140 steps per month** with dependencies, for example:
- subledger cut-off per entity (AP, AR, inventory) → period close in the ERP;
- month-end FX rates from the rate provider → loaded into every ERP and into consolidation;
- trial balance extract per entity → mapped to the group chart → loaded into consolidation;
- intercompany matching → top-side adjustment journals posted back into the ERPs;
- final consolidated results → finance data warehouse.

Facts:
- A trial balance for a large SAP entity is about **250,000 lines**; the extract takes 10 to 20 minutes.
- When an entity posts a late journal, only **that entity's** trial balance must be extracted and loaded again, not all 22.
- ERPs have maintenance windows on different weekends.
- **SOX**: for every automated step, keep who started it, when, the input and output files and their totals.

**Questions:**
1. How do you model the close calendar and its dependencies?
2. How do the controllers start, watch and rerun steps?
3. How do you talk to six different ERPs?
4. How do you make reruns safe and keep the evidence auditors need?
`,
  answerTemplate: `## Close calendar and orchestration

## Cockpit for controllers

## ERP adapters

## Reruns and evidence
`,
  keyPoints: [
    'The close calendar is data: steps, dependencies and entity scope in a state database; one orchestrator Process API moves each step through its states.',
    'Controllers use a cockpit through an Experience API; start and rerun calls return at once and progress comes from step state, not from waiting on an ERP.',
    'ERP work is requested by events per entity and step, handled by GL workers that call one System API per ERP type, so a single entity can rerun alone.',
    'Every step is idempotent by entity, period and step version (a rerun replaces the earlier load in consolidation), and failed events go to a DLQ.',
    'Inputs, outputs, totals and the actor of each step are written to a write-once evidence store for SOX.',
  ],
  solution: `
\`\`\`
Close cockpit --> exp-close-cockpit-api --> prc-close-orchestrator --> step state DB
                                                |     |--> sys-consolidation-api --> OneStream
                                                |     |--> sys-fx-rates-api --> rate provider
                                                |     \\--> SOX evidence store
                                                \\~~> (close-events) ~~> prc-erp-gl-worker --> sys-sap-gl-api / sys-oracle-ebs-gl-api / sys-netsuite-gl-api ...
                                                          ^~~~~~~~~~~~ step-done events ~~~~~~~~~~~~/
\`\`\`

**Calendar as data.** Each month the orchestrator creates the step instances for each entity from a template: step type, dependencies, owner, due day. The state database holds every instance with its status (WAITING, READY, RUNNING, DONE, FAILED) and the version of its output. When a step finishes, the orchestrator marks the dependent steps READY. Automated READY steps start at once; manual steps wait for a controller to confirm them in the cockpit.

**Cockpit.** **exp-close-cockpit-api** gives controllers the calendar, status per entity, and actions: confirm a manual step, start, rerun. A start or rerun call records the request and returns 202. The cockpit shows progress from step state; it never holds a call open while an ERP works for 20 minutes.

**ERP work.** For an automated ERP step the orchestrator publishes an event such as \`extract-tb {entity: BR01, period: 2026-10, version: 3}\` to the \`close-events\` exchange. **prc-erp-gl-worker** consumes it and calls the System API for that entity's ERP type: **sys-sap-gl-api**, **sys-oracle-ebs-gl-api**, **sys-netsuite-gl-api** (one per ERP type, configured per instance). Large trial balances are streamed to a file, mapped to the group chart of accounts and handed to **sys-consolidation-api**. The worker publishes \`step-done\` or \`step-failed\` with totals; the orchestrator consumes it and updates the state.

**FX and top-side journals.** The orchestrator loads month-end rates once through **sys-fx-rates-api**, then raises one event per ERP to load them. Top-side journals from intercompany matching go out the same way, so each ERP's maintenance window only delays its own events.

**Reruns.** Each load to consolidation carries entity, period and version, and replaces the previous version for that entity. A late journal in Brazil means one rerun of \`extract-tb\` for BR01; the other 21 entities are untouched. Events that fail after retries go to the DLQ and the step shows FAILED with the reason.

**Evidence.** For every step the orchestrator writes the request, the actor, the input and output files and their control totals to a **write-once** store with a 7-year retention, and links them from the step state. Auditors get the evidence pack per entity from the cockpit.
`,
  followUps: [
    { q: 'Why not run the whole close as one long Mule flow?', a: 'A close lasts days and waits on people. State in a database survives restarts and deployments, while a flow holding that state would not.' },
    { q: 'How do you add the Dynamics 365 instance later?', a: 'Write a System API for Dynamics and register the entities with that ERP type. The orchestrator, worker and calendar stay the same.' },
    { q: 'How do you stop two reruns of the same entity from overlapping?', a: 'The orchestrator only allows one RUNNING instance per entity and step. A second request waits or is refused, and versions show which load is current.' },
    { q: 'What goes into the SOX evidence for an automated step?', a: 'Who started it and when, the parameters, the input and output files, control totals and the result. Everything is stored write-once and linked to the step.' },
  ],
}
