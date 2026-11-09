export default {
  id: 'cs-106',
  category: 'case-studies',
  title: 'Pharma Company Running a Validated Integration Platform Under GxP',
  level: 'EXPERT',
  tags: ['pharma', 'compliance', 'gxp', 'ci-cd', 'testing', 'munit', 'governance', 'runtime-fabric', 'environments', 'logging'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Quality assurance wants every Mule application validated with full scripted testing and a printed, signed test record, as for the old ESB. Integration teams say this will make each change take 3 months. What is the best response?',
      options: [
        'Accept full scripted testing for every application, because regulators expect it',
        'Classify each integration by its impact on product quality, patient safety and data integrity, and apply testing effort in proportion (risk-based, as in computer software assurance), with automated test evidence kept as records',
        'Skip validation for integrations, because only the end systems are GxP',
        'Validate the Anypoint Platform once and treat applications as configuration that needs no testing',
      ],
      answer: 1,
      explain: 'Risk-based assurance puts the most effort where a failure could harm patients or data integrity. Automated tests produce reliable evidence; integrations that move GxP data are in scope, but not all need the same depth.',
    },
    {
      type: 'match',
      prompt: 'Match each integration to the most sensible risk class.',
      pairs: [
        ['Batch release status from QMS to ERP, which allows shipping', 'High: direct impact on product quality'],
        ['Lab instrument results to LIMS used for release testing', 'High: GxP record, data integrity'],
        ['Training completion from the LMS to HR', 'Medium: GxP supporting record'],
        ['Canteen menu feed to the intranet', 'Not GxP: standard IT controls only'],
      ],
      explain: 'Risk follows the decision the data supports. Release and test results are high; training records support GxP compliance but are less direct; a canteen feed needs no validation.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which controls in the delivery pipeline help produce acceptable validation evidence? (choose all that apply)',
      options: [
        'MUnit and integration tests linked to requirement ids, with results stored as immutable records per build',
        'Approval in the pipeline by a named QA reviewer before deployment to the validated production environment',
        'Only artefacts built once by the pipeline and promoted unchanged from test to production',
        'Developers deploying hot fixes from Anypoint Studio to production when the pipeline is slow',
        'A traceability report linking requirements, risks, tests and releases',
      ],
      answer: [0, 1, 2, 4],
      explain: 'Traceable tests, controlled approval, build-once promotion and a traceability report are the evidence auditors look for. Manual deployments from a developer\'s machine break the chain of control.',
    },
    {
      type: 'single',
      prompt: 'The platform team wants to upgrade the Mule runtime from 4.6 to 4.9 across 140 applications, of which 30 are high risk. What is the best validation approach?',
      options: [
        'Revalidate all 140 applications fully',
        'Assess the change: review release notes for impact, run the automated regression suites of every application on the new runtime, add targeted tests for changed areas, and record a risk-based assessment with QA approval',
        'Upgrade without testing because it is a minor version',
        'Keep high-risk applications on 4.6 indefinitely',
      ],
      answer: 1,
      explain: 'A platform change is assessed for impact and verified with the automated regression suites that already exist. Staying on an unsupported runtime is itself a compliance and security risk.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which runtime practices support data integrity (complete, consistent, accurate and attributable data) for GxP integrations? (choose all that apply)',
      options: [
        'Correlation ids and an audit log of every message received and delivered, with outcome',
        'Reconciliation counts between source and target for each batch or day',
        'Reprocessing failed messages by editing the payload in production without a record',
        'Restricted, logged access to production queues and dead-letter queues',
        'Synchronised clocks and UTC timestamps on every record',
      ],
      answer: [0, 1, 3, 4],
      explain: 'Audit logs, reconciliation, controlled access and reliable timestamps make data attributable and complete. Changing payloads without a record breaks data integrity.',
    },
    {
      type: 'order',
      prompt: 'Put the life cycle of a new high-risk integration in order.',
      items: [
        'User requirements and risk assessment agreed with the business owner and QA',
        'Design and specification, including error handling and audit',
        'Build with automated tests linked to requirements',
        'Verification in a qualified test environment, with evidence recorded',
        'QA approval and release to production',
        'Periodic review and controlled change during operation',
      ],
      explain: 'Requirements and risk come first and set the testing depth. After release, the integration stays in a validated state through periodic review and change control.',
    },
  ],
  description: `
**Context.** A global pharmaceutical manufacturer runs about 140 Mule applications on Runtime Fabric across development, test, validation and production environments. About 30 of them carry data used in GxP decisions:
- batch release status from the quality management system (QMS) to SAP
- lab instrument results into the LIMS
- deviations and CAPAs between QMS and manufacturing
- temperature data from warehouses

The company also integrates many non-GxP systems on the same platform.

**The problem today.** The old ESB was validated with paper test scripts signed by hand. Each change to a GxP interface took 10 to 14 weeks, mostly waiting for document reviews. Business teams now bypass the integration team with spreadsheets and manual uploads, which is a bigger data integrity risk than the interfaces were. A recent regulatory inspection observed missing audit trails for reprocessed messages.

**Goals**
- Changes to high-risk integrations released in 3 weeks or less, with evidence that satisfies QA and inspectors.
- Non-GxP integrations follow normal IT controls on the same platform.
- Reprocessing and manual intervention always leave a record.
- Platform upgrades no longer freeze for months.

**Constraints**
| Item | Detail |
|---|---|
| Regulation | EU GMP Annex 11 and US 21 CFR Part 11 for electronic records; the company follows GAMP 5 and a risk-based assurance approach |
| QA | QA must approve releases of GxP systems; QA staff are few and not technical |
| Platform | Runtime Fabric on company Kubernetes; CI/CD with a pipeline tool; Anypoint Monitoring |
| Teams | Four integration teams, one platform team, one CSV/CSA lead in QA |

**Your task.** Answer the questions about risk classification, evidence, platform changes and operational controls.
`,
  answerTemplate: `## Risk classification of integrations

## Evidence from the pipeline

## Environments and promotion

## Platform and runtime changes

## Operational data integrity controls

## Working with QA
`,
  keyPoints: [
    'Classify integrations by their impact on product quality, patient safety and data integrity, and set testing depth by class.',
    'Automated tests linked to requirements, build-once promotion and pipeline approvals produce the evidence; records are stored immutably per release.',
    'The platform itself is qualified once (infrastructure, Runtime Fabric, pipeline) and kept in a controlled state; applications are validated on top of it.',
    'Runtime upgrades are assessed and verified with existing regression suites, not by revalidating everything from scratch.',
    'Every message is attributable (correlation id, audit log), reconciled, and reprocessed only through controlled, logged tools.',
    'QA approves risk assessments and releases in the pipeline; traceability reports replace manual document review.',
  ],
  solution: `
**Classification.** Each integration gets a risk class when it is designed: high (direct impact on release, patient safety or a GxP record), medium (supports GxP compliance), or not GxP. The class sets the required tests, reviews and approvals.

**Platform qualification.** Runtime Fabric, the Kubernetes cluster, the pipeline, Anypoint Monitoring and log storage are qualified once and changed under change control. The validated environments (validation, production) only accept artefacts from the pipeline.

**Evidence from the pipeline.**
- Requirements and risks have ids; MUnit and integration tests reference them.
- Each build stores its test results, coverage and the exact artefact hash as an immutable record.
- Deploying to the validated environments needs a named QA approval in the pipeline (electronic signature).
- A traceability report (requirement, risk, test, result, release) is generated for every release.

**Platform upgrades.** For a runtime upgrade the platform team assesses release notes, runs every application's regression suite on the new version in the validation environment, adds tests for changed areas, and records the assessment for QA approval. Applications move in batches.

**Operational controls.**
- Correlation id on every message; an audit log of receipt, transformation outcome and delivery.
- Daily reconciliation of counts for high-risk interfaces.
- Reprocessing only through a tool that logs who, when, why and the original payload hash.
- Access to production queues and DLQs restricted and logged.
- Clocks synchronised; timestamps in UTC.

**Working with QA.** Train QA on reading pipeline evidence. Agree templates once, then reuse them. Periodic reviews per integration (yearly for high risk) check incidents, changes and access.
`,
  followUps: [
    { q: 'Why is risk-based assurance better than full scripted testing for every change?', a: 'Effort goes where failure would harm patients or data. Low-risk changes move faster, and the team can test high-risk ones more deeply.' },
    { q: 'What makes automated test results acceptable as GxP evidence?', a: 'They are linked to requirements, produced by a controlled pipeline, tied to the exact artefact and stored so they cannot be changed. A named reviewer approves the release.' },
    { q: 'How do you reprocess a failed GxP message without breaking data integrity?', a: 'Use a controlled tool that records who reprocessed it, when, why and what was sent. Never edit the payload in place without a record.' },
    { q: 'What is the difference between qualifying the platform and validating an application?', a: 'Qualification shows the infrastructure and tools are installed and working as specified. Validation shows a specific application meets its intended use.' },
  ],
}
