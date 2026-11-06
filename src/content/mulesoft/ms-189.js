export default {
  id: 'ms-189',
  category: 'mulesoft',
  title: 'What an API Manager Policy Does: Rules at the Front Door',
  level: 'BEGINNER',
  tags: ['api-manager', 'policies', 'rate-limiting', 'client-id-enforcement', 'autodiscovery', 'security'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer has a live Prices API, and one partner is sending far too many calls. The retailer wants to cap the calls without changing the code of the Mule app. What fits?',
      options: [
        'Add a Choice router to each flow that counts the calls from that partner',
        'Move the Mule app to a bigger server so that it can accept all the calls',
        'Apply a Rate Limiting policy to the API in API Manager',
        'Add a note about the limit to the API docs in Exchange',
      ],
      answer: 2,
      explain: 'A policy is a ready-made rule that you switch on for an API. Rate Limiting caps how many requests get through. The Choice router needs new code, a bigger server does not cap anything, and a note enforces nothing.',
    },
    {
      type: 'single',
      prompt: 'An API Manager policy blocks a request to a Mule API. What happens to the logic in the flow behind the API?',
      options: [
        'It runs first, and then the policy removes the reply to the caller',
        'It does not run, because the request is stopped before it gets there',
        'It runs later, when the policy has put the request in a retry queue',
        'It runs once with an empty payload, so that the flow can log the block',
      ],
      answer: 1,
      explain: 'Policies sit in front of the API implementation like a guard at the door. A blocked request gets its rejection straight away, so your flow logic does no work for it.',
    },
    {
      type: 'single',
      prompt: 'A bank wants only registered client applications to call its Accounts API, and each must send a client ID and secret. Which policy fits, and what happens to a request that has no client ID?',
      options: [
        'Client ID Enforcement, and the request is rejected',
        'Rate Limiting, and the request is put in a waiting line',
        'Client ID Enforcement, and the flow adds a new client ID',
        'Rate Limiting, and the request is sent on with a warning',
      ],
      answer: 0,
      explain: 'Client ID Enforcement checks that the caller is a registered client application. A request with no valid credentials does not get through. Rate Limiting is about how many calls arrive, not who makes them.',
    },
    {
      type: 'single',
      prompt: 'A retailer has two new rules for its Checkout API. Rule A: reject any caller with no valid client ID. Rule B: give gold loyalty members a 10 percent discount. Where does each rule belong?',
      options: [
        'Both belong in an API Manager policy',
        'Rule A in a policy, and Rule B in the Mule flow',
        'Rule A in the Mule flow, and Rule B in a policy',
        'Both belong in the Mule flow, not in a policy',
      ],
      answer: 1,
      explain: 'Policies handle concerns that apply to the API as a whole, such as who may call it and how often. A discount is business logic. It needs order data, so it belongs in the implementation.',
    },
    {
      type: 'single',
      prompt: 'A Rate Limiting policy protects a live Mule API. A security lead asks to raise the limit today. What has to happen?',
      options: [
        'Change the limit in the code, then rebuild the app and deploy it again',
        'Publish a new version of the API specification to Anypoint Exchange',
        'Stop the Mule app, change the limit, and start the Mule app once more',
        'Change the policy settings in API Manager, with no rebuild of the app',
      ],
      answer: 3,
      explain: 'This is the main reason to use policies. The rule lives outside the app code, so you can add or change it in API Manager without rebuilding or redeploying the Mule app.',
    },
    {
      type: 'single',
      prompt: 'A developer applied a policy to an API instance in API Manager. API Manager uses an API instance to represent one API in one environment. Calls to the deployed Mule app are still not limited, and the app has no link to that instance. What is missing?',
      options: [
        'A second policy, as a single policy has no effect on its own',
        'A new API specification published to the Exchange of the company',
        'Autodiscovery, which links the Mule app to the API instance',
        'A Choice router in the Mule app that reads the policy settings',
      ],
      answer: 2,
      explain: 'Autodiscovery is a setting in the Mule app that names its API instance. Without that link, the app does not get the policies from API Manager, so nothing enforces them.',
    },
  ],
  description: `
A bank runs a **Currency Rates API** on Mule. It gives partners today's currency rates.

Two things have gone wrong this week:
- A partner's faulty script called the API thousands of times and slowed it for everyone.
- An audit found that anyone who knows the address can call the API.

A developer offers to write checks into every flow. An architect says: "Don't touch the code. Use **API Manager policies**." API Manager is the part of Anypoint Platform that governs live APIs. A policy is a ready-made rule that you apply to an API, such as a limit on calls.

**Questions**
1. What does a policy do, and where does it act?
2. Which policies fit the two problems?
3. Why is a policy better here than code in each flow?
4. What must be in place for the Mule app to follow the policy?
`,
  answerTemplate: `## What a policy does

## Which policies fit

## Why not code in each flow

## What must be in place
`,
  keyPoints: [
    'A policy is a ready-made rule applied to an API in API Manager.',
    'It acts in front of the implementation, so a blocked request never reaches your flow logic.',
    'Rate Limiting caps the number of calls. Client ID Enforcement checks who is calling.',
    'Policies can be added or changed without rebuilding the Mule app.',
    'Business logic stays in the flows. Policies handle concerns such as access and traffic.',
    'Autodiscovery links the Mule app to its API instance.',
  ],
  solution: `
**1. What a policy does.** A policy checks each request before it reaches the implementation. If the request breaks the rule, the caller gets a rejection and the flow logic does not run.

**2. The two problems.**
- Too many calls: **Rate Limiting** caps how many requests get through.
- Anyone can call: **Client ID Enforcement** lets through only registered client applications that send valid credentials.

**3. Why a policy.** The rules are ready-made and tested, so nobody writes them again in each flow. They live outside the app, so a limit can change today with no rebuild or redeploy. The same rule works the same way on each API that uses it.

**4. What must be in place.** The API needs an **API instance** in API Manager, which represents the API in one environment. The Mule app needs **autodiscovery** configured with that instance. Without the link, the app does not get the policy.
`,
  followUps: [
    {
      q: 'Is a policy the same as the API specification?',
      a: 'No. The spec describes what the API offers. A policy controls who can use it and how much, while it is running.',
    },
    {
      q: 'Can an API have more than one policy?',
      a: 'Yes. For example, the bank can use Client ID Enforcement and Rate Limiting on the same API.',
    },
    {
      q: 'Who applies policies?',
      a: 'Usually whoever runs the API platform or the API. Because policies need no code change, they do not have to wait for a developer release.',
    },
  ],
}
