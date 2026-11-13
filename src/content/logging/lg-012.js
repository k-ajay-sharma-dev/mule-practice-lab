import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-012',
  category: 'logging',
  title: "Loops and Log Volume",
  level: 'BEGINNER',
  tags: ["logging","foreach","volume"],
  estMinutes: 10,
  quiz: fromLogging(["log-008","log-043","log-222","log-322","log-105"]),
  description: `
A For Each goes over thousands of lines, and a health check runs every 10 seconds. Keep the log useful and small.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A line inside a loop is written once per item. Keep it at DEBUG or move the INFO line after the loop.",
    "Health checks and polls that find nothing are noise at INFO.",
    "One summary line with counts is worth more than thousands of single lines.",
  ],
}
