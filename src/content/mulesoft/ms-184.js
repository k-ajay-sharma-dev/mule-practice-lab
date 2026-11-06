export default {
  id: 'ms-184',
  category: 'mulesoft',
  title: 'Connectors and Modules: What Each One Adds',
  level: 'BEGINNER',
  tags: ['connectors', 'modules', 'fundamentals'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer needs its Mule app to create records in Salesforce. Why would a developer add the Salesforce connector?',
      options: [
        'It lets the app run on Salesforce servers in place of the Mule runtime',
        'It copies the Salesforce data into the app when the app is deployed',
        'It adds ready-made operations that connect the app to Salesforce',
        'It adds a new DataWeave language that only Salesforce data can use',
      ],
      answer: 2,
      explain: 'A connector groups components built to connect a Mule app to an outside system or protocol. The developer picks an operation in place of writing the calls by hand.',
    },
    {
      type: 'single',
      prompt: 'A flow must compress a report before saving it. No outside system is involved in the compressing. What kind of component fits this work?',
      options: [
        'A connector for the system that receives the report',
        'A module that adds compression to the app itself',
        'An event source that starts when the report is ready',
        'A global element that holds the size of the report',
      ],
      answer: 1,
      explain: 'A module adds abilities at the level of ordinary coding, such as compressing data, working with JSON or XML, or using Java. It works on your data and does not exist to reach a system.',
    },
    {
      type: 'match',
      prompt: 'Match each need in a retail app to what provides it.',
      pairs: [
        ['Read rows from an Oracle table', 'Database connector'],
        ['Create a customer record in Salesforce', 'Salesforce connector'],
        ['Pull a value out of an XML document', 'XML module'],
        ['Check a message against a JSON schema', 'JSON module'],
      ],
      explain: 'Reaching an outside system points to a connector. Working on data that is already in the flow points to a module.',
    },
    {
      type: 'multi',
      prompt: 'A developer adds a connector for a messaging system to a Mule project. Which two kinds of component can a connector provide?',
      options: [
        'Sources that start a flow when something happens in that system',
        'Runtimes that replace Mule when a flow uses that system',
        'Operations that perform an action on that system',
        'Environments that hold a copy of that system for testing',
      ],
      answer: [0, 2],
      explain: 'Sources receive information from the system and start a flow. Operations run inside a flow and act on the system. Not every connector has sources, but most have operations.',
    },
    {
      type: 'single',
      prompt: 'A new developer searches Anypoint Exchange for a Logger to add to a project. What is the right advice?',
      options: [
        'Logger is a core component, so there is nothing to add',
        'Logger is a connector, so add it with a global element',
        'Logger is a module, so add it as a dependency first',
        'Logger is a source, so add it at the start of the flow',
      ],
      answer: 0,
      explain: 'Core components such as Logger, Set Payload and Choice are part of Mule itself. Connectors and modules are the extras you add when a project needs them.',
    },
    {
      type: 'single',
      prompt: 'A project uses the Database connector and builds on a developer laptop. Where does the project record that it needs this connector, so a build server can get it too?',
      options: [
        'In a global element, which downloads the connector when the app starts',
        'In a property file, which lists the connectors for each environment',
        'In the Studio settings, which are copied to the build server',
        'In `pom.xml`, where the connector is listed as a dependency',
      ],
      answer: 3,
      explain: 'Connectors and modules are Maven dependencies, and `pom.xml` is the file that lists them. A build server knows only what that file declares.',
    },
  ],
  description: `
A retailer is building a Mule app that takes new online customers and loads them into Salesforce. The app needs to:

1. Read customers from an Oracle table.
2. Check each message against a JSON schema, which is a file that describes the shape the data must have.
3. Create a customer record in Salesforce.
4. Write a line to the log for each customer.

A new developer opens the palette in Anypoint Studio and sees three groups of things: **core components**, **connectors** and **modules**. The names look alike. Which one does each step need, and why are they separate?

**Questions**
1. What does a connector do?
2. What does a module do?
3. Which is which in the four steps above?
4. How does a connector or a module get into a project?
`,
  answerTemplate: `## What a connector does

## What a module does

## The four steps

## Adding one to a project
`,
  keyPoints: [
    'A connector groups components that connect a Mule app to an outside system or protocol.',
    'A module groups components that add coding level abilities, such as working with JSON or XML, or compressing data.',
    'Core components such as Logger and Choice are part of Mule itself.',
    'A connector can provide sources that start a flow and operations that act on the system.',
    'Connectors and modules are listed in pom.xml as dependencies.',
  ],
  solution: `
**Connector:** a group of components built to reach an outside system or protocol, such as Salesforce or a database. It can provide **sources**, which start a flow, and **operations**, which act on the system.

**Module:** a group of components that add abilities at the level of ordinary coding, such as working with JSON or XML, compressing data or using Java.

**The four steps**
| Step | Provided by |
|---|---|
| Read from Oracle | Database connector |
| Check against a JSON schema | JSON module |
| Create a record in Salesforce | Salesforce connector |
| Write to the log | Logger, a core component |

A quick test: if the step reaches something outside the app, look for a connector. If it works on data already in the flow, look for a module or a core component.

**Adding one:** add it from Exchange in Studio, and it appears in \`pom.xml\` as a dependency. Core components need no such step.
`,
  followUps: [
    {
      q: 'Is the HTTP Listener a core component?',
      a: 'No. It comes from the HTTP connector, which also provides the HTTP Request operation.',
    },
    {
      q: 'Is the Scheduler a connector?',
      a: 'No. The Scheduler is a core component that acts as a flow source. It reaches no outside system.',
    },
    {
      q: 'Do connectors need a global element?',
      a: 'Usually, yes. Connectors that reach a system hold the connection details in a connector configuration, and operations refer to it.',
    },
  ],
}
