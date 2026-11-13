import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-084',
  category: 'logging',
  title: "NetSuite Invoices",
  level: 'INTERMEDIATE',
  tags: ["logging","netsuite","invoices"],
  estMinutes: 15,
  quiz: fromLogging(["log-4041","log-4042","log-4043","log-4044","log-4045"]),
  description: `
Oakvale Furniture posts invoices to NetSuite. Calls can hit the concurrency limit, records can be refused, and some invoices are already there.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log your invoice number with the NetSuite internalId.",
    "Check the response status, because a refusal is not always a Mule error.",
    "Inside a loop, log at DEBUG and write one INFO line after it.",
  ],
}
