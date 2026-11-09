export default {
  id: 'cs-088',
  category: 'case-studies',
  title: 'Insurance Group Preparing Its Integration Platform for DORA',
  level: 'ADVANCED',
  tags: ['insurance', 'dora', 'resilience', 'compliance', 'third-party-risk', 'observability', 'governance'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The supervisor asks which integration components support the claims payment function. What should the group have ready?',
      options: [
        'The Anypoint Runtime Manager list of deployed applications',
        'A mapping from each critical or important business function to the APIs, Mule apps, queues and third-party services it depends on, kept current',
        'The MuleSoft subscription contract',
        'A diagram of the CloudHub 2.0 private space network',
      ],
      answer: 1,
      explain: 'DORA asks firms to identify the ICT assets that support critical or important functions and how they depend on each other. A list of apps or a network diagram alone does not show which business function breaks when a component fails.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Anypoint Platform (control plane, CloudHub 2.0 and Anypoint MQ) is a third-party ICT service supporting critical functions. Which three things does the group need for it?',
      options: [
        'An entry in the register of information for ICT third-party arrangements',
        'Contract terms covering service levels, incident notification, audit and access rights, and exit support',
        'A tested exit strategy, including how APIs, DataWeave and configuration would move to another runtime',
        'A promise from MuleSoft that the platform will never have an outage',
        'Moving every Mule app on premises so no third party is involved',
      ],
      answer: [0, 1, 2],
      explain: 'DORA requires a register of ICT third-party arrangements, specific contract terms for services supporting critical or important functions, and exit strategies. No provider can promise zero outages, and moving on premises is a design choice, not a requirement.',
    },
    {
      type: 'single',
      prompt: 'The Anypoint control plane is unavailable for 2 hours. What happens to the Mule applications already running on CloudHub 2.0?',
      options: [
        'They stop processing until the control plane returns',
        'They keep running and processing traffic, but deployments, scaling changes and configuration updates are not possible',
        'They restart in a degraded mode without policies',
        'They switch automatically to another region',
      ],
      answer: 1,
      explain: 'The runtime plane is separate from the control plane. Running apps keep processing; what is lost is management: deploying, changing settings, and parts of monitoring. The resilience plan should say how to run without changes for a few hours.',
    },
    {
      type: 'match',
      prompt: 'Match each DORA expectation to the evidence the integration team can provide.',
      pairs: [
        ['ICT incident management and classification', 'Runbooks with severity rules, alert routing and post-incident reviews'],
        ['Digital operational resilience testing', 'Scheduled failover and chaos tests with written results and fixes'],
        ['Business continuity for critical functions', 'Recovery time targets per integration and a tested failover to the second region'],
        ['Third-party risk management', 'Register of ICT providers with criticality, contracts and exit plans'],
      ],
      explain: 'Each pillar needs evidence that a process exists and is used. For an integration platform this is mostly runbooks, test results, recovery targets and the third-party register.',
    },
    {
      type: 'order',
      prompt: 'A major outage of the policy API hits customers. Order the incident steps the group should follow under DORA.',
      items: [
        'Detect the outage through monitoring and open an incident',
        'Classify it against the major ICT incident criteria (clients affected, duration, critical services)',
        'Send the initial notification to the supervisor within the required time',
        'Restore service and send the intermediate report with updates',
        'Send the final report with root cause and remediation, and track the fixes',
      ],
      explain: 'Classification decides whether reporting applies. Initial, intermediate and final reports follow set deadlines, and the final report closes with root cause and actions.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which change most improves the group\'s answer to "how quickly can claims payments recover if one cloud region fails?"',
      options: [
        'Add more vCores to the claims payment apps in the same region',
        'Deploy the claims payment flow to a second region with its own queues, test the failover twice a year and record the recovery time',
        'Write a policy document saying the recovery time is 4 hours',
        'Turn on debug logging for all claims apps',
      ],
      answer: 1,
      explain: 'Supervisors expect tested recovery, not stated targets. A second region with its own messaging, plus regular recorded failover tests, produces evidence of the real recovery time.',
    },
  ],
  description: `
**Context.** An insurance group with entities in four EU countries runs its integrations on Anypoint Platform: 140 Mule applications on CloudHub 2.0 in one EU region, Anypoint MQ for claims and payments, and API Manager for 60 partner APIs. The EU Digital Operational Resilience Act (DORA) has applied since January 2025 and the group's first supervisory review of ICT risk is in six months.

**What the review found so far**
- No list links business functions (claims payment, policy issue, broker quotes) to the Mule apps, queues and SaaS systems they depend on.
- Anypoint Platform, the claims SaaS and the payment provider are not in the ICT third-party register.
- Incidents are handled in Slack; there is no severity rule and no record of which incidents affected customers.
- A single CloudHub 2.0 region hosts everything; failover has never been tested.
- The MuleSoft contract has no exit clause, and nobody has thought about how to leave the platform.

**Your task.** Answer the questions on what the integration team must put in place to meet DORA expectations for its platform.
`,
  answerTemplate: `## Mapping business functions to integration assets

## Third-party register, contracts and exit

## Incident management and reporting

## Resilience testing and recovery

## Plan for the next six months
`,
  keyPoints: [
    'Map each critical or important business function to its APIs, Mule apps, queues and third-party services, and keep that map current.',
    'Put Anypoint Platform and other SaaS providers in the register of ICT third-party arrangements, with contract terms, criticality and exit strategies.',
    'Know what fails when the control plane is down versus the runtime plane, and plan to run without changes for a few hours.',
    'Run incidents with a classification rule tied to DORA major incident criteria and the reporting timeline.',
    'Test recovery for real (second region, failover drills) and keep the results as evidence.',
  ],
  solution: `
**Months 1 to 2.** Build the function to asset map from Runtime Manager, API Manager and Exchange data plus owner interviews. Add Anypoint Platform, the claims SaaS and the payment provider to the third-party register with criticality.

**Months 2 to 4.** Incident process with severity rules, classification against DORA criteria and a reporting playbook. Review the MuleSoft contract for SLAs, incident notification, audit rights and exit support. Write an exit plan: API specs and DataWeave in Git, CI/CD that can target Runtime Fabric or another Mule runtime, documented MQ alternatives.

**Months 4 to 6.** Deploy claims payment and policy issue to a second EU region with its own queues; run a failover test and record recovery time; schedule tests twice a year.

**Evidence for the supervisor.** The map, the register, the incident records and the test reports.
`,
  followUps: [
    { q: 'Does DORA force you to leave a cloud integration platform?', a: 'No. It requires managing the risk: register, contract terms, monitoring, concentration analysis and a tested exit plan for critical services.' },
    { q: 'What would an exit plan for Anypoint Platform contain?', a: 'Where the assets live (specs, DataWeave, config in Git), which runtime could take them, the order of moving critical flows, the time needed, and who pays.' },
    { q: 'Why is a second region not enough on its own?', a: 'Without a regular test you do not know the real recovery time. Queues, secrets, DNS and partner allow lists often break during the first failover.' },
  ],
}
