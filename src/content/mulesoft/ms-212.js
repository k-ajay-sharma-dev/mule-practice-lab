export default {
  id: 'ms-212',
  category: 'mulesoft',
  title: 'Round Robin and First Successful: Taking Turns and Falling Back',
  level: 'BEGINNER',
  tags: ['routers', 'round-robin', 'first-successful', 'resilience', 'logistics'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A parcel company has two label printers, each behind its own HTTP endpoint. A Round Robin router has one route per printer. Three print jobs arrive one after another. Where do they go?',
      options: [
        'All three go to the first printer, and the second is a fallback',
        'Each job goes to both printers, one copy to each',
        'The first and third go to one printer, the second to the other',
        'Each job goes to whichever printer answered fastest last time',
      ],
      answer: 2,
      explain: 'Round Robin sends each event to one route and moves to the next route for the next event. It takes turns. A fallback route is how First Successful works. Round Robin does not measure speed, and it never sends one event to two routes.',
    },
    {
      type: 'single',
      prompt: 'A Round Robin router picks the second printer, and that printer is switched off. What does the router do?',
      options: [
        'It raises the error from that route. It does not try the other printer',
        'It retries the same route until the printer comes back',
        'It skips the route and sends the job to the first printer',
        'It marks the route as down and leaves it out from then on',
      ],
      answer: 0,
      explain: 'Round Robin is about taking turns, not about health. The route it picked fails and the error goes to the error handler. To fall back to another target, use First Successful, or put a real load balancer with health checks in front.',
    },
    {
      type: 'single',
      prompt: 'A shipping flow books with Carrier A, and should use Carrier B only when the booking with A fails. Which router fits?',
      options: [
        'Scatter-Gather with Carrier A first and Carrier B second',
        'First Successful with Carrier A first and Carrier B second',
        'Round Robin with Carrier A first and Carrier B second',
        'Choice with a route for Carrier A and `otherwise` for Carrier B',
      ],
      answer: 1,
      explain: 'First Successful runs its routes in order and stops at the first one that ends without an error. Carrier B is only called when the route for Carrier A fails.',
    },
    {
      type: 'single',
      prompt: 'A First Successful router has two routes, and both fail. What happens?',
      options: [
        'The router returns the payload it had before the first route ran',
        'The router starts again from the first route, up to its retry count',
        'The router returns the last route result, with the error in a variable',
        'The router raises an error, and the flow error handling takes over',
      ],
      answer: 3,
      explain: 'When no route succeeds, First Successful raises an error. Plan for it in the error handler, for example by returning a 503 and keeping the booking request to try later.',
    },
    {
      type: 'match',
      prompt: 'Match each scope or router to what it does when something fails.',
      pairs: [
        ['First Successful', 'Moves on to the next route in its list'],
        ['Until Successful', 'Runs the same steps again after a delay'],
        ['Round Robin', 'Raises the error of the one route it picked'],
      ],
      explain: 'First Successful tries a different route. Until Successful repeats the same steps, up to a number of retries. Round Robin only takes turns, so a failure on its route is a failure of the event.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'In a First Successful router, the route for Carrier A writes a shipment row to the database, then the carrier call times out. Carrier B then succeeds. What risk does the design have?',
      options: [
        'The row is rolled back with the failed route, so the route for Carrier B writes the only row',
        'The router calls Carrier A a second time before it moves on, so that route writes two rows',
        'The row from the route for Carrier A stays, so the booking can be recorded twice',
        'The flow ends in an error, as the timeout from Carrier A is raised after Carrier B succeeds',
      ],
      answer: 2,
      explain: 'A failed route does not roll back what it already did, so the row written before the timeout stays. The router does not call a failed route again; it moves to the next one. Once Carrier B succeeds, the router returns its result and the flow goes on with no error. Keep side effects out of the routes, or make them safe to repeat, for example with an upsert on the shipment id. Write the database row after the router, when you know which carrier won.',
    },
  ],
  description: `
A parcel company runs a Mule app that prints labels and books collections with carriers.

- It has two label printers behind two HTTP endpoints. The team wants to share the load between them.
- It books each collection with Carrier A. When Carrier A is down, it wants to use Carrier B instead.

A developer used a Round Robin router for both jobs. During a carrier outage, half of the bookings failed. On the day one printer broke, half of the labels failed too.

**Questions**
1. What does Round Robin do, and why did it not help when a target was down?
2. Which router fits the carrier fallback, and how does it behave when every route fails?
3. What should stay out of the routes of a fallback router?
`,
  answerTemplate: `## What Round Robin does

## The carrier fallback

## Keeping routes safe
`,
  keyPoints: [
    'Round Robin sends each event to one route and takes turns between the routes.',
    'Round Robin does not check health. If the route it picked fails, the event fails.',
    'First Successful runs routes in order and stops at the first one with no error.',
    'When every route of First Successful fails, the router raises an error.',
    'A failed route does not undo its earlier steps, so side effects belong after the router or must be safe to repeat.',
  ],
  solution: `
**1. Round Robin.** It sends each event to one route, then uses the next route for the next event, so the routes take turns. It has no idea whether a target is up. When Carrier A was down, every event that landed on the Carrier A route failed, which was half of them. The same happened with the broken printer.

**2. The carrier fallback.** Use **First Successful** with Carrier A as the first route and Carrier B as the second. Carrier B is only called when the Carrier A route raises an error. If both fail, the router raises an error, and the error handler can return a 503 or park the booking to try later.

| Need | Router |
|---|---|
| Share load between equal targets | Round Robin, or a load balancer with health checks |
| Use a backup when the main target fails | First Successful |
| Retry the same target after a delay | Until Successful |

**3. Keeping routes safe.** A route that fails part way does not roll back. If the Carrier A route writes a database row before the call fails, that row stays, and the Carrier B route may write another. Keep each route to the carrier call alone, and write the result after the router, once you know which carrier took the booking.
`,
  followUps: [
    {
      q: 'Can First Successful and Until Successful be combined?',
      a: 'Yes. Put an Until Successful inside the Carrier A route to retry a short blip a few times. Only when those retries are used up does the route fail and First Successful move on to Carrier B.',
    },
    {
      q: 'Is Round Robin a good way to spread load across CloudHub replicas?',
      a: 'No. Traffic to replicas is spread by the platform load balancer. Round Robin chooses between routes inside one app, such as two different back-end endpoints.',
    },
    {
      q: 'How should a timeout be set on the Carrier A route?',
      a: 'Keep it short on the HTTP Request, so a slow carrier fails quickly and the fallback has time to run. The caller waits for both attempts, so the total must fit within its own timeout.',
    },
  ],
}
