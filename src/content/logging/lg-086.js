import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-086',
  category: 'logging',
  title: "Claims Stored Procedures",
  level: 'INTERMEDIATE',
  tags: ["logging","database","stored-procedures"],
  estMinutes: 15,
  quiz: fromLogging(["log-4051","log-4052","log-4053","log-4054","log-4055"]),
  description: `
The Claims API of Redwood Pharmacy calls a stored procedure to approve claims and shares a small connection pool. Log the calls without patient data.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Name the procedure and log only the outputs you need.",
    "An empty connection pool fails every request: ERROR.",
    "A business error raised by the procedure is often a WARN.",
  ],
}
