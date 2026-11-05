export default {
  id: 'ms-032',
  category: 'mulesoft',
  title: 'MIME Types, Reader Properties and Inline DataWeave in Components',
  level: 'INTERMEDIATE',
  tags: ['mime-type', 'dataweave', 'reader-properties', 'output-mime-type'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why does `payload map { id: $.column_0 }` fail on the pipe-delimited file?',
      options: [
        'DataWeave cannot map over CSV at all',
        'The file has no declared MIME type, so it is read as binary and DataWeave cannot navigate rows and columns',
        'The column must be called `$.col1`',
        'File Read always returns a Java String',
      ],
      answer: 1,
      explain: 'DataWeave picks its **reader** from the incoming MIME type. With an unknown type the content is binary, hence the coercion error.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Which File Read setting lets DataWeave read the file correctly as headerless, pipe-separated CSV?',
      options: [
        '`outputMimeType="application/csv; header=false; separator=|"`',
        '`mimeType="text/plain"` on the following Transform',
        '`outputEncoding="csv"`',
        '`targetValue="#[csv]"`',
      ],
      answer: 0,
      explain: 'Reader properties are passed as MIME type parameters on `outputMimeType`. With `header=false` the columns are named `column_0`, `column_1`, ...',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'What does `#[{ count: sizeOf(payload), source: "nightly" }]` in Set Payload produce?',
      options: [
        'A JSON string',
        'A Java Map (application/java)',
        'Plain text',
        'Whatever the HTTP Request expects',
      ],
      answer: 1,
      explain: 'Inline expressions without an output directive produce Java objects. Use `#[output application/json --- {...}]` or a Transform Message with `output application/json`.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A teammate fixes step 2 by setting `mimeType="application/json"` on Set Payload while keeping the same inline expression. Does that work?',
      options: [
        'Yes, it converts the Java Map to JSON text',
        'No, it only labels the value; it does not convert a Java object into JSON text',
        'Yes, but only for HTTP Request',
        'No, Set Payload has no mimeType attribute',
      ],
      answer: 1,
      explain: 'The `mimeType` attribute declares a type; it is not a transformation. The conversion needs an `output application/json` directive.',
    },
    {
      type: 'match',
      prompt: 'Match each connector-operation setting to its effect.',
      pairs: [
        ['`outputMimeType`', 'Declares the type of the operation output so the right reader is used later'],
        ['`target`', 'Stores the result in a variable; payload and attributes stay unchanged'],
        ['`targetValue`', 'Chooses what to store, e.g. `#[attributes.statusCode]`'],
      ],
      explain: '`target` redirects the result into a variable, and `targetValue` (default `#[payload]`) selects what part of the result goes there.',
    },
    {
      type: 'single',
      prompt: 'A flow reads a headerless, pipe-separated file. One option declares the type with `outputMimeType` on File Read. The other parses it with `read(payload, "application/csv", {...})` inside DataWeave. Why is the File Read option usually preferred?',
      options: [
        'Every later component sees the correct type',
        'Only File Read can set `header=false`',
        'It avoids having to parse the file at all',
        '`read` cannot take a custom separator',
      ],
      answer: 0,
      explain: 'Declaring it on the operation types the payload once for the whole flow and lets Studio show metadata. Both approaches can set the reader properties, and both parse the file.',
    },
  ],
  description: `
A nightly flow picks up a pipe-delimited file from a shared folder with **File Read**:

\`\`\`text
1001|ACME|2500.00
1002|GLOBEX|180.50
\`\`\`

There is **no header row**. The flow then:

1. Uses a Transform Message: \`payload map { id: $.column_0, ... }\`
2. Uses \`Set Payload\` with \`#[{ count: sizeOf(payload), source: "nightly" }]\`
3. Sends the result with HTTP Request to a REST API that expects JSON.

Problems:
- Step 1 fails with an error saying it cannot coerce Binary to Array (or similar).
- After fixing that, the REST API receives a body it cannot parse and the HTTP Request content type is not \`application/json\`.

**Questions**
1. Why does DataWeave treat the file content as binary?
2. How do you declare the MIME type and CSV reader properties for the file (two ways)?
3. What MIME type does an inline expression like the one in step 2 produce, and how do you make it JSON?
4. What do \`outputMimeType\`, \`target\` and \`targetValue\` do on a connector operation?
`,
  answerTemplate: `## Why binary

## Declaring MIME type and reader properties

## Inline expressions and output

## outputMimeType, target, targetValue
`,
  keyPoints: [
    'Every payload carries a data type (MIME type); DataWeave picks its reader from it, so unknown types are read as binary.',
    'Set outputMimeType on the source/operation (e.g. application/csv; header=false; separator=|) or parse explicitly with read(payload, "application/csv", {...}).',
    'Inline #[...] expressions produce Java objects (application/java) unless they declare an output directive.',
    'Use #[output application/json --- ...] or a Transform Message with output application/json when the next component needs JSON.',
    'target stores the operation result in a variable instead of the payload; targetValue chooses what to store (default #[payload]).',
  ],
  solution: `
**Why binary:** a file with an unknown extension or no declared type is typed as \`application/octet-stream\` (or generic text). DataWeave chooses its **reader** from the incoming MIME type; with binary it cannot navigate rows/columns, hence the coercion error.

**Declare it — option 1: on the operation**
\`\`\`xml
<file:read path="#[vars.fileName]"
           outputMimeType="application/csv; header=false; separator=|"/>
\`\`\`
Reader properties are passed as MIME type parameters. With \`header=false\` the columns are \`column_0\`, \`column_1\`, ...

**Option 2: in DataWeave**
\`\`\`dataweave
%dw 2.0
output application/json
var rows = read(payload, "application/csv", { header: false, separator: "|" })
---
rows map { id: $.column_0, customer: $.column_1, amount: $.column_2 as Number }
\`\`\`
Option 1 is preferred: every downstream component sees the correct type, and Studio metadata works.

**Inline expressions:** \`#[{ count: ..., source: "nightly" }]\` produces a **Java Map** (\`application/java\`). The HTTP Request then serializes a Java object, not JSON. Fix:
\`\`\`xml
<set-payload value='#[output application/json --- { count: sizeOf(payload), source: "nightly" }]'/>
\`\`\`
or use a Transform Message with \`output application/json\`. Set Payload also has a \`mimeType\` attribute, but that only labels the value — it does not convert a Java object into JSON text.

**Operation settings**
| Setting | Effect |
|---|---|
| \`outputMimeType\` / \`outputEncoding\` | declares the type/encoding of the operation's output so the right reader is used later |
| \`target\` | name of a variable that receives the result; payload and attributes stay unchanged |
| \`targetValue\` | expression evaluated over the result, e.g. \`#[payload]\` (default), \`#[message]\`, \`#[attributes.statusCode]\` |
`,
  followUps: [
    {
      q: 'How do you parse a CSV that uses a semicolon separator and Windows-1252 encoding?',
      a: 'Set outputEncoding="windows-1252" on the read operation; encoding is not a CSV reader property, so read() rejects it. For the separator, a semicolon also delimits MIME type parameters, so test how your runtime parses it in outputMimeType, or pass {separator: ";"} to read(). Without the encoding, accented characters will be corrupted.',
    },
    {
      q: 'Why is it risky to log #[payload] for a large CSV stream?',
      a: 'Logging forces the stream to be read and materialised as text, which costs memory, and with non-repeatable streams it consumes the content so later components see nothing.',
    },
  ],
}
