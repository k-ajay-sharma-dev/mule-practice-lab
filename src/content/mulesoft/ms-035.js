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
      detail: true,
      prompt: 'Two Transform scripts start with `import * from dw::common::Utils`. Where must the module file be for the import to resolve?',
      options: [
        '`src/main/mule/dw/common/Utils.dwl`, next to the flow XML files',
        '`src/main/resources/Utils.dwl`, since the import finds it by file name',
        '`src/main/resources/dw/common/Utils.dwl`, matching the import path',
        '`src/main/java/dw/common/Utils.dwl`, so it is compiled with the classes',
      ],
      answer: 2,
      explain: 'The path under `src/main/resources` becomes the module name with `::` separators, so `dw::common::Utils` is `dw/common/Utils.dwl` on the class path. The import does not search by file name alone, and `src/main/mule` holds flow XML, not resources.',
    },
    {
      type: 'match',
      prompt: 'Match each import form to how you then call `maskCard`.',
      pairs: [
        ['`import dw::common::Utils`', '`Utils::maskCard(...)`'],
        ['`import * from dw::common::Utils`', '`maskCard(...)`: every function is in scope'],
        ['`import maskCard, mapStatus from dw::common::Utils`', '`maskCard(...)`: only the named functions are in scope'],
      ],
      explain: 'Importing the module keeps calls qualified; `import * from` or a named list brings functions into scope directly.',
    },
    {
      type: 'single',
      prompt: 'A developer copies a working Transform script into `Utils.dwl` to share its functions. The file keeps `%dw 2.0`, `output application/json`, the `fun` declarations and a body after `---`. Importing scripts now fail. What must change?',
      options: [
        'Remove the `%dw 2.0` header, which only a top-level script may have',
        'Remove the `output` directive and the body, keeping only declarations',
        'Mark each `fun` with `export`, so other scripts are allowed to import it',
        'Give every importing script the same `output` as the module declares',
      ],
      answer: 1,
      explain: 'A module is a library: declarations (`fun`, `var`, `type`, `ns`) and imports only. It has no `output` directive and no body after `---`. The `%dw 2.0` header is allowed, and every declaration of a module can be imported without an `export` keyword.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A reviewer asks to move the 300-line `toErp` mapping out of the Transform Message XML, into `src/main/resources/dw/orders/toErp.dwl`, so diffs are clean and the script can be tested alone. Which element does that?',
      options: [
        '`<ee:transform file="dw/orders/toErp.dwl"/>` on the Transform itself',
        '`<ee:set-payload script="dw/orders/toErp.dwl"/>` inside the Transform',
        '`<ee:set-payload resource="dw/orders/toErp.dwl"/>` inside the Transform',
        '`#[readUrl("classpath://dw/orders/toErp.dwl")]` in a Set Payload',
      ],
      answer: 2,
      explain: 'The `resource` attribute of `ee:set-payload` references an external script, which keeps the XML readable, gives clean diffs and makes the script testable. `ee:transform` has no `file` attribute and `ee:set-payload` has no `script` attribute. `readUrl` in a Set Payload reads a resource as data, and it is not how a Transform Message references its script.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Where should the 200-entry country lookup live and how is it loaded?',
      options: [
        'Inline in both scripts, so each one can change on its own',
        'In a JSON file in resources, loaded once in the module with `readUrl`',
        'In a flow variable that a Scheduler fills once when the app starts up',
        'In `mule-artifact.json`, which every script can read directly',
      ],
      answer: 1,
      explain: 'Put it in `src/main/resources/data/countries.json` and load it with `readUrl("classpath://data/countries.json", "application/json")` in the shared module. One file gives one definition, which avoids the drift that caused the missed status update.',
    },
    {
      type: 'single',
      prompt: 'Five Mule applications need the same functions. What is the best way to share them?',
      options: [
        'Copy the .dwl file into each of the five projects',
        'Publish a versioned DataWeave library to Exchange and depend on it',
        'Put the functions in a Mule domain shared on CloudHub 2.0',
        'Expose one shared app over HTTP and call it for each transformation',
      ],
      answer: 1,
      explain: 'A versioned library dependency (or a shared Maven artifact) gives one source of truth and controlled upgrades; copying recreates the drift problem.',
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
    'A module contains only declarations (functions, variables, types, namespaces): no output directive and no body after ---.',
    'Transform Message can reference an external script with resource="dw/orders/toErp.dwl", which keeps XML small and scripts testable.',
    'readUrl("classpath://...") loads static lookup data; for cross-app reuse publish a DataWeave library to Exchange or a shared Maven artifact.',
  ],
  solution: `
**Create and import**: file \`src/main/resources/dw/common/Utils.dwl\`:
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

**What a module may contain:** \`fun\`, \`var\`, \`type\`, \`ns\` declarations and other imports. It must **not** have an \`output\` directive or a body after \`---\`: it is a library, not a script.

**External scripts**
\`\`\`xml
<ee:transform>
  <ee:message>
    <ee:set-payload resource="dw/orders/toErp.dwl"/>
  </ee:message>
</ee:transform>
\`\`\`
Keeps the XML readable, gives clean diffs, and lets you unit-test the script.

**Lookup file**: \`src/main/resources/data/countries.json\`:
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
