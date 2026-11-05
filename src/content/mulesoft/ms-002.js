export default {
  id: 'ms-002',
  category: 'mulesoft',
  title: 'Repeatable vs Non-Repeatable Streaming',
  level: 'BEGINNER',
  tags: ['streaming', 'performance', 'memory'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'With a **non-repeatable** stream, the flow logs `#[payload]`, validates, then transforms. Why does the ERP receive an empty body?',
      options: [
        'The Logger consumed the one-shot stream, so later processors read an already-consumed stream',
        'Non-repeatable streams are truncated at 512 KB',
        'DataWeave cannot read streams at all',
        'The HTTP Request connector drops bodies larger than 2 MB',
      ],
      answer: 0,
      explain: 'A non-repeatable stream can be read **once**. The Logger reads it to the end, so the validator and DataWeave get nothing. The 512 KB figure is the in-memory buffer of the repeatable file-store strategy, not a truncation limit.',
    },
    {
      type: 'single',
      prompt: 'What is the default streaming strategy in Mule 4 **Enterprise**?',
      options: [
        'Non-repeatable stream',
        'Repeatable in-memory stream',
        'Repeatable file-store stream',
        'No streaming — the payload is always fully loaded into heap',
      ],
      answer: 2,
      explain: 'EE defaults to `repeatable-file-store-stream`: it buffers in memory up to `inMemorySize` (512 KB by default) and spills the rest to a temp file. Mule CE uses the in-memory strategy.',
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
        'An HTTP flow that logs, validates, and then transforms the body',
        'A flow that receives a large file over HTTP and streams it straight to S3 with no other processor reading it',
        'A flow that calls two APIs with the same request body',
        'Any flow handling files above 100 MB, regardless of how many processors read it',
      ],
      answer: 1,
      explain: 'Non-repeatable fits a **single consumer** pass-through. Size alone is not the criterion — if more than one processor reads the content, you need a repeatable stream.',
    },
    {
      type: 'multi',
      prompt: 'Which changes would you make to fix this flow?',
      options: [
        'Restore the repeatable file-store strategy (optionally tune `inMemorySize`)',
        'Log a correlation ID and the content length instead of the full payload',
        'Switch to repeatable in-memory stream so it is faster for 400 MB files',
        'Make sure the replica has enough temp disk for concurrent large files',
      ],
      answer: [0, 1, 3],
      explain: 'File-store keeps the payload re-readable without holding 400 MB in heap, and needs temp disk. In-memory would hold whole files in heap and fail when the buffer is exceeded.',
    },
  ],
  description: `
A flow receives order files (2 MB – 400 MB of JSON) through an HTTP Listener, then:

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
    'Repeatable in-memory stream keeps everything in heap up to a max buffer size and fails if exceeded — not suitable for 400 MB.',
    'Non-repeatable fits a pure pass-through where the payload is read exactly once (e.g. stream file straight to SFTP/S3).',
    'Fix: keep repeatable file-store (or tune inMemorySize), and avoid logging the full payload — log size or a few fields instead.',
  ],
  solution: `
**Why it breaks:** with \`non-repeatable-stream\` the payload is a one-shot cursor. The Logger expression \`#[payload]\` reads it to the end, so the schema validator and the DataWeave transform see an already-consumed stream. You get an empty body or a "stream already consumed" style error. Any processor that reads the content (Logger, validator, DataWeave, HTTP Request body) counts.

**Default strategy (EE):** \`repeatable-file-store-stream\`. Mule keeps the first part of the stream in memory (\`inMemorySize\`, 512 KB by default) and transparently writes the rest to a temporary file. Each consumer gets a fresh cursor, so the payload can be read many times. Small payloads never touch disk; large ones cost disk I/O but not heap. (\`repeatable-in-memory-stream\` keeps everything in heap and fails when its max buffer is exceeded — Mule CE uses in-memory.)

**When non-repeatable fits:** a single consumer that reads the stream once, e.g. HTTP → S3/SFTP upload or file-to-file copy, where you want zero buffering overhead.

**Fix:**
- Restore the default repeatable file-store strategy (optionally tune \`inMemorySize\` / buffer unit).
- Replace the payload Logger with a correlation ID and metadata such as \`attributes.headers.'content-length'\` — logging 400 MB is a problem on its own.
- Ensure the worker/replica has enough temp disk for concurrent large files.
`,
}
