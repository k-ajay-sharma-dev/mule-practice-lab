import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-180',
  category: 'logging',
  title: "Merging Plans and Forecasts",
  level: 'EXPERT',
  tags: ["logging","myproject","sql-server","merge","planning-platform","plans"],
  estMinutes: 25,
  quiz: fromLogging(["log-14046","log-14047","log-14048","log-14049","log-14050"]),
  description: `
Larkfield Grocers merges forecasts from the planning platform into SQL Server. Log duplicates, the merge counts and failures.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log duplicate keys with the rule used.",
    "Log inserted, updated and unchanged counts.",
    "Say no changes were made when a merge rolls back.",
  ],
}
