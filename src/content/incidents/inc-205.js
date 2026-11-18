export default {
  id: 'inc-205',
  category: 'incidents',
  title: "The Upload API Hangs Then Fails With VM:QUEUE_TIMEOUT: the Worker Behind the VM Queue Cannot Keep Up",
  level: 'INTERMEDIATE',
  tags: ["myproject","queues","vm","back-pressure","performance"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 11:00:01 INFO  [doc-api] Upload received docId=D-5501", relevant: false },
      { text: "2026-11-18 11:00:31 ERROR [doc-api] VM publish failed queue=ocrQueue errorType=VM:QUEUE_TIMEOUT", relevant: true, why: "The publish waited and gave up because the queue was full." },
      { text: "2026-11-18 11:00:31 INFO  [ocr-worker] Processing docId=D-5288 durationMs=4100 maxConcurrency=1", relevant: true, why: "The worker handles one document at a time, slowly." },
      { text: "2026-11-18 11:00:32 INFO  [doc-api] Requests in flight=180", relevant: true, why: "Callers pile up while publishes wait." },
      { text: "2026-11-18 11:01:00 INFO  [doc-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the upload API fail?",
        options: [
          "The VM queue is full because the OCR worker is slow, so publish waits and times out",
          "The VM queue was deleted",
          "Uploads are too large",
          "The API has no listener",
        ],
        answer: 0,
        explain: "A bounded queue pushes back on the publisher when the consumer is slower than the producer.",
      },
      {
        type: 'single',
        prompt: "Why is the worker so slow?",
        options: [
          "It runs one document at a time and each takes about four seconds",
          "It is in a loop",
          "It reads from the wrong queue",
          "It has no memory",
        ],
        answer: 0,
        explain: "One at a time at four seconds each is fifteen a minute, far below the upload rate.",
      },
      {
        type: 'multi',
        prompt: "Which changes help?",
        options: [
          "Raise the worker concurrency, if the OCR service can take it",
          "Answer callers with 202 and an ID, and process in the background",
          "Use a persistent broker queue if uploads must survive a restart",
          "Raise the publish timeout to one hour",
        ],
        answer: [0,1,2],
        explain: "Match the worker speed to the input, stop holding callers, and choose a durable queue if needed. A long timeout only holds callers longer.",
      },
      {
        type: 'single',
        prompt: "What does the queue timeout protect?",
        options: [
          "The app, by not holding unlimited messages in memory",
          "The caller’s data",
          "The OCR service licence",
          "Nothing",
        ],
        answer: 0,
        explain: "A full queue is a signal that the system is over capacity.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Confirm the worker throughput against the upload rate",
          "Raise worker concurrency within OCR limits",
          "Return 202 to callers and process in the background",
          "Alert on queue depth",
          "Load test with the real upload rate",
        ],
        explain: "Measure, add capacity, decouple callers, then watch and test.",
      },
    ],
  },
  description: `
## Symptoms
- During month end, document uploads hang for 30 seconds and then fail.
- CPU is low.

## Change / Context
- The upload API publishes each document to a VM queue. An OCR worker flow reads it with max concurrency 1.
- Uploads rise from 5 to 60 a minute at month end.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 11:00:31 ERROR [doc-api] VM publish failed queue=ocrQueue errorType=VM:QUEUE_TIMEOUT
2026-11-18 11:00:31 INFO  [ocr-worker] Processing docId=D-5288 durationMs=4100 maxConcurrency=1
2026-11-18 11:00:32 INFO  [doc-api] Requests in flight=180
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
    "A VM queue holds a limited number of messages.",
    "When it is full, publish waits and then fails with VM:QUEUE_TIMEOUT.",
    "Consumer throughput must match producer rate.",
    "Concurrency of the worker sets its throughput.",
    "Do not hold callers while work queues up.",
    "Alert on queue depth.",
  ],
  solution: `
**Diagnosis.** Uploads arrive faster than the single-threaded OCR worker can process them. The VM queue fills, publish blocks, and after the timeout it fails.

**Immediate mitigation.**
- Raise the worker concurrency to what the OCR service allows.

**Root cause.** The worker was sized for normal days, and the API waited for the queue instead of answering callers.

**Permanent fix.**
- Answer 202 with a document ID and process in the background.
- Use a persistent broker queue if uploads must survive restarts.
- Size worker concurrency from the peak rate.

**Prevention.** Alert on VM queue depth and load test with month end volumes.
`,
  followUps: [
    { q: "Are VM queues persistent?", a: "They can be configured as persistent or transient. Check the queue config and the deployment model." },
    { q: "Why not an unbounded queue?", a: "It would use memory until the app fails. A bound turns overload into a clear error." },
    { q: "What limits concurrency?", a: "The OCR service capacity and the memory each document needs." },
    { q: "How do callers get results?", a: "Poll by document ID, or receive a callback." },
  ],
}
