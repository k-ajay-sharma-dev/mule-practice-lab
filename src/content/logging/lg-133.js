import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-133',
  category: 'logging',
  title: "Health Checks Without the Noise",
  level: 'INTERMEDIATE',
  tags: ["logging","health-checks","monitoring","noise"],
  estMinutes: 20,
  quiz: fromLogging(["log-9011","log-9012","log-9013","log-9014","log-9015"]),
  description: `
The Pelham Energy meter API has a health endpoint the load balancer calls every 10 seconds. It checks the database and the queue. Log so a failing dependency is clear at once, without a line for every probe.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Keep probe lines at DEBUG or TRACE.",
    "Log one line when a dependency changes status, naming it and the error.",
    "On recovery, log how long it was down.",
  ],
}
