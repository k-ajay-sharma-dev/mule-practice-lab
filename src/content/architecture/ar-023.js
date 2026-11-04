export default {
  id: 'ar-023',
  category: 'architecture',
  title: 'API Governance with Rulesets and Exchange',
  level: 'ADVANCED',
  tags: ['api-governance', 'rulesets', 'exchange', 'design-first'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you make the API style guide enforceable rather than a PDF?',
      options: [
        'Ask the architecture board to read every spec more carefully',
        'Encode it as governance rulesets (MuleSoft-provided plus a custom company ruleset in Exchange) and publish shared fragments teams import',
        'Email the PDF to all 9 teams every quarter',
        'Let each team write its own rules',
      ],
      answer: 1,
      explain: 'Rulesets give violations while the spec is written and in CI; fragments (error type, paging traits, security schemes) make the standard the easiest path.',
    },
    {
      type: 'match',
      prompt: 'Match each problem to the automated control that addresses it.',
      pairs: [
        ['camelCase vs snake_case and differing error formats', 'API Governance rulesets at design time and in CI'],
        ['APIs reaching production without a security policy', 'Automated policies, and a pipeline that refuses to promote without one'],
        ['Specs that do not match the implementation', 'Contract tests and APIkit routing from the spec'],
      ],
      explain: 'Each kind of drift is caught at the point where it is cheapest: design, build, or deployment.',
    },
    {
      type: 'single',
      prompt: 'What should the architecture board still review by hand?',
      options: [
        'Naming conventions and pagination parameters',
        'Resource model, API boundaries vs existing APIs (reuse), data ownership, security classification',
        'Whether descriptions and examples exist',
        'Every spec line by line in a weekly 2-hour meeting',
      ],
      answer: 1,
      explain: 'Machines check the mechanical rules; people judge domain design and reuse, which rulesets cannot assess.',
    },
    {
      type: 'multi',
      prompt: 'Which changes keep human review fast?',
      options: [
        'Asynchronous review in pull requests/Exchange comments with a 2-day SLA',
        'A short checklist',
        'A trained API champion in each team who reviews first',
        'A synchronous meeting only for new domains or exceptions',
        'Requiring CTO sign-off on every API',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Federating and making review asynchronous removes the weekly bottleneck that teams were trying to skip.',
    },
    {
      type: 'single',
      prompt: 'What do you do with existing non-conforming APIs?',
      options: [
        'Block them all until they conform',
        'Ignore them; rules apply only to new APIs',
        'Run governance in report mode, prioritise high-traffic/external APIs, fix non-breaking issues now and breaking ones in the next major version',
        'Rewrite them all in one sprint',
      ],
      answer: 2,
      explain: 'Running services must not be broken overnight; non-breaking fixes (descriptions, policies) are quick wins, naming and error-format changes wait for a major version.',
    },
    {
      type: 'single',
      prompt: 'How do you introduce blocking rules without frustrating teams?',
      options: [
        'Make every rule an error from day one',
        'Start with errors only for critical rules (security, error format) and warnings for style, then tighten',
        'Make every rule a warning forever',
        'Let teams disable rules they dislike',
      ],
      answer: 1,
      explain: 'Gradual tightening builds trust. Security-critical rules are errors from the start and have no exceptions.',
    },
  ],
  description: `
A global retailer has **9 delivery teams** (internal and 3 system integrators) building APIs on Anypoint Platform. After 18 months:

- Some APIs use \`camelCase\`, others \`snake_case\`; pagination and error formats differ in every API.
- 30% of APIs in Exchange have **no description, no examples**, and specs that do not match the deployed implementation.
- Several APIs went to production **without any security policy**.
- The architecture board reviews every API in a 2-hour weekly meeting and has become a bottleneck; teams try to skip it.

The CTO asks you to set up **API governance** that improves quality **without slowing delivery**.

**Questions:**
- What standards do you define, and how are they made enforceable rather than a PDF?
- How do you use Anypoint capabilities (Exchange, API Governance rulesets, API Manager) and CI/CD to automate checks?
- What still needs human review, and how do you keep it fast?
- How do you handle existing non-conforming APIs?
`,
  answerTemplate: `## Standards

## Automated enforcement

## Human review

## Existing APIs

## Measuring success
`,
  keyPoints: [
    'Standards are published as reusable assets: an API style guide plus shared fragments in Exchange (error schema, pagination, common types, security schemes).',
    'Standards are encoded as governance rulesets (Anypoint API Governance, with MuleSoft-provided and custom rulesets) that validate specs in design and in CI, failing builds on violations.',
    'Runtime governance is automated: every API instance must have required policies (e.g. client ID/OAuth), applied via automated policies or pipeline-scripted configuration.',
    'Human review focuses on domain design and reuse (API boundaries, resource model) with a short, asynchronous checklist, while mechanical checks are left to automation.',
    'Existing APIs get a conformance report and a remediation plan prioritised by consumer impact; new versions must conform, old ones are not blocked overnight.',
    'Governance success is measured: conformance rate, time from design to publish, and reuse/consumption of standard fragments.',
  ],
  solution: `
**Standards (concise, versioned).**
- **API style guide:** naming (\`camelCase\` JSON, plural resource nouns, kebab-case paths), versioning rules, pagination (\`limit/offset\` or cursor), filtering, dates (ISO 8601), error contract, headers (\`X-Correlation-ID\`).
- **Reusable fragments in Exchange:** error response type, pagination traits, common data types (Money, Address), OAuth/client-ID security schemes, example sets. Teams *import* them instead of rewriting.
- **Asset quality:** required description, examples per operation, owner/contact, lifecycle state (development/stable/deprecated).

**Automated enforcement.**
- **Design time:** Anypoint **API Governance** applies rulesets (MuleSoft-provided ones such as Anypoint best practices / OpenAPI best practices, plus a **custom company ruleset** published in Exchange) to the APIs in scope; conformance status is visible in Exchange and Design Center, so developers see violations while writing the spec.
- **CI:** the pipeline validates the spec against the same rulesets (e.g. via Anypoint CLI governance commands) and **fails the build** on errors; warnings are reported. Contract tests check that the implementation matches the spec (APIkit routing from the spec helps here).
- **Runtime:** **automated policies** in API Manager per environment for baseline controls, and the deployment pipeline refuses to promote an API whose instance lacks the required security policy. Periodic report: APIs in prod without client-ID/OAuth = 0.

**Human review — keep it fast.**
- The board reviews **only what machines can't check**: resource model, API boundaries vs existing APIs (reuse!), data ownership, security classification.
- **Asynchronous** review in pull requests/Exchange comments with a 2-day SLA, plus a short checklist. A synchronous meeting only for new domains or exceptions.
- **Federate:** each team has a trained "API champion" who reviews first; the central team coaches.

**Existing APIs.** Run governance in **report mode** across all assets; publish a conformance dashboard. Prioritise fixes on high-traffic and external APIs; fix non-breaking issues (descriptions, examples, policies) now, breaking ones (naming, error format) in the next major version. Don't block running services.

**Measuring success.** Conformance % per team, time from spec draft to Exchange publish (should drop), number of APIs using shared fragments, production incidents related to missing policies (target zero), and developer satisfaction.

**Trade-off:** strict blocking rules early can frustrate teams; start with errors only for critical rules (security, error format) and warnings for style, then tighten.
`,
  followUps: [
    { q: 'An SI partner says the rulesets block their deadline. How do you respond?', a: 'Keep a documented, time-boxed exception process approved by the architecture lead, logged in Exchange, with a fix date. Security-critical rules have no exceptions.' },
    { q: 'How do you write a custom rule, for example "all paths must be kebab-case"?', a: 'Define it in a custom governance ruleset (validation profile) published to Exchange, test it against good and bad example specs, then add it to the governance profile and CI. Start as a warning before making it an error.' },
    { q: 'How do you justify the governance effort to the business?', a: 'Consistent APIs reduce integration time for consumers, fewer production security gaps, and faster reviews. Show the before/after of review lead time and incidents.' },
  ],
}
