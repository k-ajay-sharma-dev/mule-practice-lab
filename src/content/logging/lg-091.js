import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-091',
  category: 'logging',
  title: "Greenleaf Store Finder Errors",
  level: 'INTERMEDIATE',
  tags: ["error-handling","on-error-continue","on-error-propagate"],
  estMinutes: 15,
  quiz: fromLogging(["log-5001","log-5002","log-5003","log-5004","log-5005"]),
  description: `
The Greenleaf Garden Centres Store Finder API adds a weather forecast to each store page. Decide when an error is handled with On Error Continue or On Error Propagate, and what each handler should log.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "On Error Continue hides the error from the caller, so its log line is the only trace.",
    "A failure the caller sees goes through On Error Propagate and is logged at ERROR.",
    "Do not catch ANY error with On Error Continue.",
  ],
}
