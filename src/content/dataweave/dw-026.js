export default {
  id: 'dw-026',
  category: 'dataweave',
  title: 'Merge Tenant Overrides into Default Settings',
  level: 'INTERMEDIATE',
  tags: ['mergeWith', 'dw::core::Objects', 'recursion', 'multiple-inputs'],
  estMinutes: 20,
  description: `
A multi-tenant connector keeps one set of **default settings** (second input \`defaults\`). Each tenant in \`payload\` only stores the settings it wants to change in \`overrides\`. Produce the effective settings per tenant.

**Merge rules**
- A value in \`overrides\` replaces the default value with the same key.
- When **both** the default and the override value are **objects**, merge them key by key using these same rules (at any depth).
- Arrays are **replaced**, never concatenated.
- An override value of \`null\` means "not set" — the default is kept.
- Keys that exist only in \`overrides\` are added.
- A missing \`overrides\` field means no overrides.

Output one \`{ tenant, settings }\` object per tenant, in input order. (Key order inside \`settings\` is not graded.)
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  {
    "tenant": "acme",
    "overrides": {
      "timeoutMs": 60000,
      "retry": { "maxAttempts": 5 },
      "http": { "headers": { "X-Tenant": "acme" } }
    }
  },
  {
    "tenant": "globex",
    "overrides": {
      "logLevel": null,
      "allowedCountries": ["FR"],
      "http": { "port": 8443 },
      "featureFlags": { "betaPricing": true }
    }
  },
  { "tenant": "initech" }
]`,
    },
    {
      name: 'defaults',
      mime: 'application/json',
      content: `{
  "timeoutMs": 30000,
  "logLevel": "INFO",
  "retry": { "maxAttempts": 3, "backoffMs": 1000 },
  "http": {
    "host": "api.partner.com",
    "port": 443,
    "headers": { "Accept": "application/json", "X-Client": "mule" }
  },
  "allowedCountries": ["NL", "DE"]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "tenant": "acme",
    "settings": {
      "timeoutMs": 60000,
      "logLevel": "INFO",
      "retry": { "maxAttempts": 5, "backoffMs": 1000 },
      "http": {
        "host": "api.partner.com",
        "port": 443,
        "headers": { "Accept": "application/json", "X-Client": "mule", "X-Tenant": "acme" }
      },
      "allowedCountries": ["NL", "DE"]
    }
  },
  {
    "tenant": "globex",
    "settings": {
      "timeoutMs": 30000,
      "logLevel": "INFO",
      "retry": { "maxAttempts": 3, "backoffMs": 1000 },
      "http": {
        "host": "api.partner.com",
        "port": 8443,
        "headers": { "Accept": "application/json", "X-Client": "mule" }
      },
      "allowedCountries": ["FR"],
      "featureFlags": { "betaPricing": true }
    }
  },
  {
    "tenant": "initech",
    "settings": {
      "timeoutMs": 30000,
      "logLevel": "INFO",
      "retry": { "maxAttempts": 3, "backoffMs": 1000 },
      "http": {
        "host": "api.partner.com",
        "port": 443,
        "headers": { "Accept": "application/json", "X-Client": "mule" }
      },
      "allowedCountries": ["NL", "DE"]
    }
  }
]`,
  },
  starterCode: `%dw 2.0
import mergeWith from dw::core::Objects
output application/json
---
payload
`,
  hints: [
    '`a mergeWith b` (from `dw::core::Objects`) returns `a` with every key of `b` added or replaced — but only at the **top level**.',
    'Prepare the override before merging: drop null values with `filterObject`, and for keys where both sides are objects, replace the override value with a recursive merge.',
    'A recursive function: `fun deepMerge(base: Object, over: Object): Object = base mergeWith (over ... mapObject (v, k) -> { (k): if (v is Object and base[k] is Object) deepMerge(base[k], v) else v })`.',
  ],
  solution: `%dw 2.0
import mergeWith from dw::core::Objects
output application/json

fun deepMerge(base: Object, over: Object): Object =
  base mergeWith (
    over
      filterObject ((v) -> v != null)
      mapObject (v, k) -> {
        (k): if (v is Object and base[k] is Object) deepMerge(base[k], v) else v
      }
  )
---
payload map (t) -> {
  tenant: t.tenant,
  settings: deepMerge(defaults, t.overrides default {})
}`,
  explanation: `
\`mergeWith\` is a **shallow** merge: \`{ http: {host, port, headers} } mergeWith { http: { port: 8443 } }\` returns \`http: { port: 8443 }\` — host and headers are lost. That is the main trap, and the reason the solution recurses whenever both sides hold an object.

\`++\` is even worse for this job: it keeps **both** keys, so the JSON would contain \`timeoutMs\` twice.

The null rule is handled by \`filterObject\` before merging — \`{ logLevel: "INFO" } mergeWith { logLevel: null }\` would otherwise produce \`logLevel: null\`.

Arrays are not objects, so \`v is Object\` is false for them and the override array simply replaces the default one.
`,
  tests: [
    {
      name: 'Null deep inside a nested override, new nested key',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "tenant": "t1", "overrides": { "retry": { "maxAttempts": null, "jitter": true }, "http": { "headers": { "Accept": "text/xml" } } } }]',
        },
        {
          name: 'defaults',
          mime: 'application/json',
          content:
            '{ "retry": { "maxAttempts": 3, "backoffMs": 1000 }, "http": { "host": "h", "headers": { "Accept": "application/json" } } }',
        },
      ],
      expected:
        '[{ "tenant": "t1", "settings": { "retry": { "maxAttempts": 3, "backoffMs": 1000, "jitter": true }, "http": { "host": "h", "headers": { "Accept": "text/xml" } } } }]',
    },
    {
      name: 'Override replaces an object with a scalar',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "tenant": "t2", "overrides": { "retry": false, "tags": [] } }]',
        },
        {
          name: 'defaults',
          mime: 'application/json',
          content: '{ "retry": { "maxAttempts": 3 }, "tags": ["a", "b"] }',
        },
      ],
      expected: '[{ "tenant": "t2", "settings": { "retry": false, "tags": [] } }]',
    },
  ],
  followUps: [
    {
      q: 'Why not just use `defaults ++ overrides`?',
      a: '`++` on objects concatenates fields, so duplicate keys appear twice in the output instead of being replaced. `mergeWith` replaces matching keys.',
    },
    {
      q: 'How would you also let a tenant explicitly remove a default setting?',
      a: 'Agree on a marker value (for example `"__REMOVE__"`) and filter those keys out after merging with `filterObject ($ != "__REMOVE__")`, applied recursively — `null` cannot be used because it already means "not set".',
    },
    {
      q: 'Where would the defaults typically come from in a Mule app?',
      a: 'From a properties/YAML file, a config Object Store, or a config API cached at startup. Reading them once into a variable avoids repeating that work for every tenant.',
    },
  ],
}
