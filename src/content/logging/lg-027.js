import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-027',
  category: 'logging',
  title: "Errors Across API Layers",
  level: 'ADVANCED',
  tags: ["logging","error-handling","api-led"],
  estMinutes: 15,
  quiz: fromLogging(["log-315","log-312","log-311","log-405","log-208","log-303"]),
  description: `
An error starts in a System API and travels up through the Process and Experience APIs. Log it so it is written once with full detail, and each layer adds only what it knows.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the full error once, where it is handled, not in every layer.",
    "Upper layers log the status they send back and the correlation ID.",
    "An error that the flow handles and continues from is WARN, not ERROR.",
  ],
}
