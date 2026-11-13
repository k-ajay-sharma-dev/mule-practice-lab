import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-046',
  category: 'logging',
  title: "Publishing Order Events to Anypoint MQ",
  level: 'BEGINNER',
  tags: ["logging","anypoint-mq","publish","events"],
  estMinutes: 10,
  quiz: fromLogging(["log-2001","log-2002","log-2003","log-2004","log-2005"]),
  description: `
Larkspur Grocers saves each order, then publishes an OrderPlaced message to the Anypoint MQ queue larkspur-orders so the stores can pick it. Log the publish so a missing order can be traced.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After a publish, log the queue, the message ID and the business key.",
    "A publish that worked is INFO, never ERROR.",
    "If the publish fails after the data is saved, say so at ERROR and say what must happen next.",
  ],
}
