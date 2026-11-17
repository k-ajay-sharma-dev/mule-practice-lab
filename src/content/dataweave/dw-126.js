export default {
  id: 'dw-126',
  category: 'dataweave',
  title: 'Build a Search URL with Encoded Query Parameters',
  level: 'INTERMEDIATE',
  tags: ['encodeURIComponent', 'dw::core::URL', 'pluck', 'filterObject', 'joinBy', 'strings', 'json'],
  estMinutes: 15,
  description: `
A shop's mobile app sends its search filters to a Mule API as JSON. The API must call a partner search service with the filters in the query string of the URL.

The filter values come from shoppers, so they can hold spaces, slashes and \`&\`. Written into a URL as they are, a value such as \`salt & pepper\` would cut the query string in two.

Output one object with a \`url\` field:

- Start with \`baseUrl\`.
- Add \`?\` and then one \`name=value\` pair for each filter, joined with \`&\`, in the order the filters arrive.
- Leave out any filter whose value is \`null\`.
- Encode each value with \`encodeURIComponent\` from \`dw::core::URL\`. Numbers and booleans are written as text first.
- When no filter is left, the URL is \`baseUrl\` with no \`?\`.

The filter names are plain words, so they do not need encoding.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "baseUrl": "https://search.example.com/products",
  "filters": {
    "q": "red shoes",
    "size": 42,
    "brand": null,
    "colour": "dark/red",
    "inStockOnly": true
  }
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "url": "https://search.example.com/products?q=red%20shoes&size=42&colour=dark%2Fred&inStockOnly=true"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  url: payload.baseUrl
}
`,
  hints: [
    'Import the function above the `---` line: `import encodeURIComponent from dw::core::URL`.',
    '`filterObject` keeps the entries of an object that match a condition. Use it to drop the `null` values.',
    '`pluck ((value, key) -> ...)` turns each entry into one item of an array. Build `"name=value"` there, with `key as String` and `encodeURIComponent(value as String)`.',
    'Join the pairs with `joinBy "&"`, and use `isEmpty` to decide whether to add the `?`.',
  ],
  solution: `%dw 2.0
import encodeURIComponent from dw::core::URL
output application/json
var pairs = payload.filters
  filterObject ((value) -> value != null)
  pluck ((value, key) -> (key as String) ++ "=" ++ encodeURIComponent(value as String))
---
{
  url: if (isEmpty(pairs)) payload.baseUrl
       else payload.baseUrl ++ "?" ++ (pairs joinBy "&")
}`,
  explanation: `
The work happens in three steps:

1. \`filterObject\` removes \`brand\`, because its value is \`null\`.
2. \`pluck\` walks the remaining entries and returns an array such as \`["q=red%20shoes", "size=42", ...]\`. The key is a Key value in DataWeave, so \`key as String\` makes it text before \`++\`. The value is turned into text with \`as String\`, so \`42\` becomes \`"42"\` and \`true\` becomes \`"true"\`.
3. \`joinBy "&"\` glues the pairs together.

\`encodeURIComponent\` replaces every character that has a meaning in a URL. A space becomes \`%20\`, \`/\` becomes \`%2F\` and \`&\` becomes \`%26\`. Without it, \`dark/red\` could be read as part of the path, and \`salt & pepper\` would start a new parameter called \` pepper\`.

The \`isEmpty\` check stops a URL that ends in a bare \`?\`. Many servers accept that, but some signature checks and caches treat it as a different URL.
`,
  tests: [
    {
      name: 'A value with an ampersand',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "baseUrl": "https://search.example.com/products", "filters": { "q": "salt & pepper", "page": 2 } }',
        },
      ],
      expected: '{ "url": "https://search.example.com/products?q=salt%20%26%20pepper&page=2" }',
    },
    {
      name: 'Every filter is null',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "baseUrl": "https://search.example.com/products", "filters": { "q": null, "size": null } }',
        },
      ],
      expected: '{ "url": "https://search.example.com/products" }',
    },
    {
      name: 'No filters at all',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "baseUrl": "https://search.example.com/products", "filters": {} }' }],
      expected: '{ "url": "https://search.example.com/products" }',
    },
  ],
  followUps: [
    {
      q: 'In a Mule flow, is there a better place for these parameters than a hand-built URL?',
      a: 'Yes. The HTTP Request operation has a query parameters section that takes a DataWeave object, and it encodes the values for you. Building the URL by hand is useful when the full URL must be logged, signed or passed on to another system.',
    },
    {
      q: 'What is the difference between `encodeURIComponent` and `encodeURI`?',
      a: '`encodeURI` is meant for a whole URL, so it leaves characters such as `/`, `?`, `&` and `=` alone. `encodeURIComponent` is meant for one piece, such as a single value, so it encodes those characters too.',
    },
    {
      q: 'How would you send a filter that has several values, such as two colours?',
      a: 'Decide the format with the partner first. A common one repeats the name: `colour=red&colour=blue`. In DataWeave you can map an array value to one pair per item and then flatten the result before `joinBy`.',
    },
  ],
}
