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
      prompt: 'The nightly flow calls List Blobs once, with a page size of 5,000, on a container of 3 million blobs, and processes what comes back. It misses files. Why?',
      options: [
        'The service leaves blobs out once a container passes a size limit',
        'A page size of 5,000 is over the limit, so the service returned fewer',
        'It handled only the first page and never followed the NextMarker',
        'Listings return the newest blobs last, so the newest were cut off',
      ],
      answer: 2,
      explain: 'Listing is paged. Each call returns at most the page size, which has an upper limit of 5,000, and a NextMarker when there is more. One call is one page. There is no container size at which blobs leave the listing, 5,000 is allowed, and listings come back in name order, not by age.',
    },
    {
      type: 'single',
      prompt: 'A page comes back with fewer results than the page size. Does that mean the listing is complete?',
      options: [
        'Yes, a short page means the server ran out of blobs',
        'No, only an empty next marker means the end',
        'Only when the page has no results',
        'Yes, if it also has no BlobPrefix entries',
      ],
      answer: 1,
      explain: 'A page can be short while more remain. Loop until the marker is empty. Stopping on a short page can miss blobs.',
    },
    {
      type: 'single',
      prompt: 'A container holds inbound/a.csv, inbound/2026/11/b.csv and inbound/2026/12/c.csv. The flow lists with prefix "inbound/" and delimiter "/". What comes back?',
      options: [
        'Three blobs, a.csv, b.csv and c.csv, with their full names',
        'Only the BlobPrefix inbound/2026/, as a delimiter hides blobs',
        'The blob inbound/a.csv and the prefixes inbound/2026/11/ and inbound/2026/12/',
        'The blob inbound/a.csv and one BlobPrefix entry, inbound/2026/',
      ],
      answer: 3,
      explain: 'Blobs directly under the prefix come back as blobs. The delimiter folds everything below the next slash into one BlobPrefix entry, which gives a folder view. Without a delimiter all three blobs would come back. The fold happens at the first slash after the prefix, so the deeper folders appear only when you list inbound/2026/ next.',
    },
    {
      type: 'multi',
      prompt: 'The nightly flow wants CSV carrier files under carriers/, changed since yesterday and larger than 1 KB. Which of these can List Blobs filter on the server?',
      options: ['Names that start with carriers/', 'Names that end in .csv', 'Last modified after a date', 'Content type equals text/csv', 'Size above a value'],
      answer: [0],
      explain: 'The server filters by name prefix. Dates, types and sizes must be filtered by the client after listing, or designed into the names. A prefix matches only the start of a name, so an extension cannot be filtered on the server either.',
    },
    {
      type: 'single',
      prompt: 'Names look like carriers/<carrier>/<file id>.csv. A flow lists carriers/ and stops after the first 100 results, expecting the 100 newest files. What does it get?',
      options: ['The 100 newest files, as a listing returns newest first', 'The first 100 names in name order, whatever their age', 'The first 100 uploaded, as a listing keeps upload order', 'The 100 largest files, as a listing sorts by size'],
      answer: 1,
      explain: 'Results come back in name order. A date in the name is the way to get time order from a listing. Here the names start with the carrier, so the first 100 are from the carriers early in the alphabet.',
    },
    {
      type: 'single',
      prompt: 'A nightly flow must find yesterday\'s files in a container with 3 years of data. What is the best design?',
      options: [
        'List everything and filter by Last-Modified',
        'Put the date in blob names and list by prefix',
        'List carriers/ only, then filter by Last-Modified',
        'List with a page size of 5,000 to go faster',
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
