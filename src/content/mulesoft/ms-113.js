export default {
  id: 'ms-113',
  category: 'mulesoft',
  title: 'API Governance Profiles in Practice: Draft or Active, Latest Rulesets and What Governance Does Not Enforce',
  level: 'ADVANCED',
  tags: ['governance', 'api-governance', 'api-manager', 'api-management', 'rulesets', 'conformance', 'exchange'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'An architect says: "We added the Mule API Management Best Practices ruleset to an active governance profile, so all those APIs now have the required policies." What is wrong?',
      options: [
        'Governance profiles validate APIs and report conformance; they do not apply or enforce policies',
        'Nothing, because a profile applies the policies named in its rulesets',
        'Rulesets apply policies only at the next redeployment',
        'Only draft profiles can apply policies',
      ],
      answer: 0,
      explain: 'The docs state that profiles validate APIs and do not apply or enforce policies. Applying policies is a separate capability, for example automated policies.',
    },
    {
      type: 'single',
      prompt: 'A governance administrator creates a profile and selects no filter criteria. What is the effect?',
      options: [
        'The rulesets apply to all of the organization\'s APIs in Exchange',
        'The profile applies to no APIs until a filter is added',
        'The profile cannot be saved',
        'It applies only to APIs published after the profile was created',
      ],
      answer: 0,
      explain: 'The docs carry an explicit caution: with no filter criteria, a profile applies its rulesets to all of your APIs in Exchange.',
    },
    {
      type: 'single',
      prompt: 'Why save a new profile as draft first?',
      options: [
        'Conformance results stay in the draft profile view and notifications are off, so you can test before developers see anything',
        'A draft profile does not govern its APIs, so it does not count against capacity',
        'Only draft profiles can use custom rulesets',
        'Active profiles cannot be edited later',
      ],
      answer: 0,
      explain: 'APIs targeted by a draft profile are governed, but their conformance information is not shown outside the draft view unless an active profile also targets them. Notifications are automatically disabled for drafts.',
    },
    {
      type: 'single',
      prompt: 'A profile uses the default ruleset version setting. The C4E publishes a stricter version of its custom ruleset. Nothing changed in the APIs, but owners get nonconformance emails. Why?',
      options: [
        'The default is Latest, so the profile uses the newly published version automatically, and updating a ruleset can trigger notifications',
        'Rulesets expire when a new version is published',
        'Profiles re-read API specs only when a ruleset is deleted',
        'The emails come from Exchange, not from API Governance',
      ],
      answer: 0,
      explain: 'Latest is the default. Updating governance rulesets is listed among the changes that can result in notifications. Pin a version when you want to control the rollout.',
    },
    {
      type: 'match',
      prompt: 'Match each finding to where you fix it.',
      pairs: [
        ['The API instance has no Client ID Enforcement policy applied', 'In API Manager, on the instance'],
        ['A spec rule about required examples fails', 'In the spec, then publish a new version to Exchange'],
        ['A catalog information rule fails', 'In the asset portal in Exchange'],
      ],
      explain: 'Conformance covers aspects of an API: specification, instance, catalog information and documentation. Each aspect is fixed in the tool that owns it.',
    },
    {
      type: 'multi',
      prompt: 'How can a team find conformance issues before central governance reports them?',
      options: [
        'Add published rulesets as dependencies in the API Designer project',
        'Run the governance:api:validate command of Anypoint CLI in the pipeline',
        'Validate in Anypoint Code Builder',
        'Wait for the Runtime Manager alert',
      ],
      answer: [0, 1, 2],
      explain: 'A spec can be validated against rulesets in its project whether or not the API is centrally governed. Runtime Manager alerts are about runtime events.',
    },
    {
      type: 'single',
      prompt: 'Which statement about counting governed APIs is correct?',
      options: [
        'If an API is governed, all versions of that API are considered one governed API',
        'Each version counts as one governed API',
        'Each API instance counts as one governed API',
        'Only APIs in Production count',
      ],
      answer: 0,
      explain: 'The concepts section states this directly. Subscription limits are based on purchased capacity.',
    },
  ],
  description: `
An insurer has 180 APIs. The C4E has written two custom rulesets and wants to start API Governance. A plan is on the table:

1. Create one profile, with no filters, with all MuleSoft rulesets and both custom rulesets.
2. Save it as active on Monday, with notifications on.
3. Consider the "no policies" audit finding closed, because a ruleset now checks for Client ID Enforcement.
4. Let developers fix issues when the emails arrive.

The API owners object. They say they will receive thousands of emails for APIs that are being retired, and the security lead asks whether a nonconformant API can reach Production.

**Questions**
1. Explain governed APIs, profiles, rulesets and the aspects of an API that can be checked.
2. What is wrong with this plan? Propose a better rollout.
3. Who fixes which kind of finding, and where?
4. Does governance stop a nonconformant API? What actually puts a policy on an API?
5. How do you bring checks into design and CI?
`,
  answerTemplate: `## Concepts

## Problems with the plan and a better rollout

## Who fixes what

## Validation or enforcement

## Design time and CI
`,
  keyPoints: [
    'A governance profile applies selected rulesets to a filtered group of APIs. An API is governed if at least one profile targets it, and all its versions count as one governed API.',
    'A profile with no filter criteria applies to all APIs in Exchange.',
    'Use draft profiles to test, because their results stay in the draft view and notifications are off. Then activate.',
    'Start with a few APIs, few rulesets and narrow filters; identify the APIs with tags and categories in Exchange first.',
    'Ruleset version defaults to Latest, so a new ruleset version applies automatically.',
    'Profiles validate; they do not apply or enforce policies. Automated policies apply policies.',
    'Instance issues are fixed in API Manager, spec issues in the design tool, catalog issues in Exchange.',
    'In the enhanced MuleSoft experience, governance strategies add Controls, which can optionally block non-compliant actions. The UI now says Services where it said APIs.',
  ],
  solution: `
**1. Concepts.**
- **Ruleset:** a collection of rules, published in Exchange as an asset. MuleSoft provides several, such as Anypoint API Best Practices, OpenAPI Best Practices, Authentication Security Best Practices and Mule API Management Best Practices. Custom rulesets hold your own standards.
- **Profile:** applies selected rulesets to a filtered group of APIs.
- **Governed API:** an API that at least one profile selects. All its versions count as one.
- **Aspects:** a rule can check the specification, the instance, the catalog information or the documentation.

The UI now uses the word **Services** in place of APIs, to cover agents, MCP servers and gateways too. Functionality is unchanged.

**2. Problems with the plan.**
- No filters means every API in Exchange is governed, including retiring ones.
- All rulesets at once in one profile is hard to maintain and hard to read.
- Going active with notifications on means emails before anyone has seen the results.
- A ruleset that checks for a policy reports the gap. It does not close the audit finding.

**A better rollout.** Tag APIs in Exchange first, for example by layer and by exposure. Create a **draft** profile for a small set with few rulesets, and review the results; notifications are automatically off for drafts. Fix the rules that give false findings. Pin ruleset versions if you want controlled rollout, because the default of **Latest** picks up new versions by itself. Then activate, one group at a time. Check that recipients have a valid contact email.

**3. Who fixes what.**
| Finding | Where |
|---|---|
| Policy missing or in the wrong order on an instance | API Manager |
| Instance-related issue in the spec | Design Center or Anypoint Code Builder |
| Spec rule | Design tool, then publish a new version |
| Catalog information | Asset portal in Exchange |

In API Manager, the **Instance Conformance** field and **Governance Report** page show the details. The ruleset in Exchange has descriptions of each rule.

**4. Validation or enforcement.** Profiles report and do not block. The docs say they validate APIs and do not apply or enforce policies. To put a policy on an API, use an automated policy or apply it to the instance. In the enhanced MuleSoft experience, governance strategies of type **Automated Policies** enforce policy requirements, and **Controls** can optionally block non-compliant actions. To answer the security lead: profiles alone do not stop an API. Your pipeline can stop it, if a failing validation fails the build.

**5. Design time and CI.** Developers add rulesets as dependencies in API Designer, and they get a dot or warning icon when their API is centrally governed. Anypoint Code Builder has its own validation. In the pipeline, run \`governance:api:validate\` from Anypoint CLI and fail the build on violations. API Manager also shows **Conformance Status** for RAML and OAS assets when you add an instance.
`,
  followUps: [
    {
      q: 'When are automatic notifications sent?',
      a: 'Only when an active profile targets the API, a valid contact email exists, and the status changes to failing because of a change in the API or rulesets, or the first time a version fails a ruleset. Each email names the API and the rulesets it failed, with links to Exchange and Design Center.',
    },
    {
      q: 'What is the difference between automated policies and open policies?',
      a: 'In the enhanced experience, automated policies attach to every API that matches criteria, with one shared configuration, and only on Anypoint instances. Open policies are configured once and applied to selected instances, including third-party providers, and each policy is then independent.',
    },
    {
      q: 'Who can create profiles?',
      a: 'Only API Governance administrators and organization administrators can create, edit and delete profiles.',
    },
    {
      q: 'Do tags have to exist before you use them in a profile?',
      a: 'No. You can add a tag name in a profile even if it has not yet been added to APIs in Exchange, and the filter also applies to new APIs as they are added.',
    },
  ],
}
