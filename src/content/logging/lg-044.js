import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-044',
  category: 'logging',
  title: "Loan Quotes: Timeouts and Time Budgets",
  level: 'ADVANCED',
  tags: ["logging","timeouts","response-time"],
  estMinutes: 20,
  quiz: fromLogging(["log-1066","log-1067","log-1068","log-1069","log-1070"]),
  description: `
The Loan Experience API of an invented lender calls a Credit Check System API and must answer within 3000 ms. Tell timeouts from refused connections, and log slow requests before they fail.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "HTTP:TIMEOUT and HTTP:CONNECTIVITY point to different problems, so log errorType.",
    "A slow request that worked is a WARN with the budget and the slowest call.",
    "A request that failed is an ERROR with the status sent back.",
  ],
}
