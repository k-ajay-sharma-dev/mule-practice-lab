import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-136',
  category: 'logging',
  title: "Failed Logins and Account Lockouts",
  level: 'BEGINNER',
  tags: ["logging","security","login","lockout"],
  estMinutes: 15,
  quiz: fromLogging(["log-10001","log-10002","log-10003","log-10004","log-10005"]),
  description: `
Pinecrest Credit Union locks a member account after five wrong passwords. Log lockouts and repeated failed logins so support can help members and security can spot attacks, without writing passwords or personal data.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a lockout at WARN with the member ID, the number of failures and when the lock ends.",
    "Never log the password typed, even a wrong one.",
    "Log one line for a pattern of failures from one source, not one line per attempt.",
  ],
}
