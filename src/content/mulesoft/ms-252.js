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
        'The PDF file is broken',
        'The blob has no PDF content type stored',
        'Browsers cannot open blobs directly',
        'The container is set to private access',
      ],
      answer: 1,
      explain: 'The content type stored with the blob is returned on download. Without it, the blob is served as a generic binary type.',
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
      prompt: 'How is user metadata sent when a blob is written through the REST API?',
      options: [
        'In the body, before the content',
        'As headers that start with x-ms-meta-',
        'In a JSON blob stored next to the file',
        'As query parameters on the blob URL',
      ],
      answer: 1,
      explain: 'Each metadata pair becomes a header such as x-ms-meta-source. Connectors usually take a map and build the headers.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about blob metadata are true?',
      options: [
        'Names follow C# identifier rules, so a name with a dash is refused',
        'Names are not case sensitive',
        'Setting metadata replaces all existing metadata on the blob',
        'Metadata can be searched across the whole account with a query',
      ],
      answer: [0, 1, 2],
      explain: 'Metadata is stored with each blob but is not indexed. Blob index tags are the feature built for searching.',
    },
    {
      type: 'single',
      prompt: 'A flow sets the metadata "status" to "done" on a blob that already had "source" and "batch". What remains?',
      options: [
        'source, batch and status',
        'Only status',
        'No metadata at all',
        'source and batch, as status is refused',
      ],
      answer: 1,
      explain: 'Setting metadata replaces the whole set. To add one entry, read the existing metadata and write it back with the new entry.',
    },
    {
      type: 'single',
      prompt: 'Does changing the metadata or properties rewrite the blob content?',
      options: [
        'Yes, the whole blob is uploaded again',
        'No, only the metadata or properties change',
        'Only for blobs larger than 256 MB',
        'Only for blobs in the Archive tier',
      ],
      answer: 1,
      explain: 'Properties and metadata are updated without touching the content. The Last-Modified time and ETag still change.',
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
