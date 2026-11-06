export default {
  id: 'ms-185',
  category: 'mulesoft',
  title: 'The Three API-Led Layers in One Order Status Example',
  level: 'BEGINNER',
  tags: ['api-led', 'system-api', 'process-api', 'experience-api', 'layers', 'retail'],
  estMinutes: 10,
  quiz: [
    {
      type: 'match',
      prompt: 'API-led connectivity splits APIs into three layers. Match each job at a retailer to the layer that does it.',
      pairs: [
        ['Read customer records from SAP and return them as clean JSON', 'System API'],
        ['Combine stock and price data and decide what a shopper can buy', 'Process API'],
        ['Trim product data down to the few fields a mobile app shows', 'Experience API'],
      ],
      explain: 'A System API opens up one back-end system. A Process API holds the business logic and combines data. An Experience API shapes the result for one kind of client.',
    },
    {
      type: 'single',
      prompt: 'A bank keeps accounts on an old mainframe, and several projects need that account data. In an API-led design, what should stand directly in front of the mainframe?',
      options: [
        'An Experience API for each project, each with its own mainframe connection',
        'A System API that hides the mainframe details and returns account data',
        'A Process API for each project, each copying the mainframe login details',
        'No API at all, because each project should read the mainframe tables itself',
      ],
      answer: 1,
      explain: 'A System API is the one place that knows how to talk to the mainframe. Everything else calls that API, so the old system details are not repeated in many projects.',
    },
    {
      type: 'single',
      prompt: 'A shipping company builds a Track Parcel API. It calls a carrier system and a warehouse system, then applies a rule to mark a parcel as delayed. Which layer does the Track Parcel API belong to?',
      options: [
        'System, because it reads data from back-end systems',
        'Experience, because a customer sees the parcel status',
        'Process, because it combines systems and applies a rule',
        'None, because an API in API-led design cannot call two systems',
      ],
      answer: 2,
      explain: 'Combining data from more than one system and applying a business rule is the job of a Process API. It would reach the carrier and the warehouse through their System APIs.',
    },
    {
      type: 'single',
      prompt: 'A retailer has an Orders Process API that its website already uses. A new mobile app needs the same orders with fewer fields. What is the usual API-led way to serve the app?',
      options: [
        'Add a mobile Experience API that calls the existing Orders Process API',
        'Copy the Orders Process API and edit the copy for the mobile app',
        'Let the mobile app call the order database through a new System API',
        'Remove fields from the Orders Process API, which also changes the website',
      ],
      answer: 0,
      explain: 'The business logic stays in the Process API and is reused. Only the shape of the data differs, and shaping data for one client is what an Experience API is for.',
    },
    {
      type: 'single',
      prompt: 'A retailer replaces its order database. A System API sits in front of that database, and Process APIs call the System API. If the System API keeps the same request and response format, what has to change?',
      options: [
        'Every Process API, because each one depends on the old database',
        'Every Experience API, because each one shows order data to users',
        'All three layers, because API-led apps are released together',
        'Only the inside of the System API, where the database connection lives',
      ],
      answer: 3,
      explain: 'This is the main payoff of the layers. Callers depend on the format of the System API, not on the database behind it, so the change stays in one place.',
    },
    {
      type: 'single',
      prompt: 'A shopper opens the order status screen in a retail mobile app. In an API-led design, which path does the request follow?',
      options: [
        'App, then System API, then Process API, then Experience API, then database',
        'App, then Process API, then Experience API, then System API, then database',
        'App, then Experience API, then Process API, then System API, then database',
        'App, then Experience API, then System API, then Process API, then database',
      ],
      answer: 2,
      explain: 'Requests come in at the top and go down: the client calls the Experience API, which calls the Process API, which calls the System API, which reaches the system of record (the place where the real data is kept).',
    },
  ],
  description: `
A clothing retailer wants customers to see **where is my order?** on its website and in a new mobile app.

The answer needs data from two places: the **order database** and the **warehouse system**. An architect suggests three small APIs instead of one big one, using **API-led connectivity**. That means building APIs in three layers: System, Process and Experience.

**Questions**
1. What does each of the three layers do in this example?
2. Which APIs would you build for order status, and which calls which?
3. What changes if the retailer replaces its warehouse system?
`,
  answerTemplate: `## What each layer does

## The APIs for order status

## Replacing the warehouse system
`,
  keyPoints: [
    'A System API opens up one back-end system and hides its details.',
    'A Process API holds business logic and combines data from System APIs.',
    'An Experience API shapes data for one kind of client, such as a mobile app.',
    'Requests go down the layers: Experience, then Process, then System.',
    'If a System API keeps its format, callers do not change when the system behind it changes.',
  ],
  solution: `
**1. The layers.**
- **System:** an Orders System API reads the order database. A Warehouse System API reads the warehouse system.
- **Process:** an Order Status Process API calls both System APIs and works out one status, such as "packed" or "shipped".
- **Experience:** a Mobile Experience API returns the few fields the app shows. The website can have its own Experience API if it needs a different shape.

**2. Who calls who.** The app calls the Mobile Experience API. That calls the Order Status Process API. That calls the two System APIs, and they reach the real systems.

**3. Replacing the warehouse system.** Only the inside of the Warehouse System API changes, as long as its request and response format stay the same. The Process and Experience APIs do not notice.
`,
  followUps: [
    {
      q: 'Why not build one API that does everything?',
      a: 'One big API ties every client to every back-end system. A change in one place can affect them all, and no part can be reused alone. Layers keep each change small and let other projects reuse the same APIs.',
    },
    {
      q: 'Does every project need all three layers?',
      a: 'No. Layers are a guide, not a law. If there is no business logic to hold, a small project may not need a separate Process API. Say why you skipped a layer.',
    },
    {
      q: 'What is a system of record?',
      a: 'It is the system that holds the official copy of some data, such as an order database or an HR system. System APIs sit in front of these.',
    },
  ],
}
