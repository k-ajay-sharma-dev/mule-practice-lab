export default {
  id: 'ms-222',
  category: 'mulesoft',
  title: 'Expressions and Placeholders: #[ ], ${ } and p() and When Each Is Read',
  level: 'BEGINNER',
  tags: ['expressions', 'properties', 'placeholders', 'dataweave', 'configuration', 'energy'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A connector config has `host="${meter.api.host}"`. When is that value filled in?',
      options: [
        'Once, when the application starts',
        'Every time a message reaches the connector',
        'Every time the property file is saved',
        'When the first request fails',
      ],
      answer: 0,
      explain: 'A `${...}` placeholder is replaced with the property value when the app starts. Changing it needs a restart or a redeploy.',
    },
    {
      type: 'single',
      prompt: 'A Logger must print the meter id of each reading. Which value fits?',
      options: ['`${payload.meterId}`', '`#[payload.meterId]`', '`p(payload.meterId)`', '`meterId`'],
      answer: 1,
      explain: '`#[...]` is a DataWeave expression, worked out for each event. A placeholder cannot see the payload.',
    },
    {
      type: 'single',
      prompt: 'Inside a Transform, a script needs the property `tariff.region`. How does it read it?',
      options: ['`${tariff.region}`', '`vars.tariff.region`', '`p(\'tariff.region\')`', '`attributes.tariff.region`'],
      answer: 2,
      explain: 'The `p` function reads a configuration property from inside DataWeave.',
    },
    {
      type: 'single',
      prompt: 'The property `batch.max` is `500`. A script needs it as a number for a calculation. What is the safest way to write it?',
      options: [
        '`p(\'batch.max\')` alone, as `p` returns a Number for 500',
        '`p(\'batch.max\') as String`, so the text is kept as it is',
        '`vars.batch.max`, as Mule copies properties into variables',
        '`p(\'batch.max\') as Number`, converted before the maths',
      ],
      answer: 3,
      explain: 'Property values come back as text. DataWeave can coerce some text by itself, but an explicit `as Number` makes the type clear and fails early on a bad value. Properties are not copied into `vars`.',
    },
    {
      type: 'single',
      prompt: 'The prod property file has no `meter.api.host`, but the HTTP config uses `${meter.api.host}`. What happens on deploy?',
      options: [
        'The app starts and sends requests to localhost',
        'The app fails to start and reports the missing property',
        'The app starts and the value stays as the text ${meter.api.host}',
        'The app starts and the first request raises HTTP:CONNECTIVITY',
      ],
      answer: 1,
      explain: 'A placeholder with no value stops the app from starting. That is a good thing, because the gap shows up on deploy and not on the first customer call.',
    },
    {
      type: 'match',
      prompt: 'Match each form to what it is.',
      pairs: [
        ['${meter.api.host}', 'A property placeholder, filled in when the app starts'],
        ['#[attributes.headers.\'x-region\']', 'A DataWeave expression, worked out for each event'],
        ['p(\'meter.api.host\')', 'A property read from inside a DataWeave script'],
      ],
      explain: 'Placeholders suit settings that differ per environment. Expressions suit values that differ per message. p() brings a setting into a script.',
    },
  ],
  description: `
Northmoor Energy reads smart meters every 30 minutes. A Mule app takes each reading, looks up the tariff for the region, and sends it to billing. The app runs in dev, test and prod, with a property file for each.

A code review found three mistakes:
- A Logger used \`\${payload.meterId}\` and printed nothing useful.
- A script used \`p('batch.max')\` in a calculation without converting it from text.
- A connector had the prod host typed straight into its config, so the test app called prod.

**Questions**
1. What is the difference between \`#[...]\` and \`\${...}\`, and when is each one worked out?
2. When do you use \`p()\`, and what type does it return?
3. What happens if a placeholder has no value?
4. Which settings belong in property files, and which values come from the event?
`,
  answerTemplate: `## #[ ] and \${ }

## The p() function

## A missing property

## Settings or event data
`,
  keyPoints: [
    '#[...] is a DataWeave expression, worked out each time an event reaches it.',
    '${...} is a property placeholder, replaced when the app starts.',
    'A placeholder cannot read the payload, attributes or variables.',
    'p(\'name\') reads a property inside DataWeave. The value is text, so convert it before maths.',
    'A placeholder with no value stops the app from starting.',
    'Hosts, ports, timeouts and limits belong in property files per environment. Ids and amounts come from the event.',
  ],
  solution: `
**1. Two kinds of value.** \`#[...]\` holds DataWeave. Mule works it out for each event, so it can read \`payload\`, \`attributes\` and \`vars\`. \`\${...}\` is a placeholder for a property. Mule replaces it when the app starts, before any event exists. That is why \`\${payload.meterId}\` could never work: there was no property with that name and no payload at start-up.

**2. p().** Inside a script, \`p('tariff.region')\` returns the property value. Properties are text, so write \`p('batch.max') as Number\` before you add to it. That makes the type clear and fails early if the value is not a number. Secure properties are read the same way, with the \`secure::\` prefix in the name.

**3. A missing property.** If a placeholder has no value, the app fails to start and names the property. This is safer than a silent default, because the gap shows up on deploy.

**4. Settings or event data.** The host typed into the connector belongs in \`config-prod.yaml\` and \`config-test.yaml\` as \`meter.api.host\`, with the connector using \`\${meter.api.host}\`. The same artifact then runs in each environment with the right host. The meter id and the reading come from the event, so they use \`#[...]\`.
`,
  followUps: [
    {
      q: 'Which property file does the app load?',
      a: 'A common pattern is a file name built from an environment property, such as `config-${env}.yaml`, with `env` set at deploy time in Runtime Manager or on the command line. The same build then picks up the right file in each environment.',
    },
    {
      q: 'Can you change a property without a redeploy?',
      a: 'Placeholders are filled in at start-up, so a new value needs at least a restart. Values that must change while the app runs belong somewhere the flow reads at run time, such as an Object Store or a config API.',
    },
    {
      q: 'Why not put every setting in a DataWeave variable at the top of the flow?',
      a: 'Then the value lives in the code and changes need a new build. Property files keep the build the same across environments and let operations change a value without touching the code.',
    },
  ],
}
