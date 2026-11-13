import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-082',
  category: 'logging',
  title: "SAP IDoc Deliveries",
  level: 'INTERMEDIATE',
  tags: ["logging","sap","idoc"],
  estMinutes: 15,
  quiz: fromLogging(["log-4031","log-4032","log-4033","log-4034","log-4035"]),
  description: `
Granite Peak Beverages sends ORDERS IDocs to SAP and receives delivery IDocs back. Log the IDocs so SAP support can find each one.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The IDoc number is the key fact on every IDoc line.",
    "Status 53 is posted and status 51 is not posted.",
    "An IDoc that did not post needs an ERROR with the next step.",
  ],
}
