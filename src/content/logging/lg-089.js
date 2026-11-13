import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-089',
  category: 'logging',
  title: "Salesforce Limits and Composite",
  level: 'ADVANCED',
  tags: ["logging","salesforce","limits"],
  estMinutes: 20,
  quiz: fromLogging(["log-4066","log-4067","log-4068","log-4069","log-4070"]),
  description: `
The Booking Process API of Driftwood Travel uses Salesforce composite requests and watches the org API limits. Log enough to see failures and limits coming.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "With allOrNone, log the referenceId of the subrequest that failed.",
    "The daily API limit is shared by the whole org.",
    "Warn on high usage before calls are refused.",
  ],
}
