import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-123',
  category: 'logging',
  title: "A Partner That Says Slow Down",
  level: 'INTERMEDIATE',
  tags: ["logging","rate-limit","http-429","metrics"],
  estMinutes: 20,
  quiz: fromLogging(["log-7011","log-7012","log-7013","log-7014","log-7015"]),
  description: `
Brambleton Travel searches hotels through a partner Hotel API. The partner answers 429 at times and says Brambleton calls too fast. Log the 429s and a count per minute, so both sides can see the numbers.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A 429 that the flow waits out is a WARN with the status and the wait time.",
    "A line a minute with calls sent and the partner limit lets you chart the rate.",
    "Do not log headers or URLs that carry the API key.",
  ],
}
