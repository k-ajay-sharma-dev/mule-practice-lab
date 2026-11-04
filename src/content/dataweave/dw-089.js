export default {
  id: 'dw-089',
  category: 'dataweave',
  title: 'Flatten an Inbound SAP MATMAS05 IDoc into a Product Event',
  level: 'INTERMEDIATE',
  tags: ['sap', 'idoc', 'matmas', 'xml', 'json', 'manufacturing'],
  estMinutes: 25,
  description: `
SAP sends material master changes as **MATMAS05 IDocs** to a Mule app through the Document Listener. The IDoc XML below is simplified. dw-066 builds an IDoc from JSON; this problem goes the other way, reading one and turning its segments into a clean JSON event.

**Rules**
- \`idocNumber\`: \`DOCNUM\` from the control record \`EDI_DC40\`, without leading zeros.
- \`material\`: \`MATNR\` from \`E1MARAM\`. When it contains only digits, remove the leading zeros. Alphanumeric numbers stay exactly as they are.
- \`baseUnit\`: \`MEINS\`.
- \`grossWeightKg\`: \`BRGEW\` as a number. When \`GEWEI\` is \`G\`, divide by 1000.
- \`active\`: \`false\` when the deletion flag \`LVORM\` is \`X\`, otherwise \`true\`. The element may be absent.
- \`names\`: an object with one key per language from the repeating \`E1MAKTM\` segments: key \`SPRAS_ISO\` in lower case, value \`MAKTX\`.
- \`unitConversions\`: one entry per \`E1MARMM\` segment, **except the base unit**: \`{ "unit": MEINH, "baseUnitsPerUnit": UMREZ / UMREN }\`. An empty array when there are none.
- \`plants\`: the \`WERKS\` of each \`E1MARCM\` segment, as an array of strings.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<MATMAS05>
  <IDOC BEGIN="1">
    <EDI_DC40 SEGMENT="1">
      <DOCNUM>0000000048211907</DOCNUM>
      <IDOCTYP>MATMAS05</IDOCTYP>
      <MESTYP>MATMAS</MESTYP>
      <SNDPRN>S4HCLNT100</SNDPRN>
    </EDI_DC40>
    <E1MARAM SEGMENT="1">
      <MATNR>000000000000104422</MATNR>
      <MEINS>EA</MEINS>
      <BRGEW>1250.000</BRGEW>
      <GEWEI>G</GEWEI>
      <E1MAKTM SEGMENT="1">
        <SPRAS_ISO>EN</SPRAS_ISO>
        <MAKTX>Hydraulic pump H4</MAKTX>
      </E1MAKTM>
      <E1MAKTM SEGMENT="1">
        <SPRAS_ISO>DE</SPRAS_ISO>
        <MAKTX>Hydraulikpumpe H4</MAKTX>
      </E1MAKTM>
      <E1MARMM SEGMENT="1">
        <MEINH>EA</MEINH>
        <UMREZ>1</UMREZ>
        <UMREN>1</UMREN>
      </E1MARMM>
      <E1MARMM SEGMENT="1">
        <MEINH>BOX</MEINH>
        <UMREZ>12</UMREZ>
        <UMREN>1</UMREN>
      </E1MARMM>
      <E1MARCM SEGMENT="1">
        <WERKS>1000</WERKS>
      </E1MARCM>
      <E1MARCM SEGMENT="1">
        <WERKS>2100</WERKS>
      </E1MARCM>
    </E1MARAM>
  </IDOC>
</MATMAS05>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "idocNumber": "48211907",
  "material": "104422",
  "baseUnit": "EA",
  "grossWeightKg": 1.25,
  "active": true,
  "names": { "en": "Hydraulic pump H4", "de": "Hydraulikpumpe H4" },
  "unitConversions": [ { "unit": "BOX", "baseUnitsPerUnit": 12 } ],
  "plants": [ "1000", "2100" ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Keep a variable for the IDoc and one for `E1MARAM`, so paths stay short.',
    'Repeating segments need the multi-value selector with a default: `mat.*E1MAKTM default []`.',
    'Build an object from an array with `reduce`, or with a dynamic key inside `{ (... map ...) }`.',
    '`matches` tells you whether a string has only digits; `replace /^0+/ with ""` removes the zeros.',
    'IDoc fields are strings, so convert with `as Number` before you calculate.',
  ],
  solution: `%dw 2.0
output application/json
fun stripZeros(value) = if (value matches /^\\d+$/) (value replace /^0+/ with "") else value
var idoc = payload.MATMAS05.IDOC
var mat = idoc.E1MARAM
var weight = mat.BRGEW as Number
---
{
  idocNumber: stripZeros(idoc.EDI_DC40.DOCNUM),
  material: stripZeros(mat.MATNR),
  baseUnit: mat.MEINS,
  grossWeightKg: if (mat.GEWEI == "G") weight / 1000 else weight,
  active: mat.LVORM != "X",
  names: {
    ((mat.*E1MAKTM default []) map (t) -> {
      (lower(t.SPRAS_ISO)): t.MAKTX
    })
  },
  unitConversions: ((mat.*E1MARMM default []) filter ((u) -> u.MEINH != mat.MEINS)) map (u) -> {
    unit: u.MEINH,
    baseUnitsPerUnit: (u.UMREZ as Number) / (u.UMREN as Number)
  },
  plants: (mat.*E1MARCM default []) map (p) -> p.WERKS
}`,
  explanation: `
**Reading an IDoc.** The XML form has the IDoc type as the root, an \`IDOC\` element, the control record \`EDI_DC40\`, then data segments. Child segments are nested in their parent, so \`E1MAKTM\` is below \`E1MARAM\`.

**Everything is text.** IDoc fields are character fields: numbers are padded and leading zeros are common. Convert with \`as Number\` before calculating. Only strip zeros from numeric values, because an alphanumeric material such as \`00A-77\` must not change.

**Repeating segments.** Use \`.*\` for anything that can repeat, and \`default []\` because the selector gives \`null\` when there is no match.

**Dynamic keys.** \`{ ((... map ...)) }\` merges an array of single-key objects into one object, and \`(lower(t.SPRAS_ISO)): ...\` makes the key from data.

**Optional flag.** A missing \`LVORM\` gives \`null\`, and \`null != "X"\` is \`true\`, so absent means active with no extra code.
`,
  tests: [
    {
      name: 'Deleted alphanumeric material with no units or plants',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<MATMAS05><IDOC BEGIN="1"><EDI_DC40 SEGMENT="1"><DOCNUM>0000000000005512</DOCNUM></EDI_DC40><E1MARAM SEGMENT="1"><MATNR>00A-77</MATNR><LVORM>X</LVORM><MEINS>KG</MEINS><BRGEW>3.500</BRGEW><GEWEI>KG</GEWEI><E1MAKTM SEGMENT="1"><SPRAS_ISO>NL</SPRAS_ISO><MAKTX>Afdichtring</MAKTX></E1MAKTM></E1MARAM></IDOC></MATMAS05>',
        },
      ],
      expected:
        '{ "idocNumber": "5512", "material": "00A-77", "baseUnit": "KG", "grossWeightKg": 3.5, "active": false, "names": { "nl": "Afdichtring" }, "unitConversions": [], "plants": [] }',
    },
    {
      name: 'Conversion with a denominator',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<MATMAS05><IDOC BEGIN="1"><EDI_DC40 SEGMENT="1"><DOCNUM>0000000000000901</DOCNUM></EDI_DC40><E1MARAM SEGMENT="1"><MATNR>000000000000000350</MATNR><MEINS>M</MEINS><BRGEW>200.000</BRGEW><GEWEI>G</GEWEI><E1MARMM SEGMENT="1"><MEINH>CM</MEINH><UMREZ>1</UMREZ><UMREN>100</UMREN></E1MARMM><E1MARCM SEGMENT="1"><WERKS>3000</WERKS></E1MARCM></E1MARAM></IDOC></MATMAS05>',
        },
      ],
      expected:
        '{ "idocNumber": "901", "material": "350", "baseUnit": "M", "grossWeightKg": 0.2, "active": true, "names": {}, "unitConversions": [ { "unit": "CM", "baseUnitsPerUnit": 0.01 } ], "plants": [ "3000" ] }',
    },
  ],
  followUps: [
    {
      q: 'The Document Listener output is binary. What do you do before this mapping?',
      a: 'Check the MIME type on the message first. If it is not XML, use `read(payload, "application/xml")` in a variable or set the MIME type. Do not call `read` on a payload that is already parsed, because it fails.',
    },
    {
      q: 'Why not always cast MATNR to a Number to remove the zeros?',
      a: 'Materials can be alphanumeric, and a cast would fail on those. A number also loses the difference between identifiers and quantities, so keep identifiers as strings.',
    },
  ],
}
