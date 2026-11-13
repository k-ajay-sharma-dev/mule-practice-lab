import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-093',
  category: 'logging',
  title: "Validation Errors in a Quote API",
  level: 'INTERMEDIATE',
  tags: ["validation","error-handling","personal-data"],
  estMinutes: 15,
  quiz: fromLogging(["log-5011","log-5012","log-5013","log-5014","log-5015"]),
  description: `
The Brightpath Insurance car quote API checks each request with the Validation module. Log the rejected requests so callers can be helped, without the personal data they sent.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A rejected request is a WARN with status=400.",
    "Log which check failed, not the value that failed it.",
    "error.errorType.identifier names the failed check.",
  ],
}
