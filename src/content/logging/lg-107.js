import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-107',
  category: 'logging',
  title: "First JSON Log Lines",
  level: 'BEGINNER',
  tags: ["logging","structured-logging","json"],
  estMinutes: 15,
  quiz: fromLogging(["log-6006","log-6007","log-6008","log-6009","log-6010"]),
  description: `
The Marchmont Quote API is moving from text lines to JSON lines, so Splunk can search every field. Write the new lines and check them against the field names the other APIs use.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Write JSON with output application/json indent=false, so one event is one line.",
    "Use the same field names as the other apps.",
    "The format does not change the level.",
  ],
}
