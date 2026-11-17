export default {
  id: 'dw-127',
  category: 'dataweave',
  title: 'Find the Latest Release of Each Asset by Version Number',
  level: 'INTERMEDIATE',
  tags: ['maxBy', 'groupBy', 'pluck', 'splitBy', 'functions', 'orderBy', 'json'],
  estMinutes: 20,
  description: `
A platform team keeps a list of every release of its shared assets, such as API specs and connectors. A dashboard must show the **latest** version of each asset.

A version has three numbers: \`MAJOR.MINOR.PATCH\`, such as \`1.10.0\`. The last report was wrong. It compared versions as text, and text compares one character at a time, so \`"1.9.2"\` came out higher than \`"1.10.0"\` because \`9\` is higher than \`1\`.

Output an array with one object per asset, sorted by asset name:

- \`asset\`: the asset name
- \`latest\`: the highest version of that asset, compared number by number

Every version has exactly three parts, and each part is below 1000. There are no labels such as \`-beta\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "asset": "orders-sapi", "version": "1.9.2" },
  { "asset": "orders-sapi", "version": "1.10.0" },
  { "asset": "customer-papi", "version": "2.0.1" },
  { "asset": "orders-sapi", "version": "1.2.15" },
  { "asset": "customer-papi", "version": "2.0.10" },
  { "asset": "customer-papi", "version": "1.99.0" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "asset": "customer-papi", "latest": "2.0.10" },
  { "asset": "orders-sapi", "latest": "1.10.0" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
(payload groupBy $.asset) pluck ((releases, asset) -> {
  asset: asset as String,
  latest: (releases maxBy $.version).version
})
`,
  hints: [
    'The starter runs, but `maxBy $.version` compares text. Find the asset where that gives the wrong answer.',
    'Write a function that turns a version into one number you can compare: split it with `splitBy "."`, and turn each part into a Number with `as Number`.',
    'With each part below 1000, `major * 1000000 + minor * 1000 + patch` keeps the order right: any higher major beats every minor and patch.',
    'Finish with `orderBy $.asset` so the result is sorted by name.',
  ],
  solution: `%dw 2.0
output application/json
fun versionKey(version: String): Number = do {
  var parts = version splitBy "."
  ---
  (parts[0] as Number) * 1000000 + (parts[1] as Number) * 1000 + (parts[2] as Number)
}
---
((payload groupBy $.asset) pluck ((releases, asset) -> {
  asset: asset as String,
  latest: (releases maxBy ((release) -> versionKey(release.version))).version
})) orderBy $.asset`,
  explanation: `
\`groupBy $.asset\` builds an object with one key per asset. Its value is the list of releases of that asset. \`pluck\` turns that object back into an array, one item per asset.

The fix is in what \`maxBy\` compares. \`versionKey\` turns \`"1.10.0"\` into \`1010000\` and \`"1.9.2"\` into \`1009002\`. Numbers compare by size, so \`1.10.0\` wins. In the same way \`2.0.10\` becomes \`2000010\` and beats \`2.0.1\`, which is \`2000001\`.

The weights only work because each part is below 1000. A minor of \`1000\` would spill into the major. If you cannot promise that, compare part by part instead, as in the follow up below.

\`maxBy\` returns the whole release, so \`.version\` reads the original text back. The output shows the version as it was written, not the number used to compare it.

\`orderBy $.asset\` sorts the final list. The order of keys after \`groupBy\` is not something to rely on in a report.
`,
  tests: [
    {
      name: 'One asset, a higher major wins over a bigger minor',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "asset": "billing-eapi", "version": "1.999.999" }, { "asset": "billing-eapi", "version": "2.0.0" }, { "asset": "billing-eapi", "version": "1.45.3" }]',
        },
      ],
      expected: '[{ "asset": "billing-eapi", "latest": "2.0.0" }]',
    },
    {
      name: 'An asset with a single release',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "asset": "stock-sapi", "version": "0.1.0" }, { "asset": "audit-lib", "version": "3.4.5" }, { "asset": "stock-sapi", "version": "0.0.9" }]',
        },
      ],
      expected: '[{ "asset": "audit-lib", "latest": "3.4.5" }, { "asset": "stock-sapi", "latest": "0.1.0" }]',
    },
    {
      name: 'An empty list',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'How would you compare versions without a size limit on each part?',
      a: 'Compare part by part. Write a function that takes two versions, checks the majors, then the minors only when the majors are equal, then the patches. Use it in `reduce` to keep the higher of the two at each step.',
    },
    {
      q: 'How should `2.0.0-beta.1` sort against `2.0.0`?',
      a: 'Under semantic versioning, a version with a pre-release label is lower than the same version without one. Split the label off with `splitBy "-"`, compare the numbers first, and only when they match treat the version with no label as higher.',
    },
    {
      q: 'What happens if one release has the version `1.10`?',
      a: '`parts[2]` is `null`, and `null as Number` fails, so the whole script stops. Validate the format first, for example with `matches /[0-9]+\\.[0-9]+\\.[0-9]+/`, and report bad rows instead of failing on them.',
    },
  ],
}
