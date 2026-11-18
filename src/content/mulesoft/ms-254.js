export default {
  id: 'ms-254',
  category: 'mulesoft',
  title: 'Listing Blobs at Scale: Prefixes, Delimiters, Page Size and Continuation Markers',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'list-blobs', 'pagination', 'prefix', 'performance', 'logistics'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A container holds 2 million blobs. What does one List Blobs call return?',
      options: [
        'All 2 million',
        'One page of results, up to the requested page size, with a marker when more remain',
        'Only the first 100, always',
        'An error, because the container is too big',
      ],
      answer: 1,
      explain: 'Listing is paged. Each call returns at most the page size, which has an upper limit of 5,000, and a NextMarker when there is more.',
    },
    {
      type: 'single',
      prompt: 'A page comes back with fewer results than the page size. Does that mean the listing is complete?',
      options: [
        'Yes, always',
        'No. Only an empty next marker means the end, since a page can be short while more remain.',
        'Only when the page is empty',
        'Only for prefixes',
      ],
      answer: 1,
      explain: 'Loop until the marker is empty. Stopping on a short page can miss blobs.',
    },
    {
      type: 'single',
      prompt: 'What does the delimiter "/" change in a listing with prefix "inbound/"?',
      options: [
        'Nothing',
        'Blobs directly under the prefix come back as blobs, and deeper paths come back once each as virtual folder prefixes',
        'It returns only folders',
        'It sorts by date',
      ],
      answer: 1,
      explain: 'The delimiter folds everything below the next slash into one BlobPrefix entry, which gives a folder view.',
    },
    {
      type: 'multi',
      prompt: 'Which filters does the List Blobs call apply on the server?',
      options: ['A name prefix', 'Last modified after a date', 'Content type equals text/csv', 'Size above a value'],
      answer: [0],
      explain: 'The server filters by name prefix. Dates, types and sizes must be filtered by the client after listing, or designed into the names.',
    },
    {
      type: 'single',
      prompt: 'In what order does the listing return blobs?',
      options: ['By last modified, newest first', 'In order of their names', 'Random', 'By size'],
      answer: 1,
      explain: 'Results come back in name order. A date in the name is the way to get time order from a listing.',
    },
    {
      type: 'single',
      prompt: 'A nightly flow must find yesterday\'s files in a container with 3 years of data. What is the best design?',
      options: [
        'List everything and filter by Last-Modified',
        'Put the date in the blob names and list with the prefix for yesterday',
        'Download every blob and check its content',
        'Create a new storage account each day',
      ],
      answer: 1,
      explain: 'A date prefix turns a scan of millions of blobs into a short listing of one day.',
    },
  ],
  description: `
Ravensmoor Logistics stores proof of delivery images and carrier files in one Azure Blob container. A Mule flow lists the container each night to find new carrier files. The container now holds 3 million blobs, the flow takes 40 minutes, and last week it missed files.

**Questions**
1. How does listing work, and why did the flow miss files?
2. What do prefixes and delimiters do?
3. Which filters run on the server, and which do not?
4. How would you redesign the names and the flow?
`,
  answerTemplate: `## How listing works

## Prefixes and delimiters

## Server and client filters

## Redesign
`,
  keyPoints: [
    'Listing is paged, with a page size limit and a continuation marker.',
    'Only an empty marker means the end, since pages can be short.',
    'Prefix filters on the server. A delimiter gives a folder view.',
    'Dates, sizes and types are not server side filters in List Blobs.',
    'Results come back in name order.',
    'Put the system and date in names so the flow can list a narrow prefix.',
  ],
  solution: `
**1. How listing works.** List Blobs returns one page per call, up to the page size, with an upper limit of 5,000 entries. When more remain, the response has a \`NextMarker\`, which the next call sends back. The flow stopped when a page came back with fewer entries than the page size, but a short page does not mean the end. That is why it missed files. Loop until the marker is empty.

**2. Prefixes and delimiters.** A prefix returns only names that start with it, filtered on the server. A delimiter such as \`/\` returns blobs at that level and folds deeper paths into one \`BlobPrefix\` each, which gives a folder like view and smaller pages.

**3. Server and client filters.** The server filters by name prefix only. Last modified, size and content type come back as properties, and the flow must filter them itself after paging through everything. Blob index tags allow a search by tag, if the team adopts them.

**4. Redesign.** Separate the images from the carrier files, by container or by a top level prefix. Name carrier files like \`carrier/<carrier>/<yyyy>/<MM>/<dd>/<file>\`. The nightly flow then lists \`carrier/\` with yesterday's date path and gets a few hundred entries. Ask for metadata in the list only if the flow needs it, to keep pages small. Old blobs can move to a cooler tier by lifecycle rule without affecting the listing.
`,
  followUps: [
    {
      q: 'Can you run several list calls in parallel to go faster?',
      a: 'Yes, by splitting the work by prefix, such as one call per carrier. One listing cannot be split, since each page needs the marker from the page before.',
    },
    {
      q: 'Is a NextMarker valid forever?',
      a: 'Treat it as short lived and opaque. Use it for the next call in the same run, and start a fresh listing on the next run.',
    },
    {
      q: 'How would you find carrier files when the names cannot change?',
      a: 'Keep a watermark of the last run and filter by Last-Modified after listing, or react to Event Grid BlobCreated events instead of listing at all.',
    },
  ],
}
