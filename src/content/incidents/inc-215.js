export default {
  id: 'inc-215',
  category: 'incidents',
  title: "A New Region Cannot Upload: the Container Name Has Capital Letters",
  level: 'BEGINNER',
  tags: ["myproject","azure-blob","naming","configuration"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:01 INFO  [label-service] Region=UK container=Labels-UK", relevant: true, why: "The new region uses a container name with capitals." },
      { text: "2026-11-18 10:00:02 ERROR [label-service] Create container failed status=400 code=InvalidResourceName", relevant: true, why: "Azure rejects the name." },
      { text: "2026-11-18 10:00:02 INFO  [label-service] Region=FR container=labels-fr uploads ok", relevant: true, why: "Lower case names work." },
      { text: "2026-11-18 10:01:00 INFO  [label-service] GET /health 200", relevant: false },
      { text: "2026-11-18 10:02:00 INFO  [config] container.uk=Labels-UK added by change CR-881", relevant: true, why: "The name came from a recent config change." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the UK container fail?",
        options: [
          "Container names must be lower case letters, numbers and hyphens",
          "UK is blocked",
          "The account is full",
          "The key is wrong",
        ],
        answer: 0,
        explain: "InvalidResourceName means the name breaks the naming rules.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Use labels-uk",
          "Use Labels_UK",
          "Use LABELS-UK",
          "Use a space",
        ],
        answer: 0,
        explain: "Lower case with hyphens follows the rules.",
      },
      {
        type: 'multi',
        prompt: "How do you prevent this?",
        options: [
          "Build container names in code with lower case from the region code",
          "Validate names in the pipeline",
          "Keep one naming rule for all regions",
          "Let each team choose",
        ],
        answer: [0,1,2],
        explain: "A rule in code and a check in the pipeline catch it before go-live.",
      },
      {
        type: 'single',
        prompt: "Are blob names under the same rule?",
        options: [
          "No, blob names allow mixed case, but they are case sensitive",
          "Yes, exactly the same",
          "Blob names must be numbers",
          "Blob names cannot contain slashes",
        ],
        answer: 0,
        explain: "Container names are strict. Blob names are more flexible but case sensitive.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Correct the container name to labels-uk",
          "Create the container",
          "Retry the failed uploads",
          "Build names from a lower case rule",
          "Add a pipeline check",
        ],
        explain: "Fix, recover, then prevent.",
      },
    ],
  },
  description: `
## Symptoms
- The new UK region cannot store shipping labels. Other regions work.

## Change / Context
- Each region uploads labels to its own container named in config.
- The UK entry was added yesterday as \`Labels-UK\`.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:01 INFO  [label-service] Region=UK container=Labels-UK
2026-11-18 10:00:02 ERROR [label-service] Create container failed status=400 code=InvalidResourceName
2026-11-18 10:00:02 INFO  [label-service] Region=FR container=labels-fr uploads ok
2026-11-18 10:02:00 INFO  [config] container.uk=Labels-UK added by change CR-881
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
    "Container names are lower case letters, numbers and hyphens.",
    "Breaking the rule gives 400 InvalidResourceName.",
    "Blob names are case sensitive.",
    "Build names from a rule, not by hand.",
    "Validate in the pipeline.",
    "Retry failed uploads after the fix.",
  ],
  solution: `
**Diagnosis.** The container name \`Labels-UK\` has capitals, which Azure does not allow, so creation and uploads fail.

**Immediate mitigation.**
- Rename to \`labels-uk\`, create it and retry uploads.

**Root cause.** The name was typed by hand without the naming rule.

**Permanent fix.**
- Build container names in code from the region code in lower case.

**Prevention.** A pipeline check on container names and a shared naming standard.
`,
  followUps: [
    { q: "What else is not allowed?", a: "Underscores, spaces, and two hyphens in a row are not allowed, and names have length limits." },
    { q: "Why do blob names differ?", a: "Blob names are paths inside a container and allow more characters." },
    { q: "Does case matter when reading a blob?", a: "Yes, Invoice.pdf and invoice.pdf are different blobs." },
    { q: "Should apps create containers?", a: "Often infrastructure scripts create them, and apps only read and write." },
  ],
}
