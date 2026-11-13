import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-026',
  category: 'logging',
  title: "Log Categories and log4j2",
  level: 'ADVANCED',
  tags: ["logging","log4j2","categories"],
  estMinutes: 10,
  quiz: fromLogging(["log-313","log-314","log-321","log-327","log-123"]),
  description: `
Support wants DEBUG for one part of a large app, for one hour, without flooding the rest. Use logger categories and the log4j2.xml to do it safely.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A category on each Logger, such as com.acme.orders.sftp, lets you change the level for one part only.",
    "Name categories by a pattern your team agrees on.",
    "Turn the extra detail off again, and keep async logging for busy APIs.",
  ],
}
