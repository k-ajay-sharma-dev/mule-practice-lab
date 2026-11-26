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
        'The XML SDK, built from existing Mule components',
        'The Java SDK, with a new HTTP client in Java',
        'Neither, copy the flow into every app',
        'A DataWeave module that makes the call',
      ],
      answer: 0,
      explain: 'The work is a set of Mule components: a transform and an HTTP Request. The XML SDK wraps them as one operation without Java code.',
    },
    {
      type: 'single',
      prompt: 'A module must start flows when a message arrives from a partner\'s own TCP protocol. Which SDK can provide that trigger?',
      options: [
        'The XML SDK, by wrapping a Scheduler that polls the socket',
        'The Java SDK',
        'Both, as each of them can define a message source',
        'Neither, only connectors from Exchange can start flows',
      ],
      answer: 1,
      explain: 'A trigger is a message source. The Java SDK can define sources. The XML SDK is for operations built from existing components.',
    },
    {
      type: 'single',
      prompt: 'A partner system needs a connection that is pooled, tested when the app deploys and closed on shutdown. The team wraps it in a custom module. What fits?',
      options: [
        'An XML SDK module that keeps the connection in a module property',
        'A shared Mule domain that holds the XML SDK module config',
        'A Java SDK module with its own connection provider',
        'An XML SDK module whose operations open and close a socket each time',
      ],
      answer: 2,
      explain: 'Connection providers with their own lifecycle, pooling and connectivity test are written with the Java SDK. The XML SDK builds operations from existing components and has no connection provider of its own. A module property holds a value, not a live connection, and a socket per call gives up the pooling. A domain shares configs, it does not add a connection type.',
    },
    {
      type: 'multi',
      prompt: 'A team packages its audit call as an XML SDK module for 30 apps. Which statements are true?',
      options: [
        'Its operations are written in XML using Mule components',
        'Apps use it as a Maven dependency, and its operations show up like a connector\'s',
        'Its operations can take parameters and return a result',
        'Its operations can call any flow in the app that uses the module',
        'Its operations can read the calling flow\'s variables without them being passed in',
        'It can add a message source that listens for pushed messages, like a connector\'s listener',
      ],
      answer: [0, 1, 2],
      explain: 'XML SDK operations are written in XML with Mule components. The module is built with Maven, and apps add it as a dependency, where its operations show up in the palette like a connector\'s. Operations take parameters and can return a result. A module is closed: its operations work only with their parameters and module properties, so they cannot call the app\'s flows or read the caller\'s variables. The XML SDK has no message sources. A listener that receives pushed messages, like the robot vendor\'s TCP feed, needs the Java SDK.',
    },
    {
      type: 'single',
      prompt: 'How do 30 apps get version 1.2.0 of the module?',
      options: [
        'Copy the module XML into src/main/mule of each app',
        'Publish it to Exchange and update each pom.xml',
        'Upload it once to Runtime Manager as a shared library',
        'Put it in a shared Mule domain that the 30 apps use',
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
