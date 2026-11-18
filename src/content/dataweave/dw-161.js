export default {
  id: 'dw-161',
  category: 'dataweave',
  title: 'Parse an Azure List Blobs XML Response into Blobs, Folders and a Next Marker',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'xml', 'list-blobs', 'pagination', 'dates', 'multi-value-selector', 'json'],
  estMinutes: 20,
  description: `
Corriveau Pharma calls the Azure Blob Storage REST API from Mule to list a container page by page. The list call uses a prefix and the \`/\` delimiter, so the answer holds blobs at this level and virtual folders below it. The response is XML.

Turn one page into JSON:

- \`container\`: the \`ContainerName\` attribute of the root element
- \`prefix\`: the \`Prefix\` element
- \`blobs\`: one entry per \`Blob\`, in order, with \`name\`, \`sizeBytes\` (a number from \`Content-Length\`), \`lastModified\` (from \`Last-Modified\`, written as \`yyyy-MM-ddTHH:mm:ssZ\`), \`tier\` (\`AccessTier\`) and \`contentType\` (\`Content-Type\`)
- \`folders\`: the \`Name\` of each \`BlobPrefix\`
- \`nextMarker\`: the \`NextMarker\` text, or \`null\` when it is empty or missing
- \`morePages\`: \`true\` when there is a next marker

A page may have no blobs and no folders.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://corriveaudemo.blob.core.windows.net/" ContainerName="lab-results">
  <Prefix>2026/11/</Prefix>
  <MaxResults>3</MaxResults>
  <Delimiter>/</Delimiter>
  <Blobs>
    <Blob>
      <Name>2026/11/run-0418.csv</Name>
      <Properties>
        <Last-Modified>Wed, 18 Nov 2026 08:15:00 GMT</Last-Modified>
        <Content-Length>52480</Content-Length>
        <Content-Type>text/csv</Content-Type>
        <BlobType>BlockBlob</BlobType>
        <AccessTier>Hot</AccessTier>
      </Properties>
    </Blob>
    <Blob>
      <Name>2026/11/run-0419.json</Name>
      <Properties>
        <Last-Modified>Wed, 18 Nov 2026 09:40:05 GMT</Last-Modified>
        <Content-Length>2048</Content-Length>
        <Content-Type>application/json</Content-Type>
        <BlobType>BlockBlob</BlobType>
        <AccessTier>Cool</AccessTier>
      </Properties>
    </Blob>
    <BlobPrefix>
      <Name>2026/11/rejected/</Name>
    </BlobPrefix>
  </Blobs>
  <NextMarker>2!96!MDAwMDQ0IXJ1bi0wNDIwLmNzdg--</NextMarker>
</EnumerationResults>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "container": "lab-results",
  "prefix": "2026/11/",
  "blobs": [
    { "name": "2026/11/run-0418.csv", "sizeBytes": 52480, "lastModified": "2026-11-18T08:15:00Z", "tier": "Hot", "contentType": "text/csv" },
    { "name": "2026/11/run-0419.json", "sizeBytes": 2048, "lastModified": "2026-11-18T09:40:05Z", "tier": "Cool", "contentType": "application/json" }
  ],
  "folders": ["2026/11/rejected/"],
  "nextMarker": "2!96!MDAwMDQ0IXJ1bi0wNDIwLmNzdg--",
  "morePages": true
}`,
  },
  starterCode: `%dw 2.0
output application/json
var root = payload.EnumerationResults
---
{
  container: root.@ContainerName,
  blobs: root.Blobs.Blob map { name: $.Name }
}
`,
  hints: [
    '`root.Blobs.Blob` returns only the first Blob. The multi value selector `root.Blobs.*Blob` returns all of them.',
    'When a page has no blobs, `*Blob` gives null, and mapping null gives null. Add `default []` before `map`.',
    'Element names with a dash need quotes: `$.Properties."Content-Length"`.',
    'Read the date with `as DateTime {format: "EEE, dd MMM yyyy HH:mm:ss zzz"}`, then write it with `as String {format: "yyyy-MM-dd\'T\'HH:mm:ss\'Z\'"}`.',
    'An empty element may read as an empty string or as null. `isEmpty` is true for both.',
  ],
  solution: `%dw 2.0
output application/json
var root = payload.EnumerationResults
var marker = root.NextMarker

fun isoTime(text) =
  text as DateTime {format: "EEE, dd MMM yyyy HH:mm:ss zzz"} as String {format: "yyyy-MM-dd'T'HH:mm:ss'Z'"}
---
{
  container: root.@ContainerName,
  prefix: root.Prefix,
  blobs: (root.Blobs.*Blob default []) map (b) -> {
    name: b.Name,
    sizeBytes: b.Properties."Content-Length" as Number,
    lastModified: isoTime(b.Properties."Last-Modified"),
    tier: b.Properties.AccessTier,
    contentType: b.Properties."Content-Type"
  },
  folders: (root.Blobs.*BlobPrefix default []) map $.Name,
  nextMarker: if (isEmpty(marker)) null else marker,
  morePages: not isEmpty(marker)
}`,
  explanation: `
**Repeated elements.** In XML a repeated element is a set of keys with the same name. \`.Blob\` returns the first one, \`.*Blob\` returns all of them as a list. Forgetting the star is a common bug that only shows up when a page has two or more blobs.

**Empty pages.** A page can hold zero blobs, for example a prefix with only folders. \`default []\` keeps the output a list in that case.

**Blobs and folders.** With a delimiter, Azure returns blobs at this level as \`Blob\` and every deeper path once as \`BlobPrefix\`. The folders are not real objects, only shared beginnings of names.

**The date format.** \`Last-Modified\` uses the HTTP date format, always in GMT. Parsing it and writing ISO 8601 gives a value that sorts and compares well in later steps.

**The marker.** Azure returns at most \`MaxResults\` items per call. A non empty \`NextMarker\` means more pages. The next call sends it back as the \`marker\` query parameter. The last page has an empty marker, which is why the check uses \`isEmpty\`.
`,
  tests: [
    {
      name: 'Last page with only a folder',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<?xml version="1.0" encoding="utf-8"?><EnumerationResults ContainerName="lab-results"><Prefix>2026/12/</Prefix><Delimiter>/</Delimiter><Blobs><BlobPrefix><Name>2026/12/rejected/</Name></BlobPrefix></Blobs><NextMarker /></EnumerationResults>',
        },
      ],
      expected: '{ "container": "lab-results", "prefix": "2026/12/", "blobs": [], "folders": ["2026/12/rejected/"], "nextMarker": null, "morePages": false }',
    },
    {
      name: 'One blob and no folders',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<?xml version="1.0" encoding="utf-8"?><EnumerationResults ContainerName="archive"><Prefix>x/</Prefix><Blobs><Blob><Name>x/a.pdf</Name><Properties><Last-Modified>Mon, 02 Nov 2026 23:59:59 GMT</Last-Modified><Content-Length>10</Content-Length><Content-Type>application/pdf</Content-Type><AccessTier>Archive</AccessTier></Properties></Blob></Blobs><NextMarker/></EnumerationResults>',
        },
      ],
      expected:
        '{ "container": "archive", "prefix": "x/", "blobs": [{ "name": "x/a.pdf", "sizeBytes": 10, "lastModified": "2026-11-02T23:59:59Z", "tier": "Archive", "contentType": "application/pdf" }], "folders": [], "nextMarker": null, "morePages": false }',
    },
  ],
  followUps: [
    {
      q: 'How would a Mule flow read every page?',
      a: 'Call the list operation, process the page, and call again with the returned marker until it is empty. A recursive flow reference or a loop with a variable works. Keep the page size moderate so each page fits in memory.',
    },
    {
      q: 'Why not list the whole container without a delimiter?',
      a: 'Without a delimiter every blob under the prefix comes back, including deep paths. That can be millions of entries. The delimiter returns one level, like a folder view.',
    },
    {
      q: 'Can you sort by last modified on the server?',
      a: 'No. The list returns names in name order only. Sorting by time needs all pages first, or a naming scheme with the date in the name.',
    },
  ],
}
