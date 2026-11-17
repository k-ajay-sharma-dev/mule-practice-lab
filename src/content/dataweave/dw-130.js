export default {
  id: 'dw-130',
  category: 'dataweave',
  title: 'Split Uploaded File Names into Name and Extension',
  level: 'BEGINNER',
  tags: ['dw::core::Strings', 'substringBeforeLast', 'substringAfterLast', 'strings', 'map', 'json'],
  estMinutes: 10,
  description: `
Harbour Mutual is an insurer. Its claims portal lets customers upload photos and documents. Before a file goes to the claims team, an integration checks the file type from the name.

Output one object per upload with:

- \`uploadId\`: copied from the input
- \`baseName\`: the name without the last dot and what follows it
- \`extension\`: the part after the **last** dot, in lower case
- \`accepted\`: \`true\` when the extension is \`pdf\`, \`jpg\` or \`png\`

A name can hold more than one dot, such as \`repair.quote.2026.pdf\`. Only the last dot starts the extension. A name with no dot has an empty \`extension\`, keeps its whole name as \`baseName\`, and is not accepted.

The \`dw::core::Strings\` module has \`substringBeforeLast\` and \`substringAfterLast\`. Each takes the text and a separator.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "uploadId": "U-101", "fileName": "car-front.JPG" },
  { "uploadId": "U-102", "fileName": "repair.quote.2026.pdf" },
  { "uploadId": "U-103", "fileName": "notes" },
  { "uploadId": "U-104", "fileName": "dashcam.mov" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "uploadId": "U-101", "baseName": "car-front", "extension": "jpg", "accepted": true },
  { "uploadId": "U-102", "baseName": "repair.quote.2026", "extension": "pdf", "accepted": true },
  { "uploadId": "U-103", "baseName": "notes", "extension": "", "accepted": false },
  { "uploadId": "U-104", "baseName": "dashcam", "extension": "mov", "accepted": false }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (upload) -> {
  uploadId: upload.uploadId,
  baseName: upload.fileName,
  extension: "",
  accepted: false
}
`,
  hints: [
    'Bring the two functions in above the `---` line: `import substringBeforeLast, substringAfterLast from dw::core::Strings`.',
    '`substringAfterLast("repair.quote.2026.pdf", ".")` gives `"pdf"`. Wrap it in `lower(...)` so `JPG` becomes `jpg`.',
    'Check for a dot first with `upload.fileName contains "."`, and use `if` / `else` for names that have none.',
    'Keep the allowed list in a `var` and test it with `allowed contains extension`.',
  ],
  solution: `%dw 2.0
import substringBeforeLast, substringAfterLast from dw::core::Strings
output application/json
var allowed = ["pdf", "jpg", "png"]
---
payload map (upload) -> do {
  var hasDot = upload.fileName contains "."
  var extension = if (hasDot) lower(substringAfterLast(upload.fileName, ".")) else ""
  ---
  {
    uploadId: upload.uploadId,
    baseName: if (hasDot) substringBeforeLast(upload.fileName, ".") else upload.fileName,
    extension: extension,
    accepted: allowed contains extension
  }
}`,
  explanation: `
**The last dot.** \`substringAfterLast\` looks for the last place the separator appears and returns what follows it. \`substringBeforeLast\` returns what comes before that same dot. So \`repair.quote.2026.pdf\` splits into \`repair.quote.2026\` and \`pdf\`. With \`splitBy "."\` you would get four parts and need to join three of them again.

**Lower case.** People save files as \`JPG\`, \`Jpg\` and \`jpg\`. \`lower\` makes them all the same before the check, so the allowed list holds one spelling of each type.

**No dot.** The brief says what to do when there is no dot, so the script checks for one first instead of relying on what the two functions return in that case. The \`do\` block keeps \`hasDot\` and \`extension\` local to each upload.

**The check.** \`allowed contains extension\` is \`true\` when the list holds that exact text. An empty extension is never in the list, so \`notes\` is refused.
`,
  tests: [
    {
      name: 'Upper case and mixed case types',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "uploadId": "U-1", "fileName": "Invoice.PDF" }, { "uploadId": "U-2", "fileName": "scratch.Png" }]',
        },
      ],
      expected:
        '[{ "uploadId": "U-1", "baseName": "Invoice", "extension": "pdf", "accepted": true }, { "uploadId": "U-2", "baseName": "scratch", "extension": "png", "accepted": true }]',
    },
    {
      name: 'A type that is not allowed',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "uploadId": "U-3", "fileName": "claim.form.docx" }]' }],
      expected: '[{ "uploadId": "U-3", "baseName": "claim.form", "extension": "docx", "accepted": false }]',
    },
    {
      name: 'No uploads',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Is the extension enough to trust a file?',
      a: 'No. Anyone can rename a file. The name check is a quick first filter. The system that stores the file should also read its first bytes or its content type, and scan it.',
    },
    {
      q: 'A file is called `.env`. What does your script give?',
      a: 'It has a dot, so `baseName` is an empty string and `extension` is `env`. If such names should keep their whole name, also check that the dot is not the first character, for example with `upload.fileName startsWith "."`.',
    },
    {
      q: 'How would you also strip a folder path such as `photos/2026/car.jpg`?',
      a: 'Take `substringAfterLast(upload.fileName, "/")` first to keep only the file name, then split off the extension as before. Check for a slash in the same way you check for a dot.',
    },
  ],
}
