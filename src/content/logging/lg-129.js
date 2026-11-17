import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-129',
  category: 'logging',
  title: "Two-Way Sync Conflicts",
  level: 'INTERMEDIATE',
  tags: ["logging","sync","crm","erp"],
  estMinutes: 20,
  quiz: fromLogging(["log-8016","log-8017","log-8018","log-8019","log-8020"]),
  description: `
Bellmont Furniture syncs customers both ways between its CRM and ERP. Sometimes both change the same field, and sometimes one side rejects an update. Log conflicts and failures so a user can learn why a change was lost, without copying customer data into the logs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A conflict settled by a rule is INFO or WARN with the record, field, winner and rule.",
    "A rejected update that leaves the systems different is an ERROR with what happens next.",
    "Log IDs and field names, not the personal values.",
  ],
}
