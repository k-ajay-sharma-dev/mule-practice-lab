import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-177',
  category: 'logging',
  title: "Bulk Loads Into SQL Server",
  level: 'ADVANCED',
  tags: ["logging","myproject","sql-server","bulk-insert","batch"],
  estMinutes: 25,
  quiz: fromLogging(["log-14031","log-14032","log-14033","log-14034","log-14035"]),
  description: `
Larkfield Grocers loads millions of rows with bulk inserts. Log one summary per load and each fallback block.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log blocks at DEBUG and the summary at INFO.",
    "Log rows, blocks, fallbacks, rejects and time.",
    "Log a fallback with the block number and error.",
  ],
}
