import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-052',
  category: 'logging',
  title: "JMS Topics and Durable Subscribers",
  level: 'INTERMEDIATE',
  tags: ["logging","jms","topics","pub-sub"],
  estMinutes: 15,
  quiz: fromLogging(["log-2031","log-2032","log-2033","log-2034","log-2035"]),
  description: `
Pellucid Telecom publishes price changes to a JMS topic, and three apps subscribe to it. Log the topic so one price change can be followed to every subscriber.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the same event ID in the publisher and in every subscriber.",
    "A publisher cannot see its subscribers. Each subscriber logs its own arrival.",
    "Expected messages that are ignored are DEBUG.",
  ],
}
