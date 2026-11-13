import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-080',
  category: 'logging',
  title: "Web Leads to Salesforce",
  level: 'INTERMEDIATE',
  tags: ["logging","salesforce","upsert"],
  estMinutes: 15,
  quiz: fromLogging(["log-4021","log-4022","log-4023","log-4024","log-4025"]),
  description: `
Larkspur Solar sends web form leads to Salesforce with an Upsert on an external ID. Some leads fail on their own, and sometimes the whole call fails.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "An Upsert reports success for each item, so log both counts.",
    "For a failed lead, log its ID and the Salesforce error, not the lead.",
    "When the whole call fails, say what happens to the batch.",
  ],
}
