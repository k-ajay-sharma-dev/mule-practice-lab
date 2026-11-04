export default {
  id: 'ms-052',
  category: 'mulesoft',
  title: 'API Instances, Environments, Client Applications and Contracts Across the Layers',
  level: 'BEGINNER',
  tags: ['api-led', 'api-manager', 'client-applications', 'contracts', 'exchange', 'environments'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'The Process API gets **401** from the Inventory SAPI in Test, though the same code works in Dev. Most likely cause?',
      options: [
        'Client ID Enforcement is broken in Test',
        'The `orders-papi` application only has an approved contract with the **Dev** instance; the Test instance has its own contract list',
        'The Test instance uses a different RAML',
        'The mobile app\'s credentials expired',
      ],
      answer: 1,
      explain: 'Contracts are per API instance. Request access to the Test instance and check the Test property file holds the Test credentials.',
    },
    {
      type: 'order',
      prompt: 'Order the "Request access" steps in Exchange.',
      items: [
        'Open the API in Exchange and click Request access',
        'Choose the API instance (the environment)',
        'Choose an existing client application or create a new one',
        'Pick an SLA tier, if tiers exist, and submit',
        'Approval — automatic or by the API owner in API Manager',
      ],
      explain: 'Once the contract is approved, the policy accepts that application\'s credentials.',
    },
    {
      type: 'single',
      prompt: 'Whose client ID/secret does the Orders Process API send when calling the Inventory SAPI?',
      options: [
        'The mobile app\'s, forwarded from the original request',
        'Its own (`orders-papi`) credentials',
        'The Experience API\'s credentials',
        'None — internal calls skip Client ID Enforcement',
      ],
      answer: 1,
      explain: 'Each layer is a consumer with its own application, so analytics and throttling show exactly which app calls the System API.',
    },
    {
      type: 'match',
      prompt: 'Match each API Manager concept to its definition.',
      pairs: [
        ['API instance', 'Runtime representation of an Exchange API version in one environment'],
        ['Client application', 'A consumer that owns a client ID and secret'],
        ['Contract', 'Permission for one application to call one API instance, optionally on an SLA tier'],
      ],
      explain: 'Policies, SLA tiers and contracts all hang off the API instance, which is why each environment differs.',
    },
    {
      type: 'single',
      prompt: 'Where should the Process API store its client ID/secret?',
      options: [
        'Hard-coded in the HTTP Request config',
        'In environment-specific properties, encrypted with Secure Properties or supplied as secure properties at deploy time',
        'In the RAML spec',
        'In a plain `config.yaml` committed to Git',
      ],
      answer: 1,
      explain: 'Never hard-code or commit secrets in plain text.',
    },
    {
      type: 'single',
      prompt: 'The Inventory SAPI\'s Test instance is deleted and recreated. What happens to its contracts?',
      options: [
        'They are restored automatically',
        'They are lost — contracts belong to the instance, so consumers must request access again',
        'They move to the Prod instance',
        'Nothing; contracts belong to the Exchange asset',
      ],
      answer: 1,
      explain: 'Updating the existing instance to a new asset version, rather than deleting it, keeps the instance and its contracts.',
    },
  ],
  description: `
The call chain is:

**Mobile app** → **Orders Experience API** → **Orders Process API** → **Inventory System API** and **Customers System API**

All three Mule APIs have **Client ID Enforcement** applied in API Manager, in **Dev**, **Test** and **Prod**. A developer on the Process API team gets **401** when calling the Inventory System API in Test, although the same code works in Dev.

**Questions**
1. What is an API instance, and why is there one per environment?
2. What are a client application and a contract? Walk through "Request access" in Exchange.
3. Which client applications should exist for this chain, and whose credentials does each Mule app send?
4. Explain the 401 in Test.
5. Where do the credentials live in the calling Mule app?
`,
  answerTemplate: `## API instances and environments

## Client applications and contracts

## Credentials per layer

## The 401 in Test

## Storing credentials
`,
  keyPoints: [
    'An API instance is API Manager\'s runtime representation of an Exchange API version in one environment; it has its own instance ID, policies, SLA tiers and contracts.',
    'A client application (with client ID/secret) represents a consumer; a contract links that application to one API instance, optionally under an SLA tier and subject to approval.',
    'Each calling layer is a consumer: the Experience API has its own app with contracts to the Process API; the Process API has its own app with contracts to each System API.',
    'Contracts are per API instance, so a contract in Dev does not grant access in Test — request access for each environment\'s instance.',
    'Store client ID/secret in secure, environment-specific properties, not in code.',
  ],
  solution: `
**API instances**
An API instance is created in API Manager from an Exchange asset version, inside one **environment**. It holds the instance ID used by autodiscovery, the applied policies, SLA tiers, alerts and the list of contracts. Dev, Test and Prod each have their own instance (often created by promoting from the lower environment), so policies and consumers can differ between them — e.g. relaxed rate limits in Dev.

**Client applications and contracts**
- A **client application** represents a consumer and owns a **client ID and secret**. One application can hold contracts with many APIs.
- A **contract** is the link "application X may call API instance Y (on SLA tier Z)".
- Request access flow: open the API in **Exchange** → *Request access* → choose the **API instance** (which environment) → choose an existing application or create a new one → choose an SLA tier if tiers exist → submit. Depending on the tier, approval is automatic or requires the API owner to approve in API Manager. Once approved, the policy accepts that application's credentials.

**Credentials per layer**
| Caller | Client application | Contracts with |
|---|---|---|
| Mobile app | \`mobile-orders-app\` | Orders Experience API (per env) |
| Orders Experience API | \`orders-eapi\` | Orders Process API (per env) |
| Orders Process API | \`orders-papi\` | Inventory SAPI and Customers SAPI (per env) |

Each Mule app sends **its own** client ID/secret on outbound calls — it does not forward the mobile app's credentials. That keeps each contract meaningful: you can see in analytics and throttle exactly which consumer is calling the System API.

**The 401 in Test**
The \`orders-papi\` application has an approved contract with the **Dev** instance of the Inventory SAPI only. The Test instance is a different API instance with its own contract list, so the credentials are rejected. Fix: request access to the Test instance (with the same or a Test-specific application) and get it approved. Also check the Test property file actually holds the Test credentials.

**Storing credentials**
In the calling app's environment-specific properties, encrypted with Secure Properties (\`secure::\` placeholders) or supplied as protected/secure properties at deploy time in Runtime Manager. Never hard-code or commit them in plain text.
`,
  followUps: [
    {
      q: 'Should you use one client application for all environments or one per environment?',
      a: 'Separate applications (or at least separate credentials) per environment are safer, because a leaked Dev secret then cannot reach Prod; many teams use one app per consumer per environment.',
    },
    {
      q: 'What happens to a contract if the API instance is deleted and recreated?',
      a: 'Contracts belong to the instance, so they are lost and consumers must request access again; updating the existing instance to a new asset version, rather than deleting it, avoids this.',
    },
    {
      q: 'Can you revoke a single consumer without affecting others?',
      a: 'Yes. Revoke (or delete) that application\'s contract in API Manager, or reset the application\'s client secret.',
    },
  ],
}
