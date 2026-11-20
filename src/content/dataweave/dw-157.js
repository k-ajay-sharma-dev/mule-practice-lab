export default {
  id: 'dw-157',
  category: 'dataweave',
  title: 'Wrap Staging Item Rows in an SBDH Envelope for the Outbound Queue',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'sbdh', 'gs1', 'xml', 'namespaces', 'code-map', 'product-data-hub'],
  estMinutes: 20,
  description: `
Kestrel Home Supply runs a product data hub. Item master data is loaded into Oracle staging tables, and a flow publishes it to an outbound JMS queue for a supply chain planning platform. The platform expects GS1 style XML wrapped in a Standard Business Document Header (SBDH) envelope.

The input has a \`header\`, the \`codeMaps\` the hub loaded from its cross reference table, and the staging \`rows\`. Build one XML message:

- Root \`sh:StandardBusinessDocument\`, where \`sh\` is \`http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader\`
- \`sh:StandardBusinessDocumentHeader\` with:
  - \`sh:HeaderVersion\`: \`1.0\`
  - \`sh:Sender\` and \`sh:Receiver\`, each with an \`sh:Identifier\` that has the attribute \`Authority="KESTREL"\`
  - \`sh:DocumentIdentification\` with \`sh:Standard\` (\`GS1\`), \`sh:TypeVersion\`, \`sh:InstanceIdentifier\` (the message id), \`sh:Type\` (\`Item\`) and \`sh:CreationDateAndTime\`
- Then \`itm:ItemMessage\`, where \`itm\` is \`urn:kestrel:pdh:item:1\`, with the attributes \`count\` (number of items) and \`unmapped\` (number of codes not found in a code map), holding one \`itm:Item\` per row with \`itm:ItemId\`, \`itm:Description\` (trimmed), \`itm:UnitOfMeasure\`, \`itm:Status\` and \`itm:PackQuantity\`

Translate \`UOM_CODE\` through \`codeMaps.uom\` and \`STATUS_CODE\` through \`codeMaps.status\`. An unknown code becomes \`UNMAPPED\`. The \`unmapped\` attribute counts unknown codes, not rows, so a row with both codes unknown adds 2. Keep the elements in the order listed above and the items in row order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "header": {
    "sender": "KESTREL-PDH",
    "receiver": "PLANHUB",
    "messageId": "PDH-ITEM-20261118-0007",
    "typeVersion": "3.4",
    "createdAt": "2026-11-18T09:30:00Z"
  },
  "codeMaps": {
    "uom": { "EACH": "EA", "CASE": "CS", "PACK": "PK" },
    "status": { "A": "ACTIVE", "D": "DISCONTINUED" }
  },
  "rows": [
    { "ITEM_ID": "RLR-2201", "DESCRIPTION": "Paint roller set, 9 in ", "UOM_CODE": "PACK", "STATUS_CODE": "A", "PACK_QTY": 4 },
    { "ITEM_ID": "HNG-0310", "DESCRIPTION": "Cabinet hinge", "UOM_CODE": "EACH", "STATUS_CODE": "D", "PACK_QTY": 1 },
    { "ITEM_ID": "HSE-1180", "DESCRIPTION": " Garden hose 18 m", "UOM_CODE": "PAIR", "STATUS_CODE": "A", "PACK_QTY": 2 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<sh:StandardBusinessDocument xmlns:sh="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">
  <sh:StandardBusinessDocumentHeader>
    <sh:HeaderVersion>1.0</sh:HeaderVersion>
    <sh:Sender>
      <sh:Identifier Authority="KESTREL">KESTREL-PDH</sh:Identifier>
    </sh:Sender>
    <sh:Receiver>
      <sh:Identifier Authority="KESTREL">PLANHUB</sh:Identifier>
    </sh:Receiver>
    <sh:DocumentIdentification>
      <sh:Standard>GS1</sh:Standard>
      <sh:TypeVersion>3.4</sh:TypeVersion>
      <sh:InstanceIdentifier>PDH-ITEM-20261118-0007</sh:InstanceIdentifier>
      <sh:Type>Item</sh:Type>
      <sh:CreationDateAndTime>2026-11-18T09:30:00Z</sh:CreationDateAndTime>
    </sh:DocumentIdentification>
  </sh:StandardBusinessDocumentHeader>
  <itm:ItemMessage xmlns:itm="urn:kestrel:pdh:item:1" count="3" unmapped="1">
    <itm:Item>
      <itm:ItemId>RLR-2201</itm:ItemId>
      <itm:Description>Paint roller set, 9 in</itm:Description>
      <itm:UnitOfMeasure>PK</itm:UnitOfMeasure>
      <itm:Status>ACTIVE</itm:Status>
      <itm:PackQuantity>4</itm:PackQuantity>
    </itm:Item>
    <itm:Item>
      <itm:ItemId>HNG-0310</itm:ItemId>
      <itm:Description>Cabinet hinge</itm:Description>
      <itm:UnitOfMeasure>EA</itm:UnitOfMeasure>
      <itm:Status>DISCONTINUED</itm:Status>
      <itm:PackQuantity>1</itm:PackQuantity>
    </itm:Item>
    <itm:Item>
      <itm:ItemId>HSE-1180</itm:ItemId>
      <itm:Description>Garden hose 18 m</itm:Description>
      <itm:UnitOfMeasure>UNMAPPED</itm:UnitOfMeasure>
      <itm:Status>ACTIVE</itm:Status>
      <itm:PackQuantity>2</itm:PackQuantity>
    </itm:Item>
  </itm:ItemMessage>
</sh:StandardBusinessDocument>`,
  },
  starterCode: `%dw 2.0
output application/xml
ns sh http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader
ns itm urn:kestrel:pdh:item:1
var h = payload.header
---
sh#StandardBusinessDocument: {
  sh#StandardBusinessDocumentHeader: {
    sh#HeaderVersion: "1.0"
  }
}
`,
  hints: [
    'Declare both prefixes with `ns` in the header, then write keys such as `sh#Sender` and `itm#Item`.',
    'An attribute goes between the key and the colon: `sh#Identifier @(Authority: "KESTREL"): h.sender`.',
    'A code map lookup with a default: `fun mapCode(map, code) = map[code] default "UNMAPPED"`.',
    'Several `itm#Item` elements come from `(items map (i) -> { itm#Item: { ... } })` inside the parent object.',
    'Translate the rows once into a `var`, then count the `UNMAPPED` values from that list for the attribute.',
  ],
  solution: `%dw 2.0
output application/xml
ns sh http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader
ns itm urn:kestrel:pdh:item:1
var h = payload.header
var maps = payload.codeMaps

fun mapCode(codeMap, code) = codeMap[code] default "UNMAPPED"

var items = payload.rows map (r) -> {
  id: r.ITEM_ID,
  description: trim(r.DESCRIPTION),
  uom: mapCode(maps.uom, r.UOM_CODE),
  status: mapCode(maps.status, r.STATUS_CODE),
  packQty: r.PACK_QTY
}

var unmapped = sizeOf(items filter ($.uom == "UNMAPPED")) + sizeOf(items filter ($.status == "UNMAPPED"))
---
sh#StandardBusinessDocument: {
  sh#StandardBusinessDocumentHeader: {
    sh#HeaderVersion: "1.0",
    sh#Sender: { sh#Identifier @(Authority: "KESTREL"): h.sender },
    sh#Receiver: { sh#Identifier @(Authority: "KESTREL"): h.receiver },
    sh#DocumentIdentification: {
      sh#Standard: "GS1",
      sh#TypeVersion: h.typeVersion,
      sh#InstanceIdentifier: h.messageId,
      sh#Type: "Item",
      sh#CreationDateAndTime: h.createdAt
    }
  },
  itm#ItemMessage @(count: sizeOf(items), unmapped: unmapped): {
    (items map (i) -> {
      itm#Item: {
        itm#ItemId: i.id,
        itm#Description: i.description,
        itm#UnitOfMeasure: i.uom,
        itm#Status: i.status,
        itm#PackQuantity: i.packQty
      }
    })
  }
}`,
  explanation: `
**The envelope.** The SBDH says who sent the document, who should receive it, what kind of document it is and when it was made. The receiver can route and log the message from the header without reading the business part.

**Two namespaces.** The header elements belong to the SBDH namespace, and the business payload to its own. \`ns\` binds each prefix to its URI, and \`sh#\` or \`itm#\` puts an element in that namespace. A receiver that validates against a schema checks the URI, not the prefix.

**Code maps with a default.** Staging rows use the hub's own codes. The cross reference map turns them into the codes the receiver knows. \`default "UNMAPPED"\` keeps the message valid when a code is missing from the map, and the \`unmapped\` attribute makes the gap visible instead of hiding it.

**Translate once.** The \`items\` list holds clean, translated values. The XML and the count both read from it, so they cannot disagree.

**Repeated elements.** Wrapping the \`map\` in parentheses inside the object spreads the list into several \`itm:Item\` keys, which the writer outputs as sibling elements.
`,
  tests: [
    {
      name: 'One item, every code known',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "header": { "sender": "KESTREL-PDH", "receiver": "PLANHUB", "messageId": "PDH-ITEM-20261118-0008", "typeVersion": "3.4", "createdAt": "2026-11-18T10:00:00Z" }, "codeMaps": { "uom": { "CASE": "CS" }, "status": { "A": "ACTIVE" } }, "rows": [{ "ITEM_ID": "SCR-0042", "DESCRIPTION": "Wood screw box", "UOM_CODE": "CASE", "STATUS_CODE": "A", "PACK_QTY": 10 }] }',
        },
      ],
      expected:
        '<?xml version="1.0" encoding="UTF-8"?><sh:StandardBusinessDocument xmlns:sh="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader"><sh:StandardBusinessDocumentHeader><sh:HeaderVersion>1.0</sh:HeaderVersion><sh:Sender><sh:Identifier Authority="KESTREL">KESTREL-PDH</sh:Identifier></sh:Sender><sh:Receiver><sh:Identifier Authority="KESTREL">PLANHUB</sh:Identifier></sh:Receiver><sh:DocumentIdentification><sh:Standard>GS1</sh:Standard><sh:TypeVersion>3.4</sh:TypeVersion><sh:InstanceIdentifier>PDH-ITEM-20261118-0008</sh:InstanceIdentifier><sh:Type>Item</sh:Type><sh:CreationDateAndTime>2026-11-18T10:00:00Z</sh:CreationDateAndTime></sh:DocumentIdentification></sh:StandardBusinessDocumentHeader><itm:ItemMessage xmlns:itm="urn:kestrel:pdh:item:1" count="1" unmapped="0"><itm:Item><itm:ItemId>SCR-0042</itm:ItemId><itm:Description>Wood screw box</itm:Description><itm:UnitOfMeasure>CS</itm:UnitOfMeasure><itm:Status>ACTIVE</itm:Status><itm:PackQuantity>10</itm:PackQuantity></itm:Item></itm:ItemMessage></sh:StandardBusinessDocument>',
    },
  ],
  followUps: [
    {
      q: 'Should a message with unmapped codes be sent at all?',
      a: 'That is a business rule to agree with the receiver. Many teams hold the record back as a reject and fix the code map, since an UNMAPPED unit of measure can break planning.',
    },
    {
      q: 'The code map lives in an Oracle table. When do you load it?',
      a: 'Once per run, before the transform, and pass it in as a variable. Looking up each code with its own query is slow and loads the database.',
    },
    {
      q: 'How do you check the XML before it goes on the queue?',
      a: 'Validate it against the receiver schema with the XML module, and send failures to the reject path. Finding a broken message on the receiver side is much slower to fix.',
    },
  ],
}
