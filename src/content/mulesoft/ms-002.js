export default {
  id: 'ms-002',
  category: 'mulesoft',
  title: 'Repeatable vs Non-Repeatable Streaming',
  level: 'BEGINNER',
  tags: ['myproject', 'streaming', 'performance', 'memory'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'With a **non-repeatable** stream, the flow logs `#[payload]`, validates, then transforms. Why does the ERP receive an empty body?',
      options: [
        'The Logger read the one-shot stream, so later steps get nothing',
        'Non-repeatable streams are cut off after the first 512 KB',
        'DataWeave cannot read a non-repeatable stream as its input',
        'The HTTP Request drops bodies larger than 2 MB unless chunked',
      ],
      answer: 0,
      explain: 'A non-repeatable stream can be read **once**. The Logger reads it to the end, so the validator and DataWeave get nothing. The 512 KB figure is the in-memory buffer of the repeatable file-store strategy, not a truncation limit.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A Mule 4 **Enterprise** app has no streaming configuration. Its HTTP Listener receives a 50 MB file, and both a Logger and a Transform read the payload. Where is the content held while the flow runs?',
      options: [
        'All 50 MB in heap, because repeatable streams buffer the whole content in memory',
        'Up to 512 KB in memory, and the rest in a temporary file on disk',
        'Nowhere, because the stream is read once and the Transform gets nothing',
        'In heap up to a buffer limit, and then the flow fails with a buffer error',
      ],
      answer: 1,
      explain: 'With no configuration, Mule 4 EE uses the repeatable file-store strategy. It keeps up to `inMemorySize` (512 KB by default) in memory and spills the rest to a temporary file, so both readers see the whole content. Reading once and then getting nothing is the non-repeatable strategy. Holding content in heap up to a limit and then failing is the repeatable in-memory strategy, which is the default in Mule CE.',
    },
    {
      type: 'match',
      prompt: 'Match each streaming strategy to its behaviour.',
      pairs: [
        ['repeatable-file-store-stream', 'Buffers in memory, then spills to a temp file; readable many times'],
        ['repeatable-in-memory-stream', 'Keeps everything in heap; fails when the max buffer is exceeded'],
        ['non-repeatable-stream', 'One-shot cursor; can be read only once'],
      ],
      explain: 'File-store trades disk I/O for heap; in-memory keeps the whole content in heap up to a limit; non-repeatable has no buffer at all.',
    },
    {
      type: 'single',
      prompt: 'Which scenario is a good fit for non-repeatable streaming?',
      options: [
        'An HTTP flow that logs, validates and then transforms each order body',
        'A flow that streams a large upload from HTTP to S3, with nothing else reading it',
        'A flow that sends the same request body to two different APIs in turn',
        'A flow that uploads 200 MB files to S3, then logs and archives each file body',
      ],
      answer: 1,
      explain: 'Non-repeatable fits a **single consumer** pass-through. Size alone is not the criterion. If more than one processor reads the content, you need a repeatable stream.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which changes would you make to fix this flow?',
      options: [
        'Restore the repeatable file-store strategy (optionally tune `inMemorySize`)',
        'Log a correlation ID and the content length instead of the full payload',
        'Switch to repeatable in-memory stream so it is faster for 400 MB files',
        'Make sure the replica has enough temp disk for concurrent large files',
        'Keep non-repeatable and move the Logger to after the ERP call',
      ],
      answer: [0, 1, 3],
      explain: 'File-store keeps the payload re-readable without holding 400 MB in heap, and needs temp disk. Logging an ID and the length stops the Logger reading the whole stream. In-memory would hold whole files in heap and fail when the buffer is exceeded. Moving the Logger is not enough: the validator still reads the stream, and the transform then gets nothing.',
    },
  ],
  description: `
A flow receives order files (2 MB to 400 MB of JSON) through an HTTP Listener, then:

1. Logs the payload for debugging.
2. Validates it against a JSON schema.
3. Transforms it with DataWeave and posts it to the ERP.

To "save memory", a developer set the listener's streaming strategy to **non-repeatable**. Now the ERP receives an **empty body**, or the flow fails with an error saying the stream was already consumed.

**Questions**
- Why does the non-repeatable stream break this flow? Which processors read it?
- What is the default streaming strategy in Mule 4 (Enterprise) and how does it behave for small vs large payloads?
- When *is* non-repeatable streaming the right choice?
- What would you change in this flow?
`,
  answerTemplate: `## Why it breaks

## Default strategy

## When non-repeatable fits

## Fix
`,
  keyPoints: [
    'A non-repeatable stream can be read only once; the Logger (or validator) consumes it, so later processors get nothing.',
    'Default in Mule 4 EE is the repeatable file-store stream: buffers in memory (512 KB by default), then spills to a temp file on disk.',
    'Repeatable in-memory stream keeps everything in heap up to a max buffer size and fails if exceeded, so it does not suit 400 MB files.',
    'Non-repeatable fits a pure pass-through where the payload is read exactly once (e.g. stream file straight to SFTP/S3).',
    'Fix: keep repeatable file-store (or tune inMemorySize), and avoid logging the full payload: log size or a few fields instead.',
  ],
  solution: `
**Why it breaks:** with \`non-repeatable-stream\` the payload is a one-shot cursor. The Logger expression \`#[payload]\` reads it to the end, so the schema validator and the DataWeave transform see an already-consumed stream. You get an empty body or a "stream already consumed" style error. Any processor that reads the content (Logger, validator, DataWeave, HTTP Request body) counts.

**Default strategy (EE):** \`repeatable-file-store-stream\`. Mule keeps the first part of the stream in memory (\`inMemorySize\`, 512 KB by default) and transparently writes the rest to a temporary file. Each consumer gets a fresh cursor, so the payload can be read many times. Small payloads never touch disk; large ones cost disk I/O but not heap. (\`repeatable-in-memory-stream\` keeps everything in heap and fails when its max buffer is exceeded. Mule CE uses in-memory by default.)

**When non-repeatable fits:** a single consumer that reads the stream once, e.g. HTTP → S3/SFTP upload or file-to-file copy, where you want zero buffering overhead.

**Fix:**
- Restore the default repeatable file-store strategy (optionally tune \`inMemorySize\` / buffer unit).
- Replace the payload Logger with a correlation ID and metadata such as \`attributes.headers.'content-length'\`: logging 400 MB is a problem on its own.
- Ensure the worker/replica has enough temp disk for concurrent large files.
`,
}
