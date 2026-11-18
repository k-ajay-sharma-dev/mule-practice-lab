export default {
  id: 'ms-234',
  category: 'mulesoft',
  title: 'HTTP Streaming in Practice: Chunked Responses, Streaming Modes and Large Downloads',
  level: 'INTERMEDIATE',
  tags: ['http', 'streaming', 'chunked', 'http-listener', 'http-request', 'memory', 'performance', 'media'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A response has the header `Transfer-Encoding: chunked`. What does it mean?',
      options: [
        'The body is compressed',
        'The body is sent in pieces, and the total length is not given up front',
        'The body is split into several HTTP requests',
        'The body is encrypted',
      ],
      answer: 1,
      explain: 'Chunked transfer sends the body in pieces with a size before each piece. The sender does not need to know the total size first.',
    },
    {
      type: 'single',
      prompt: 'A legacy client cannot read chunked responses. Which HTTP Listener setting can force a Content-Length instead?',
      options: ['responseStreamingMode set to NEVER', 'followRedirects set to false', 'parseRequest set to false', 'A larger connection idle timeout'],
      answer: 0,
      explain: 'NEVER makes the listener send a Content-Length. To know the length, the whole body must be ready first, which costs memory or disk for large bodies.',
    },
    {
      type: 'single',
      prompt: 'With the streaming mode left on AUTO, what does the listener generally do?',
      options: [
        'Always sends chunked',
        'Sends a Content-Length when the size is known, and chunked when it is not',
        'Always buffers the whole body',
        'Refuses bodies over 10 MB',
      ],
      answer: 1,
      explain: 'AUTO picks based on what it knows about the payload. Check the exact rules for your connector version if a client is sensitive to it.',
    },
    {
      type: 'multi',
      prompt: 'A flow passes a 2 GB file from SFTP to the HTTP response. Which steps would stop it from streaming?',
      options: [
        'A Logger that prints the whole payload',
        'A DataWeave step that sorts every record with orderBy',
        'A Transform that calls sizeOf on the whole payload before the response',
        'Passing the SFTP read result straight to the response',
      ],
      answer: [0, 1, 2],
      explain: 'Logging, sorting and counting the whole payload all need every byte at once. Passing the stream straight through keeps it streaming.',
    },
    {
      type: 'single',
      prompt: 'A repeatable file store stream holds more data than its in-memory buffer. What happens?',
      options: [
        'The app fails with an error',
        'The extra data is buffered to a temporary file on disk',
        'The extra data is dropped',
        'The stream turns non-repeatable',
      ],
      answer: 1,
      explain: 'The file store strategy keeps a part in memory and moves the rest to disk, so a large stream can still be read more than once.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to investigate a slow, memory-hungry download endpoint.',
      items: [
        'Call the endpoint and check its response headers for chunked or Content-Length',
        'Watch heap use during a large download',
        'Find steps that read the whole payload, such as logs or sorts',
        'Change those steps so the body streams',
        'Load test again with real file sizes',
      ],
      explain: 'Measure first, find the step that buffers, fix it, and prove the fix with the same test.',
    },
  ],
  description: `
Brightmoor Media offers broadcasters a download API for video archive files, many over 1 GB. The Mule app reads each file from SFTP and returns it from an HTTP Listener. Two problems came up in one week:

- During busy hours the app restarts with out of memory errors.
- One broadcaster's old ingest system says the downloads are "missing a length" and refuses them.

**Questions**
1. What is chunked transfer encoding, and why does Mule use it?
2. Which listener settings control it, and what does each choice cost?
3. Which steps in a flow stop a large body from streaming?
4. How do you serve the legacy client without breaking the others?
`,
  answerTemplate: `## Chunked transfer

## Streaming modes

## What breaks streaming

## The legacy client
`,
  keyPoints: [
    'Chunked transfer sends a body without knowing its length first.',
    'The listener streaming mode AUTO, ALWAYS or NEVER controls chunked or Content-Length.',
    'NEVER needs the whole body before sending, which costs memory or disk.',
    'Logging, sorting or counting the whole payload stops streaming.',
    'Repeatable file store streams move large data to disk.',
    'A separate endpoint or config can serve a client that needs Content-Length.',
  ],
  solution: `
**1. Chunked transfer.** In HTTP/1.1, a body can be sent in chunks, each with its size, ending with an empty chunk. The sender does not need the total size first. That lets Mule start sending a 2 GB file as soon as the first bytes arrive from SFTP, without holding it all.

**2. Streaming modes.** The HTTP Listener has a response streaming mode. AUTO generally sends a Content-Length when the size is known and chunked when it is not. ALWAYS sends chunked. NEVER sends a Content-Length, which means the whole body must be ready first, in memory or in a file buffer. The HTTP Request has a matching setting for request bodies. Check the exact behaviour for your connector version.

**3. What breaks streaming.** Any step that needs all of the data at once: a Logger that prints the payload, a DataWeave sort, group or count over the whole body, or reading the payload into a string. The out of memory restarts usually come from one of these. Keep the body moving from the SFTP read to the response, and log only the file name and size.

**4. The legacy client.** If the SFTP attributes give the file size, try setting a Content-Length header from it, and test that the listener keeps it and still streams. If that does not work in your version, give that client its own endpoint with NEVER and a limit on file size, and accept the memory or disk cost for that one path.
`,
  followUps: [
    {
      q: 'Does HTTP/2 use chunked transfer encoding?',
      a: 'No. HTTP/2 splits every body into frames, so the chunked header is an HTTP/1.1 feature. Check what your load balancer speaks to the client and to Mule.',
    },
    {
      q: 'Why can a proxy in front of Mule still buffer the whole file?',
      a: 'Some proxies and gateways buffer bodies by default. Streaming in Mule only helps if each hop to the client also streams, so check their settings too.',
    },
    {
      q: 'The client wants to resume a broken download. What would you add?',
      a: 'Support Range requests: read the Range header, return only the bytes asked for with 206 Partial Content, and send Accept-Ranges so clients know it works.',
    },
  ],
}
