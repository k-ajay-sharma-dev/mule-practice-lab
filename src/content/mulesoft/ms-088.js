export default {
  id: 'ms-088',
  category: 'mulesoft',
  title: 'Choosing Data Formats in Mule: JSON, XML, CSV, Flat File and NDJSON with Reader and Writer Properties',
  level: 'INTERMEDIATE',
  tags: ['data-formats', 'mime-type', 'csv', 'json', 'xml', 'flat-file', 'fixed-width', 'ndjson', 'dataweave'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each format to its MIME type in DataWeave.',
      pairs: [
        ['CSV', 'application/csv'],
        ['Flat File and Fixed Width', 'application/flatfile'],
        ['NDJSON', 'application/x-ndjson'],
        ['Excel', 'application/xlsx'],
        ['URL encoded form', 'application/x-www-form-urlencoded'],
      ],
      explain: 'The MIME type selects the reader and the writer. Flat file and fixed width share one MIME type, and a schema describes the layout.',
    },
    {
      type: 'single',
      prompt: 'A `file:read` sets `outputMimeType="application/csv"` on a file. What does that do?',
      options: [
        'It sets the type metadata so the CSV reader is used; it does not transform the content',
        'It converts the file to CSV on disk',
        'It validates every row and raises an error on a bad one',
        'It converts the payload to JSON',
      ],
      answer: 0,
      explain: 'The File connector docs say the parameter changes only the metadata. The content is parsed later, when DataWeave reads it.',
    },
    {
      type: 'single',
      prompt: 'A pipe-delimited file has no header row. Which File Read setting reads it correctly?',
      options: [
        '`outputMimeType="application/csv; header=false; separator=|"`',
        '`outputMimeType="application/csv; headerLineNumber=-1"`',
        '`outputMimeType="text/plain; separator=|"`',
        '`outputMimeType="application/flatfile; separator=|"`',
      ],
      answer: 0,
      explain: '`header` and `separator` are CSV reader properties, passed as MIME type parameters. With `header=false` you reach fields by position, for example `payload[107][2]`.',
    },
    {
      type: 'single',
      prompt: 'A mainframe sends 120-character records with fixed positions. What must you provide to read them?',
      options: [
        'application/flatfile with `schemaPath` pointing to a schema that defines the layout',
        'application/csv with `separator=" "`',
        'application/json with `streaming=true`',
        'Nothing: DataWeave detects field positions itself',
      ],
      answer: 0,
      explain: 'The flat file and fixed width formats require `schemaPath`. If the schema has several definitions, `structureIdent` or `segmentIdent` selects the right one.',
    },
    {
      type: 'multi',
      prompt: 'A 2 GB log export has one JSON object on each line, and a few lines are damaged. Which statements are correct for `application/x-ndjson`?',
      options: [
        'Each line is one object, and DataWeave presents the input as an array of objects',
        'The reader property `skipInvalid=true` skips invalid lines and keeps the valid objects',
        '`skipInvalid` defaults to false',
        'The whole file must be wrapped in one top-level JSON array',
      ],
      answer: [0, 1, 2],
      explain: 'NDJSON needs no enclosing array, which is why it suits very long streams of records. By default invalid lines are not skipped.',
    },
    {
      type: 'single',
      prompt: 'A flow reads a 1 GB CSV from start to end, once. Which property streams it, and what limit applies?',
      options: [
        '`streaming=true` on the reader, for sequential access only',
        '`deferred=true` on the reader, for random access',
        '`bufferSize=1` on the reader, for any access pattern',
        '`indexedReader=false`, which applies to all formats',
      ],
      answer: 0,
      explain: '`streaming` is a reader property and the input must be a top-level array. `deferred` is a writer property that produces output as a data stream.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the property that meets it.',
      pairs: [
        ['JSON output on a single line', 'indent=false on the JSON writer'],
        ['Leave out keys with null values in JSON', 'skipNullOn="objects" on the JSON writer'],
        ['Quote every value in a CSV', 'quoteValues=true on the CSV writer'],
        ['Omit the XML declaration', 'writeDeclaration=false on the XML writer'],
      ],
      explain: 'These go on the DataWeave `output` directive, for example `output application/json indent=false`. Check the format page for the exact property, because names differ between formats.',
    },
  ],
  description: `
A distribution company is replacing an old integration hub. Mule must handle these feeds:

| Feed | Details |
|---|---|
| Customer web API | Request and response payloads for mobile and web clients |
| Government customs filing | Schema-validated documents with namespaces |
| Retailer sales | Pipe-delimited file with no header, 800 MB a night |
| Mainframe inventory | Fixed-position records defined by a copybook |
| Warehouse scanner events | One JSON object per line, continuous, a few damaged lines |

The last hub lost time to parsing failures, because files were read with the wrong type and every problem surfaced as a transform error.

**Questions**
1. Which format and MIME type fit each feed?
2. How do you tell Mule what a file is when it is read?
3. Which reader and writer properties do you need for each feed?
4. What protects you from unsafe XML, and from large files?
`,
  answerTemplate: `## Format per feed

## Declaring the type on read

## Reader and writer properties

## Unsafe XML and large files
`,
  keyPoints: [
    'The MIME type selects the DataWeave reader and writer.',
    'Output Mime Type on a read only sets metadata; it does not transform the content.',
    'Reader properties go in the MIME type, for example application/csv; header=false; separator=|.',
    'CSV: header defaults to true, separator to a comma. With header=false, reach fields by position.',
    'Flat file and fixed width use application/flatfile and require schemaPath.',
    'NDJSON has one object per line, reads as an array, and skipInvalid=true skips bad lines.',
    'XML reader defaults: supportDtd false and externalEntities false, which guards against XXE.',
    'streaming=true is a reader property for sequential access; deferred=true is a writer property.',
  ],
  solution: `
**1. Format per feed.**
| Feed | Format | MIME type | Why |
|---|---|---|---|
| Web API | JSON | application/json | The natural format for web and mobile clients |
| Customs filing | XML | application/xml | Schemas and namespaces |
| Retailer sales | CSV | application/csv | Delimited rows |
| Mainframe inventory | Flat file or fixed width | application/flatfile | Fixed positions need a schema |
| Scanner events | NDJSON | application/x-ndjson | Line-based, so damage stays on one line |

**2. Declaring the type.** Set **Output Mime Type** on the read:
\`\`\`xml
<file:read path="sales.txt"
           outputMimeType="application/csv; header=false; separator=|; streaming=true"/>
\`\`\`
This changes only the metadata. It does not transform the file. Parsing happens when DataWeave reads the content, so a wrong declaration shows up later, in the transform.

**3. Properties.**
- **CSV reader:** \`header\` (default true), \`separator\` (default comma), \`quote\`, \`escape\`, \`headerLineNumber\`, \`bodyStartLineNumber\`, \`ignoreEmptyLine\`, \`streaming\`. With \`header=false\`, use positions: \`payload[107][2]\`.
- **CSV writer:** the same core settings plus \`quoteValues\`, \`quoteHeader\`, \`lineSeparator\` and \`encoding\`.
- **JSON writer:** \`indent=false\` for one line, and \`skipNullOn\` with \`arrays\`, \`objects\` or \`everywhere\`.
- **XML writer:** \`writeDeclaration\`, \`indent\`, \`skipNullOn\` with \`elements\`, \`attributes\` or \`everywhere\`.
- **Flat file:** \`schemaPath\` is required. \`structureIdent\` selects a structure in a flat file schema, and \`segmentIdent\` selects a segment in fixed-width or copybook schemas. \`recordParsing\` defaults to \`strict\`, and \`recordTerminator\` on the writer sets the line break.
- **NDJSON reader:** \`skipInvalid=true\` for the damaged lines. Log how many were lost, because skipped records would otherwise go unnoticed. \`ignoreEmptyLine\` defaults to true.

**4. Unsafe XML and large files.**
- The XML reader defaults are safe: \`supportDtd=false\`, \`externalEntities=false\` (guards against XXE) and \`maxEntityCount=1\` (limits entity expansion). Leave them unless a partner has a proven need.
- For large input, \`streaming=true\` works for sequential access only, and on JSON and CSV the input must be a top-level array. The XML reader's \`collectionPath\` selects the elements to stream. For output, \`deferred=true\` produces a data stream.
`,
  followUps: [
    {
      q: 'When is CSV a poor choice?',
      a: 'When the data is nested or repeats within a record. Rows and columns cannot express that cleanly, so you end up inventing conventions that JSON or XML provides already.',
    },
    {
      q: 'Why choose NDJSON over a JSON array for a long stream?',
      a: 'Each line stands alone, so a producer can keep appending and a damaged line does not spoil the rest. A single JSON array is not complete until its closing bracket arrives.',
    },
    {
      q: 'Can you set reader properties in DataWeave as well?',
      a: 'Yes. The read function takes them, but declaring the type on the operation means every later component sees the correct type.',
    },
  ],
}
