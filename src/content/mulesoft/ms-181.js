export default {
  id: 'ms-181',
  category: 'mulesoft',
  title: 'Property Files: Keeping Settings Out of the Flow',
  level: 'BEGINNER',
  tags: ['properties', 'configuration', 'environments'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A payroll app has its database host typed into the XML. The host is different in test and in production. Why move the host to a property file?',
      options: [
        'A flow runs faster when it reads its settings from a separate file',
        'Mule refuses to deploy an app that has a host written in its XML',
        'The same app can move between environments with only the values changing',
        'A host in a property file is encrypted when the app is packaged',
      ],
      answer: 2,
      explain: 'The logic of the app is the same everywhere, and only the settings differ. Keeping settings in a property file means no one edits flows to change environment.',
    },
    {
      type: 'multi',
      prompt: 'An HR app is being cleaned up. Which two of these belong in a property file rather than in the flow?',
      options: [
        'The host name of the HR database',
        'The order of the steps in the flow',
        'The base URL of the benefits API',
        'The DataWeave mapping for an employee',
      ],
      answer: [0, 2],
      explain: 'Values that change between environments belong in a property file. The order of steps and the mappings are the logic of the app, so they stay the same everywhere and live in the flow.',
    },
    {
      type: 'single',
      prompt: 'A YAML property file has `host` nested under `db`. Which value in the XML of a Database connector configuration reads it?',
      options: ['`#[db.host]`', '`${db:host}`', '`#[vars.db.host]`', '`${db.host}`'],
      answer: 3,
      explain: 'A placeholder in XML uses `${...}`, and nested YAML keys are joined with dots. `#[...]` is a DataWeave expression, where `db` on its own means nothing.',
    },
    {
      type: 'single',
      prompt: 'A Logger message is a DataWeave expression, and it must show the property `api.region`. Which expression reads it?',
      options: [
        "`#[p('api.region')]`",
        "`#[vars['api.region']]`",
        "`#[attributes['api.region']]`",
        "`#[payload['api.region']]`",
      ],
      answer: 0,
      explain: 'The `p` function reads a property by name inside DataWeave. Properties are not stored in the payload, attributes or variables of the event.',
    },
    {
      type: 'single',
      prompt: 'An app has `config-test.yaml` and `config-prod.yaml`, and it declares `<configuration-properties file="config-${env}.yaml"/>`. The app is deployed with `env` set to `prod`. What happens?',
      options: [
        'Mule loads both files and uses the one that was saved last',
        'Mule loads `config-prod.yaml` and uses the values from that file',
        'Mule loads `config-test.yaml` first, as test always comes before prod',
        'Mule fails, as a file name in this element cannot hold a placeholder',
      ],
      answer: 1,
      explain: 'The value of `env` fills in the file name, so one setting at deployment chooses the file. The same packaged app can then run anywhere.',
    },
    {
      type: 'single',
      prompt: 'A teammate saves the production database password in plain text in `config-prod.yaml` and commits it to Git. What is the problem?',
      options: [
        'Passwords cannot be read from YAML, so the app fails to connect',
        'Git changes the value of a password when a file is committed',
        'Mule writes every value from a property file into the app log',
        'Anyone who can read the repository can read the password',
      ],
      answer: 3,
      explain: 'A property file is only a text file. Secrets should be stored encrypted, for example with the Secure Configuration Properties module, or be supplied safely at deployment.',
    },
  ],
  description: `
An HR company runs a payroll app in two environments, test and production. An **environment** is a separate place where the app runs, with its own database and its own APIs.

Today the database host is typed straight into the XML. Before each release, a developer edits the XML, rebuilds the app and hopes nothing else changed. Last time, the test host went to production.

The team decides to use **property files**. A property file is a small text file of named settings. The app reads a setting by its name, so the flow never holds the value itself.

\`\`\`yaml
# config-prod.yaml
db:
  host: "payroll-db.prod.example"
\`\`\`

**Questions**
1. Why should environment settings stay out of the flow?
2. How do you read a property in XML and in DataWeave?
3. How does the app know which file to load?
4. What should not sit in a plain property file?
`,
  answerTemplate: `## Why settings stay out of the flow

## Reading a property

## Choosing the file

## What stays out of a plain file
`,
  keyPoints: [
    'Property files keep values that change between environments out of the flow, so the app logic is the same everywhere.',
    'XML reads a property with a placeholder such as ${db.host}. Nested YAML keys are joined with dots.',
    "DataWeave reads a property with p('db.host').",
    'A file name such as config-${env}.yaml lets one setting at deployment choose the file.',
    'Passwords do not belong in a plain text file in Git. Encrypt them or supply them safely at deployment.',
  ],
  solution: `
**Why:** the steps of the payroll flow do not change between test and production. Only the settings do. With settings in property files, the same packaged app moves between environments, and no one edits a flow to do it.

**Reading a property**
| Where | Syntax |
|---|---|
| XML, such as a connector configuration | \`\${db.host}\` |
| DataWeave expression | \`#[p('db.host')]\` |

**Choosing the file**
\`\`\`xml
<configuration-properties file="config-\${env}.yaml"/>
\`\`\`
Set \`env\` to \`prod\` at deployment and the app loads \`config-prod.yaml\`.

**What stays out:** passwords and other secrets in plain text. Anyone who can read the repository could read them. Store them encrypted, for example with the Secure Configuration Properties module, or supply them safely at deployment.
`,
  followUps: [
    {
      q: 'If a property is in the file and is also set as a deployment property, which value wins?',
      a: 'The deployment property. Deployment properties sit at the top of the order, above properties loaded from a configuration file. This lets you override a value without rebuilding the app.',
    },
    {
      q: 'Where do property files go in a Mule project?',
      a: 'In src/main/resources. The configuration-properties element then names the file.',
    },
    {
      q: 'Can you use .properties files instead of YAML?',
      a: 'Yes, both work. YAML uses nested keys and .properties uses flat lines such as db.host=value. Pick the one your team finds clearer.',
    },
  ],
}
