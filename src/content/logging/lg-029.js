import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-029',
  category: 'logging',
  title: "Caching, Routing and Optional Values",
  level: 'INTERMEDIATE',
  tags: ["logging","cache","choice"],
  estMinutes: 10,
  quiz: fromLogging(["log-112","log-122","log-434","log-317","log-306"]),
  description: `
A Cache scope sits in front of the Product API, a Choice router picks one of four routes, and some customers have no loyalty ID. Log these paths without errors and without noise.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Cache hits and misses, and the chosen route, are DEBUG detail.",
    "A value that can be null must not break the logger. Use default.",
    "Loggers left over from a debugging session come out.",
  ],
}
