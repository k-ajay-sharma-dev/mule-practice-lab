import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-178',
  category: 'logging',
  title: "Deadlocks and Retries",
  level: 'ADVANCED',
  tags: ["logging","myproject","sql-server","deadlock","retry"],
  estMinutes: 25,
  quiz: fromLogging(["log-14036","log-14037","log-14038","log-14039","log-14040"]),
  description: `
Larkfield Grocers updates stock in parallel and sometimes hits deadlocks. Log each victim and each final failure.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log table, key, attempt and SQL error code.",
    "Never log the full SQL with its values.",
    "Log the final failure with where the row went.",
  ],
}
