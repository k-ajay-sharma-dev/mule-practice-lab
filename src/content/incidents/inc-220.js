export default {
  id: 'inc-220',
  category: 'incidents',
  title: "Item Messages Fail With BlobNotFound After the Hub Already Said \"Received\": the Notification Points to the Wrong Container",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","claim-check","jms","planning-platform","validation"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:01 INFO  [item-hub] Notification received messageId=N-9001 blob=items/2026-11-18/batch-41.json container=inbound", relevant: true, why: "A JMS notification points to a blob." },
      { text: "2026-11-18 06:00:01 INFO  [item-hub] ACK published status=RECEIVED messageId=N-9001", relevant: true, why: "The hub tells the sender it has the message before checking the blob." },
      { text: "2026-11-18 06:00:02 ERROR [item-hub] Download failed status=404 code=BlobNotFound container=inbound", relevant: true, why: "The blob is not where the notification says." },
      { text: "2026-11-18 06:00:02 INFO  [sender] Blob written container=inbound-items", relevant: true, why: "The sender changed its container this week." },
      { text: "2026-11-18 06:01:00 INFO  [item-hub] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the download fail?",
        options: [
          "The sender moved to another container, so the blob is not where the notification points",
          "The blob was deleted",
          "The key expired",
          "The file is too big",
        ],
        answer: 0,
        explain: "BlobNotFound with a container the sender no longer uses shows a mismatch.",
      },
      {
        type: 'single',
        prompt: "What is wrong with the order of steps?",
        options: [
          "The hub sent RECEIVED before checking the blob exists, so the sender thinks all is well",
          "Nothing",
          "The ACK should never be sent",
          "The download should be first",
        ],
        answer: 0,
        explain: "An ACK must mean \"I have it and can read it\". Check the blob first.",
      },
      {
        type: 'multi',
        prompt: "What should the hub check before acknowledging?",
        options: [
          "The notification passes its schema",
          "The message ID is not a duplicate",
          "The blob exists where it says",
          "The blob has been processed",
        ],
        answer: [0,1,2],
        explain: "Check what is needed to accept the work. Processing comes later.",
      },
      {
        type: 'single',
        prompt: "What should the hub send when the blob is missing?",
        options: [
          "A clear REJECTED answer with the reason, so the sender can fix and resend",
          "RECEIVED anyway",
          "Nothing",
          "An email to the CEO",
        ],
        answer: 0,
        explain: "A negative ACK with a reason lets the sender act without a support call.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Point the hub at the new container, or agree the old one",
          "Reprocess the notifications that failed",
          "Check the blob exists before sending RECEIVED",
          "Send REJECTED with a reason when it is missing",
          "Agree container changes as contract changes",
        ],
        explain: "Fix, recover, then make the ACK honest.",
      },
    ],
  },
  description: `
## Symptoms
- Since Monday, item messages from the planning platform are not loaded. The platform shows them as delivered and received.

## Change / Context
- The platform writes each message as a JSON file in blob storage and sends a small JMS notification with the blob path.
- The hub validates the notification, publishes a RECEIVED ACK, then downloads the blob.
- The platform moved its files to a new container this week.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:01 INFO  [item-hub] Notification received messageId=N-9001 blob=items/2026-11-18/batch-41.json container=inbound
2026-11-18 06:00:01 INFO  [item-hub] ACK published status=RECEIVED messageId=N-9001
2026-11-18 06:00:02 ERROR [item-hub] Download failed status=404 code=BlobNotFound container=inbound
2026-11-18 06:00:02 INFO  [sender] Blob written container=inbound-items
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
    "A notification points to data stored elsewhere: the claim check.",
    "Check the blob exists before acknowledging.",
    "An ACK should mean the work can be done.",
    "Send a negative ACK with a reason when it cannot.",
    "Container names are part of the contract.",
    "Reprocess the failed notifications.",
  ],
  solution: `
**Diagnosis.** The sender now writes to a different container. The notification still names the old one, so the download returns BlobNotFound. The hub had already sent RECEIVED.

**Immediate mitigation.**
- Agree the right container, then reprocess the failed notifications.

**Root cause.** The ACK was sent before the blob was checked, and the container change was not treated as a contract change.

**Permanent fix.**
- Validate the notification, check for duplicates, check the blob exists, then send RECEIVED.
- Send REJECTED with the reason when the blob is missing.

**Prevention.** Treat storage paths as part of the interface contract and test with the sender before changes.
`,
  followUps: [
    { q: "Why a claim check here?", a: "Message files can be large. The queue carries a small pointer and storage carries the data." },
    { q: "Is there a race if the blob is still being written?", a: "The sender should notify only after the upload completes." },
    { q: "What goes in the REJECTED ACK?", a: "The message ID, the reason and what to fix." },
    { q: "How do you check a blob exists?", a: "Ask for its properties, or try the download and handle 404." },
  ],
}
