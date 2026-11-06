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
      prompt: 'A developer at a retailer is searching Anypoint Exchange. Which two of these can be found there as assets?',
      options: [
        'An API specification published by another team',
        'A connector for talking to a system such as Salesforce',
        'The live log file of an app running in production',
        'A customer record from the production database',
      ],
      answer: [0, 1],
      explain: 'An asset is a reusable building block, such as an API spec, a connector or a template. Logs live with the running app, and business data lives in its own systems.',
    },
    {
      type: 'single',
      prompt: 'A developer at a shipping company publishes the specification of a Parcel API to Anypoint Exchange, and no Mule app has been built yet. A client then calls the real Parcel API address, and nothing answers. Why?',
      options: [
        'Exchange holds the description, and the working app must be built and deployed',
        'Exchange takes time to start the API, so the client has to wait and try again',
        'Exchange only starts an API after a person has approved the published version',
        'Exchange starts the API in a sandbox, so a client must use a different address',
      ],
      answer: 0,
      explain: 'Publishing shares an asset so that people can find it. Exchange is a catalogue, not a place where your Mule apps run. The implementation is built separately and deployed to a runtime.',
    },
    {
      type: 'single',
      prompt: 'A developer finds an Orders API in Anypoint Exchange and wants to know how to call it. What can the developer learn from its Exchange page?',
      options: [
        'Which customers placed orders today and what they bought',
        'The password that the API uses for its order database',
        'Its paths, its request and response data, and its docs',
        'How many servers the API runs on at this moment',
      ],
      answer: 2,
      explain: 'The page for a REST API shows documentation built from its spec, so a caller can see what to send and what comes back. Live data, secrets and server details are not published there.',
    },
    {
      type: 'single',
      prompt: 'A developer in Anypoint Studio needs the Salesforce connector, a ready-made component that talks to Salesforce. It is not in the project yet. Where does it come from?',
      options: [
        'From API Manager, which sends connectors to apps that have policies',
        'From Exchange, where Studio can search for it and add it to the project',
        'From CloudHub, which copies connectors into an app when it is deployed',
        'From Runtime Manager, which installs connectors on the laptop of a developer',
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
