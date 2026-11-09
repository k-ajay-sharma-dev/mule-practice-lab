export default {
  id: 'cs-076',
  category: 'case-studies',
  title: 'Automaker Separating Its Integrations During the Carve-Out of Its Parts Business',
  level: 'EXPERT',
  tags: ['automotive', 'm-and-a', 'migration', 'governance', 'sap', 'api-management', 'b2b', 'risk'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What should be the first piece of integration work after the deal is signed?',
      options: [
        'Start building the new company\'s SAP system',
        'Build a complete inventory of every interface the parts business uses, with owner, data, direction, volume and which company owns each end after the split',
        'Copy the whole Anypoint organisation to the new company',
        'Move all dealer APIs to new hostnames so dealers can test early',
      ],
      answer: 1,
      explain: 'Every later decision (clone, rebuild, keep under the transition service agreement, retire) depends on knowing each interface and who will own each end. Building or copying before that wastes effort and misses hidden dependencies.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each interface to the best treatment at Day 1.',
      pairs: [
        ['Dealer parts ordering API used by 3,000 dealers', 'Keep the same contract and hostname; switch the back end behind it'],
        ['Shared material master feed that both companies still need for 18 months', 'Run under the transition service agreement with a filtered copy for the new company'],
        ['Nightly HR feed for parts employees to the car maker\'s payroll', 'Rebuild in the new company before Day 1, as payroll cannot be shared'],
        ['Old interface to a warehouse closed last year', 'Retire'],
      ],
      explain: 'Dealer contracts should not change at all; a shared master feed can run for a time under the transition service agreement with filtering; legal and people data must be separated by Day 1; and dead interfaces are retired, not copied.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'During the transition service period the car maker still runs some integrations for the new company. Which three controls are needed?',
      options: [
        'Filter shared feeds so each company receives only its own data',
        'Separate API Manager client IDs and contracts for the new company, so its access can be removed at the exit date',
        'Monthly service reports per transition service, with volumes and incidents',
        'Give the new company admin rights on the car maker\'s Anypoint organisation to make support easier',
        'Share one set of System API credentials between both companies to save time',
      ],
      answer: [0, 1, 2],
      explain: 'Data must be filtered, access must be separable and revocable, and services must be measured because they are charged and time limited. Admin rights and shared credentials break both security and a clean exit.',
    },
    {
      type: 'order',
      prompt: 'Order the phases for separating the integrations.',
      items: [
        'Inventory interfaces and classify each one: keep, clone, rebuild, run under the transition agreement or retire',
        'Set up the new company\'s Anypoint organisation, network and identity provider',
        'Build and test the Day 1 interfaces, including dealer contracts behind unchanged hostnames',
        'Cut over on Day 1 with rehearsed runbooks and a rollback plan',
        'Run the transition services with filtering and service reports',
        'Move each transition service to the new company and remove access at the exit date',
      ],
      explain: 'Classification drives scope; the platform must exist before interfaces are built; Day 1 is rehearsed; and transition services end one by one with access removed.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Dealers order cars and parts from the same dealer portal today. After the split, how should the portal reach parts ordering?',
      options: [
        'Dealers sign in to two portals from Day 1',
        'The car maker\'s portal keeps calling the same parts Experience API contract, which is moved to the new company and secured with a client ID for the car maker',
        'The car maker copies the parts ordering code into its own portal',
        'The new company calls the car maker\'s SAP directly for each dealer order',
      ],
      answer: 1,
      explain: 'Keeping the contract stable avoids changing 3,000 dealers on Day 1. The API moves owner and is secured like any partner API, and neither company reaches into the other company\'s systems.',
    },
    {
      type: 'single',
      prompt: 'Which risk is most often underestimated in an integration carve-out?',
      options: [
        'Mule runtime licence costs',
        'Hidden point-to-point interfaces and shared credentials that nobody listed, found only when something breaks after Day 1',
        'The time needed to write RAML specifications',
        'CloudHub region availability',
      ],
      answer: 1,
      explain: 'Undocumented interfaces, shared service accounts and file drops are the usual Day 1 surprises. Network traffic analysis, credential reviews and business process walk-throughs reduce them.',
    },
  ],
  description: `
**Context.** A car maker is selling its aftermarket parts business (2,200 staff, 4 parts DCs, sales of 3 billion a year) to an investment firm. The deal closes in 9 months (Day 1). The new parts company will build its own IT, but cannot do everything by Day 1, so the car maker will provide some services for up to 18 months under a transition service agreement (TSA).

**Integration landscape involving parts**
| Item | Detail |
|---|---|
| Interfaces | About 180 touch parts: 70 on Anypoint Platform, 60 on an old webMethods server, about 50 file transfers and database links nobody owns |
| Shared systems | One SAP S/4HANA (parts is a company code), one Salesforce org, one Anypoint organisation, one identity provider |
| Dealers | 3,000 dealers order cars and parts through one dealer portal and through dealer DMS systems calling a parts ordering API |
| Partners | 900 parts suppliers on EDI; 4 parts DCs on a WMS shared with car logistics |

**Requirements**
- On Day 1, dealers must keep ordering parts with no change on their side.
- People data and finance must be separate on Day 1 (legal entity).
- Each company must see only its own data from Day 1, even in shared feeds.
- Every TSA service has a price and an end date; the investment firm wants the TSA as short as possible.

**Constraints**
- The integration team is 18 people and also runs the car maker's other projects.
- The car maker's security team will not let the new company keep any access after the TSA ends.

**Your task.** Answer the questions on how to separate the integrations.
`,
  answerTemplate: `## Inventory and classification

## Day 1 scope

## Running transition services safely

## Dealers and partners: keeping contracts stable

## Exit from the transition services

## Risks
`,
  keyPoints: [
    'Start with a full interface inventory, including file drops, database links and shared credentials, and classify each interface by Day 1 treatment and future owner.',
    'Keep dealer and partner contracts stable; switch what is behind them and move ownership of the APIs.',
    'Separate people, finance and legal data flows by Day 1; run the rest under the TSA with filtering by company.',
    'Give the new company its own Anypoint organisation, identity provider and client IDs, so TSA access is separable and revocable.',
    'Plan the exit per service with dates, service reports and access removal; track hidden interfaces as the main risk.',
  ],
  solution: `
**Inventory.** Combine the Anypoint and webMethods catalogues with network flow logs, SAP RFC and IDoc partner lists, SFTP accounts and database link reviews. Give each interface an owner after the split and a Day 1 treatment:
- **Keep and move:** dealer parts API, supplier EDI for parts.
- **Clone:** standard System APIs the new company needs on its own platform.
- **Rebuild:** payroll, finance and legal reporting.
- **TSA:** shared SAP feeds, WMS shared with car logistics.
- **Retire:** dead interfaces.

**Day 1.**
- A new Anypoint organisation, network and identity provider for the parts company.
- Dealer-facing parts APIs keep their hostnames and contracts. DNS and certificates move with a rehearsed cut-over.
- People and finance interfaces are rebuilt for the new company's payroll and ERP.
- Shared feeds are filtered by company code before they leave the car maker.

**TSA.** Each service has an ID, an owner on both sides, a monthly report (volumes, incidents, SLA) and an end date. The new company calls TSA services with its own client IDs, so access ends by revoking them.

**Exit.** The new company builds its own SAP and WMS integrations during the TSA. Each TSA service moves when its replacement passes parallel runs. Credentials are revoked and feeds turned off one by one.

**Risks.**
- Hidden interfaces (discovery from network data).
- The team's capacity (a separate carve-out squad, partner support).
- Dealer disruption (contract tests, early dealer pilots).
`,
  followUps: [
    { q: 'Why keep the dealer parts API hostname the same after the split?', a: 'Dealers would otherwise need to change 3,000 systems on Day 1. Moving the hostname and certificate with the API keeps them unaffected.' },
    { q: 'How do you find interfaces nobody documented?', a: 'Analyse network flows, SFTP accounts, database links and SAP partner profiles. Then walk through business processes with the parts teams to confirm each flow.' },
    { q: 'How do you make sure the new company loses access when the TSA ends?', a: 'Give it separate client IDs, accounts and certificates from the start. Revoke them per service at its end date and confirm traffic stops.' },
    { q: 'What do you rebuild before Day 1 rather than run under the TSA?', a: 'Payroll, finance and legal reporting, because they belong to a separate legal entity. Shared operational feeds can wait under the TSA with filtering.' },
  ],
}
