import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-206',
  category: 'logging',
  title: "Long Transactions in SQL Server",
  level: 'ADVANCED',
  tags: ["logging","myproject","sql-server","tempdb","transactions"],
  estMinutes: 25,
  quiz: fromLogging(["log-17026","log-17027","log-17028","log-17029","log-17030"]),
  description: `
Larkfield Grocers watches for long open transactions that fill tempdb. Log them and the extracts they break.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log session ID, program and minutes open.",
    "Never log SQL text.",
    "Log the rerun plan when an extract fails.",
  ],
}
