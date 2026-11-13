import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-116',
  category: 'logging',
  title: "Cache Hits and Misses",
  level: 'INTERMEDIATE',
  tags: ["logging","cache","incident"],
  estMinutes: 15,
  quiz: fromLogging(["log-6051","log-6052","log-6053","log-6054","log-6055"]),
  description: `
The Fennwick Rates API keeps exchange rates in a Cache scope in front of an FX provider. Log the misses so you can measure the cache, and log what happens when the provider goes down.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A logger inside a Cache scope runs only on a miss.",
    "Log the cache key, such as the currency pair.",
    "Serving a stale value is handled, so WARN.",
  ],
}
