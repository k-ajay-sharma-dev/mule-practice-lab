import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-096',
  category: 'logging',
  title: "Global Handler and Error Mapping",
  level: 'INTERMEDIATE',
  tags: ["global-error-handler","error-mapping","tracking"],
  estMinutes: 15,
  quiz: fromLogging(["log-5026","log-5027","log-5028","log-5029","log-5030"]),
  description: `
The Kestrel Freight tracking app maps carrier errors to its own types and has one global error handler for everything else. Write and review the loggers of both.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Map connector errors to your own types to log them in your own words.",
    "The global handler line names the flow and the error type.",
    "An error that reaches the global handler is an ERROR.",
  ],
}
