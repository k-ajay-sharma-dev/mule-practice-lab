export default {
  id: 'ms-252',
  category: 'mulesoft',
  title: 'Content Type, Content Disposition and Metadata on Uploaded Blobs',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'blob-metadata', 'content-type', 'http-headers', 'fundamentals', 'media'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule flow uploads PDF reports without setting a content type. Users open the link and the browser downloads an unknown file. Why?',
      options: [
        'The blob was written as an append blob',
        'The blob was stored as application/octet-stream',
        'The blob has Content-Disposition inline',
        'The container is set to private access',
      ],
      answer: 1,
      explain: 'With no content type on the upload, Azure stores application/octet-stream and returns it on download, so the browser treats the PDF as generic binary. The blob type does not change how a PDF is served. Inline disposition asks the browser to open the file, not download it. A private container refuses the link instead of serving a file.',
    },
    {
      type: 'match',
      prompt: 'Match each blob property to what it controls.',
      pairs: [
        ['Content-Type', 'What kind of data the blob holds'],
        ['Content-Disposition', 'Whether a browser shows the file or saves it, and the file name'],
        ['Content-Encoding', 'How the stored bytes are encoded, such as gzip'],
        ['Cache-Control', 'How long clients and caches may keep a copy'],
      ],
      explain: 'These are stored with the blob and sent back as HTTP headers when it is read.',
    },
    {
      type: 'single',
      prompt: 'A flow calls Put Blob through an HTTP Request and sends a header "source: erp" to store the source with the file. The upload works, but the blob shows no metadata. What is wrong?',
      options: [
        'Custom headers need the x-ms- prefix, as in x-ms-source',
        'Metadata needs a Set Blob Metadata call after the upload',
        'Metadata headers need the x-ms-meta- prefix, as in x-ms-meta-source',
        'Metadata goes in one x-ms-tags header, as source=erp',
      ],
      answer: 2,
      explain: 'Each metadata pair becomes a header such as x-ms-meta-source. x-ms-source is not a metadata header, as the prefix must be x-ms-meta-. Connectors usually take a map and build the headers. Put Blob accepts metadata headers with the upload, so no second call is needed, though Set Blob Metadata also exists. The body holds only the content. The x-ms-tags header sets blob index tags, which are a separate feature from metadata.',
    },
    {
      type: 'multi',
      prompt: 'A flow writes metadata on each uploaded blob, and a report later needs to find blobs by those values. Which statements are true?',
      options: [
        'A name such as batch-id is refused, as names follow C# identifier rules',
        'batchId and BATCHID name the same entry, as names are not case sensitive',
        'Writing one new entry later replaces all existing metadata on the blob',
        'The report can query blobs by a metadata value across the whole account',
        'The metadata stays when a new upload overwrites the blob without metadata',
      ],
      answer: [0, 1, 2],
      explain: 'Metadata is stored with each blob but is not indexed. Blob index tags are the feature built for searching. An upload that overwrites a blob replaces its metadata too, so an upload with none leaves none.',
    },
    {
      type: 'single',
      prompt: 'A flow sets the metadata "status" to "done" on a blob that already had "source" and "batch". What remains?',
      options: [
        'source, batch and status',
        'Only status',
        'All three, as the connector merges maps',
        'source and batch, as status is refused',
      ],
      answer: 1,
      explain: 'Setting metadata replaces the whole set. To add one entry, read the existing metadata and write it back with the new entry.',
    },
    {
      type: 'single',
      prompt: 'A flow marks a 4 GB blob as processed by setting its metadata. Another flow compares ETags, and a lifecycle rule uses Last-Modified. What changes?',
      options: [
        'The content is written again, so the ETag and Last-Modified change',
        'Only the metadata changes, and the ETag stays as the content is the same',
        'Only the metadata changes, but the ETag and Last-Modified change too',
        'Only the metadata changes, and Last-Modified stays as only content counts',
      ],
      answer: 2,
      explain: 'Properties and metadata are updated without touching the content. The Last-Modified time and ETag still change. So the content is not uploaded again, but any flow that compares ETags or ages blobs by Last-Modified sees a change.',
    },
  ],
  description: `
Lanthorn Media stores article images and PDF reports in Azure Blob Storage from a Mule app. Editors complain that PDF links download a file called after a long id instead of opening in the browser. The analytics team also wants to know which system created each blob.

**Questions**
1. Which blob properties control how a browser treats a file?
2. What is blob metadata, and what are its rules?
3. What goes wrong when a flow updates metadata?
4. What would you set on each upload?
`,
  answerTemplate: `## Properties for browsers

## Metadata rules

## Updating metadata

## What to set on upload
`,
  keyPoints: [
    'Content-Type tells clients what the blob holds and is returned on download.',
    'Content-Disposition decides between showing and saving, and the file name.',
    'Metadata is name value pairs sent as x-ms-meta- headers.',
    'Metadata names follow C# identifier rules and are not case sensitive.',
    'Setting metadata replaces the whole set, so read, merge and write.',
    'Changing properties or metadata updates Last-Modified and the ETag but not the content.',
  ],
  solution: `
**1. Properties for browsers.** \`Content-Type\` says what the blob is, such as \`application/pdf\`. When it is missing, the blob is served as a generic binary type and browsers save it. \`Content-Disposition\` set to \`inline\` with a file name asks the browser to show it under a friendly name. \`Cache-Control\` and \`Content-Encoding\` matter for images and compressed files.

**2. Metadata rules.** Metadata is a set of name value pairs stored with the blob and sent as \`x-ms-meta-\` headers. Names must be valid C# identifiers, so letters, digits and underscores, not starting with a digit. Names are not case sensitive. Values travel as HTTP headers, so keep them short and ASCII, or encode them. Metadata is not indexed for searching.

**3. Updating metadata.** Setting metadata replaces every existing entry. A flow that writes only \`status\` erases \`source\` and \`batch\`. Read the current metadata, merge in the change, and write the full set. Use the ETag as a condition if two flows can update the same blob.

**4. On each upload.** Set the content type from the file type, a content disposition for files people open, and metadata such as \`source\`, \`batchid\` and \`createdby\` for analytics. Fix the existing PDFs by setting their properties, which does not upload the content again.
`,
  followUps: [
    {
      q: 'The analytics team wants every blob created by the ERP. Does metadata help?',
      a: 'Not for searching, since metadata is not indexed. Use blob index tags, a naming prefix per system, or a catalogue table written by the flow.',
    },
    {
      q: 'How would you store a value with accented letters in metadata?',
      a: 'URL encode or Base64 encode it before writing, and decode it when reading. Header values outside ASCII can be refused or changed.',
    },
    {
      q: 'Why does the ETag change after a metadata update?',
      a: 'The ETag marks any change to the blob, including properties and metadata. A writer that holds an old ETag will see its conditional write fail.',
    },
  ],
}
