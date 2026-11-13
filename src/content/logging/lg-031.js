import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-031',
  category: 'logging',
  title: "Hotel Booking API: Request In, Response Out",
  level: 'BEGINNER',
  tags: ["logging","http","experience-api"],
  estMinutes: 10,
  quiz: fromLogging(["log-1001","log-1002","log-1003","log-1004","log-1005"]),
  description: `
The Booking Experience API of an invented hotel group takes GET /bookings/{bookingId} and POST /bookings. Decide what it logs when a request arrives, while you build it, and when it sends the answer back.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log one INFO line when a request arrives and one when the answer goes back.",
    "The last line gives the ID, the status and durationMs.",
    "Guest details stay out of the log. DEBUG is for detail while you build.",
  ],
}
