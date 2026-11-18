export default {
  id: 'dw-165',
  category: 'dataweave',
  title: 'Build the Create File Request for an Azure File Share Upload',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'rest-api', 'create-file', 'http-headers', 'splitBy', 'json'],
  estMinutes: 10,
  description: `
Brindle Outdoor writes export files to an Azure file share from a Mule app on CloudHub, using the REST API. The first call is Create File. It creates the file with its full size and no content yet. The content is written afterwards with Put Range calls.

Build the request that an HTTP Request operation will send:

- \`method\`: always \`PUT\`
- \`url\`: \`https://\` + the account + \`.file.core.windows.net/\` + the share + \`/\` + the directory path + \`/\` + the file name
- \`headers\`:
  - \`x-ms-type\`: always \`file\`
  - \`x-ms-content-length\`: the file size in bytes, as text
  - \`x-ms-content-type\`: the file content type
  - \`x-ms-version\`: the API version from the input

The directory may have slashes at the start or end, or doubled slashes. Drop empty parts, so \`/sales//2026/\` becomes \`sales/2026\`. When the directory is empty, the file goes in the root of the share, with no extra slash.

The credential is added by the connector configuration, so it is not part of this request. Older API versions also require some SMB property headers. This problem assumes a version where they are optional.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "share": { "account": "brindleexports", "name": "planning-out" },
  "directory": "/sales/2026/11/",
  "file": { "name": "SALES_20261118_0001.csv", "sizeBytes": 2483201, "contentType": "text/csv" },
  "apiVersion": "2023-11-03"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "method": "PUT",
  "url": "https://brindleexports.file.core.windows.net/planning-out/sales/2026/11/SALES_20261118_0001.csv",
  "headers": {
    "x-ms-type": "file",
    "x-ms-content-length": "2483201",
    "x-ms-content-type": "text/csv",
    "x-ms-version": "2023-11-03"
  }
}`,
  },
  starterCode: `%dw 2.0
output application/json
var s = payload.share
---
{
  method: "PUT",
  url: "https://" ++ s.account ++ ".file.core.windows.net/" ++ s.name ++ payload.directory ++ payload.file.name
}
`,
  hints: [
    'Clean the directory with `(payload.directory default "") splitBy "/" filter (not isEmpty($)) joinBy "/"`. Empty parts come from leading, trailing or doubled slashes.',
    'Build the path with an `if`: the file name alone when the directory is empty, otherwise directory, slash, file name.',
    'Header names with dashes need quotes: `"x-ms-type": "file"`.',
    'Headers are text, so write the size with `as String`.',
  ],
  solution: `%dw 2.0
output application/json
var s = payload.share
var dir = ((payload.directory default "") splitBy "/") filter (not isEmpty($)) joinBy "/"
var path = if (isEmpty(dir)) payload.file.name else dir ++ "/" ++ payload.file.name
---
{
  method: "PUT",
  url: "https://" ++ s.account ++ ".file.core.windows.net/" ++ s.name ++ "/" ++ path,
  headers: {
    "x-ms-type": "file",
    "x-ms-content-length": payload.file.sizeBytes as String,
    "x-ms-content-type": payload.file.contentType,
    "x-ms-version": payload.apiVersion
  }
}`,
  explanation: `
**One file, full size.** Create File reserves the whole file, sized by \`x-ms-content-length\`. Nothing is written yet. Put Range calls fill it afterwards. If the declared size is larger than the data, the end of the file reads as zero bytes, so the size must be exact.

**Cleaning the path.** Splitting on \`/\` and dropping empty parts handles a leading slash, a trailing slash and doubled slashes in one step. Joining again gives a clean path.

**The root case.** With no directory, the path is the file name alone. Without the \`if\`, the URL would hold a double slash, which points to a different and wrong path.

**Text headers.** HTTP headers are text. Writing the size \`as String\` makes the request clear about what is sent.

**Directories must exist.** Unlike blob names, a file share needs real directories. A flow creates \`sales\`, \`sales/2026\` and \`sales/2026/11\` before this call, and treats "already exists" as success.
`,
  tests: [
    {
      name: 'File in the root of the share',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "share": { "account": "brindleexports", "name": "drop" }, "directory": "/", "file": { "name": "items.txt", "sizeBytes": 0, "contentType": "text/plain" }, "apiVersion": "2023-11-03" }',
        },
      ],
      expected:
        '{ "method": "PUT", "url": "https://brindleexports.file.core.windows.net/drop/items.txt", "headers": { "x-ms-type": "file", "x-ms-content-length": "0", "x-ms-content-type": "text/plain", "x-ms-version": "2023-11-03" } }',
    },
    {
      name: 'Doubled slashes in the directory',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "share": { "account": "brindleexports", "name": "planning-out" }, "directory": "inventory//stores/", "file": { "name": "INV_S0412.dat", "sizeBytes": 58210, "contentType": "application/octet-stream" }, "apiVersion": "2023-11-03" }',
        },
      ],
      expected:
        '{ "method": "PUT", "url": "https://brindleexports.file.core.windows.net/planning-out/inventory/stores/INV_S0412.dat", "headers": { "x-ms-type": "file", "x-ms-content-length": "58210", "x-ms-content-type": "application/octet-stream", "x-ms-version": "2023-11-03" } }',
    },
  ],
  followUps: [
    {
      q: 'Why does Create File need the size before any content is sent?',
      a: 'A file in Azure Files has a fixed length from creation. Put Range writes into that space, and any part never written reads as zeros.',
    },
    {
      q: 'Where would the SAS token go in this request?',
      a: 'In the query string of the URL, added from secure properties by the HTTP configuration. Keep it out of the payload and mask it in logs.',
    },
    {
      q: 'What if a file name holds a space or a hash sign?',
      a: 'Encode each path part for a URL before joining. A raw hash sign would cut the URL, and a space would break the request.',
    },
  ],
}
