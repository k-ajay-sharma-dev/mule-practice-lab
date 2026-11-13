import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-016',
  category: 'logging',
  title: "Redelivery and Poison Messages",
  level: 'ADVANCED',
  tags: ["logging","jms","redelivery"],
  estMinutes: 15,
  quiz: fromLogging(["log-101","log-102","log-211","log-410","log-411"]),
  description: `
A message keeps failing. The broker delivers it again and again until a redelivery policy gives up. Log each step so the poison message is found fast.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A second delivery is WARN with the delivery count.",
    "REDELIVERY_EXHAUSTED means the message needs a person: ERROR, with the message ID and where it went.",
    "Log the error description, not the whole message.",
  ],
}
