import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-176',
  category: 'logging',
  title: "SQL Server Connections",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","sql-server","pool","failover"],
  estMinutes: 25,
  quiz: fromLogging(["log-14026","log-14027","log-14028","log-14029","log-14030"]),
  description: `
Larkfield Grocers calls SQL Server from several APIs. Log pool timeouts and failover errors with the facts needed to fix them.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log pool size and wait time when the pool is exhausted.",
    "Log the server on read only errors after failover.",
    "Never log the connection string or password.",
  ],
}
