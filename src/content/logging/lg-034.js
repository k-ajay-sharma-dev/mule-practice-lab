import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-034',
  category: 'logging',
  title: "Customer Lookup: When the System API Says 404",
  level: 'BEGINNER',
  tags: ["logging","process-api","http-request"],
  estMinutes: 10,
  quiz: fromLogging(["log-1016","log-1017","log-1018","log-1019","log-1020"]),
  description: `
The Customer Process API of an invented bank calls GET /customers/{customerId} on the Customer System API. Most calls answer 200, some answer 404, and some records come back with a field missing. Pick the levels and write the lines.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "An unknown ID is a normal answer, not an ERROR.",
    "After a call, log the ID, the status and the duration.",
    "Data that is not as expected but handled is a WARN.",
  ],
}
