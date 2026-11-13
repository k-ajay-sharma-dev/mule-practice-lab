import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-112',
  category: 'logging',
  title: "Work in an Async Scope",
  level: 'INTERMEDIATE',
  tags: ["logging","async"],
  estMinutes: 15,
  quiz: fromLogging(["log-6031","log-6032","log-6033","log-6034","log-6035"]),
  description: `
When a member signs up at Lumen Fitness, the welcome message goes out in an Async scope, after the member already got 201. Make sure a lost message shows in the log.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "An Async scope keeps the correlation ID but runs on its own.",
    "Errors inside an Async scope do not reach the flow error handler.",
    "Log the result of the work inside the scope, where it is known.",
  ],
}
