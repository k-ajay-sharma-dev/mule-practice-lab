import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-140',
  category: 'logging',
  title: "Stopping an App for a Redeploy",
  level: 'ADVANCED',
  tags: ["logging","deployment","shutdown","queues"],
  estMinutes: 25,
  quiz: fromLogging(["log-10021","log-10022","log-10023","log-10024","log-10025"]),
  description: `
Saltmarsh Logistics redeploys its shipment app during the day. Log the stop so the team can show that every message in progress either finished or went back to the queue.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the start of a shutdown with the reason and the count in progress.",
    "Log the end with how many finished and how many went back to the queue.",
    "Log a message cut off by the stop with its IDs and where it went.",
  ],
}
