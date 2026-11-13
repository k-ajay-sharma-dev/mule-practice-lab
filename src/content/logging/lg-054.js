import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-054',
  category: 'logging',
  title: "Fan-out Through an Anypoint MQ Exchange",
  level: 'INTERMEDIATE',
  tags: ["logging","anypoint-mq","exchange","fan-out"],
  estMinutes: 15,
  quiz: fromLogging(["log-2041","log-2042","log-2043","log-2044","log-2045"]),
  description: `
Velora Fashion publishes product updates to an Anypoint MQ exchange that copies each one to three queues. Log the publisher and the consumers so you can see where an update stopped.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The publisher logs the exchange, not the queues bound to it.",
    "Each consumer names its own queue.",
    "One failed consumer is WARN when the message will come again.",
  ],
}
