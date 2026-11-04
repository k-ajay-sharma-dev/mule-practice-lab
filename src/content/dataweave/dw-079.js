export default {
  id: 'dw-079',
  category: 'dataweave',
  title: 'Report Configuration Drift Between Two JSON Documents',
  level: 'ADVANCED',
  tags: ['json', 'data-formats', 'diff', 'recursion', 'multiple-inputs', 'namesOf'],
  estMinutes: 35,
  description: `
Before each release of a Mule API, the deployment pipeline compares the configuration document it is about to deploy (\`payload\`) with the approved one (\`baseline\`). Reviewers do not want to read two 300-line documents, so the pipeline needs a short report of what differs, using dotted paths to any depth.

**Comparison rules**
- Walk both documents from the root. When a key holds an **object on both sides**, go into it and compare its keys. The path is dotted: \`http.tls.enabled\`.
- A key only in \`payload\` is **added**, and a key only in \`baseline\` is **removed**. It is reported once at that path, with its whole value, without going deeper.
- For anything else present on both sides, compare the two values as a whole. **Arrays are compared as one value**, and so is an object compared with a non-object. If they differ, the key is **changed**.
- A key holding \`null\` **exists**. \`"proxy": null\` compared with no \`proxy\` key is an addition or removal, not "no difference".
- Numbers compare by value, and the order of keys in an object does not matter.

**Output**
- \`added\`: list of \`{ path, value }\`
- \`removed\`: list of \`{ path, value }\` (the baseline value)
- \`changed\`: list of \`{ path, from, to }\`, where \`from\` is the baseline value
- Each list is sorted by \`path\` ascending. Lists with nothing to report are \`[]\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "service": "orders-api",
  "version": "3.5.0",
  "http": {
    "port": 8081,
    "timeoutMs": 30000,
    "tls": { "enabled": true, "minVersion": "1.2", "ciphers": ["TLS_AES_256_GCM_SHA384"] }
  },
  "features": { "bulkImport": false },
  "owners": ["team-orders", "team-platform"],
  "proxy": { "host": "proxy.internal", "port": 3128 },
  "retries": null
}`,
    },
    {
      name: 'baseline',
      mime: 'application/json',
      content: `{
  "service": "orders-api",
  "version": "3.4.0",
  "http": {
    "port": 8081,
    "timeoutMs": 30000,
    "tls": { "enabled": false, "minVersion": "1.2" }
  },
  "features": { "bulkImport": false, "legacyExport": true },
  "owners": ["team-orders"],
  "proxy": null,
  "notes": "approved in CAB-1182"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "added": [
    { "path": "http.tls.ciphers", "value": ["TLS_AES_256_GCM_SHA384"] },
    { "path": "retries", "value": null }
  ],
  "removed": [
    { "path": "features.legacyExport", "value": true },
    { "path": "notes", "value": "approved in CAB-1182" }
  ],
  "changed": [
    { "path": "http.tls.enabled", "from": false, "to": true },
    { "path": "owners", "from": ["team-orders"], "to": ["team-orders", "team-platform"] },
    { "path": "proxy", "from": null, "to": { "host": "proxy.internal", "port": 3128 } },
    { "path": "version", "from": "3.4.0", "to": "3.5.0" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  added: [],
  removed: [],
  changed: []
}
`,
  hints: [
    'Write a recursive `fun diff(base: Object, current: Object, path: String): Array` that returns one flat list of differences, each with a `kind`. Split the list by kind at the end.',
    'Do not test for a missing key with `current[k] == null`: that cannot separate a missing key from a key holding null. Use `namesOf(current) contains k`.',
    'Loop over the distinct names of both sides: `(namesOf(base) ++ namesOf(current)) distinctBy ((k) -> k)`. Each key returns a list, so `flatten` the result.',
    'Only recurse when **both** values are objects (`base[k] is Object and current[k] is Object`). Then compare with `==`.',
    'Put the `filter ... map` in parentheses before `orderBy`, or `orderBy` is applied to the result of the lambda.',
  ],
  solution: `%dw 2.0
output application/json

fun child(path: String, key: String): String =
  if (path == "") key else path ++ "." ++ key

fun diff(base: Object, current: Object, path: String): Array = do {
  var baseKeys = namesOf(base)
  var currentKeys = namesOf(current)
  ---
  flatten(((baseKeys ++ currentKeys) distinctBy ((k) -> k)) map ((k) -> do {
    var p = child(path, k)
    ---
    if (not (baseKeys contains k)) [{ kind: "added", path: p, value: current[k] }]
    else if (not (currentKeys contains k)) [{ kind: "removed", path: p, value: base[k] }]
    else if (base[k] is Object and current[k] is Object) diff(base[k], current[k], p)
    else if (base[k] == current[k]) []
    else [{ kind: "changed", path: p, from: base[k], to: current[k] }]
  }))
}

var all = diff(baseline, payload, "")
---
{
  added: ((all filter ((d) -> d.kind == "added")) map ((d) -> { path: d.path, value: d.value }))
    orderBy ((d) -> d.path),
  removed: ((all filter ((d) -> d.kind == "removed")) map ((d) -> { path: d.path, value: d.value }))
    orderBy ((d) -> d.path),
  changed: ((all filter ((d) -> d.kind == "changed")) map ((d) -> { path: d.path, from: d.from, to: d.to }))
    orderBy ((d) -> d.path)
}`,
  explanation: `
**Presence is not the same as value.** \`obj[k]\` returns \`null\` for a missing key and also for a key holding null, so a value comparison alone calls \`retries\` "no difference". Asking \`namesOf(...) contains k\` answers the real question, and that is what makes \`retries\` an addition and \`proxy\` a change.

**When to go deeper.** The recursion only happens when both sides are objects. Everywhere else the two values are compared whole, so \`proxy\` going from \`null\` to an object is one readable change, not a list of additions under \`proxy\`. The same applies to \`owners\`: arrays have no stable key to align on, so element-by-element reporting would mislead when an item is inserted at the front.

**One list, split at the end.** \`diff\` returns a single flat list tagged with \`kind\`. Each level just concatenates, and the final object splits and sorts. Sorting once at the top is simpler than keeping three lists sorted through the recursion, and the output no longer depends on the key order in either document.

**How this differs from comparing records.** Comparing two record sets (such as product snapshots by SKU) lines up rows by an identifier first. Here there is one document and the identifier is the path.
`,
  tests: [
    {
      name: 'Key order and number format are not differences',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "y": { "q": 2, "p": 1 }, "x": 1.0, "list": [1, 2] }' },
        { name: 'baseline', mime: 'application/json', content: '{ "x": 1, "y": { "p": 1, "q": 2 }, "list": [1, 2] }' },
      ],
      expected: '{ "added": [], "removed": [], "changed": [] }',
    },
    {
      name: 'Null against missing, object against scalar',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "a": 5, "d": { "e": {} }, "n": null }' },
        { name: 'baseline', mime: 'application/json', content: '{ "a": { "b": 1 }, "c": null, "n": null }' },
      ],
      expected:
        '{ "added": [ { "path": "d", "value": { "e": {} } } ], "removed": [ { "path": "c", "value": null } ], "changed": [ { "path": "a", "from": { "b": 1 }, "to": 5 } ] }',
    },
    {
      name: 'Array order is a change, deep paths are dotted',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "a": { "b": { "c": { "d": 2 } } }, "tags": ["y", "x"] }' },
        { name: 'baseline', mime: 'application/json', content: '{ "a": { "b": { "c": { "d": 1 } } }, "tags": ["x", "y"] }' },
      ],
      expected:
        '{ "added": [], "removed": [], "changed": [ { "path": "a.b.c.d", "from": 1, "to": 2 }, { "path": "tags", "from": ["x", "y"], "to": ["y", "x"] } ] }',
    },
  ],
  followUps: [
    {
      q: 'The documents contain passwords. What must change before this report goes into a pull request comment?',
      a: 'Secret values must not appear in `from`, `to` or `value`. Mask them by path or key name, for example reporting only that `db.password` changed. Better still, keep secrets out of these documents and hold only references to them.',
    },
    {
      q: 'Reviewers want array items matched by their name field instead of reported whole. What is the extra design input?',
      a: 'A key per array path, such as `endpoints` matched on `name`. Without that configuration there is no reliable way to align elements. With it, the array becomes an object keyed by that field and the same recursion applies.',
    },
  ],
}
