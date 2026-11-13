import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-038',
  category: 'logging',
  title: "Cancel a Booking: DELETE and Refunds",
  level: 'INTERMEDIATE',
  tags: ["logging","delete","process-api"],
  estMinutes: 10,
  quiz: fromLogging(["log-1036","log-1037","log-1038","log-1039","log-1040"]),
  description: `
The Booking Process API of an invented travel company takes DELETE /bookings/{bookingId}. It cancels the booking in the Booking System API and asks the Payment System API for a refund. Review and write its loggers.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A repeated DELETE that the API handles is normal, so INFO.",
    "A 204 has no body, so keep IDs in vars before the call.",
    "Card data never goes in a log, at any level.",
  ],
}
