export default {
  id: 'ms-180',
  category: 'mulesoft',
  title: 'Global Elements and Connector Configurations',
  level: 'BEGINNER',
  tags: ['connector-config', 'configuration', 'connectors', 'reuse'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'Five HTTP Request operations in a banking app call the same fraud API, and each has the host typed in by hand. The host is about to change. Which setup means the next change is one edit?',
      options: [
        'One sub-flow for each of the five calls, with the host typed into each sub-flow',
        'One global HTTP Request configuration that all five operations refer to',
        'One Set Variable at the start of each flow that stores the host for that flow',
        'One extra flow that runs at startup and rewrites the host in the five operations',
      ],
      answer: 1,
      explain: 'A **global element** is a reusable object that holds settings many components can share. Change it once and every operation that refers to it picks up the change.',
    },
    {
      type: 'single',
      prompt: 'A developer opens the XML of a Mule app to find a global HTTP Request configuration. Where should it be?',
      options: [
        'Inside the first flow that uses it, before the other components of that flow',
        'Inside every flow that uses it, as a copy for each of those flows',
        'At the top level of a configuration file, outside every flow',
        'Inside the `pom.xml` file, next to the dependency for the HTTP connector',
      ],
      answer: 2,
      explain: 'Global elements sit outside flows, which is what lets any flow in the app use them. Many teams keep them together in one file such as `global.xml`.',
    },
    {
      type: 'single',
      prompt: 'A flow contains `<http:request config-ref="fraudApi" path="/check"/>`. What does `config-ref` do?',
      options: [
        'It names the global element that supplies the connection settings',
        'It names the flow to run when the HTTP call has finished',
        'It stores the response of the HTTP call in a variable called `fraudApi`',
        'It names the property file that holds the value of `path`',
      ],
      answer: 0,
      explain: '`config-ref` is the link from the operation to the global element. The operation says what to do, and the configuration says how to reach the system.',
    },
    {
      type: 'single',
      prompt: 'A payments app calls two different partner APIs. They have different hosts and different credentials. How many HTTP Request configurations does it need?',
      options: [
        'One, as a single HTTP Request configuration can only exist once in an app',
        'One, with the second host and credentials added to the same configuration',
        'None, as the host and credentials of a second API go on the operation',
        'Two, one for each API, and each operation refers to the one it needs',
      ],
      answer: 3,
      explain: 'A configuration describes how to reach one system. Two systems with their own hosts and credentials need two configurations, and each operation picks the right one with `config-ref`.',
    },
    {
      type: 'match',
      prompt: 'In an app with an HTTP Listener and an HTTP Request, match each setting to where it belongs.',
      pairs: [
        ['The port the app listens on', 'HTTP Listener configuration'],
        ['The path `/payments` that one flow answers on', 'HTTP Listener in the flow'],
        ['The host of the fraud API', 'HTTP Request configuration'],
        ['The path `/check` for one call to the fraud API', 'HTTP Request operation in the flow'],
      ],
      explain: 'Settings shared by every use go in the global configuration. Settings for one use, such as a path, stay on the component in the flow.',
    },
    {
      type: 'single',
      prompt: 'In the XML of a Mule app, a developer renames a global element from `fraudApi` to `fraudService`. An operation has `config-ref="fraudApi"`. What must the developer also do?',
      options: [
        'Nothing, as Mule matches a configuration by its connector type',
        'Change the `config-ref` on the operation to `fraudService`',
        'Add a property called `fraudApi` that holds the new name',
        'Move the operation into the file that holds the configuration',
      ],
      answer: 1,
      explain: '`config-ref` finds the global element by its name. After a rename, each operation must use the new name, or its reference points at nothing.',
    },
  ],
  description: `
A bank has a payments app. Five flows call the same fraud API, and each **HTTP Request** has the host typed in by hand.

Last month the fraud API moved to a new host. A developer changed four of the five operations and missed the last one. Payments through that flow failed for a morning.

A senior developer says: "Put the host in a **global element** and let every operation refer to it." A global element is a reusable object that sits outside your flows and holds settings. A **connector configuration** is the kind of global element that tells a connector how to reach a system.

**Questions**
1. What should replace the five typed hosts?
2. Where does a global element sit, and how does an operation refer to it?
3. Which settings belong in the configuration, and which stay on the operation?
`,
  answerTemplate: `## What replaces the typed hosts

## Where it sits and how it is used

## Configuration or operation
`,
  keyPoints: [
    'A global element is a reusable object that holds settings any number of components can share.',
    'Global elements sit outside flows. Many teams keep them in one file such as global.xml.',
    'An operation points to its connector configuration with config-ref.',
    'Shared details such as host and credentials go in the configuration. Details for one use, such as a path, stay on the operation.',
    'Each separate system needs its own configuration.',
  ],
  solution: `
**The fix:** create one global HTTP Request configuration for the fraud API, and point all five operations at it.

\`\`\`xml
<http:request-config name="fraudApi">
  <http:request-connection host="fraud.bank.example" port="443" protocol="HTTPS"/>
</http:request-config>

<flow name="check-payment">
  <http:request config-ref="fraudApi" method="POST" path="/check"/>
</flow>
\`\`\`

**Where it sits:** at the top level of a configuration file, outside every flow. In Studio you see these on the **Global Elements** tab.

**What goes where**
| Setting | Place |
|---|---|
| Host, port, credentials | Connector configuration |
| Path and method of one call | Operation in the flow |

The next time the host moves, one edit updates all five calls.
`,
  followUps: [
    {
      q: 'Can a flow in one XML file use a global element from another XML file in the same app?',
      a: 'Yes. Global elements belong to the app, not to one file. That is why teams can keep them all in a file such as global.xml.',
    },
    {
      q: 'Does every component need a global element?',
      a: 'No. Core components such as Logger and Set Payload have none. Connectors that reach a system use one to hold the connection details.',
    },
    {
      q: 'What should the host value in a configuration look like when it differs per environment?',
      a: 'It should be a property placeholder such as ${fraud.host} rather than a typed value, so each environment can supply its own host.',
    },
  ],
}
