import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-106',
  category: 'logging',
  title: "One ID Across Two APIs",
  level: 'INTERMEDIATE',
  tags: ["logging","correlation-id","http"],
  estMinutes: 10,
  quiz: fromLogging(["log-6001","log-6002","log-6003","log-6004","log-6005"]),
  description: `
The Brightleaf Mobile Experience API calls the Basket Process API for every basket screen. When a customer reports a problem, support must follow one request through both apps. Make sure both apps log the same correlation ID.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The HTTP Listener takes the correlation ID from the X-Correlation-ID header.",
    "If the header is not sent on the call, the next app makes a new ID.",
    "Log correlationId, not all the headers.",
  ],
}
