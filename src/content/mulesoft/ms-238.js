export default {
  id: 'ms-238',
  category: 'mulesoft',
  title: 'XML SDK or Java SDK: Packaging a Reusable Operation as a Custom Module',
  level: 'ADVANCED',
  tags: ['mule-sdk', 'xml-sdk', 'java-sdk', 'custom-module', 'reuse', 'exchange', 'extensibility', 'retail'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'Every app must send audit events in the same way: build a JSON body, add two headers and call the audit API. Which SDK fits best?',
      options: [
        'The XML SDK, building the operation from existing Mule components',
        'The Java SDK, writing a new HTTP client',
        'Neither, copy the flow into every app',
        'A DataWeave module only',
      ],
      answer: 0,
      explain: 'The work is a set of Mule components: a transform and an HTTP Request. The XML SDK wraps them as one operation without Java code.',
    },
    {
      type: 'single',
      prompt: 'A module must start flows when a message arrives from a partner\'s own TCP protocol. Which SDK can provide that trigger?',
      options: ['The XML SDK', 'The Java SDK', 'Both', 'Neither'],
      answer: 1,
      explain: 'A trigger is a message source. The Java SDK can define sources. The XML SDK is for operations built from existing components.',
    },
    {
      type: 'single',
      prompt: 'A module needs its own connection with pooling and a connectivity test. Which SDK supports that?',
      options: ['The XML SDK', 'The Java SDK', 'A Mule domain', 'A parent POM'],
      answer: 1,
      explain: 'Connection providers with their own lifecycle are written with the Java SDK.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about an XML SDK module are true?',
      options: [
        'Its operations are written in XML using Mule components',
        'Apps use it as a Maven dependency, and its operations show up like a connector\'s',
        'Its operations can take parameters and return a result',
        'Its operations can call any flow in the app that uses the module',
      ],
      answer: [0, 1, 2],
      explain: 'A module is closed. Its operations work only with what they are given as parameters and module properties, not with the flows of the app that uses them.',
    },
    {
      type: 'single',
      prompt: 'How do 30 apps get version 1.2.0 of the module?',
      options: [
        'Copy the module XML into each app',
        'Publish it to Exchange and add or update the dependency in each app\'s pom.xml',
        'Upload it to Runtime Manager',
        'Put it in a Mule domain',
      ],
      answer: 1,
      explain: 'Exchange works as a Maven repository. Each app picks a version, so apps can move to a new version one at a time.',
    },
    {
      type: 'order',
      prompt: 'Order the life of a custom module.',
      items: [
        'Create the module project and write its operations',
        'Test it with its own tests and a small test app',
        'Publish a version to Exchange',
        'Add it as a dependency in the apps that need it',
        'Release a new version and let each app upgrade on its own schedule',
      ],
      explain: 'A module is a product with versions. Apps upgrade when they are ready, not all at once.',
    },
  ],
  description: `
Gilmore Home Retail has 30 Mule apps. Each one calls the internal audit API with copied code: a DataWeave transform that builds the event, two headers and an HTTP Request. The copies have drifted, and the audit team now finds events with missing fields.

A second team needs to connect to a warehouse robot vendor that only speaks its own TCP protocol and pushes messages when a pallet moves.

The architect asks whether a custom module is the answer for either, and which SDK to use.

**Questions**
1. What are the XML SDK and the Java SDK, and how do they differ?
2. Which one fits the audit call, and which fits the robot vendor?
3. How do apps get and upgrade a module?
4. What are the costs of building your own module?
`,
  answerTemplate: `## XML SDK and Java SDK

## Which fits each case

## Getting and upgrading the module

## Costs
`,
  keyPoints: [
    'The XML SDK builds operations from existing Mule components, in XML.',
    'The Java SDK can add connections, pooling and message sources.',
    'A trigger from an outside system needs a source, which means the Java SDK.',
    'A module is closed: its operations only use their parameters and module properties.',
    'Modules are published to Exchange and used as Maven dependencies.',
    'A module needs an owner, tests and versions like any product.',
  ],
  solution: `
**1. Two SDKs.** Both build extensions that apps use like connectors. The **XML SDK** defines operations in XML using existing Mule components such as Transform, HTTP Request and Logger. It needs no Java. The **Java SDK** writes extensions in Java and can do more: its own connection providers with pooling and connectivity tests, message sources that start flows, and logic that no existing component offers.

**2. Which fits.** The audit call is a transform and an HTTP Request, so the XML SDK fits. One operation, such as "send audit event", takes the fields as parameters, and module properties hold the audit API's address. Every app then sends events the same way. The robot vendor needs a long-lived TCP connection and a trigger when a pallet moves. That is a connection and a source, so it needs the Java SDK. Check first whether an existing connector, such as the Sockets connector, already covers the protocol.

**3. Getting the module.** Publish each version to Exchange. Apps add it as a Maven dependency, and its operations appear in the palette like a connector's. Version with semantic versions, so a change that breaks callers gets a new major version, and each app upgrades when it is ready.

**4. Costs.** Someone must own the module: fix bugs, test it against new runtime versions and answer questions. A Java SDK module also needs Java skills and care with Java version support. For a small piece of shared logic, a DataWeave module or a shared flow may be enough.
`,
  followUps: [
    {
      q: 'Why not put the audit flow in a Mule domain?',
      a: 'Domains share resources such as connector configs between apps on the same on-premises runtime. They do not share flows, and they do not exist on CloudHub.',
    },
    {
      q: 'How do you test an XML SDK operation?',
      a: 'Write tests in the module project for its operations, and keep a small test app that calls the operation with real parameters against a mock of the audit API.',
    },
    {
      q: 'The audit API changes its URL. What changes in the apps?',
      a: 'Nothing in the code if the URL is a module property set from each app\'s properties. If it is fixed inside the module, release a new module version and update the apps.',
    },
  ],
}
