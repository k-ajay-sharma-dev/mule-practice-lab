import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-076',
  category: 'logging',
  title: "Salesforce Account Lookup",
  level: 'BEGINNER',
  tags: ["logging","salesforce","query"],
  estMinutes: 10,
  quiz: fromLogging(["log-4001","log-4002","log-4003","log-4004","log-4005"]),
  description: `
The Customer System API of Brightmoor Outdoor looks up accounts in Salesforce with a SOQL query. Log what was asked for and what came back, without the account details.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After a query, log the record count, not the records.",
    "An account with no match is a handled 404, not an ERROR.",
    "Log the Salesforce record ID instead of names and phone numbers.",
  ],
}
