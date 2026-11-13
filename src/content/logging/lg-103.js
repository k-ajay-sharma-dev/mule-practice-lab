import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-103',
  category: 'logging',
  title: "Timeouts and Fallbacks",
  level: 'ADVANCED',
  tags: ["timeouts","fallback","travel"],
  estMinutes: 20,
  quiz: fromLogging(["log-5061","log-5062","log-5063","log-5064","log-5065"]),
  description: `
The Bluewing Travel fare search falls back to cached exchange rates when the Rates API is slow. Log the fallback and the moment it is no longer safe.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Set a timeout shorter than the caller waits.",
    "A fallback that works is a WARN with the age of the data.",
    "When the fallback runs out, log an ERROR with the limit.",
  ],
}
