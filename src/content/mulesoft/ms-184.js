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
      prompt: 'A retail app uses the Database connector with an Oracle connection. The project builds, but the connection test fails with an error saying the class `oracle.jdbc.OracleDriver` cannot be found. What is missing?',
      options: [
        'The Oracle wallet files in `src/main/resources`, which hold the driver',
        'The Oracle JDBC driver as a Maven dependency, shared with the connector',
        'The driver class name in a property file, so the connector can load it',
        'A newer Database connector version, which bundles the Oracle driver',
      ],
      answer: 1,
      explain: 'The Database connector does not ship any JDBC driver. The Oracle driver must be added to `pom.xml` as a dependency and declared as a shared library, so the connector can load the class. A property can name the class but cannot supply it, wallet files hold certificates and not code, and no connector version bundles the driver.',
    },
    {
      type: 'single',
      prompt: 'A flow checks each customer with the JSON module `Validate schema` operation before calling Salesforce. One payload is missing a field that the schema marks as required. What happens?',
      options: [
        'The operation returns `false` as the payload, and the flow carries on',
        'The operation drops the bad record and passes an empty payload on',
        'It raises `JSON:SCHEMA_NOT_HONOURED`, and the flow goes to its error handler',
        'The operation logs a warning, and the payload goes on to Salesforce as it is',
      ],
      answer: 2,
      explain: 'A failed schema check raises the error `JSON:SCHEMA_NOT_HONOURED`, so the Salesforce call never runs and the error handler decides what to do. The operation does not return a true or false value, does not change the payload and does not let a bad record pass with a warning.',
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
      prompt: 'A developer adds the JMS connector to a project and nothing else. Which two jobs can the project now do with components from that connector?',
      options: [
        'Start a flow each time a message arrives on a queue',
        'Turn the XML body of a message into JSON for the next step',
        'Publish a message to a queue from the middle of a flow',
        'Keep each message in an Object Store after it is read',
      ],
      answer: [0, 2],
      explain: 'A connector gives sources, which start a flow when something happens in the system, and operations, which act on the system from inside a flow. The JMS listener and the publish operation are those two. Converting XML to JSON is DataWeave work, and an Object Store needs its own connector.',
    },
    {
      type: 'single',
      prompt: 'A project uses an HTTP Listener, Choice, Transform Message and Logger. A developer cleans up `pom.xml` and wants to keep only the dependencies these four need. What must stay?',
      options: [
        'Nothing, as all four of them ship inside the Mule runtime',
        'The HTTP connector, as the Listener comes from it and the rest ship with Mule',
        'The HTTP connector and a DataWeave module for Transform Message',
        'The HTTP connector and a Logger module, as Logger comes from Exchange',
      ],
      answer: 1,
      explain: 'Core components such as Logger, Choice and Transform Message are part of Mule itself and need no dependency. The HTTP Listener belongs to the HTTP connector, so that dependency must stay. Removing it would break the build of the app.',
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
