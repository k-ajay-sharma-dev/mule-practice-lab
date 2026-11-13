import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-002',
  category: 'logging',
  title: "Order API: Where the Loggers Go",
  level: 'BEGINNER',
  tags: ["logging","sap","http"],
  estMinutes: 10,
  quiz: fromLogging(["log-049","log-045","log-020","log-027","log-061"]),
  description: `
The Order Process API calls SAP and the CRM for every order. Place the loggers around those calls and word them so the next person can read the story of one order.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A logger before and after each important outside call shows where time goes and where a request stopped.",
    "The line after a call says what came back: an ID, a status, a time.",
    "Say what happened with the business key, not \"done\" or \"step 3\".",
  ],
}
