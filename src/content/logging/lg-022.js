import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-022',
  category: 'logging',
  title: "Salesforce and Workday Calls",
  level: 'INTERMEDIATE',
  tags: ["logging","salesforce","workday"],
  estMinutes: 15,
  quiz: fromLogging(["log-118","log-207","log-417","log-420","log-205"]),
  description: `
Your flows upsert accounts and contacts in Salesforce and create hires in Workday. Log the results so a record can be found in both systems.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log your ID and the ID the other system returned.",
    "A bulk call logs how many records worked and how many failed.",
    "The first line of a sync says what it will do and for which period.",
  ],
}
