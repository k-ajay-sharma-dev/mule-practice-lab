export default {
  id: 'inc-216',
  category: 'incidents',
  title: "Customers Get \"Unknown File\" When Opening Their Statements: Blobs Stored Without a Content Type",
  level: 'BEGINNER',
  tags: ["myproject","azure-blob","content-type","downloads"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 12:00:01 INFO  [statement-store] Uploaded blob=stmt/C-2210/2026-10.pdf contentType=application/octet-stream", relevant: true, why: "The PDF is stored with a generic type." },
      { text: "2026-11-18 12:05:00 INFO  [portal] GET /statements/C-2210/2026-10 streaming blob=stmt/C-2210/2026-10.pdf contentType=application/octet-stream", relevant: false },
      { text: "2026-11-18 12:05:00 WARN  [portal] Browser could not display file, offered download as \"2026-10\"", relevant: true, why: "The browser does not know it is a PDF." },
      { text: "2026-11-18 12:06:00 INFO  [statement-store] Upload config contentType not set", relevant: true, why: "The upload never sets the type." },
      { text: "2026-11-18 12:07:00 INFO  [statement-store] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the browser not open the PDF?",
        options: [
          "The blob was stored with a generic content type, so the browser does not know it is a PDF",
          "The PDF generator wrote a damaged file, so no viewer can open it",
          "The SAS token in the download link has expired",
          "The storage account has no CORS rule, so the browser blocks the PDF",
        ],
        answer: 0,
        explain: "Azure returns the content type stored with the blob. A generic type gives the browser no hint.",
      },
      {
        type: 'single',
        prompt: "What should the upload set?",
        options: [
          "Content type application/pdf, and a sensible file name for download",
          "Content type application/octet-stream, so every browser saves the file safely",
          "Content encoding gzip, so the browser knows how to read the bytes",
          "A metadata pair type=pdf on the blob",
        ],
        answer: 0,
        explain: "Set the right type at upload so every download is served correctly.",
      },
      {
        type: 'multi',
        prompt: "How do you fix the blobs already stored?",
        options: [
          "Update their properties to set the content type",
          "Upload them again with the type",
          "Leave them, because Azure applies the new upload setting to existing blobs",
          "Rename them so they end in .pdf, and Azure works out the type",
        ],
        answer: [0,1],
        explain: "Old blobs keep the wrong type until their properties are changed or they are uploaded again.",
      },
      {
        type: 'single',
        prompt: "Where does the content type come from?",
        options: [
          "The app knows it made a PDF, so it sets it explicitly",
          "Azure Blob Storage works it out from the first bytes of the file",
          "The browser decides, whatever the server sends",
          "Azure works it out from the .pdf ending of the blob name",
        ],
        answer: 0,
        explain: "The Blob service stores the type it is given and does not guess one. The producer knows the type, so it sets it.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Set the content type on upload",
          "Update existing statement blobs",
          "Test download in two browsers",
          "Add the content type to the upload test",
          "Check other upload flows",
        ],
        explain: "Fix new, fix old, prove it, then look wider.",
      },
    ],
  },
  description: `
## Symptoms
- Customers say statements download as files with no extension and do not open.

## Change / Context
- Statements are generated as PDFs and uploaded to Azure Blob Storage by a Mule app, \`statement-store\`.
- The portal gives customers a link such as \`/statements/C-2210/2026-10\`. It streams the blob back with the content type stored on the blob.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 12:00:01 INFO  [statement-store] Uploaded blob=stmt/C-2210/2026-10.pdf contentType=application/octet-stream
2026-11-18 12:05:00 INFO  [portal] GET /statements/C-2210/2026-10 streaming blob=stmt/C-2210/2026-10.pdf contentType=application/octet-stream
2026-11-18 12:05:00 WARN  [portal] Browser could not display file, offered download as "2026-10"
2026-11-18 12:06:00 INFO  [statement-store] Upload config contentType not set
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    "Blob storage serves the content type stored with the blob.",
    "Set the content type at upload.",
    "A generic type makes browsers download a nameless file.",
    "Existing blobs need their properties updated.",
    "The producer knows the type, so set it explicitly.",
    "Test downloads in a browser.",
  ],
  solution: `
**Diagnosis.** Statements were uploaded without a content type, so they are served as application/octet-stream and browsers cannot display them.

**Immediate mitigation.**
- Update the content type of existing statement blobs to application/pdf.

**Root cause.** The upload operation was configured without a content type.

**Permanent fix.**
- Set the content type and, if needed, a content disposition on every upload.

**Prevention.** Include download checks in tests and review every upload flow.
`,
  followUps: [
    { q: "What is content disposition?", a: "A header that tells the browser to show the file or download it, and under which name." },
    { q: "Can you set metadata too?", a: "Yes, blobs carry name and value metadata, such as the customer ID." },
    { q: "Does the content type change the stored bytes?", a: "No, only how it is served." },
    { q: "How do you update many blobs?", a: "List them by prefix and set properties on each, in batches." },
  ],
}
