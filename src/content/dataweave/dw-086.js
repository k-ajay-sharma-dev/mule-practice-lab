export default {
  id: 'dw-086',
  category: 'dataweave',
  title: 'Convert a YAML API Inventory to NDJSON Lines',
  level: 'INTERMEDIATE',
  tags: ['yaml', 'ndjson', 'json', 'data-formats', 'write', 'flatMap'],
  estMinutes: 20,
  description: `
The platform team keeps its API inventory in a YAML file in version control, about 180 APIs. A search index needs the same data as **NDJSON** (newline-delimited JSON): one complete JSON object per line, and no enclosing array, so the indexer can load the file line by line.

The input is real YAML, read by the YAML reader. In Mule you would normally write the result with \`output application/x-ndjson\`. **The DataWeave CLI behind this site does not include that writer**, so here you build the lines yourself as \`text/plain\`, which also shows what the format really is.

**Input**: \`defaults\` holds \`tier\` and \`timeoutMs\`. \`apis\` is a list, and each API has \`name\`, \`version\`, \`owner\`, an optional \`environments\` list, and optional \`tier\` and \`timeoutMs\` overrides.

**Output**: one line per API **and** environment, following the file order.
- Each line is one record written by the JSON writer with \`indent: false\`, with the keys in this order: \`id\`, \`api\`, \`version\`, \`env\`, \`owner\`, \`tier\`, \`timeoutMs\`. That writer keeps a space after each colon, as the expected output shows, and the output is compared as text.
- \`id\` is the API name, a hyphen and the environment.
- \`tier\` and \`timeoutMs\` use the API's own value when present, otherwise the value in \`defaults\`.
- An API with no environments, or an empty list, produces no lines.
- Lines are separated by a single \`\\n\`, with no trailing empty line.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/yaml',
      content: `defaults:
  tier: silver
  timeoutMs: 30000
apis:
  - name: orders-papi
    version: v2
    owner: team-orders
    timeoutMs: 15000
    environments:
      - dev
      - prod
  - name: stock-sapi
    version: v1
    owner: team-wms
    tier: gold
    environments: [prod]
  - name: legacy-bridge
    version: v1
    owner: team-integration
    environments: []
`,
    },
  ],
  expected: {
    mime: 'text/plain',
    content: `{"id": "orders-papi-dev","api": "orders-papi","version": "v2","env": "dev","owner": "team-orders","tier": "silver","timeoutMs": 15000}
{"id": "orders-papi-prod","api": "orders-papi","version": "v2","env": "prod","owner": "team-orders","tier": "silver","timeoutMs": 15000}
{"id": "stock-sapi-prod","api": "stock-sapi","version": "v1","env": "prod","owner": "team-wms","tier": "gold","timeoutMs": 30000}`,
  },
  starterCode: `%dw 2.0
output text/plain
---
write(payload, "application/json")
`,
  hints: [
    'After reading, YAML is ordinary DataWeave data: `payload.apis` is an array and `payload.defaults.tier` is a value.',
    'One API gives several records, so use `flatMap` over the APIs with a `map` over the environments inside it. Add `default []` for APIs with no `environments` key.',
    '`a.tier default payload.defaults.tier` covers the override.',
    '`write(record, "application/json", { indent: false })` turns one record into a single-line JSON string. Then `joinBy "\\n"` joins the lines.',
  ],
  solution: `%dw 2.0
output text/plain

var defaults = payload.defaults

var records = (payload.apis default []) flatMap ((a) ->
  (a.environments default []) map ((e) -> {
    id: a.name ++ "-" ++ e,
    api: a.name,
    version: a.version,
    env: e,
    owner: a.owner,
    tier: a.tier default defaults.tier,
    timeoutMs: a.timeoutMs default defaults.timeoutMs
  })
)
---
(records map ((r) -> write(r, "application/json", { indent: false }))) joinBy "\\n"`,
  explanation: `
**YAML is just another reader.** Once the reader has parsed the file, the script sees objects, arrays, strings, numbers and booleans, the same as for JSON. Block lists (\`- dev\`) and inline lists (\`[prod]\`) give the same array, and \`timeoutMs: 15000\` is already a number.

**NDJSON is not a JSON document.** The whole file is not valid JSON, because it has several top-level values and no enclosing array. Each *line* is valid JSON. That is the point of the format: a consumer can process one line at a time without holding the file in memory, and a broken line damages only that line.

**\`write\` inside a script.** \`write\` runs a writer on a value and returns a String. \`{ indent: false }\` is the JSON writer property that compresses the output into a single line, so each record becomes one line of text. It removes the line breaks and indentation, but the space after each colon stays, which is harmless because JSON ignores that whitespace. \`output text/plain\` then prints the joined text without adding quotes around it.

**One to many.** \`flatMap\` combines the inner lists into one flat list. An API without environments contributes an empty list and disappears, which needs no special case. The \`default []\` handles the key being absent altogether.

**In Mule.** The DataWeave documentation lists \`application/x-ndjson\` as a format with its own reader and writer properties, so on a Mule runtime you would use that output type rather than building lines by hand. The manual version here exists because this site's CLI rejects that output type.
`,
  tests: [
    {
      name: 'Override both values, missing environments key',
      inputs: [
        {
          name: 'payload',
          mime: 'application/yaml',
          content: `defaults:
  tier: bronze
  timeoutMs: 5000
apis:
  - name: billing-eapi
    version: v3
    owner: team-finance
    tier: platinum
    timeoutMs: 60000
    environments:
      - test
  - name: docs-sapi
    version: v1
    owner: team-web
`,
        },
      ],
      expected:
        '{"id": "billing-eapi-test","api": "billing-eapi","version": "v3","env": "test","owner": "team-finance","tier": "platinum","timeoutMs": 60000}',
    },
    {
      name: 'Quoted YAML values and inline lists',
      inputs: [
        {
          name: 'payload',
          mime: 'application/yaml',
          content: `defaults: { tier: "silver", timeoutMs: 1000 }
apis:
  - { name: "a-api", version: "v1", owner: "team: core", environments: [dev, test, prod] }
`,
        },
      ],
      expected: `{"id": "a-api-dev","api": "a-api","version": "v1","env": "dev","owner": "team: core","tier": "silver","timeoutMs": 1000}
{"id": "a-api-test","api": "a-api","version": "v1","env": "test","owner": "team: core","tier": "silver","timeoutMs": 1000}
{"id": "a-api-prod","api": "a-api","version": "v1","env": "prod","owner": "team: core","tier": "silver","timeoutMs": 1000}`,
    },
  ],
  followUps: [
    {
      q: 'You receive NDJSON in Mule and a few lines are corrupt. Which reader property helps, and what is the catch?',
      a: 'Set `skipInvalid=true` on the `application/x-ndjson` reader, which ignores invalid lines (the default is false). The catch is that those records vanish silently, so compare the number of lines with the number of records if you need to know about them.',
    },
    {
      q: 'Why does a generated YAML file from DataWeave start with extra lines, and how do you remove them?',
      a: 'The YAML writer adds a header declaration by default. Set the writer property `writeDeclaration=false` to leave it out.',
    },
  ],
}
