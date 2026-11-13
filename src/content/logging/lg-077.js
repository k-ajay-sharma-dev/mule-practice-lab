import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-077',
  category: 'logging',
  title: "Product Lookup Cache",
  level: 'BEGINNER',
  tags: ["logging","object-store","caching"],
  estMinutes: 10,
  quiz: fromLogging(["log-4006","log-4007","log-4008","log-4009","log-4010"]),
  description: `
The Price API of Kestrel Home Goods keeps product prices in an Object Store cache and reads the database only on a miss. Log the cache so it helps without flooding the log.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Cache hits are frequent, so log them at DEBUG.",
    "A miss that the flow handles is not an error.",
    "Log the key and the counts, never the cached value.",
  ],
}
