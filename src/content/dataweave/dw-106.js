import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

const xml = '<order id="7"><item>A</item><item>B</item></order>'
const asXml = { payload: xml, inputMime: 'application/xml' }

export default {
  id: 'dw-106',
  category: 'dataweave',
  title: 'Read the Output: XML and CSV',
  level: 'ADVANCED',
  tags: ['xml', 'csv', 'data-formats', 'read-the-output'],
  estMinutes: 12,
  exercise: 'quiz',
  description: `
Formats have rules that JSON doesn't: XML has attributes, repeated elements and a single root, and CSV needs flat rows. These questions check the ones that catch people out.

Work out each result before you choose.
`,
  quiz: [
    out({
      ...asXml,
      body: 'payload.order.@id',
      right: '"7"',
      wrong: ['7', 'null', '{"id": "7"}'],
      explain: '`.@name` reads an attribute. XML has no number type, so the value is text until you convert it.',
    }),
    out({
      ...asXml,
      body: 'payload.order.item',
      right: '"A"',
      wrong: ['["A", "B"]', '"B"', 'null'],
      explain: 'Repeated elements are repeated keys, so `.item` returns only the first one. This bug hides until a real message has two items.',
    }),
    out({
      ...asXml,
      body: 'payload.order.*item',
      right: '["A", "B"]',
      wrong: ['"A"', '"AB"', '[{"item": "A"}, {"item": "B"}]'],
      explain: '`.*item` returns every repeated element, and it still gives an array when there is only one.',
    }),
    out({
      output: 'application/xml writeDeclaration=false',
      body: '{ order @(id: 7): { item: "A" } }',
      right: '<order id="7"><item>A</item></order>',
      wrong: ['<order><id>7</id><item>A</item></order>', '<order id="7" item="A"/>', FAILS],
      explain: '`@(...)` after a key writes attributes on that element. `writeDeclaration=false` leaves out the `<?xml ...?>` line.',
    }),
    out({
      output: 'application/xml',
      body: '{ a: 1, b: 2 }',
      right: FAILS,
      wrong: ['<a>1</a><b>2</b>', '<root><a>1</a><b>2</b></root>', '<a b="2">1</a>'],
      error: 'root',
      explain: 'An XML document needs exactly one root element, and DataWeave will not invent one. Wrap the object in a single key.',
    }),
    out({
      payload: '[{"a": 1, "b": "x"}]',
      output: 'application/csv',
      body: 'payload',
      right: 'a,b\n1,x',
      wrong: ['1,x', '"a","b"\n"1","x"', 'a=1,b=x'],
      explain: 'The CSV writer uses the keys as a header row by default. Set `header=false` to leave it out.',
    }),
  ],
  answerTemplate: `## How to read attributes and repeated elements

## What XML output requires

## What CSV output requires
`,
  keyPoints: [
    '.@name reads an attribute, and the value is text.',
    '.item returns the first repeated element, and .*item returns all.',
    'XML output needs a single root.',
    'CSV output takes the header from the keys and needs flat rows.',
  ],
  solution: `
Read attributes with \`.@name\`. Repeated elements behave as repeated keys, so always use \`.*item\` for anything that can occur more than once. That also gives an array when only one element arrives.

XML output needs a single root and uses \`@(...)\` for attributes.

CSV output needs an array of flat objects. The keys become the header row unless you set \`header=false\`.
`,
  followUps: [
    { q: 'Why can `.item` pass testing and still fail in production?', a: 'Test messages often hold one item. Real messages with two lose the second one without any error.' },
    { q: 'What do you do with nested data going to CSV?', a: 'Flatten it first with map or flatMap, so each row is a flat object.' },
  ],
}
