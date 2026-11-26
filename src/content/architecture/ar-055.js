export default {
  id: 'ar-055',
  category: 'architecture',
  title: 'Designing for Reuse: Exchange, Fragments, Templates and the C4E',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'reuse', 'c4e', 'exchange', 'api-fragments'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'Where do you get "number of consumers per API" from in Anypoint Platform?',
      options: [
        'Exchange page views, ratings and downloads for each asset version',
        'API Manager contracts and traffic by client id in analytics',
        'The count of project specs in Exchange that list the API as a dependency',
        'Anypoint Monitoring request counts for each app, across all callers',
      ],
      answer: 1,
      explain: 'Client applications and contracts in API Manager, plus traffic by client id in API analytics or Anypoint Monitoring, identify each consuming application. That is also why client-id enforcement makes reuse measurable. Page views show interest, not use. Spec dependencies show design reuse of fragments, not apps that call the API. A request count per app shows volume, but not how many different clients send it.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The report shows every Experience API has exactly one consumer. How do you read that?',
      options: [
        'A failure of the programme that needs fixing',
        'Expected: each Experience API is built for one consumer',
        'A sign that the Experience APIs should be merged into one',
        'Proof that the Process layer is not needed',
      ],
      answer: 1,
      explain: 'Experience APIs are consumer-specific by design; reuse is expected mainly from System and core Process APIs. Reporting low Experience reuse as a failure is a misunderstanding of the layers.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Most System APIs also show only one consumer each. What does that suggest?',
      options: [
        'Nothing; one consumer per System API is normal',
        'They are too narrow, or consumers bypass them',
        'System APIs are rarely reused, by design',
        'Client-id enforcement is counting consumers wrongly',
      ],
      answer: 1,
      explain: 'System APIs should show the highest reuse; low numbers point to design or discoverability problems, such as APIs that are hard to find or miss fields.',
    },
    {
      type: 'single',
      prompt: 'In an API-led programme, every project writes its own error format and pagination. What should the Center for Enablement (C4E) publish to Exchange to fix this?',
      options: [
        'A reference API spec with the error format, which teams copy into new specs',
        'A monthly report of consumers per API and per layer',
        'A guide page that describes the standard error body and paging parameters',
        'API fragments with a shared error type and a pageable trait',
      ],
      answer: 3,
      explain: 'Shared fragments give all APIs the same error and paging contracts, because each spec references one versioned definition. A copied reference spec drifts as each team edits its copy. A guide page describes the standard, but each team still writes its own types. A consumer report measures reuse and changes nothing in the specs. The same aim is served by project templates with a global error handler, logging and a CI pipeline, by common modules such as a logging and error library or DataWeave function modules, and by governance rulesets for naming and required error responses. A C4E that builds everything recreates the old ESB bottleneck.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A team built a duplicate Customer System API anyway. What do you do first?',
      options: [
        'Merge the two into one API that serves both groups of consumers',
        'Find out why it was built, fix that, then retire the duplicate',
        'Deprecate the duplicate in Exchange, and let its consumers move over time',
        'Add a governance rule that fails any new spec named like an existing one',
      ],
      answer: 1,
      explain: 'Duplicates are a symptom: the team could not find the API, it missed a field, or the owner was slow. Fix that root cause, migrate consumers, then retire the duplicate. Improving discoverability or owner responsiveness prevents the next one. Merging or deprecating first acts before you know what the original lacked, so the gap stays. A naming rule catches copies with similar names, not the reason teams build them.',
    },
    {
      type: 'single',
      prompt: 'How does the C4E avoid becoming the old ESB bottleneck?',
      options: [
        'By adding architects to the C4E as the demand for its reviews grows',
        'By publishing self-service standards and coaching, while teams build',
        'By owning the shared System APIs, while domain teams build the rest',
        'By building the first API in each domain, then handing it over',
      ],
      answer: 1,
      explain: 'The C4E enables: self-service standards and templates, time-boxed design reviews, Exchange curation and coaching, while LOB teams build and deploy their own APIs. Consumption, not creation, is the KPI. More architects only widen the queue that every team still waits in. Owning the shared System APIs puts the most reused work behind one team again. Building the first API in each domain makes the C4E a delivery team on every new domain\'s critical path.',
    },
  ],
  description: `
Eighteen months into an API-led programme, the CIO asks: *"We were promised reuse. Are we getting it?"* Nobody can answer with numbers. Developers say they often build a new System API because they "couldn't find" an existing one, and every project writes its own error format and pagination.

**Questions:**
1. Which reuse **metrics** would you report, per layer, and where does the data come from in Anypoint Platform?
2. What realistic reuse level do you expect for System vs Process vs Experience APIs?
3. Which **reusable assets** besides APIs should the C4E publish to Exchange (fragments, templates, etc.) and how do they make API-led consistent?
4. What does the C4E actually do day to day to make reuse happen, without becoming the old ESB bottleneck?
`,
  answerTemplate: `## Reuse metrics

## Expected reuse per layer

## Reusable assets beyond APIs

## The C4E's role
`,
  keyPoints: [
    'Measure consumers per API (contracts/client applications in API Manager, traffic by client id in analytics), % of new projects reusing existing assets, and time-to-deliver vs baseline.',
    'System APIs and core Process APIs should show the highest reuse; Experience APIs are expected to have one or few consumers.',
    'Exchange assets that drive consistency: API fragments (data types, traits for pagination/errors, security schemes), project templates/archetypes, common error-handling and logging modules, DataWeave libraries, examples.',
    'The C4E enables rather than builds: publishes standards and starter assets, runs lightweight design reviews, curates Exchange, coaches teams and reports metrics.',
    'Discoverability is a design task: consistent naming, categories/tags, good documentation pages and examples in Exchange.',
  ],
  solution: `
**Metrics** (report monthly, per layer and per business domain):

| Metric | Source |
|---|---|
| Consumers per API (distinct client applications) | API Manager contracts / client applications; traffic by client id in API analytics / Anypoint Monitoring |
| % of new projects consuming ≥ 1 existing asset | Project intake records + Exchange dependencies |
| Number of assets reused vs newly created per project | Project retrospectives / architecture review |
| Duplicate-API candidates | Exchange inventory review (two APIs over the same system/entity) |
| Delivery lead time vs pre-programme baseline | Project data |
| Assets with zero consumers after N months | Analytics: candidates for retirement |

Note: reuse of a **template or fragment** is harder to see in runtime analytics; track it via Exchange dependencies in projects (e.g. Maven dependencies/fragments referenced by specs).

**Expected reuse per layer.**
- **System:** highest: a well-designed \`sys-sfdc-customer-api\` may have many consumers. If System APIs show only one consumer each, they are probably too narrow or consumers bypass them.
- **Process:** medium: core domain processes (Customer 360, Order) are reused; niche processes may have one.
- **Experience:** low by design (one channel each). Reporting "low Experience reuse" as a failure is a misunderstanding.

**Reusable assets beyond APIs.**
- **API fragments** (RAML libraries/data types/traits, or OAS components): \`Address\`, \`Money\`, \`ErrorResponse\`, \`pageable\` trait, security schemes: so all APIs share the same error and paging contracts.
- **Project templates/archetypes** per layer: folder structure, global error handler, logging, health endpoint, property files, CI pipeline.
- **Common modules** (e.g. a shared error-handling/logging library, DataWeave function modules).
- **Examples and connectors** (custom connectors via Mule SDK where justified).
- **Governance rulesets** (naming, required error responses) applied to specs.

**C4E role.**
- Publishes and maintains the above as **products** (versioned, documented).
- Curates Exchange: naming, categories (layer, domain, system), deprecation markers; makes "search Exchange first" part of project intake.
- Lightweight **design review** for new System/Process APIs (is there one already?).
- Coaches LOB teams and builds the first few reference APIs with them; then steps back.
- Reports reuse metrics and celebrates reuse (consumption, not creation, is the KPI).
- Avoids becoming a bottleneck: reviews are time-boxed, standards are self-service, and LOB teams deploy their own APIs.
`,
  followUps: [
    { q: 'How do you put a monetary value on reuse?', a: 'Estimate the build effort avoided each time an existing asset is consumed (e.g. days saved × day rate), minus the extra cost of making it reusable. It is an estimate, so be transparent about assumptions.' },
    { q: 'A team built a duplicate System API anyway. What do you do?', a: 'Find out why (could not find it, it lacked a field, owner too slow). Fix the root cause, extend the existing API, improve its docs, then migrate and retire the duplicate.' },
    { q: 'Who owns a reused System API when five teams depend on it?', a: 'One named owning team with a backlog that accepts change requests from consumers; consumers contribute (inner-source) where possible. Shared ownership with no owner leads to decay.' },
  ],
}
