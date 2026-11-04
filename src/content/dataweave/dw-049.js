export default {
  id: 'dw-049',
  category: 'dataweave',
  title: 'Create an ITSM Ticket XML with CDATA and a Default Namespace',
  level: 'ADVANCED',
  tags: ['xml', 'cdata', 'namespaces', 'default-namespace', 'conditional'],
  estMinutes: 25,
  description: `
Incidents raised in your service portal must be created in an ITSM tool whose API only accepts XML. The tool's schema has two namespaces:

| Namespace | URI | Written as |
|---|---|---|
| ticket (default) | \`http://example.com/itsm/ticket/v3\` | **no prefix** — declared once as \`xmlns="..."\` on \`Ticket\` |
| attachment | \`http://example.com/itsm/attachment/v1\` | prefix \`att\` — declared once, on \`att:Attachments\` |

**Structure** (see the expected output for the exact shape and attribute order)
- \`Ticket\` with attributes \`xmlns\`, \`id\` (\`ticketId\`), \`priority\` (\`"P"\` + the number).
- \`Summary\` — plain text (special characters are escaped normally).
- \`Description\` — the HTML from \`descriptionHtml\`, written as **CDATA** so the markup is not escaped.
- \`Reporter\` — attribute \`id\`, text = the reporter's email.
- \`Comments\` — one \`Comment\` per comment, attributes \`author\` and \`at\`, text as **CDATA**. Leave out \`Comments\` entirely when there are no comments.
- \`att:Attachments\` — attribute \`count\` (number of attachments), one \`att:File\` per attachment with attributes \`name\` and \`contentType\`, text = the \`url\`. Leave it out entirely when there are no attachments.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "ticketId": "INC-1001",
  "priority": 2,
  "summary": "VPN & Wi-Fi drop every 10 minutes",
  "descriptionHtml": "<p>User reports <b>VPN</b> disconnects & reconnects.</p>",
  "reporter": { "id": "u-77", "email": "eva@acme.example" },
  "comments": [
    { "author": "agent-1", "at": "2026-11-02T09:15:00Z", "text": "Asked for logs <attached soon>" },
    { "author": "eva", "at": "2026-11-02T09:40:00Z", "text": "Logs uploaded" }
  ],
  "attachments": [
    { "name": "vpn.log", "mime": "text/plain", "url": "https://files.example.com/a/1" },
    { "name": "screen.png", "mime": "image/png", "url": "https://files.example.com/a/2" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<Ticket xmlns="http://example.com/itsm/ticket/v3" id="INC-1001" priority="P2">
  <Summary>VPN &amp; Wi-Fi drop every 10 minutes</Summary>
  <Description><![CDATA[<p>User reports <b>VPN</b> disconnects & reconnects.</p>]]></Description>
  <Reporter id="u-77">eva@acme.example</Reporter>
  <Comments>
    <Comment author="agent-1" at="2026-11-02T09:15:00Z"><![CDATA[Asked for logs <attached soon>]]></Comment>
    <Comment author="eva" at="2026-11-02T09:40:00Z"><![CDATA[Logs uploaded]]></Comment>
  </Comments>
  <att:Attachments xmlns:att="http://example.com/itsm/attachment/v1" count="2">
    <att:File name="vpn.log" contentType="text/plain">https://files.example.com/a/1</att:File>
    <att:File name="screen.png" contentType="image/png">https://files.example.com/a/2</att:File>
  </att:Attachments>
</Ticket>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
payload
`,
  hints: [
    'CDATA is a type: `payload.descriptionHtml as CData` makes the XML writer emit `<![CDATA[...]]>` instead of escaping `<` and `&`.',
    'A **default** namespace has no prefix, so `ns` + `prefix#Name` cannot produce it. Add it as an ordinary attribute on the root — `Ticket @(xmlns: "http://...", id: ...)` — and keep the child keys un-prefixed. For `att`, use `ns att ...` and `att#Attachments`.',
    'Optional elements: `(Comments: { ... }) if (not isEmpty(payload.comments))`. Repeated elements: spread a mapped array into the object, `{ (payload.comments map (c) -> { Comment @(...): c.text as CData }) }`.',
  ],
  solution: `%dw 2.0
output application/xml
ns att http://example.com/itsm/attachment/v1
---
{
  Ticket @(xmlns: "http://example.com/itsm/ticket/v3", id: payload.ticketId, priority: "P" ++ (payload.priority as String)): {
    Summary: payload.summary,
    Description: payload.descriptionHtml as CData,
    Reporter @(id: payload.reporter.id): payload.reporter.email,
    (Comments: {
      (payload.comments map (c) -> {
        Comment @(author: c.author, at: c.at): c.text as CData
      })
    }) if (not isEmpty(payload.comments)),
    (att#Attachments @(count: sizeOf(payload.attachments)): {
      (payload.attachments map (a) -> {
        att#File @(name: a.name, contentType: a.mime): a.url
      })
    }) if (not isEmpty(payload.attachments))
  }
}`,
  explanation: `
**CDATA**: \`as CData\` marks a String so the XML writer wraps it in \`<![CDATA[ ... ]]>\`. The HTML arrives at the ITSM tool unchanged, instead of as \`&lt;p&gt;...\`. Plain strings (like \`Summary\`) are still escaped — \`&\` becomes \`&amp;\` — which is correct XML too; CDATA is a readability/contract choice, not a requirement for safety.

**Namespaces declared once**: the writer declares a prefix on the **first element that uses it**, and again on any later element outside that element's scope. Putting both \`att\` elements under one \`att:Attachments\` parent means a single declaration. A default namespace is not something \`ns\` can express, so it is written as an \`xmlns\` attribute on the root; un-prefixed children inherit it in the XML text.

Common traps:
- Keeping \`Attachments\` in the default namespace and only \`File\` in \`att\`: every \`att:File\` sibling then gets its own \`xmlns:att\` declaration.
- \`ns t http://example.com/itsm/ticket/v3\` + \`t#Ticket\` produces \`t:Ticket\`. It is namespace-equivalent, but the contract (and many strict partner parsers or XSLT templates) expects the exact form.
- \`if (...)\` on an object field needs the field wrapped in parentheses: \`(Comments: {...}) if (cond)\`. Writing \`Comments: if (cond) {...} else null\` still emits an empty \`<Comments/>\`.
`,
  tests: [
    {
      name: 'No comments, one attachment, priority 1',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "ticketId": "INC-7", "priority": 1, "summary": "Toner < 10%", "descriptionHtml": "<i>3rd floor</i>", "reporter": { "id": "u-1", "email": "a@b.example" }, "comments": [], "attachments": [ { "name": "p.jpg", "mime": "image/jpeg", "url": "https://files.example.com/a/9" } ] }',
        },
      ],
      expected: `<Ticket xmlns="http://example.com/itsm/ticket/v3" id="INC-7" priority="P1">
  <Summary>Toner &lt; 10%</Summary>
  <Description><![CDATA[<i>3rd floor</i>]]></Description>
  <Reporter id="u-1">a@b.example</Reporter>
  <att:Attachments xmlns:att="http://example.com/itsm/attachment/v1" count="1">
    <att:File name="p.jpg" contentType="image/jpeg">https://files.example.com/a/9</att:File>
  </att:Attachments>
</Ticket>`,
    },
    {
      name: 'No comments and no attachments',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "ticketId": "INC-8", "priority": 4, "summary": "Mouse", "descriptionHtml": "<p>n/a</p>", "reporter": { "id": "u-2", "email": "c@d.example" }, "comments": [], "attachments": [] }',
        },
      ],
      expected: `<Ticket xmlns="http://example.com/itsm/ticket/v3" id="INC-8" priority="P4">
  <Summary>Mouse</Summary>
  <Description><![CDATA[<p>n/a</p>]]></Description>
  <Reporter id="u-2">c@d.example</Reporter>
</Ticket>`,
    },
  ],
  followUps: [
    {
      q: 'What happens if the HTML itself contains `]]>`?',
      a: 'A CDATA section cannot contain `]]>`, so it must be split into two CDATA sections (`]]]]><![CDATA[>`). Check how your writer version handles it, or fall back to a normal escaped string for such values.',
    },
    {
      q: 'How do you read CDATA back in DataWeave?',
      a: 'The XML reader returns CDATA content as a normal String, so `payload.Ticket.Description` is just the HTML — no special handling is needed.',
    },
    {
      q: 'How would you validate the generated XML against the vendor XSD in Mule?',
      a: 'Use the XML Module\'s `Validate schema` operation with the XSD on the classpath, after the Transform. It raises `XML-MODULE:SCHEMA_NOT_HONOURED` with the violations, which you can map to a 4xx/5xx response.',
    },
  ],
}
