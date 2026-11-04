export default {
  id: 'ms-035',
  category: 'mulesoft',
  title: 'Reusable DataWeave Modules and External .dwl Files',
  level: 'INTERMEDIATE',
  tags: ['dataweave', 'modules', 'reuse', 'resources'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'You create `src/main/resources/dw/common/Utils.dwl`. What is its module name?',
      options: ['`dw.common.Utils`', '`dw::common::Utils`', '`Utils`', '`classpath://dw/common/Utils`'],
      answer: 1,
      explain: 'The path under `src/main/resources` becomes the module name with `::` separators.',
    },
    {
      type: 'match',
      prompt: 'Match each import form to how you then call `maskCard`.',
      pairs: [
        ['`import dw::common::Utils`', '`Utils::maskCard(...)`'],
        ['`import * from dw::common::Utils`', '`maskCard(...)` — every function is in scope'],
        ['`import maskCard, mapStatus from dw::common::Utils`', '`maskCard(...)` — only the named functions are in scope'],
      ],
      explain: 'Importing the module keeps calls qualified; `import * from` or a named list brings functions into scope directly.',
    },
    {
      type: 'multi',
      prompt: 'Which of these are allowed in a DataWeave **module** file?',
      options: ['`fun` declarations', '`var` declarations', '`type` declarations', 'An `output application/json` directive', 'A body after `---`'],
      answer: [0, 1, 2],
      explain: 'A module is a library: declarations (fun, var, type, ns) and imports only. No `output` directive and no body.',
    },
    {
      type: 'single',
      prompt: 'How do you move the whole Transform Message script out of the XML?',
      options: [
        '`<ee:set-payload resource="dw/orders/toErp.dwl"/>`',
        '`<ee:transform file="toErp.dwl"/>`',
        '`#[readUrl("toErp.dwl")]` in Set Payload',
        'It is not possible; scripts must be inline',
      ],
      answer: 0,
      explain: 'The `resource` attribute references an external script, which keeps the XML readable, gives clean diffs and makes the script testable.',
    },
    {
      type: 'single',
      prompt: 'Where should the 200-entry country lookup live and how is it loaded?',
      options: [
        'Inline in both scripts, so each can change independently',
        'In `src/main/resources/data/countries.json`, loaded once in the module with `readUrl("classpath://data/countries.json", "application/json")`',
        'In a flow variable set at startup by a Scheduler',
        'In `mule-artifact.json`',
      ],
      answer: 1,
      explain: 'Keeping it in one file, loaded in the shared module, gives one definition — the exact problem that caused the missed status update.',
    },
    {
      type: 'single',
      prompt: 'Five Mule applications need the same functions. What is the best way to share them?',
      options: [
        'Copy the .dwl file into each project',
        'Package them as a DataWeave library (or shared Maven artifact), publish it to Exchange, and add a versioned dependency in each app',
        'Put them in a Mule domain on CloudHub',
        'Call one app over HTTP for every transformation',
      ],
      answer: 1,
      explain: 'A versioned library dependency gives one source of truth and controlled upgrades; copying recreates the drift problem.',
    },
  ],
  description: `
Across 12 Transform Message components in a **Customer Process API**, the same logic is copy-pasted:

- masking a card number (\`**** **** **** 1234\`),
- formatting dates to ISO-8601 in UTC,
- mapping internal status codes (\`A\`, \`I\`, \`S\`) to \`ACTIVE\`, \`INACTIVE\`, \`SUSPENDED\`.

Last week the status mapping was updated in 9 places and missed in 3. A lookup table of 200 country codes is also pasted inline in two scripts.

**Questions**
1. How do you create a DataWeave module in a Mule project and import it?
2. What may a module contain, and what is not allowed in it?
3. How do you move whole transformation scripts out of the XML?
4. How do you load the country lookup from a file in resources?
5. How would you share these functions across **several** Mule applications?
`,
  answerTemplate: `## Creating and importing a module

## What a module may contain

## External transformation scripts

## Loading a lookup file

## Sharing across applications
`,
  keyPoints: [
    'A module is a .dwl file under src/main/resources; its path becomes the module name with :: separators (dw/common/Utils.dwl → dw::common::Utils).',
    'Import with import dw::common::Utils (then Utils::fn), import * from ..., or import fn from ...',
    'A module contains only declarations (functions, variables, types, namespaces) — no output directive and no body after ---.',
    'Transform Message can reference an external script with resource="dw/orders/toErp.dwl", which keeps XML small and scripts testable.',
    'readUrl("classpath://...") loads static lookup data; for cross-app reuse publish a DataWeave library to Exchange or a shared Maven artifact.',
  ],
  solution: `
**Create and import** — file \`src/main/resources/dw/common/Utils.dwl\`:
\`\`\`dataweave
%dw 2.0

var statusMap = { A: "ACTIVE", I: "INACTIVE", S: "SUSPENDED" }

fun maskCard(card: String): String =
  "**** **** **** " ++ card[-4 to -1]

fun toIsoUtc(d: DateTime): String =
  (d >> "UTC") as String { format: "yyyy-MM-dd'T'HH:mm:ss'Z'" }

fun mapStatus(code: String): String = statusMap[code] default "UNKNOWN"
\`\`\`
Using it:
\`\`\`dataweave
%dw 2.0
import dw::common::Utils
output application/json
---
{
  card: Utils::maskCard(payload.cardNumber),
  status: Utils::mapStatus(payload.status)
}
\`\`\`
Alternatives: \`import * from dw::common::Utils\` (call \`maskCard(...)\` directly) or \`import maskCard, mapStatus from dw::common::Utils\`.

**What a module may contain:** \`fun\`, \`var\`, \`type\`, \`ns\` declarations and other imports. It must **not** have an \`output\` directive or a body after \`---\` — it is a library, not a script.

**External scripts**
\`\`\`xml
<ee:transform>
  <ee:message>
    <ee:set-payload resource="dw/orders/toErp.dwl"/>
  </ee:message>
</ee:transform>
\`\`\`
Keeps the XML readable, gives clean diffs, and lets you unit-test the script.

**Lookup file** — \`src/main/resources/data/countries.json\`:
\`\`\`dataweave
var countries = readUrl("classpath://data/countries.json", "application/json")
\`\`\`
Define it in the module so every script shares one definition.

**Across applications:** package the modules as a **DataWeave library** (built with the DataWeave tooling for VS Code) and publish it to Exchange, or package them in a shared Maven artifact; each app adds a versioned dependency. Version it with semver like any other asset.
`,
  followUps: [
    {
      q: 'Can you use a module function inside an inline expression, e.g. in a Logger?',
      a: 'Yes. An inline expression can contain a full header, for example #[import dw::common::Utils --- Utils::maskCard(payload.cardNumber)].',
    },
    {
      q: 'Why should module names avoid clashing with built-in modules?',
      a: 'Built-in modules live under dw:: (dw::core::Strings etc.). Using your own top-level folder such as com/acme or a distinct dw subfolder avoids confusion and accidental shadowing.',
    },
    {
      q: 'How do you unit-test a DataWeave module?',
      a: 'With MUnit tests that call a transform using the module, or with the DataWeave testing framework in the VS Code tooling, asserting outputs for sample inputs.',
    },
  ],
}
