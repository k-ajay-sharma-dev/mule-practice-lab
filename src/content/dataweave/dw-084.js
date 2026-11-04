export default {
  id: 'dw-084',
  category: 'dataweave',
  title: 'Convert Annotated JSON to XML with Attributes and CDATA',
  level: 'EXPERT',
  tags: ['json', 'xml', 'data-formats', 'cdata', 'attributes', 'recursion', 'dynamic-keys'],
  estMinutes: 40,
  description: `
A legacy case management system accepts about 40 different XML messages. Instead of writing one mapping per message, the integration team agreed a convention: front-end teams send JSON with small annotations, and one generic DataWeave script turns any such document into XML.

**Convention**
- The input is an object with exactly one key, which is the root element.
- A key starting with \`@\` is an **attribute** of the enclosing element: \`"@id": "C-100"\` gives \`id="C-100"\`.
- \`#text\` holds the text of an element that also has attributes. Normal XML escaping applies.
- \`#cdata\` holds text that must be written as a **CDATA** section, with or without attributes.
- An element has \`#text\`, \`#cdata\` or child elements, never a mix of them.
- Any other key is a **child element**, in the order of the input:
  - a string, number or boolean is the element's text;
  - \`null\` gives an empty element;
  - an object is an element with its own content, following the same rules;
  - an **array** repeats the element once per item, and an empty array writes nothing. Items are never arrays themselves.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "CreateCase": {
    "@channel": "PORTAL",
    "@version": 2,
    "Customer": { "@id": "C-100", "#text": "Stevens & Sons" },
    "Subject": "Refund for order SO-77 & SO-78",
    "Body": { "#cdata": "<p>Please refund & confirm.</p>" },
    "Tag": ["billing", "refund"],
    "Line": [
      { "@no": 1, "Sku": "A-1", "Qty": 2 },
      { "@no": 2, "Sku": "B-7", "Qty": 1 }
    ],
    "Attachment": [],
    "Reference": null,
    "Urgent": false
  }
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<CreateCase channel="PORTAL" version="2">
  <Customer id="C-100">Stevens &amp; Sons</Customer>
  <Subject>Refund for order SO-77 &amp; SO-78</Subject>
  <Body><![CDATA[<p>Please refund & confirm.</p>]]></Body>
  <Tag>billing</Tag>
  <Tag>refund</Tag>
  <Line no="1">
    <Sku>A-1</Sku>
    <Qty>2</Qty>
  </Line>
  <Line no="2">
    <Sku>B-7</Sku>
    <Qty>1</Qty>
  </Line>
  <Reference/>
  <Urgent>false</Urgent>
</CreateCase>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
payload
`,
  hints: [
    'Split an object into three views with `filterObject`: keys starting with `@`, the special `#` keys, and the rest. Remember that keys are of type Key, so use `k as String` before `startsWith`.',
    'Attribute names need the `@` removed: `o filterObject (...) mapObject ((v, k) -> { ((k as String)[1 to -1]): v })`.',
    'A dynamic element name with dynamic attributes is written `{ (name) @((attrs)): content }`. The double parentheses spread an object into attributes.',
    '`as CData` marks a string for the XML writer: `o["#cdata"] as CData`.',
    'Repeated elements are repeated keys. Have one function return a list of single-key objects for a key, and spread all of them into the parent with `{ (list) }`.',
  ],
  solution: `%dw 2.0
output application/xml

fun attributes(o: Object) =
  (o filterObject ((v, k) -> (k as String) startsWith "@"))
    mapObject ((v, k) -> { ((k as String)[1 to -1]): v })

fun children(o: Object) =
  o filterObject ((v, k) -> not (((k as String) startsWith "@") or ((k as String) startsWith "#")))

fun content(o: Object) =
  if (namesOf(o) contains "#cdata") o["#cdata"] as CData
  else if (namesOf(o) contains "#text") o["#text"]
  else elements(children(o))

fun element(name: String, value) = value match {
  case o is Object -> { (name) @((attributes(o))): content(o) }
  else -> { (name): value }
}

fun elements(o: Object) = {
  (flatten(o pluck ((v, k) -> v match {
    case items is Array -> items map ((item) -> element(k as String, item))
    else -> [element(k as String, v)]
  })))
}
---
elements(payload)`,
  explanation: `
**XML has three things JSON lacks.** Attributes, CDATA and repeated elements have no JSON equivalent, which is why the convention exists. Each one maps to a specific DataWeave construct:

| Convention | DataWeave |
|---|---|
| \`@name\` keys | the dynamic attribute list \`@((object))\` on a key |
| \`#cdata\` | \`as CData\`, a type that makes the writer emit a CDATA block |
| array value | repeated keys, produced by spreading a list of single-key objects |

**Repeated keys.** A DataWeave object can hold the same key twice, which is exactly how the XML writer gets repeated elements. \`elements\` returns one single-key object per occurrence, and the \`{ ( ... ) }\` spread merges them while keeping duplicates and order. An empty array contributes nothing, so \`Attachment\` is not written.

**Mutual recursion.** \`element\` handles one element and \`content\` decides what goes inside it, which for ordinary objects is \`elements\` again. Each function has one job, and the nesting depth of the message does not matter.

**Escaping is the writer's job.** \`Stevens & Sons\` is passed as plain text and the writer produces \`&amp;\`. Inside a CDATA block the writer leaves the \`&\` and the \`<p>\` as they are. Escaping by hand would double-escape the text.

**Null.** \`{ (name): null }\` gives an empty element by default. If a null should disappear instead, the XML writer property \`skipNullOn="everywhere"\` removes it without a change to the script.
`,
  tests: [
    {
      name: 'CDATA with attributes, repeated CDATA items and a nested root',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "Envelope": { "Note": [ { "@lang": "nl", "#cdata": "a < b" }, { "@lang": "en", "#cdata": "c > d & e" } ], "Meta": { "Owner": { "Team": { "@code": "T1", "#text": "Claims" } } } } }',
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<Envelope>
  <Note lang="nl"><![CDATA[a < b]]></Note>
  <Note lang="en"><![CDATA[c > d & e]]></Note>
  <Meta>
    <Owner>
      <Team code="T1">Claims</Team>
    </Owner>
  </Meta>
</Envelope>`,
    },
    {
      name: 'Attributes only, and null items in an array',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "Ping": { "@id": "p-1", "@ok": true, "Slot": [ null, 3, { "@free": false, "Name": "B" } ] } }',
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<Ping id="p-1" ok="true">
  <Slot/>
  <Slot>3</Slot>
  <Slot free="false">
    <Name>B</Name>
  </Slot>
</Ping>`,
    },
  ],
  followUps: [
    {
      q: 'A #cdata value contains the text "]]>". Why is this a concern?',
      a: 'That sequence ends a CDATA section, so copying it in unchanged would produce broken XML. Run through this site\'s runner, the DataWeave writer splits the text into two adjacent CDATA sections, which stays valid and reads back as the same text. A hand-built string template would not get that protection, which is one more reason to use `as CData` instead of concatenating markers.',
    },
    {
      q: 'When is a generic converter like this the wrong choice?',
      a: 'When the target has a strict schema with fixed element order, namespaces or required elements. The convention moves all of that responsibility to the sender, so validate the result against the XSD or write an explicit mapping for those messages.',
    },
  ],
}
