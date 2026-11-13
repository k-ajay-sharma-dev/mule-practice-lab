import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-055',
  category: 'logging',
  title: "Big Messages and Size Limits",
  level: 'INTERMEDIATE',
  tags: ["logging","anypoint-mq","message-size","claim-check"],
  estMinutes: 15,
  quiz: fromLogging(["log-2046","log-2047","log-2048","log-2049","log-2050"]),
  description: `
Saltmarsh Utilities sends billing statements through Anypoint MQ, and some are close to the maximum message size. The payload is turned into text before it is published, so the message can be larger than the data. Log the size, never the body, and log the claim check when it is used.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the size of a message, with the unit in the name.",
    "Never log the body of a large document, not even at DEBUG.",
    "A message over the limit fails every time: ERROR.",
  ],
}
