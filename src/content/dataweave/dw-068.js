export default {
  id: 'dw-068',
  category: 'dataweave',
  title: 'Read a Carrier Manifest XML with Attributes into JSON',
  level: 'BEGINNER',
  tags: ['xml', 'json', 'attributes', 'multi-value-selector', 'ftp'],
  estMinutes: 15,
  description: `
A parcel carrier drops a manifest XML file on an FTP server every evening. A Mule flow picks it up with \`ftp:listener\` and must publish it as JSON to the tracking API.

Most of the data is in **attributes**, and a manifest can contain any number of \`parcel\` elements — including exactly one, or none.

**Rules**
- \`manifestId\`, \`carrier\` and \`shipDate\` come from the attributes of \`manifest\`.
- \`parcels\` is **always an array**, also when the manifest holds a single parcel, and \`[]\` when it holds none.
- \`weightKg\` is a number.
- \`recipient\` is an object with the element text as \`name\` plus its \`city\` and \`country\` attributes.
- \`parcelCount\` is the number of parcels.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<manifest id="MF-2201" carrier="DHL" shipDate="2026-11-02">
  <parcel trackingNo="JD014600003128" weightKg="2.40" service="EXPRESS">
    <recipient city="Utrecht" country="NL">A. de Vries</recipient>
  </parcel>
  <parcel trackingNo="JD014600003129" weightKg="11.75" service="STANDARD">
    <recipient city="Antwerp" country="BE">Kempen Logistics NV</recipient>
  </parcel>
</manifest>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "manifestId": "MF-2201",
  "carrier": "DHL",
  "shipDate": "2026-11-02",
  "parcelCount": 2,
  "parcels": [
    {
      "trackingNo": "JD014600003128",
      "service": "EXPRESS",
      "weightKg": 2.40,
      "recipient": { "name": "A. de Vries", "city": "Utrecht", "country": "NL" }
    },
    {
      "trackingNo": "JD014600003129",
      "service": "STANDARD",
      "weightKg": 11.75,
      "recipient": { "name": "Kempen Logistics NV", "city": "Antwerp", "country": "BE" }
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Attributes are read with the `@` selector: `payload.manifest.@carrier`.',
    'The single-value selector `.parcel` returns only the **first** parcel. The multi-value selector `.*parcel` returns all of them as an array.',
    'When there are no parcels, `.*parcel` returns `null` — add `default []`.',
    'Attribute values are strings; convert with `as Number`.',
  ],
  solution: `%dw 2.0
output application/json
var m = payload.manifest
var parcels = m.*parcel default []
---
{
  manifestId: m.@id,
  carrier: m.@carrier,
  shipDate: m.@shipDate,
  parcelCount: sizeOf(parcels),
  parcels: parcels map (p) -> {
    trackingNo: p.@trackingNo,
    service: p.@service,
    weightKg: p.@weightKg as Number,
    recipient: {
      name: p.recipient,
      city: p.recipient.@city,
      country: p.recipient.@country
    }
  }
}`,
  explanation: `
**Single vs multi-value selector.** XML has no arrays: repeating elements are just repeated keys. \`m.parcel\` returns the first match only, so a mapping built with it works in a test with one parcel and silently loses data in production. \`m.*parcel\` always returns an array of every match, which is why it is the safe choice for anything that *can* repeat — even if today's sample has one.

**Empty is \`null\`, not \`[]\`.** When no element matches, \`.*parcel\` returns \`null\`; \`default []\` turns that into an empty array so \`map\` and \`sizeOf\` keep working.

**Attributes are strings.** \`@weightKg\` is the text \`"2.40"\`; the JSON consumer expects a number, so it is coerced with \`as Number\`. The element text of \`recipient\` and its attributes are read separately: \`p.recipient\` for the text, \`p.recipient.@city\` for an attribute.
`,
  tests: [
    {
      name: 'A single parcel is still an array',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<manifest id="MF-2202" carrier="PostNL" shipDate="2026-11-03"><parcel trackingNo="3SABCD1234567" weightKg="0.85" service="MAILBOX"><recipient city="Delft" country="NL">J. Bakker</recipient></parcel></manifest>',
        },
      ],
      expected:
        '{ "manifestId": "MF-2202", "carrier": "PostNL", "shipDate": "2026-11-03", "parcelCount": 1, "parcels": [ { "trackingNo": "3SABCD1234567", "service": "MAILBOX", "weightKg": 0.85, "recipient": { "name": "J. Bakker", "city": "Delft", "country": "NL" } } ] }',
    },
    {
      name: 'Empty manifest',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content: '<manifest id="MF-2203" carrier="UPS" shipDate="2026-11-03"></manifest>',
        },
      ],
      expected: '{ "manifestId": "MF-2203", "carrier": "UPS", "shipDate": "2026-11-03", "parcelCount": 0, "parcels": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why can a mapping that passed every test with one parcel break in production?',
      a: 'With a single-value selector (`.parcel`) only the first element is read, and when an XML is converted without a schema a single repeated element is indistinguishable from a non-repeating one. Use `.*` for anything that may repeat.',
    },
    {
      q: 'The listener picks up the same manifest on every poll. What is missing?',
      a: 'A post-processing action or watermark: set `autoDelete`, `moveToDirectory` (e.g. an archive folder) or enable `watermarkEnabled`; without them the file stays in the directory and is processed again.',
    },
  ],
}
