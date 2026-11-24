// The questions to answer before drawing a design, by kind of problem.
export const PLANS = {
  flow: [
    'What starts the flow? (HTTP call, schedule, queue message, file)',
    'What comes in, and what must go out?',
    'What could be wrong with the input, and how do you check it?',
    'Which systems does it call, and in what order?',
    'What happens when each call fails? (error handler, retry, DLQ)',
  ],
  arch: [
    'Who calls, and which system owns the data?',
    'Sync or async: does the caller need the answer now?',
    'What is slow, limited or often down? (that needs a queue, cache or timeout)',
    'Which layer does each API belong to? (Experience, Process, System)',
    'What happens when one piece fails, and is anything lost?',
  ],
}
