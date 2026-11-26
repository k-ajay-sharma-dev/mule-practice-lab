export default {
  id: 'ms-188',
  category: 'mulesoft',
  title: 'What Anypoint Exchange Is For: Find and Reuse Before You Build',
  level: 'BEGINNER',
  tags: ['exchange', 'reuse', 'connectors', 'api-design'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'Two teams at a shipping company each built a Carrier Rates API because neither knew about the other. Which part of Anypoint Platform is meant to prevent this?',
      options: [
        'Runtime Manager, where teams start, stop and scale their running apps',
        'API Manager, where teams attach rules such as rate limits to their APIs',
        'Anypoint Monitoring, where teams watch dashboards of their live traffic',
        'Anypoint Exchange, where teams publish and search for reusable assets',
      ],
      answer: 3,
      explain: 'Exchange is the catalogue of an organization. If the first team publishes its API there, the second team can search, find it and reuse it. The other tools deal with apps and APIs that are already live.',
    },
    {
      type: 'multi',
      prompt: 'A team published version `1.0.0` of its Carrier Rates spec to Exchange, and two other teams use it. A typo turns up in the description of one field, and nothing else changes. Which two statements are right?',
      options: [
        'The fix goes out as a new version, `1.0.1`, as `1.0.0` stays as it was',
        'Publishing `1.0.0` again replaces the content that the two teams see',
        'A wording fix that leaves the contract alone is a patch, so it stays on 1',
        'Any change to a published spec needs a new major version, `2.0.0`',
      ],
      answer: [0, 2],
      explain: 'A published Exchange version is not overwritten, so the fix goes out as a new version. Under semantic versioning, a change that does not touch the contract is a patch, so `1.0.1` fits. A new major version is for a breaking change, such as removing a field, and would push both teams to move.',
    },
    {
      type: 'single',
      prompt: 'A developer at a shipping company publishes the specification of a Parcel API to Anypoint Exchange, and no Mule app has been built yet. A client then calls the real Parcel API address, and nothing answers. Why?',
      options: [
        'Exchange holds the description, and the working app must be built and deployed',
        'The API is live, but API Manager drops calls until a client contract is approved',
        'Exchange only starts an API after a person has approved the published version',
        'The spec was published as a draft, and Exchange deploys stable versions only',
      ],
      answer: 0,
      explain: 'Publishing shares an asset so that people can find it. Exchange is a catalogue, not a place where your Mule apps run. The implementation is built separately and deployed to a runtime.',
    },
    {
      type: 'single',
      prompt: 'A developer finds an Orders API in Anypoint Exchange and wants to know how to call it. What can the developer learn from its Exchange page?',
      options: [
        'The live call count and response time of each path',
        'The client ID and secret that callers send to it',
        'Its paths, its request and response data, and its docs',
        'The flows and DataWeave scripts behind each path',
      ],
      answer: 2,
      explain: 'The page for a REST API shows documentation built from its spec, so a caller can see what to send and what comes back. Live metrics are in Anypoint Monitoring, credentials come from the client application that requests access, and the implementation stays in the Mule project.',
    },
    {
      type: 'single',
      prompt: 'A developer in Anypoint Studio needs the Salesforce connector, a ready-made component that talks to Salesforce. It is not in the project yet. Where does it come from?',
      options: [
        'From API Manager, which sends connectors to apps that have policies',
        'From Exchange, where Studio can search for it and add it to the project',
        'From CloudHub, which copies connectors into an app when it is deployed',
        'From the Mule runtime, which ships every connector inside its own lib folder',
      ],
      answer: 1,
      explain: 'Connectors are Exchange assets. Studio can search Exchange and add one to the project, which adds it as a dependency in the `pom.xml` file.',
    },
  ],
  description: `
A shipping company has grown to six integration teams. Last month, a manager noticed that two teams had each built a **Carrier Rates API**. A third team was about to write the same code to talk to Salesforce, although a ready-made connector exists.

An architect says: "Before anyone builds anything, look in **Anypoint Exchange**. When you finish something useful, publish it there." Exchange is the catalogue in Anypoint Platform where people share and find reusable building blocks, called **assets**.

**Questions**
1. What is Exchange for?
2. What kinds of asset live there, and what does not?
3. How would it have helped the two Carrier Rates teams?
`,
  answerTemplate: `## What Exchange is for

## What lives there and what does not

## How it would have helped
`,
  keyPoints: [
    'Exchange is a catalogue for sharing and finding reusable assets.',
    'Assets include API specifications, connectors and templates.',
    'Publishing a spec shares its description. It does not run the API.',
    'A REST API page in Exchange shows docs built from its spec.',
    'Studio can search Exchange and add a connector to a project.',
    'Search first, then build only what is missing.',
  ],
  solution: `
**1. Purpose.** Exchange lets people find what already exists. A developer searches, reads the page for an asset and reuses it instead of building it again.

**2. What lives there.**
- Yes: API specifications, connectors, templates and examples.
- No: running apps, logs, business data and secrets. Apps run on a Mule runtime, and Runtime Manager looks after them.

**3. The two teams.** If the first team had published the Carrier Rates API spec, the second team would have found it with a search. They could have read its docs and called the same API. The third team could have added the Salesforce connector from Exchange rather than writing that code.
`,
  followUps: [
    {
      q: 'What is the difference between Exchange and API Manager?',
      a: 'Exchange is where an API is described and found. API Manager is where a live API is governed, for example with policies.',
    },
    {
      q: 'Why publish a spec before the API is finished?',
      a: 'Other teams can see what is coming, comment on it and plan their own work around it, so nobody starts a second copy.',
    },
    {
      q: 'What happens when a published asset changes?',
      a: 'You publish a new version. The earlier version stays available, so teams can move to the new one when they are ready.',
    },
  ],
}
