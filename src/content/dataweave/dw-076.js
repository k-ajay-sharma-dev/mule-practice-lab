export default {
  id: 'dw-076',
  category: 'dataweave',
  title: 'Deep Clean a Customer Profile of Nulls and Empty Values',
  level: 'INTERMEDIATE',
  tags: ['json', 'data-formats', 'recursion', 'match', 'mapObject', 'deep-clean'],
  estMinutes: 20,
  description: `
A customer data platform receives profiles from a CRM System API. The CRM returns every field it knows about, filled or not, and the platform's ingestion endpoint rejects documents that contain empty values. About 400,000 profiles pass through this mapping each night, and the shape differs per source system, so the cleaning must work on **any** JSON structure rather than on a fixed list of fields.

**A value is empty when it is**
- \`null\`
- a string that is empty or contains only whitespace
- an empty object \`{}\` or an empty array \`[]\`

**Rules**
- Remove empty values at **every** level: as object values and as array elements.
- Clean from the inside out. An object or array that becomes empty because of the cleaning is itself empty and is removed too.
- \`0\` and \`false\` are real values and stay.
- Strings that stay are not changed (no trimming).
- The root is always an object. It is kept, even when it ends up as \`{}\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "customerId": "C-20418",
  "email": "m.peeters@example.com",
  "middleName": null,
  "nickname": "   ",
  "loyalty": { "points": 0, "optIn": false, "tier": "" },
  "addresses": [
    { "type": "HOME", "line2": null, "city": "Ghent", "geo": { "lat": null, "lng": null } },
    { "type": null, "line2": "", "city": null }
  ],
  "phones": [],
  "preferences": {
    "channels": [null, "", "EMAIL"],
    "marketing": { "sms": null, "flags": [{}, []] }
  },
  "audit": {}
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "customerId": "C-20418",
  "email": "m.peeters@example.com",
  "loyalty": { "points": 0, "optIn": false },
  "addresses": [
    { "type": "HOME", "city": "Ghent" }
  ],
  "preferences": { "channels": ["EMAIL"] }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write two functions: `isBlankValue(v)` that answers whether a value counts as empty, and a recursive `clean(v)` that uses `match` with `case o is Object`, `case a is Array` and a final `else`.',
    'Clean a child **first** and test the cleaned result. Testing the original value misses `{ "lat": null, "lng": null }`, which only becomes empty after its children are removed.',
    'In `mapObject`, return `{}` to drop a key and `{ (k): cleaned }` to keep it. For arrays, `map` with `clean` and then `filter`.',
    'Match on the type in `isBlankValue` so that numbers and booleans fall through to `false`: `0` and `false` must stay.',
  ],
  solution: `%dw 2.0
output application/json

fun isBlankValue(v) = v match {
  case n is Null -> true
  case s is String -> trim(s) == ""
  case o is Object -> isEmpty(o)
  case a is Array -> isEmpty(a)
  else -> false
}

fun clean(v) = v match {
  case o is Object -> o mapObject ((value, key) -> do {
    var cleaned = clean(value)
    ---
    if (isBlankValue(cleaned)) {} else { (key): cleaned }
  })
  case a is Array -> (a map ((item) -> clean(item))) filter ((item) -> not isBlankValue(item))
  else -> v
}
---
clean(payload)`,
  explanation: `
**Inside out.** The order of the two steps is the whole exercise. \`clean\` first recurses into a child and only then asks whether the *result* is empty. That is why \`geo\` disappears (both coordinates were null) and why the second address disappears (all three fields were empty), leaving one element in \`addresses\`. \`marketing\` shows the same cascade across an array: \`flags\` holds only empty containers, so \`flags\` goes, and then \`marketing\` has nothing left.

**Why \`skipNullOn\` is not enough.** The writer property \`skipNullOn="everywhere"\` omits nulls while writing, but it keeps \`""\` and whitespace, and it leaves behind the containers it empties: \`{ "geo": { "lat": null } }\` is written as \`{ "geo": {} }\`. It is a good fit when only nulls matter. A contract that also rejects empty strings needs a function like this one.

**\`match\` on type.** One \`match\` per function keeps each case small, and \`else -> v\` passes numbers and booleans through, which is what keeps \`0\` and \`false\`.

**Root handling.** The root is cleaned by the same function, but nothing tests it afterwards, so a completely empty profile returns \`{}\` instead of disappearing.
`,
  tests: [
    {
      name: 'Everything empty leaves an empty root',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "a": null, "b": { "c": { "d": [ { "e": "  " } ] } }, "f": [ [], [ {} ] ] }',
        },
      ],
      expected: '{}',
    },
    {
      name: 'Nested arrays keep zero, false and untrimmed text',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "scores": [ [0, false, ""], [[]], [null] ], "label": " keep me ", "rate": 0.0, "active": false }',
        },
      ],
      expected: '{ "scores": [ [0, false] ], "label": " keep me ", "rate": 0.0, "active": false }',
    },
  ],
  followUps: [
    {
      q: 'Removing an empty array element shifts the positions of the elements after it. When is that a problem?',
      a: 'When position carries meaning, for example a fixed list where index 2 is always the third quarter, or when a consumer pairs two arrays by index. In that case keep the placeholders in arrays and clean only object keys.',
    },
    {
      q: 'The target now says an explicit null means "clear this field" on an update. What does this cleaning do to that message?',
      a: 'It removes the instruction: a missing key means "leave unchanged" in most PATCH style APIs, while null means "clear". Cleaning is then only correct on create messages, so the rule has to be chosen per operation rather than applied to every payload.',
    },
  ],
}
