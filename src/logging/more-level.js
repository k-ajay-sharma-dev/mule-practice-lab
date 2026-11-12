// More "level" exercises for the Logging Lab. See exercises.js for the format.
export const MORE_LEVEL = [
  {
    id: 'log-101',
    kind: 'level',
    situation:
      'An Anypoint MQ message holds JSON that cannot be parsed. It failed on every delivery, and the broker now moves it to the dead-letter queue.',
    answer: ['ERROR'],
    explain:
      'The message was never processed and will not be unless someone looks at it. That is ERROR. WARN would hide a lost message among the handled problems.',
  },
  {
    id: 'log-102',
    kind: 'level',
    situation:
      'A JMS listener receives a message for the second time. The first attempt failed and was rolled back, and the redelivery limit is 5.',
    answer: ['WARN'],
    explain:
      'A redelivery is unexpected but handled: the app gets another try. WARN with the delivery count shows the trend. ERROR belongs to the moment the limit is reached.',
  },
  {
    id: 'log-103',
    kind: 'level',
    situation:
      'An Idempotent Message Validator raises MULE:DUPLICATE_MESSAGE for an order already processed. The error handler skips it and the flow ends normally.',
    answer: ['INFO', 'WARN'],
    explain:
      'Queues deliver at least once, so duplicates are expected and the app did the right thing. INFO records the skip. WARN is also fair if duplicates are rare in your system, but ERROR is wrong: nothing failed.',
  },
  {
    id: 'log-104',
    kind: 'level',
    situation:
      'At start-up the property sap.host is not defined for the env, so the application fails to deploy.',
    answer: ['ERROR'],
    explain:
      'The app cannot run at all and someone must fix the configuration. That is ERROR, with the name of the missing property.',
  },
  {
    id: 'log-105',
    kind: 'level',
    situation:
      'A /health endpoint is called by the load balancer every 10 seconds. You want to log each call.',
    answer: ['DEBUG'],
    explain:
      'That is 8,640 lines a day saying "still alive". Log them at DEBUG. A failed health check is the one worth a higher level.',
  },
  {
    id: 'log-106',
    kind: 'level',
    situation:
      'A Scatter-Gather calls the Order, Invoice and Loyalty systems. The Loyalty route fails, a Try scope in that route catches it, and the API answers 200 without the loyalty points.',
    answer: ['WARN'],
    explain:
      'The caller got an answer, but not the full one. WARN, with which route failed and why. It is not ERROR because the design expects this case and handles it.',
  },
  {
    id: 'log-107',
    kind: 'level',
    situation:
      'A Scatter-Gather fetches the customer, the orders and the invoices. The invoices route fails, there is no fallback, MULE:COMPOSITE_ROUTING is raised and the request returns 500.',
    answer: ['ERROR'],
    explain:
      'The request failed and the caller got nothing useful. ERROR, with the route that failed and its error type taken from the composite error.',
  },
  {
    id: 'log-108',
    kind: 'level',
    situation:
      'A client still calls version v1 of your API, which is deprecated and will be switched off next quarter. The call works.',
    answer: ['WARN'],
    explain:
      'Nothing failed, but something must change before v1 goes away. WARN with the client ID lets you count who still needs to move. INFO would bury it.',
  },
  {
    id: 'log-109',
    kind: 'level',
    situation:
      'The access token for the partner API expired. The OAuth client fetched a new one with the client credentials and the call went on.',
    answer: ['INFO', 'DEBUG'],
    explain:
      'This happens every token lifetime and is part of normal running. INFO, or DEBUG if it is frequent. Never WARN: nothing went wrong. Never log the token itself.',
  },
  {
    id: 'log-110',
    kind: 'level',
    situation:
      'The partner rejects the OAuth refresh with invalid_grant. Every call to the partner now fails until someone authorises the app again.',
    answer: ['ERROR'],
    explain:
      'A retry will not fix this, and every call fails. A person must act, so ERROR. Compare it with a normal token refresh, which is INFO.',
  },
  {
    id: 'log-111',
    kind: 'level',
    situation:
      'An order is refused because it would take the customer over their credit limit. The API answers 422 and the order is not created.',
    answer: ['INFO'],
    explain:
      'The business rule did its job: refusing such orders is a normal outcome, not a fault. INFO with the order ID and the reason. ERROR would page support for a correct decision.',
  },
  {
    id: 'log-112',
    kind: 'level',
    situation:
      'A Cache scope sits in front of the Product API. You want a line for each cache hit and each cache miss, at thousands of lookups a minute.',
    answer: ['DEBUG'],
    explain:
      'Hits and misses are detail for tuning the cache. At this volume INFO would flood the logs. Count them, or turn on DEBUG for the cache category when you need them.',
  },
  {
    id: 'log-113',
    kind: 'level',
    situation:
      'A File listener picks up invoice_2024.txt in a folder that should only hold .csv files. The flow moves it to the rejected folder and goes on.',
    answer: ['WARN'],
    explain:
      'The app handled it, but someone put the wrong file there and may be waiting for it to load. WARN with the file name and where it was moved.',
  },
  {
    id: 'log-114',
    kind: 'level',
    situation:
      'A batch job has its max failed records set to 100. Record 101 fails, so the batch job stops before it processes the rest.',
    answer: ['ERROR'],
    explain:
      'The job did not finish and the remaining records were not loaded. Someone must find the cause and run it again. That is ERROR.',
  },
  {
    id: 'log-115',
    kind: 'level',
    situation:
      'A scheduler reads 4,200 rows from a staging table and starts a new batch job instance for them.',
    answer: ['INFO'],
    explain:
      'The start of a job is a normal event you want in production. INFO with the job instance ID and the record count, so you can match it to the end line.',
  },
  {
    id: 'log-116',
    kind: 'level',
    situation:
      'Calls to the Inventory API keep failing, so your circuit breaker opens. For the next 60 seconds the flow skips the call and uses the stock levels from the cache.',
    answer: ['WARN'],
    explain:
      'A downstream system is in trouble, but your app still answers. WARN when the breaker opens, and INFO when it closes again. Log it once on the change, not on every skipped call.',
  },
  {
    id: 'log-117',
    kind: 'level',
    situation:
      'You are troubleshooting a 401 from a partner API in the test environment and want to see the request headers, with the Authorization header masked.',
    answer: ['DEBUG'],
    explain:
      'Headers are troubleshooting detail. DEBUG keeps them out of production by default. Even at DEBUG, mask the Authorization header and any API key.',
  },
  {
    id: 'log-118',
    kind: 'level',
    situation:
      'A Salesforce upsert of an Account succeeds and returns the Salesforce ID. You log one line after the call.',
    answer: ['INFO'],
    explain:
      'A successful call to another system is a normal event. INFO with the Salesforce ID, the duration and the correlation ID. That line is the link between your logs and Salesforce.',
  },
  {
    id: 'log-119',
    kind: 'level',
    situation:
      'The nightly reconciliation finds 3 payments in the bank file with no match in the ERP. It writes them to the report the finance team checks each morning.',
    answer: ['WARN'],
    explain:
      'The job worked and the mismatches go to a team that handles them. WARN with the count makes the trend visible. ERROR would wake someone at night for work planned for the morning.',
  },
  {
    id: 'log-120',
    kind: 'level',
    situation:
      'An admin changes the price of a product through your Price System API. The business needs a record of who changed what and when.',
    answer: ['INFO'],
    explain:
      'An audit event is a normal event that must always be kept, so INFO, often in its own category such as com.acme.audit. DEBUG would drop it in production.',
  },
  {
    id: 'log-121',
    kind: 'level',
    situation:
      'The SLA for GET /orders/{id} is 2 seconds. A request took 6 seconds, but it finished and returned 200.',
    answer: ['WARN'],
    explain:
      'The caller got the right answer, but late. WARN with the duration shows the SLA breach and the trend. It is not ERROR because the request did not fail.',
  },
  {
    id: 'log-122',
    kind: 'level',
    situation:
      'A Choice router sends each message to one of four routes. While testing, you want to see which route each message took.',
    answer: ['DEBUG'],
    explain:
      'Which route was taken is detail for building and testing. DEBUG keeps it out of production. The result of the flow is the line that belongs at INFO.',
  },
  {
    id: 'log-123',
    kind: 'level',
    situation:
      'You are chasing a rounding bug in a price mapping. The DEBUG lines are not enough, so you want every intermediate value of every line of the calculation.',
    answer: ['TRACE'],
    explain:
      'This is finer than DEBUG and very noisy, which is what TRACE is for. Turn it on for that one category while you look, then off again.',
  },
]
