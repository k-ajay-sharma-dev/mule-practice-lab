export default {
  id: 'dw-050',
  category: 'dataweave',
  title: 'Generic XML to JSON That Keeps Attributes',
  level: 'ADVANCED',
  tags: ['xml', 'attributes', 'recursion', 'pluck', 'generic-transform'],
  estMinutes: 30,
  description: `
You are replacing a legacy ESB that exposed **any** XML document to REST clients as JSON using a fixed convention. Mobile apps already parse that convention, so your Mule API must reproduce it exactly — and it must work for **every** document type, not just the sample (the hidden tests use different XML). The default \`output application/json\` drops all attributes, so you need your own converter.

**Convention**
1. The result is an object with one key: the root element's name.
2. An element **without attributes** becomes
   - its text, if it only contains text;
   - an object of its children, if it contains child elements;
   - \`null\`, if it is empty (\`<x/>\`).
3. An element **with attributes** becomes an object that starts with one key per attribute, named \`"@" + attribute name\` (document order), followed by
   - \`"#text"\`: the text, if it only contains text;
   - its children's keys, if it contains child elements;
   - nothing else, if it is empty.
4. Children with the **same name** are merged into one key whose value is an **array** (document order), placed where the first one appeared. A name that occurs once is **not** wrapped in an array.
5. All values stay strings. Elements never mix text and child elements, and there are no namespaces.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<catalog source="PIM" generated="2026-11-01">
  <product id="P-1" status="active">
    <name lang="en">Desk Lamp</name>
    <price currency="EUR">39.95</price>
    <dimensions unit="cm" width="20" height="45"/>
    <tag>office</tag>
    <tag>lighting</tag>
    <supplier>
      <code>S-9</code>
      <name>Lumo BV</name>
    </supplier>
  </product>
  <product id="P-2" status="draft">
    <name lang="nl">Voetsteun</name>
    <price currency="EUR">24.00</price>
    <tag>ergonomics</tag>
    <discontinued/>
  </product>
</catalog>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "catalog": {
    "@source": "PIM",
    "@generated": "2026-11-01",
    "product": [
      {
        "@id": "P-1",
        "@status": "active",
        "name": { "@lang": "en", "#text": "Desk Lamp" },
        "price": { "@currency": "EUR", "#text": "39.95" },
        "dimensions": { "@unit": "cm", "@width": "20", "@height": "45" },
        "tag": ["office", "lighting"],
        "supplier": { "code": "S-9", "name": "Lumo BV" }
      },
      {
        "@id": "P-2",
        "@status": "draft",
        "name": { "@lang": "nl", "#text": "Voetsteun" },
        "price": { "@currency": "EUR", "#text": "24.00" },
        "tag": "ergonomics",
        "discontinued": null
      }
    ]
  }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'In the XML model, attributes are attached to the element\'s **key**. Inside `obj pluck (value, key) -> ...`, `key.@` is the attribute object of that element (or `null` when it has none), and `typeOf(value)` tells you whether it is a String (text), an Object (children) or Null (empty).',
    'Write two mutually recursive functions: `element(value, attrs)` for one element, and `children(obj)` that converts every child with `pluck` and then merges repeats with `groupBy $.name` — `groupBy` keeps first-appearance order.',
    'In `children`, map the groups back to an object: `groups mapObject (items, name) -> { (name): if (sizeOf(items) > 1) items.value else items[0].value }`. The root is just `children(payload)`.',
  ],
  solution: `%dw 2.0
output application/json

fun children(obj: Object): Object = do {
  var converted = obj pluck (v, k) -> { name: k as String, value: element(v, k.@) }
  ---
  converted groupBy $.name mapObject (items, name) -> {
    (name): if (sizeOf(items) > 1) items.value else items[0].value
  }
}

fun element(v, attrs) = do {
  var attrObj = if (attrs == null) {}
    else attrs mapObject (av, ak) -> { ("@" ++ (ak as String)): av }
  var content = v match {
    case is Object -> children(v)
    case is String -> if (isEmpty(attrObj)) v else { "#text": v }
    else -> null
  }
  ---
  if (isEmpty(attrObj)) content else attrObj ++ (content default {})
}
---
children(payload)`,
  explanation: `
DataWeave's XML model is an object whose **keys carry the attributes** (\`key.@\`) and whose values are a String, an Object of children, or \`null\`. The plain JSON writer serializes only the values, so attributes are silently lost. A generic converter therefore has to walk the tree with \`pluck\` (which exposes the key) and rebuild each level:

- \`element\` decides the shape of one element from two facts: does it have attributes, and is its value text, children or empty.
- \`children\` converts all children, then \`groupBy $.name\` merges repeated names. \`groupBy\` keeps groups in first-appearance order, so \`product\`, \`tag\` etc. stay where they first occurred.
- \`items.value\` collects the converted values of a group — including \`null\`s — into an array.
- Recursion ends naturally at text and empty elements.

Common traps:
- Using \`mapObject\` on the XML object and returning \`{ (k): ... }\` without merging: the JSON gets **duplicate keys** (\`"tag": ..., "tag": ...\`), which most JSON parsers collapse to the last value.
- Forgetting that an empty element **with** attributes (\`<dimensions unit="cm" .../>\`) has a \`null\` value: \`attrObj ++ null\` throws, hence \`content default {}\`.
- \`orderBy\`/\`distinctBy\` on names to find repeats: it reorders keys, and the contract requires document order.
`,
  tests: [
    {
      name: 'Different document type: repeated elements with attributes',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content: `<order number="SO-5">
  <customer>C-1</customer>
  <line sku="A"/>
  <line sku="B">gift wrap</line>
  <line sku="C"/>
  <notes/>
  <shipping><method>DHL</method><address type="home"><city>Utrecht</city></address></shipping>
</order>`,
        },
      ],
      expected:
        '{ "order": { "@number": "SO-5", "customer": "C-1", "line": [ { "@sku": "A" }, { "@sku": "B", "#text": "gift wrap" }, { "@sku": "C" } ], "notes": null, "shipping": { "method": "DHL", "address": { "@type": "home", "city": "Utrecht" } } } }',
    },
    {
      name: 'Root with only text',
      inputs: [{ name: 'payload', mime: 'application/xml', content: '<status>OK</status>' }],
      expected: '{ "status": "OK" }',
    },
  ],
  followUps: [
    {
      q: 'Clients complain that `tag` is sometimes a string and sometimes an array. How do you fix it?',
      a: 'That is the classic weakness of this convention. Either always emit arrays for names known to repeat (pass a list of "array paths" to the function), or always wrap every child in an array. Both change the contract, so version the API.',
    },
    {
      q: 'How would you handle namespaces?',
      a: 'The key also carries its namespace: `k.#` gives the Namespace (with `prefix` and `uri`). You can emit `prefix:name` keys and collect the `xmlns:prefix` declarations as `@xmlns:...` attributes on the element that introduces them.',
    },
    {
      q: 'Is there a cheaper alternative if only one document type is needed?',
      a: 'Yes — a specific mapping with selectors (`payload.catalog.*product map ...`, `$.price.@currency`) is faster, typed and easier to read. A generic converter is only worth it when many document types must follow one convention.',
    },
  ],
}
