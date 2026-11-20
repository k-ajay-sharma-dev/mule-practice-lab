export default {
  id: 'inc-220',
  category: 'incidents',
  title: "Item Messages Fail With BlobNotFound After the Hub Already Said \"Received\": the Hub Still Reads the Old Container",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","claim-check","jms","planning-platform","validation"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 INFO  [sender] Blob written container=inbound-items blob=items/2026-11-18/batch-41.json", relevant: true, why: "The sender now writes to a new container." },
      { text: "2026-11-18 06:00:01 INFO  [item-hub] Notification received messageId=N-9001 blob=items/2026-11-18/batch-41.json", relevant: true, why: "A JMS notification points to a blob path." },
      { text: "2026-11-18 06:00:01 INFO  [item-hub] ACK published status=RECEIVED messageId=N-9001", relevant: true, why: "The hub tells the sender it has the message before checking the blob." },
      { text: "2026-11-18 06:00:02 ERROR [item-hub] Download failed status=404 code=BlobNotFound container=inbound", relevant: true, why: "The hub looks in its configured container, which no longer gets the files." },
      { text: "2026-11-18 06:01:00 INFO  [item-hub] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the download fail?",
        options: [
          "The platform now writes to inbound-items, but the hub reads inbound",
          "The hub downloads before the platform has finished writing the blob",
          "The hub’s SAS token expired, and Azure answers 404 to hide the blob",
          "A lifecycle rule deleted the blob between the write and the download",
        ],
        answer: 0,
        explain: "The sender wrote the blob to inbound-items, and the hub looked in inbound. The path is right but the container is not.",
      },
      {
        type: 'single',
        prompt: "What is wrong with the order of steps?",
        options: [
          "RECEIVED went out before the hub checked the blob exists",
          "The hub validated the notification before downloading the blob",
          "The ACK went to the sender instead of to a shared status queue",
          "The hub should download the blob before reading the notification",
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
          "The items in the blob have been loaded",
        ],
        answer: [0,1,2],
        explain: "Check what is needed to accept the work. Processing comes later.",
      },
      {
        type: 'single',
        prompt: "What should the hub send when the blob is missing?",
        options: [
          "REJECTED with the reason, so the sender can fix and resend",
          "RECEIVED, then retry the download every hour until it works",
          "No ACK at all, so the sender times out and resends by itself",
          "RECEIVED, and open a support ticket for the hub team",
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
- The hub reads blobs from the container named in its own config, \`inbound\`.
- The hub validates the notification, publishes a RECEIVED ACK, then downloads the blob.
- On Monday the platform moved its files to a new container, \`inbound-items\`. Nobody told the integration team.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:00 INFO  [sender] Blob written container=inbound-items blob=items/2026-11-18/batch-41.json
2026-11-18 06:00:01 INFO  [item-hub] Notification received messageId=N-9001 blob=items/2026-11-18/batch-41.json
2026-11-18 06:00:01 INFO  [item-hub] ACK published status=RECEIVED messageId=N-9001
2026-11-18 06:00:02 ERROR [item-hub] Download failed status=404 code=BlobNotFound container=inbound
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
**Diagnosis.** The sender now writes to a different container. The hub still reads the old one, so the download returns BlobNotFound. The hub had already sent RECEIVED.

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
