// Logging Lab exercises, set 2. See ../exercises.js for the format.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

// Theme: messaging. Anypoint MQ, JMS, VM queues and Kafka.
const next = (example) => ({ must: /next\s*"?\s*[=:]/i, say: `Say what happens next, such as ${example}.` })
const has = (re, say) => ({ must: re, say })

export const SET_2 = [
  // ---------- lg-046 Larkspur Grocers: publishing order events to Anypoint MQ ----------
  {
    id: 'log-2001',
    kind: 'level',
    situation:
      'Larkspur Grocers: the Order Process API saved an order and the Anypoint MQ Publish of an OrderPlaced message to the queue larkspur-orders worked. You log one line after each publish.',
    answer: ['INFO'],
    explain:
      'A publish that worked is a normal event you want to see in production. When a store says it never got an order, this line shows the message left the API.',
  },
  {
    id: 'log-2002',
    kind: 'choice',
    situation: 'Larkspur Grocers: which line is best after the OrderPlaced message is published to Anypoint MQ?',
    options: [
      'Message sent',
      'Published to MQ: {"orderId":"LG-88120","customer":{"name":"Tom Reyes","phone":"+1 555 0100"},"items":[...]}',
      'OrderPlaced published queue=larkspur-orders orderId=LG-88120 messageId=3f9a1c07 correlationId=c41d9e',
      'Publishing OrderPlaced now...',
    ],
    answer: 2,
    explain:
      'It says what was published and where, with the order ID, the MQ message ID and the correlation ID. The last option is written before the publish, so it cannot tell you the publish worked.',
  },
  {
    id: 'log-2003',
    kind: 'multi',
    situation: 'Larkspur Grocers: right after an Anypoint MQ Publish that worked, the flow has this logger. Pick every problem.',
    code: `<logger level="ERROR" message='#["MQ publish " ++ write(payload)]' />`,
    options: [
      'ERROR is wrong for a publish that worked. INFO fits',
      'write(payload) puts the whole order, with customer data, in the log',
      'There is no correlation ID and no message ID',
      'Anypoint MQ rejects a publish when the flow logs the payload',
      'The line does not name the queue',
    ],
    answers: [0, 1, 2, 4],
    explain:
      'Anypoint MQ does not know or care what you log, so option 4 is false. The rest are real problems: ERROR would raise alerts for good news, and the payload brings personal data. Write "OrderPlaced published queue=larkspur-orders orderId=$(vars.orderId) messageId=$(vars.messageId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-2004',
    kind: 'write',
    situation:
      'Larkspur Grocers: the flow gives each OrderPlaced message its own ID, kept in vars.messageId, and publishes it to the Anypoint MQ queue larkspur-orders. Write the logger after the Publish. vars.orderId holds the order ID.',
    available: ['vars.orderId', 'vars.messageId', 'payload', 'payload.customer.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/publish|sent|queued/i, 'OrderPlaced published'),
      has(/larkspur-orders|queue\s*=/i, 'Name the queue, such as queue=larkspur-orders.'),
      labelled('messageId', 'messageId=$(vars.messageId)'),
      labelled('orderId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["OrderPlaced published queue=larkspur-orders messageId=$(vars.messageId) orderId=$(vars.orderId) correlationId=$(correlationId)"]',
    },
    explain:
      'The message ID finds the message in Anypoint MQ, and the store app can log the same ID when it receives it. The order ID and correlation ID join this line to the rest of the order.',
  },
  {
    id: 'log-2005',
    kind: 'write',
    situation:
      'Larkspur Grocers: the order is saved in the database, but the Publish to larkspur-orders failed with ANYPOINT-MQ:CONNECTIVITY. The stores will not hear about this order until someone sends the event again. Write the logger in the On Error Propagate. vars.orderId is set.',
    available: ['vars.orderId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/not published|publish failed|could not publish|failed/i, 'OrderPlaced publish failed'),
      errorFacts,
      labelled('orderId'),
      next('next=resend'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["OrderPlaced publish failed, the event must be sent again queue=larkspur-orders orderId=$(vars.orderId) errorType=$(error.errorType) error=$(error.description) next=resend correlationId=$(correlationId)"]',
    },
    explain:
      'The order exists but nobody downstream knows about it, so someone must act: ERROR. A name=value pair holds one token, so the prose goes in the first words and next=resend stays short. The order ID tells the reader which event to send again.',
  },

  // ---------- lg-047 Halvorsen Freight: a VM queue between two flows ----------
  {
    id: 'log-2006',
    kind: 'level',
    situation:
      'Halvorsen Freight: the Booking API puts each booking on the VM queue bookings-q. A second flow with a VM Listener reads it and prices it. What level is the first line of the listener flow?',
    answer: ['INFO'],
    explain:
      'A booking arriving at the pricing flow is a normal event you want in production. With a line on both sides of the VM queue you can see if a booking was queued but never priced.',
  },
  {
    id: 'log-2007',
    kind: 'level',
    situation:
      'Halvorsen Freight: the VM Publish waited 5 seconds for room on the full bookings-q queue and failed with VM:QUEUE_TIMEOUT. The booking is not queued and the API answers 503.',
    answer: ['ERROR'],
    explain:
      'The booking was not taken, and a full queue means the pricing flow is stuck or too slow. Someone must look at it, so ERROR.',
  },
  {
    id: 'log-2008',
    kind: 'choice',
    situation: 'Halvorsen Freight: which line is best right after the VM Publish of a booking to bookings-q?',
    options: [
      'VM publish OK',
      'Booking queued for pricing queue=bookings-q bookingId=HF-55021 correlationId=9b2e71',
      'Sent to VM: {"bookingId":"HF-55021","shipper":"Ida Berg","phone":"+47 400 00 000"}',
      'Booking queued for pricing bookingId=HF-55021',
    ],
    answer: 1,
    explain:
      'The last option is close, but without the correlation ID it cannot be joined to the line the pricing flow writes. The third dumps the payload with a name and a phone number.',
  },
  {
    id: 'log-2009',
    kind: 'multi',
    situation: 'Halvorsen Freight: the first logger of the VM Listener flow that prices bookings. Pick every problem.',
    code: `<logger level="INFO" message='#["Booking received bookingId=$(payload.bookingId)"]' />`,
    options: [
      'There is no correlation ID, so this line cannot be joined to the API line that queued the booking',
      'Logging payload.bookingId dumps the whole payload',
      'It does not name the queue the booking came from',
      'A Logger cannot be the first processor after a VM Listener',
      'INFO is too high for a booking that arrives',
    ],
    answers: [0, 2],
    explain:
      'payload.bookingId is one field, not the whole payload, and INFO fits an arrival. The line needs the correlation ID, and the queue name helps when the app has several VM queues: "Booking received queue=bookings-q bookingId=$(payload.bookingId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-2010',
    kind: 'write',
    situation:
      'Halvorsen Freight: the VM Listener flow has priced a booking. vars.bookingId, vars.priceTotal and vars.durationMs are set. Write the last logger of the flow.',
    available: ['vars.bookingId', 'vars.priceTotal', 'vars.durationMs', 'payload', 'payload.shipper.phone', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/priced|price (calculated|set)|pricing (finished|complete)/i, 'Booking priced'),
      labelled('bookingId'),
      has(/vars\.durationMs/, 'Add how long the pricing took: durationMs=$(vars.durationMs).'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Booking priced bookingId=$(vars.bookingId) priceTotal=$(vars.priceTotal) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'The end line gives the result and the time it took. A price is business data, not personal data, so it may be logged. The shipper phone number may not.',
  },

  // ---------- lg-048 Northfield Rail: reading a JMS queue ----------
  {
    id: 'log-2011',
    kind: 'level',
    situation:
      'Northfield Rail: the JMS Listener on the queue TICKETS.IN receives a ticket booking. attributes.headers.redelivered is false, so this is the first delivery.',
    answer: ['INFO'],
    explain: 'A first delivery is the normal case and you want to see it in production. A redelivery would be WARN.',
  },
  {
    id: 'log-2012',
    kind: 'choice',
    situation: 'Northfield Rail: which line is best as the first logger after the JMS Listener on TICKETS.IN?',
    options: [
      'Got JMS msg',
      'Received from TICKETS.IN: {"ticketId":"NR-7731","passenger":"Mia Cole","seat":"C14"}',
      'JMS listener step 1',
      'Ticket booking received queue=TICKETS.IN jmsMessageId=ID:nf-broker-1-1-7 ticketId=NR-7731 correlationId=5d0c8a',
    ],
    answer: 3,
    explain:
      'The JMS message ID finds the message on the broker, the ticket ID finds the booking, and the correlation ID joins the lines of this booking. The second option logs the passenger name.',
  },
  {
    id: 'log-2013',
    kind: 'multi',
    situation: 'Northfield Rail: the first logger after the JMS Listener. Pick every problem.',
    code: `<logger level="INFO" message='#["Ticket booking received " ++ write(attributes)]' />`,
    options: [
      'attributes holds every JMS header and property, so the line is long and hard to search',
      'It may carry custom properties the sender added, which nobody checked for personal data',
      'There is no labelled ticketId and no correlation ID',
      'write(attributes) logs the message body as well',
      'The JMS Listener clears attributes before the first processor runs',
    ],
    answers: [0, 1, 2],
    explain:
      'attributes holds the headers and properties, not the body, and it is there for the whole flow. Pick the facts you need: "Ticket booking received jmsMessageId=$(attributes.headers.messageId) ticketId=$(payload.ticketId) correlationId=$(correlationId)".',
  },
  {
    id: 'log-2014',
    kind: 'write',
    situation:
      'Northfield Rail: write the first logger after the JMS Listener on the queue TICKETS.IN. The message body has payload.ticketId.',
    available: ['attributes.headers.messageId', 'attributes.headers.redelivered', 'payload.ticketId', 'payload', 'payload.passenger.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|consumed|arrived|got/i, 'Ticket booking received'),
      has(/attributes\.headers\.messageId/, 'Add the JMS message ID: jmsMessageId=$(attributes.headers.messageId).'),
      labelled('ticketId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Ticket booking received queue=TICKETS.IN jmsMessageId=$(attributes.headers.messageId) ticketId=$(payload.ticketId) correlationId=$(correlationId)"]',
    },
    explain:
      'The JMS message ID is what the broker team asks for when a message is stuck or lost. The ticket ID lets support find the booking without reading the body.',
  },
  {
    id: 'log-2015',
    kind: 'write',
    situation:
      'Northfield Rail: a booking has a travel date in the past. The flow publishes it to the queue TICKETS.REJECTED and the listener takes the next message. vars.ticketId and vars.reason are set. Write the logger.',
    available: ['vars.ticketId', 'vars.reason', 'payload', 'payload.passenger.phone', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|invalid|not valid/i, 'Ticket booking rejected'),
      has(/vars\.reason/, 'Add why it was rejected: reason=$(vars.reason).'),
      next('next=TICKETS.REJECTED'),
      labelled('ticketId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Ticket booking rejected reason=$(vars.reason) ticketId=$(vars.ticketId) next=TICKETS.REJECTED correlationId=$(correlationId)"]',
    },
    explain:
      'The data was not as expected but the flow handled it, so WARN. The reason and next= tell support why it was rejected and where to find it.',
  },

  // ---------- lg-049 Kestrel Energy: a first Kafka consumer ----------
  {
    id: 'log-2016',
    kind: 'level',
    situation:
      'Kestrel Energy: a Kafka Message Listener reads about 2,000 meter readings a second from the topic meter-readings. Someone wants a line for every reading. What level should that line have?',
    answer: ['DEBUG'],
    explain:
      'At 2,000 a second, an INFO line per record is over 170 million lines a day. Keep the per-record line at DEBUG, to turn on while you troubleshoot.',
  },
  {
    id: 'log-2017',
    kind: 'choice',
    situation: 'Kestrel Energy: one meter reading is missing in the billing data. Which per-record line helps most to find out if it was read?',
    options: [
      'Kafka record processed',
      'Reading processed meterId=KE-40018',
      'Reading processed topic=meter-readings partition=3 offset=918274 meterId=KE-40018 correlationId=e7a2f4',
      'Reading processed: {"meterId":"KE-40018","kWh":12.4,"household":"P. Novak"}',
    ],
    answer: 2,
    explain:
      'Topic, partition and offset point to one exact record in Kafka. With them you can check if that record was read, and read it again if needed.',
  },
  {
    id: 'log-2018',
    kind: 'choice',
    situation: 'Kestrel Energy: a reading arrives with no kWh value. The flow skips it and goes on. Which line is best?',
    options: [
      'Bad data from meter!!!',
      'Reading skipped: kWh is missing meterId=KE-40018 partition=3 offset=918301 correlationId=e7a2f4',
      'Reading skipped {"meterId":"KE-40018","kWh":null,"household":"P. Novak"}',
      'Error occurred in reading flow',
    ],
    answer: 1,
    explain:
      'It says what was wrong and what the flow did, and the partition and offset let the meter team find the record. The first option blames and shouts, the third logs a household name.',
  },
  {
    id: 'log-2019',
    kind: 'multi',
    situation: 'Kestrel Energy: the first logger of the meter-readings listener flow, at 2,000 records a second. Pick every problem.',
    code: `<logger level="INFO" message='#["Reading $(attributes.key) value=$(payload)"]' />`,
    options: [
      'One INFO line per record at this rate floods the log',
      '$(payload) logs the whole record',
      'There is no partition or offset, so the record cannot be found again on the topic',
      'attributes.key does not exist on a Kafka record',
      'Kafka records cannot be logged until the offset is committed',
    ],
    answers: [0, 1, 2],
    explain:
      'attributes.key is the record key, here the meter ID, and you may log a record whenever you like. The problems are the volume, the whole payload and the missing partition and offset.',
  },
  {
    id: 'log-2020',
    kind: 'write',
    situation:
      'Kestrel Energy: write the per-record logger of the meter-readings listener. The record key, attributes.key, is the meter ID. It must be off in production by default.',
    available: ['attributes.topic', 'attributes.partition', 'attributes.offset', 'attributes.key', 'payload', 'payload.householdName', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/received|consumed|read|arrived|got/i, 'Meter reading received'),
      has(/attributes\.partition/, 'Add the partition: partition=$(attributes.partition).'),
      has(/attributes\.offset/, 'Add the offset: offset=$(attributes.offset).'),
      labelled('meterId', 'meterId=$(attributes.key)'),
      { not: /householdName/, say: 'Leave out the household name. The meter ID is enough.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'DEBUG',
      message:
        '#["Meter reading received topic=meter-readings partition=$(attributes.partition) offset=$(attributes.offset) meterId=$(attributes.key) correlationId=$(correlationId)"]',
    },
    explain:
      'DEBUG keeps this line out of production until someone turns it on for one meter problem. Partition and offset find the record, and the meter ID is the business key.',
  },

  // ---------- lg-050 Bramblewood Insurance: manual ack and nack in Anypoint MQ ----------
  {
    id: 'log-2021',
    kind: 'level',
    situation:
      'Bramblewood Insurance: the claims subscriber uses MANUAL acknowledgement. The claims database is down for a moment, so the flow calls Nack. Anypoint MQ will deliver the message again, and the next delivery usually works.',
    answer: ['WARN'],
    explain:
      'Nothing is lost and the app handled it, so WARN. Many nacks in a row would point to a real problem, and the last failed delivery is the ERROR.',
  },
  {
    id: 'log-2022',
    kind: 'choice',
    situation: 'Bramblewood Insurance: the claim is stored and the flow has called Ack. Which line is best?',
    options: [
      'Claim event acknowledged messageId=7c21e0aa claimId=BW-310442 deliveryCount=1 durationMs=640 correlationId=0f4b9d',
      'Claim event acknowledged',
      'Message acknowledged, body={"claimId":"BW-310442","policyHolder":"R. Osei","injury":"broken wrist"}',
      'Ack in progress step 4',
    ],
    answer: 0,
    explain:
      'Once a message is acked, Anypoint MQ forgets it. This line is the proof it was finished, with the time it took and how many deliveries it needed. The third option logs health data.',
  },
  {
    id: 'log-2023',
    kind: 'multi',
    situation:
      'Bramblewood Insurance: in the On Error Continue that calls Nack when the claims database is down for a moment. Pick every problem.',
    code: `<logger level="ERROR" message='#["NACK " ++ error.description]' />`,
    options: [
      'ERROR is too strong for a message that will be delivered again. WARN fits',
      'There is no message ID or claim ID',
      'It does not say what happens next, such as next=redelivery',
      'error.description should never be logged',
      'A Logger in an error handler cannot read error',
    ],
    answers: [0, 1, 2],
    explain:
      'error.description is exactly what the reader needs, and error is there in every error handler. Write "Claim event nacked messageId=$(vars.messageId) claimId=$(vars.claimId) errorType=$(error.errorType) next=redelivery correlationId=$(correlationId)".',
  },
  {
    id: 'log-2024',
    kind: 'write',
    situation:
      'Bramblewood Insurance: write the logger in the On Error Continue that calls Nack. At the start of the flow you saved vars.messageId and vars.deliveryCount from the MQ attributes. vars.claimId is set.',
    available: ['vars.messageId', 'vars.deliveryCount', 'vars.claimId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/nack|returned|back on|redeliver|not acknowledged/i, 'Claim event nacked'),
      errorFacts,
      has(/vars\.deliveryCount/, 'Add the delivery count: deliveryCount=$(vars.deliveryCount).'),
      labelled('messageId'),
      next('next=redelivery'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Claim event nacked messageId=$(vars.messageId) claimId=$(vars.claimId) deliveryCount=$(vars.deliveryCount) errorType=$(error.errorType) error=$(error.description) next=redelivery correlationId=$(correlationId)"]',
    },
    explain:
      'The delivery count shows how close the message is to the DLQ. Saving the MQ attributes in variables first is safer, because later operations replace attributes.',
  },
  {
    id: 'log-2025',
    kind: 'write',
    situation:
      'Bramblewood Insurance: one claim took longer than the acknowledgement timeout of the subscriber. The lock on the message ran out, so Anypoint MQ may deliver it again while it is still being stored. A Choice router sends these to your logger. vars.claimId, vars.messageId, vars.durationMs and vars.ackTimeoutMs are set.',
    available: ['vars.claimId', 'vars.messageId', 'vars.durationMs', 'vars.ackTimeoutMs', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/slow|longer than|past|after the|exceeded|lock/i, 'Claim processed after the ack timeout'),
      has(/vars\.durationMs/, 'Add how long it took: durationMs=$(vars.durationMs).'),
      has(/vars\.ackTimeoutMs/, 'Add the limit: ackTimeoutMs=$(vars.ackTimeoutMs).'),
      labelled('claimId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Claim processed after the ack timeout, duplicate delivery likely claimId=$(vars.claimId) messageId=$(vars.messageId) durationMs=$(vars.durationMs) ackTimeoutMs=$(vars.ackTimeoutMs) correlationId=$(correlationId)"]',
    },
    explain:
      'The claim was stored, so this is not an ERROR, but a second copy may come. The time and the limit side by side show how far over it went, and the claim ID lets the team check for a double claim.',
  },

  // ---------- lg-051 Corvane Pharmacy: the dead-letter queue ----------
  {
    id: 'log-2026',
    kind: 'level',
    situation:
      'Corvane Pharmacy: the queue refills has a DLQ and max deliveries of 5. A refill event fails on its 5th delivery, so Anypoint MQ will move it to refills-dlq.',
    answer: ['ERROR'],
    explain:
      'The retries are used up and the refill is not done. A person has to look at the DLQ, so ERROR. The earlier failed deliveries were WARN.',
  },
  {
    id: 'log-2027',
    kind: 'choice',
    situation: 'Corvane Pharmacy: a separate flow subscribes to refills-dlq and raises a support ticket for each message. Which first line is best?',
    options: [
      'DLQ message',
      'Refill event read from DLQ queue=refills-dlq messageId=a90d33e1 refillId=CP-20419 deliveryCount=5 correlationId=61be0c',
      'Message in DLQ!!! someone check this',
      'DLQ: {"refillId":"CP-20419","patient":"L. Grant","medication":"..."}',
    ],
    answer: 1,
    explain:
      'The refill ID and the message ID let support find the refill and the message. The last option logs a patient name and a medicine, which is health data.',
  },
  {
    id: 'log-2028',
    kind: 'multi',
    situation: 'Corvane Pharmacy: which lines does the flow that reads refills-dlq and raises tickets need? Pick every one that applies.',
    options: [
      'A line when a message is read from the DLQ, with its message ID and refill ID',
      'A line after the ticket is raised, with the ticket number',
      'An INFO line with the full refill payload, so support can read the prescription',
      'A line in the error handler if the ticket cannot be raised',
      'No lines at all, because the DLQ itself is the record',
    ],
    answers: [0, 1, 3],
    explain:
      'Once a ticket is raised the message leaves the DLQ, so the log is the only trace of what happened to it. The prescription stays out of the log: support reads it in the pharmacy system by refill ID.',
  },
  {
    id: 'log-2029',
    kind: 'write',
    situation:
      'Corvane Pharmacy: the refill flow fails on the last allowed delivery. vars.refillId, vars.messageId and vars.deliveryCount are set. Write the logger in the On Error Propagate, before the message goes to refills-dlq.',
    available: ['vars.refillId', 'vars.messageId', 'vars.deliveryCount', 'error.errorType', 'error.description', 'payload', 'payload.patient.name', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|giving up|last delivery|dead-letter|dlq/i, 'Refill event failed on last delivery'),
      errorFacts,
      next('next=refills-dlq'),
      labelled('deliveryCount', 'deliveryCount=$(vars.deliveryCount)'),
      labelled('refillId'),
      { not: /patient/i, say: 'Leave out the patient. The refill ID is enough.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Refill event failed on last delivery refillId=$(vars.refillId) messageId=$(vars.messageId) deliveryCount=$(vars.deliveryCount) errorType=$(error.errorType) error=$(error.description) next=refills-dlq correlationId=$(correlationId)"]',
    },
    explain:
      'This is the line an alert should fire on. It says why the refill failed and where the message went, so nobody has to guess.',
  },
  {
    id: 'log-2030',
    kind: 'write',
    situation:
      'Corvane Pharmacy: the DLQ flow has raised a support ticket for a failed refill. vars.ticketNumber, vars.refillId and vars.messageId are set. Write the logger.',
    available: ['vars.ticketNumber', 'vars.refillId', 'vars.messageId', 'payload', 'payload.patient.phone', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/ticket (raised|created|opened)|raised/i, 'Support ticket raised for DLQ refill'),
      labelled('ticketNumber'),
      labelled('refillId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Support ticket raised for DLQ refill ticketNumber=$(vars.ticketNumber) refillId=$(vars.refillId) messageId=$(vars.messageId) correlationId=$(correlationId)"]',
    },
    explain:
      'The ticket number joins the log to the support system, and the refill ID joins it to the failed refill. The handler worked as designed, so INFO.',
  },

  // ---------- lg-052 Pellucid Telecom: JMS topics and durable subscribers ----------
  {
    id: 'log-2031',
    kind: 'level',
    situation:
      'Pellucid Telecom: the billing app listens on the JMS topic PRICES.CHANGED. About half the messages are for plans billing does not sell, and it ignores them as designed. What level is the line for an ignored message?',
    answer: ['DEBUG'],
    explain:
      'Ignoring these is normal and needs no action, and half of all messages would fill the log. DEBUG keeps the line for when you troubleshoot.',
  },
  {
    id: 'log-2032',
    kind: 'choice',
    situation: 'Pellucid Telecom: the pricing app publishes a PriceChanged message to the JMS topic PRICES.CHANGED. Which line after the publish is best?',
    options: [
      'Published to topic',
      'PriceChanged published queue=PRICES.CHANGED planId=PT-UNL-40',
      'Sending price change to all subscribers now',
      'PriceChanged published topic=PRICES.CHANGED planId=PT-UNL-40 eventId=pc-55120 correlationId=3ac1f8',
    ],
    answer: 3,
    explain:
      'The event ID is the key every subscriber can log too, so one price change can be followed to all of them. The second option calls the topic a queue and has no correlation ID.',
  },
  {
    id: 'log-2033',
    kind: 'multi',
    situation:
      'Pellucid Telecom: the billing, web shop and store apps each listen on PRICES.CHANGED, and each starts its flow with this logger. Pick every problem.',
    code: `<logger level="INFO" message="Price change received" />`,
    options: [
      'It does not show if this is a redelivery, from attributes.headers.redelivered',
      'There is no planId or eventId, so one price change cannot be followed to all three apps',
      'There is no correlation ID',
      'A topic subscriber is not allowed to log at INFO',
      'Each subscriber should log the full message so the three copies can be compared',
    ],
    answers: [0, 1, 2],
    explain:
      'INFO is fine for an arrival. Comparing copies is done with the event ID, not by logging the body three times: "Price change received eventId=$(vars.eventId) planId=$(vars.planId) redelivered=$(attributes.headers.redelivered) correlationId=$(correlationId)".',
  },
  {
    id: 'log-2034',
    kind: 'multi',
    situation:
      'Pellucid Telecom: the web shop uses a non-durable topic subscriber. It was down for a restart from 02:00 to 02:06. The price changes published in those minutes never reached it, because a non-durable subscription keeps nothing while the app is off. Which log lines would have shown the gap? Pick every one that applies.',
    options: [
      'The pricing app line after each publish, with eventId and the time',
      'A web shop line for each price change received, with the same eventId',
      'A DEBUG line in the pricing app with the whole price list',
      'An ERROR line in the pricing app for every subscriber that is offline',
      'A WARN line in the web shop every time no message arrives for one second',
    ],
    answers: [0, 1],
    explain:
      'Compare the event IDs on both sides and the missing ones stand out. A topic publisher cannot see its subscribers, so it cannot log who is offline. The fix is a durable subscription, which keeps messages while the app is down.',
  },
  {
    id: 'log-2035',
    kind: 'write',
    situation:
      'Pellucid Telecom: the billing app reads PRICES.CHANGED with the durable subscription billing-prices and has saved the new price. vars.planId, vars.eventId and vars.newPrice are set. Write the logger.',
    available: ['vars.planId', 'vars.eventId', 'vars.newPrice', 'attributes.headers.redelivered', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/applied|updated|saved|stored/i, 'Price change applied'),
      has(/billing-prices|subscription\s*=/i, 'Name the subscription, such as subscription=billing-prices.'),
      labelled('planId'),
      labelled('eventId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Price change applied subscription=billing-prices planId=$(vars.planId) eventId=$(vars.eventId) newPrice=$(vars.newPrice) correlationId=$(correlationId)"]',
    },
    explain:
      'The event ID matches the line the pricing app wrote when it published. The subscription name tells the reader which of the topic subscribers this is.',
  },

  // ---------- lg-053 Redfern Logistics: Kafka keys and partitions ----------
  {
    id: 'log-2036',
    kind: 'level',
    situation:
      'Redfern Logistics: parcel status events go to the Kafka topic parcel-status with the parcel ID as the key, so the events of one parcel stay in order. One event had no parcel ID, so it was published with no key. The flow goes on.',
    answer: ['WARN'],
    explain:
      'It worked, but Kafka may put the keyless event on any partition, so its order against the other events of that parcel is lost. The app handled it and the data needs a look: WARN.',
  },
  {
    id: 'log-2037',
    kind: 'choice',
    situation: 'Redfern Logistics: which line is best after the Kafka Publish of a parcel status event?',
    options: [
      'Parcel status published topic=parcel-status parcelId=RL-7781204 status=OUT_FOR_DELIVERY correlationId=d29e5b',
      'Kafka publish success',
      'Parcel status published topic=parcel-status',
      'Published: {"parcelId":"RL-7781204","recipient":"Jo Park","street":"12 Elm Road"}',
    ],
    answer: 0,
    explain:
      'It names the parcel with parcelId, the same name the Tracking app uses, so one search finds both sides. That value is also the Kafka key, so it tells you which partition order the event belongs to. The last option logs a name and a street.',
  },
  {
    id: 'log-2038',
    kind: 'multi',
    situation: 'Redfern Logistics: the first logger of the Tracking app, which consumes parcel-status. Pick every problem.',
    code: `<logger level="INFO" message='#["Status event partition=$(attributes.partition) offset=$(attributes.offset)"]' />`,
    options: [
      'There is no key, so the reader cannot see which parcel the event is for',
      'There is no correlation ID',
      'It does not say what happened, such as Parcel status received',
      'partition and offset are of no use in a log',
      'The offset must be masked like a secret',
    ],
    answers: [0, 1, 2],
    explain:
      'Partition and offset are good facts: they point to one record. Add the business key and the words: "Parcel status received parcelId=$(attributes.key) partition=$(attributes.partition) offset=$(attributes.offset) correlationId=$(correlationId)".',
  },
  {
    id: 'log-2039',
    kind: 'write',
    situation:
      'Redfern Logistics: vars.parcelId was null, so the flow published the status event with no key. vars.eventId and vars.status are set. Write the logger after the publish.',
    available: ['vars.eventId', 'vars.status', 'vars.parcelId', 'payload', 'payload.recipient.phone', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/no key|without a key|key (is )?missing|null key/i, 'Parcel status published without a key'),
      has(/order/i, "Say what it means: the order of this parcel's events is not kept."),
      labelled('eventId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Parcel status published without a key, order not kept topic=parcel-status status=$(vars.status) eventId=$(vars.eventId) correlationId=$(correlationId)"]',
    },
    explain:
      'The event went out, so this is not an ERROR. The line tells the team that tracking may show statuses in the wrong order, and the event ID lets them find the bad source record.',
  },
  {
    id: 'log-2040',
    kind: 'write',
    situation:
      'Redfern Logistics: the Tracking app already has DELIVERED for a parcel when an older OUT_FOR_DELIVERY event arrives. It ignores the older event. The key, attributes.key, is the parcel ID. vars.status and vars.storedStatus are set. Write the logger.',
    available: ['attributes.key', 'attributes.partition', 'attributes.offset', 'vars.status', 'vars.storedStatus', 'payload', 'correlationId'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/out of order|older|stale|ignored|skipped/i, 'Older parcel status ignored'),
      has(/attributes\.offset/, 'Add the offset: offset=$(attributes.offset).'),
      labelled('parcelId', 'parcelId=$(attributes.key)'),
      has(/vars\.storedStatus/, 'Add the status you already have: storedStatus=$(vars.storedStatus).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Older parcel status ignored parcelId=$(attributes.key) status=$(vars.status) storedStatus=$(vars.storedStatus) partition=$(attributes.partition) offset=$(attributes.offset) correlationId=$(correlationId)"]',
    },
    explain:
      'Both statuses side by side show why the event was ignored. WARN fits if this should not happen, INFO if the team expects it now and then. ERROR does not fit: the app handled it.',
  },

  // ---------- lg-054 Velora Fashion: fan-out through an Anypoint MQ exchange ----------
  {
    id: 'log-2041',
    kind: 'level',
    situation:
      'Velora Fashion: the Product API publishes a product update to the Anypoint MQ exchange product-updates. The exchange copies it to three bound queues: web-products, store-products and search-products. The publish worked.',
    answer: ['INFO'],
    explain: 'One publish that worked is a normal event. One INFO line is enough: the exchange makes the copies, not your flow.',
  },
  {
    id: 'log-2042',
    kind: 'choice',
    situation: 'Velora Fashion: which line is best after the Product API publishes to the exchange product-updates?',
    options: [
      'Product update published to web-products, store-products and search-products productId=VF-2209',
      'Published 3 messages',
      'Product update published exchange=product-updates productId=VF-2209 messageId=5e01b7c2 correlationId=8d11fa',
      'Product update published exchange=product-updates',
    ],
    answer: 2,
    explain:
      'The publisher sends one message to one exchange. It does not know the bindings, so naming three queues is wrong as soon as a fourth queue is bound. The bound queues each log their own arrival.',
  },
  {
    id: 'log-2043',
    kind: 'multi',
    situation:
      'Velora Fashion: the store team says product VF-2209 never reached the stores. Which log lines let you find where it stopped? Pick every one that applies.',
    options: [
      'The publisher line with the exchange, productId and messageId',
      'The first line of each consumer flow, with the same productId and its own queue name',
      'A line in each consumer after its work is done, with the result',
      'A DEBUG line in the publisher that lists every bound queue from the MQ admin API',
      'One ERROR line in the publisher for each consumer that is slow',
    ],
    answers: [0, 1, 2],
    explain:
      'With the same productId on every line you can follow the update into each queue and see which consumer received it but did not finish. The publisher cannot know how slow a consumer is.',
  },
  {
    id: 'log-2044',
    kind: 'write',
    situation:
      'Velora Fashion: write the first logger of the search team flow, which subscribes to the queue search-products. vars.productId is set. The MQ message ID is in attributes.messageId.',
    available: ['vars.productId', 'attributes.messageId', 'attributes.deliveryCount', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/received|consumed|arrived|got/i, 'Product update received'),
      has(/search-products|queue\s*=/i, 'Name your own queue, such as queue=search-products, so the three consumers can be told apart.'),
      labelled('productId'),
      labelled('messageId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Product update received queue=search-products productId=$(vars.productId) messageId=$(attributes.messageId) correlationId=$(correlationId)"]',
    },
    explain:
      'Three flows receive the same update, so the queue name tells their lines apart. The product ID joins all of them to the publisher line.',
  },
  {
    id: 'log-2045',
    kind: 'write',
    situation:
      'Velora Fashion: the web-products consumer could not update the web shop, which answered 503. The On Error Propagate leaves the message on web-products for redelivery. The other two queues are not affected. vars.productId is set. Write the logger.',
    available: ['vars.productId', 'attributes.messageId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/fail|not updated|could not/i, 'Web shop product update failed'),
      errorFacts,
      has(/web-products|queue\s*=/i, 'Name the queue, such as queue=web-products.'),
      labelled('productId'),
      next('next=redelivery'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Web shop product update failed queue=web-products productId=$(vars.productId) errorType=$(error.errorType) error=$(error.description) next=redelivery correlationId=$(correlationId)"]',
    },
    explain:
      'The message will come again, so WARN. The queue name shows that only the web copy failed, which matters when the stores and search already have the update.',
  },

  // ---------- lg-055 Saltmarsh Utilities: big messages and size limits ----------
  {
    id: 'log-2046',
    kind: 'level',
    situation:
      'Saltmarsh Utilities: a billing statement payload is 9.6 MB, which is close to the maximum message size of Anypoint MQ. The payload is turned into text before it is published, so the message on the wire can be larger than the payload. This publish worked. A Choice router sends messages over 8 MB to a logger.',
    answer: ['WARN'],
    explain:
      'It worked, but the stringified message is bigger than the payload, so the next large statement may not fit. WARN gives the team time to change the design before publishes start to fail.',
  },
  {
    id: 'log-2047',
    kind: 'level',
    situation:
      'Saltmarsh Utilities: a 12 MB statement could not be published because it is over the Anypoint MQ size limit. Nothing will retry it, and the customer gets no statement.',
    answer: ['ERROR'],
    explain: 'The work failed and a retry will fail the same way. Someone must act, so ERROR.',
  },
  {
    id: 'log-2048',
    kind: 'choice',
    situation: 'Saltmarsh Utilities: which line is best after a statement is published to the queue statements?',
    options: [
      'Statement published size=184220',
      'Statement published queue=statements statementId=SU-88310 sizeBytes=184220 correlationId=4b7e90',
      'Statement published JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9n...',
      'Statement published statementId=SU-88310 sizeBytes=184220',
    ],
    answer: 1,
    explain:
      'The size with its unit in the name shows how close messages are to the limit over time. The third option logs the start of the document itself.',
  },
  {
    id: 'log-2049',
    kind: 'multi',
    situation: 'Saltmarsh Utilities: before the publish, the statement flow has this logger. Pick every problem.',
    code: `<logger level="DEBUG" message='#["Statement body: $(write(payload))"]' />`,
    options: [
      'A statement of several MB in one log line can be cut off by the log tool or slow the app',
      'The statement holds customer names, addresses and amounts',
      'DEBUG is often turned on in production to troubleshoot, so this can reach production logs',
      'Logging sizeOf(payload) would leak the same data',
      'DEBUG lines are never written to disk',
    ],
    answers: [0, 1, 2],
    explain:
      'sizeOf(payload) is a number, not the data, so it is safe and useful here. Log the statement ID and the size, never the body.',
  },
  {
    id: 'log-2050',
    kind: 'write',
    situation:
      'Saltmarsh Utilities: for statements over 8 MB the flow now stores the file in object storage and publishes only a small message with the storage key. vars.statementId, vars.sizeBytes and vars.storageKey are set. Write the logger after the publish.',
    available: ['vars.statementId', 'vars.sizeBytes', 'vars.storageKey', 'payload', 'payload.customer.address', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/stored|claim check|published|saved/i, 'Large statement stored, reference published'),
      labelled('statementId'),
      has(/vars\.sizeBytes/, 'Add the size: sizeBytes=$(vars.sizeBytes).'),
      has(/vars\.storageKey/, 'Add where the file is: storageKey=$(vars.storageKey).'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Large statement stored, reference published queue=statements statementId=$(vars.statementId) sizeBytes=$(vars.sizeBytes) storageKey=$(vars.storageKey) correlationId=$(correlationId)"]',
    },
    explain:
      'This is the claim check pattern working as designed, so INFO. The storage key is the path of the file, not a password, and it tells the reader where the statement went.',
  },

  // ---------- lg-056 Quillon Bank: duplicates on Kafka ----------
  {
    id: 'log-2051',
    kind: 'level',
    situation:
      'Quillon Bank: the Idempotent Message Validator on the payment-instructions consumer cannot reach its Object Store. The flow cannot tell if a payment was already made, so it stops and does not commit the offset.',
    answer: ['ERROR'],
    explain:
      'No payments move until the store is back, and someone has to fix it. ERROR. Stopping is the safe choice: a double payment is worse than a late one.',
  },
  {
    id: 'log-2052',
    kind: 'choice',
    situation:
      'Quillon Bank: Kafka delivers at least once, so after a rebalance a payment instruction can arrive twice. The validator raised MULE:DUPLICATE_MESSAGE and the flow skipped it. Which line is best?',
    options: [
      'Duplicate!',
      'Duplicate payment skipped debtorAccount=QB0099887766 amount=250.00',
      'MULE:DUPLICATE_MESSAGE',
      'Duplicate payment instruction skipped paymentId=QB-PAY-661204 partition=1 offset=55021 correlationId=a3c07e',
    ],
    answer: 3,
    explain:
      'The payment ID is the key the validator checked, and the partition and offset show which copy was skipped. An account number does not belong in a log.',
  },
  {
    id: 'log-2053',
    kind: 'multi',
    situation: 'Quillon Bank: in the On Error Continue for MULE:DUPLICATE_MESSAGE on the payment consumer. Pick every problem.',
    code: `<logger level="ERROR" message='#["DUPLICATE PAYMENT!!! $(payload)"]' />`,
    options: [
      'ERROR alerts someone for a duplicate the app already stopped',
      'payload holds the account numbers and the amount',
      'Capitals and !!! do not help the reader',
      'The duplicate key, paymentId, is missing',
      'Duplicates on Kafka mean the broker lost data',
    ],
    answers: [0, 1, 2, 3],
    explain:
      'With at-least-once delivery, duplicates are expected and the broker lost nothing. The validator did its job, so INFO or WARN with the payment ID.',
  },
  {
    id: 'log-2054',
    kind: 'write',
    situation:
      'Quillon Bank: write the logger in the On Error Continue for MULE:DUPLICATE_MESSAGE. The validator is the first processor, so attributes are still the Kafka record attributes. vars.paymentId is set.',
    available: ['vars.paymentId', 'attributes.partition', 'attributes.offset', 'payload', 'payload.debtorAccount', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/duplicate/i, 'Duplicate payment instruction skipped'),
      labelled('paymentId'),
      has(/attributes\.offset/, 'Add the offset: offset=$(attributes.offset).'),
      { not: /account|iban/i, say: 'Leave out account numbers. The payment ID is enough.' },
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Duplicate payment instruction skipped paymentId=$(vars.paymentId) partition=$(attributes.partition) offset=$(attributes.offset) correlationId=$(correlationId)"]',
    },
    explain:
      'A stopped duplicate is the validator working, so INFO, or WARN if the team wants to count them. The offset shows which copy was skipped, which helps when you compare it with the first one.',
  },
  {
    id: 'log-2055',
    kind: 'write',
    situation:
      'Quillon Bank: write the logger for the case where the Object Store behind the validator cannot be reached. The flow stops and does not commit the offset, so the record will be read again. vars.paymentId and vars.offset are set.',
    available: ['vars.paymentId', 'vars.offset', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/could not|cannot|unable|fail/i, 'Duplicate check failed'),
      errorFacts,
      labelled('paymentId'),
      next('next=reread'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Duplicate check failed, payment not made, offset not committed paymentId=$(vars.paymentId) offset=$(vars.offset) errorType=$(error.errorType) error=$(error.description) next=reread correlationId=$(correlationId)"]',
    },
    explain:
      'It says the payment was not made and why, and next=reread tells the reader the record is safe and will be read again. That stops someone from replaying it by hand. The pair holds one token, so "offset not committed" goes in the words before the pairs.',
  },

  // ---------- lg-057 Juniper Air: FIFO queues and ordering ----------
  {
    id: 'log-2056',
    kind: 'level',
    situation:
      'Juniper Air: seat changes arrive on the Anypoint MQ FIFO queue seat-changes, with the booking reference as the message group. One message has failed 3 times. In a FIFO queue the messages of the same group wait behind it, so the seat changes of that booking are piling up.',
    answer: ['ERROR'],
    explain: 'One bad message is holding up every seat change for that booking. Someone must act now, so ERROR.',
  },
  {
    id: 'log-2057',
    kind: 'choice',
    situation: 'Juniper Air: you want to prove the seat changes of one booking are applied in order. Which line is best when a message arrives?',
    options: [
      'Seat change received',
      'Seat change received for passenger Maria Lund seat=14C',
      'Seat change received queue=seat-changes bookingRef=JA7Q2M sequence=412 messageId=0b77e4a1 correlationId=c5f219',
      'Seat change received bookingRef=JA7Q2M',
    ],
    answer: 2,
    explain:
      'The sequence number is what proves the order. Line up the lines of one bookingRef and the sequence numbers should only go up.',
  },
  {
    id: 'log-2058',
    kind: 'multi',
    situation:
      'Juniper Air: the seat changes of one booking were applied in the wrong order. Which facts in the consumer log lines help to prove it? Pick every one that applies.',
    options: [
      'The sequence number of each event',
      'The bookingRef, so all events of one booking can be put side by side',
      'A line when each event is received and another when it is applied',
      'The passenger name, to be sure it is the same person',
      'The whole seat map before and after each change',
    ],
    answers: [0, 1, 2],
    explain:
      'Sequence numbers and two lines per event show both the order of arrival and the order of work. The booking reference already tells you it is the same booking, so no name is needed.',
  },
  {
    id: 'log-2059',
    kind: 'write',
    situation:
      'Juniper Air: the publisher sent seat change 415 before 414. The consumer keeps the last applied number per booking, so it sees a gap. It holds the event until 414 arrives. vars.bookingRef, vars.sequence and vars.expectedSequence are set. Write the logger.',
    available: ['vars.bookingRef', 'vars.sequence', 'vars.expectedSequence', 'payload', 'payload.passenger.name', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/out of order|gap|missing|early|ahead/i, 'Seat change out of order'),
      has(/vars\.sequence\b/, 'Add the number that arrived: sequence=$(vars.sequence).'),
      has(/vars\.expectedSequence/, 'Add the number you expected: expectedSequence=$(vars.expectedSequence).'),
      labelled('bookingRef'),
      next('next=held'),
      { not: /passenger/i, say: 'Leave out the passenger. The booking reference is enough.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Seat change out of order, held until the gap is filled bookingRef=$(vars.bookingRef) sequence=$(vars.sequence) expectedSequence=$(vars.expectedSequence) next=held correlationId=$(correlationId)"]',
    },
    explain:
      'The flow handled it, so WARN. Both numbers show the size of the gap, and next=held tells the reader the event is not lost, only waiting. A pair takes one token, so the rest of the sentence goes before the pairs.',
  },
  {
    id: 'log-2060',
    kind: 'write',
    situation:
      'Juniper Air: write the logger for the message that failed again on seat-changes and is holding up its message group. vars.bookingRef, vars.messageId and vars.deliveryCount are set.',
    available: ['vars.bookingRef', 'vars.messageId', 'vars.deliveryCount', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|blocking|blocked|stuck/i, 'Seat change failed, message group blocked'),
      errorFacts,
      has(/block|wait|stuck|held up/i, 'Say that the messages of the same group are waiting behind it.'),
      labelled('deliveryCount'),
      labelled('bookingRef'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Seat change failed, message group blocked behind it queue=seat-changes bookingRef=$(vars.bookingRef) messageId=$(vars.messageId) deliveryCount=$(vars.deliveryCount) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'On a standard queue one bad message holds up nothing else. On a FIFO queue it stops every message of its group, so this booking gets no more seat changes until someone acts. The line must say so, so the on-call person knows how urgent it is.',
  },

  // ---------- lg-058 Tessaly Hotels: JMS transactions and rollbacks ----------
  {
    id: 'log-2061',
    kind: 'level',
    situation:
      'Tessaly Hotels: the JMS Listener on HOTEL.RESERVATIONS starts a transaction (ALWAYS_BEGIN). The insert into the reservations table fails for a moment and the On Error Propagate rolls back. The broker will deliver the message again. This is the first delivery.',
    answer: ['WARN'],
    explain:
      'The rollback puts the message back, so nothing is lost yet. WARN. When a Mule redelivery policy on the listener runs out of attempts, it raises MULE:REDELIVERY_EXHAUSTED, and that line is the ERROR.',
  },
  {
    id: 'log-2062',
    kind: 'choice',
    situation:
      'Tessaly Hotels: inside the transaction the flow publishes a confirmation to the JMS queue HOTEL.CONFIRM. It is only delivered when the transaction commits. Which line after the publish is most honest?',
    options: [
      'Reservation confirmation queued, sent on commit queue=HOTEL.CONFIRM reservationId=TH-90412 correlationId=2c8d55',
      'Reservation confirmation delivered to guest',
      'Confirmation published',
      'Reservation confirmation queued queue=HOTEL.CONFIRM guest=Ana Ruiz room=412',
    ],
    answer: 0,
    explain:
      'If the transaction rolls back, the confirmation is never sent. A line that says "delivered" would be wrong in exactly the case you are looking into.',
  },
  {
    id: 'log-2063',
    kind: 'choice',
    situation: 'Tessaly Hotels: which line is best in the On Error Propagate that rolls back the reservation transaction?',
    options: [
      'Rollback',
      'Transaction rolled back {"reservationId":"TH-90412","guest":"Ana Ruiz","card":"****"}',
      'Error occurred, rolling back',
      'Reservation transaction rolled back reservationId=TH-90412 jmsMessageId=ID:th-broker-1-9-3 errorType=DB:CONNECTIVITY next=redelivery correlationId=2c8d55',
    ],
    answer: 3,
    explain:
      'It says what was undone, why, and what happens next. With the JMS message ID you can follow the same message through its next delivery.',
  },
  {
    id: 'log-2064',
    kind: 'multi',
    situation: 'Tessaly Hotels: the transactional JMS Listener flow has this error handler. Pick every problem.',
    code: `<on-error-continue>
  <logger level="WARN" message='#["Reservation failed, will be redelivered reservationId=$(vars.reservationId) correlationId=$(correlationId)"]' />
</on-error-continue>`,
    options: [
      'The line says the message will be redelivered, but On Error Continue commits the transaction, so it will not be',
      'The reservation is lost and no line says so at ERROR',
      'There is no error.errorType or error.description',
      'WARN lines cannot be written inside a transaction',
      'correlationId is empty inside an error handler',
    ],
    answers: [0, 1, 2],
    explain:
      'On Error Continue ends the flow as a success, so the transaction commits and the message is gone. Use On Error Propagate to roll back, or keep On Error Continue and log at ERROR that the reservation was dropped.',
  },
  {
    id: 'log-2065',
    kind: 'write',
    situation:
      'Tessaly Hotels: write the logger in the On Error Propagate that rolls back the reservation transaction. At the start you saved vars.jmsMessageId and vars.deliveryCount (from JMSXDeliveryCount). vars.reservationId is set.',
    available: ['vars.reservationId', 'vars.jmsMessageId', 'vars.deliveryCount', 'error.errorType', 'error.description', 'payload', 'payload.guest.email', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/rolled back|rollback/i, 'Reservation transaction rolled back'),
      errorFacts,
      labelled('reservationId'),
      has(/vars\.deliveryCount/, 'Add the delivery count: deliveryCount=$(vars.deliveryCount).'),
      next('next=redelivery'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Reservation transaction rolled back reservationId=$(vars.reservationId) jmsMessageId=$(vars.jmsMessageId) deliveryCount=$(vars.deliveryCount) errorType=$(error.errorType) error=$(error.description) next=redelivery correlationId=$(correlationId)"]',
    },
    explain:
      'The delivery count shows how many times this message has come back. When it keeps climbing, the same reservation is failing again and again.',
  },

  // ---------- lg-059 Marlow Ride: Kafka consumer lag and commits ----------
  {
    id: 'log-2066',
    kind: 'level',
    situation:
      'Marlow Ride: the scooter-trips consumer compares each record time with the clock. A Choice router sends records older than 60 seconds to a logger. Right now records are 9 minutes old when processed, but the consumers keep working and the age is falling.',
    answer: ['WARN'],
    explain:
      'Nothing failed and the app is catching up, but the data is late. WARN shows the team how far behind it got without waking anyone.',
  },
  {
    id: 'log-2067',
    kind: 'choice',
    situation: 'Marlow Ride: which line is best for a record that is processed late?',
    options: [
      'Consumer is SLOW',
      'Late record: {"tripId":"MR-3310872","riderId":"u-55102","route":[...]}',
      'Consumer behind ageSeconds=540 targetSeconds=60 topic=scooter-trips partition=7 offset=4410288 correlationId=b8a0d6',
      'Lag detected',
    ],
    answer: 2,
    explain:
      'The age next to the target says how far behind it is, and the partition shows if one partition or all of them are late.',
  },
  {
    id: 'log-2068',
    kind: 'multi',
    situation:
      'Marlow Ride: the listener uses MANUAL ack mode, and after each record the flow calls Commit. Thousands of records arrive each second. The logger after the Commit is below. Pick every problem.',
    code: `<logger level="INFO" message="Committed" />`,
    options: [
      'It does not say which partition and offset were committed',
      'There is no correlation ID',
      'An INFO line per commit at this rate floods the log. DEBUG fits',
      'Commit returns the record payload, so it should be logged',
      'A Logger cannot follow a Commit',
    ],
    answers: [0, 1, 2],
    explain:
      'Commit only moves the group offset forward. A DEBUG line with the partition and offset is enough to check commits while you troubleshoot.',
  },
  {
    id: 'log-2069',
    kind: 'multi',
    situation:
      'Marlow Ride: after a deployment, about 4,000 trips were processed twice. Which log lines would show why? Pick every one that applies.',
    options: [
      'A line with partition and offset when each record is received',
      'A line with partition and offset after each commit',
      'An INFO line with the full record each time',
      'An ERROR line from the broker every time a record is read twice',
      'The consumer group ID in the start-up line, to confirm both workers share one group',
    ],
    answers: [0, 1, 4],
    explain:
      'The same offset received twice, with no commit between, shows records read again after the restart. The broker does not flag a second read, and a group ID typo would make the two workers read everything twice.',
  },
  {
    id: 'log-2070',
    kind: 'write',
    situation:
      'Marlow Ride: write the logger for records older than 60 seconds. vars.ageSeconds holds the age of the record.',
    available: ['vars.ageSeconds', 'attributes.topic', 'attributes.partition', 'attributes.offset', 'payload', 'payload.riderId', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/behind|lag|late|delay|old/i, 'Consumer behind'),
      has(/vars\.ageSeconds/, 'Add the age: ageSeconds=$(vars.ageSeconds).'),
      has(/60|target|limit/i, 'Add the target, such as targetSeconds=60.'),
      has(/attributes\.partition/, 'Add the partition: partition=$(attributes.partition).'),
      { not: /riderId/, say: 'Leave out the rider. The partition and offset find the record.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Consumer behind ageSeconds=$(vars.ageSeconds) targetSeconds=60 topic=scooter-trips partition=$(attributes.partition) offset=$(attributes.offset) correlationId=$(correlationId)"]',
    },
    explain:
      'The age and the target side by side show how bad it is. The partition tells you if one slow partition, or the whole group, is behind.',
  },

  // ---------- lg-060 Brightmoor Stores: a poison record on a Kafka topic ----------
  {
    id: 'log-2071',
    kind: 'level',
    situation:
      'Brightmoor Stores: a record on the topic loyalty-points is not valid JSON. The listener uses MANUAL ack mode. The flow publishes the record to the dead-letter topic loyalty-points.dlt and calls Commit, so the partition moves on. The points for that one customer are not added until someone fixes it.',
    answer: ['ERROR', 'WARN'],
    explain:
      'ERROR fits when nobody watches the dead-letter topic, because one customer stays without points until a person fixes the record. WARN fits when the team works that topic every day, since the flow handled the record and the partition kept moving. Both are defensible here, so pick the one that matches who acts on the line.',
  },
  {
    id: 'log-2072',
    kind: 'choice',
    situation: 'Brightmoor Stores: which line is best when a record that cannot be read is sent to loyalty-points.dlt?',
    options: [
      'Poison record sent to dead-letter topic topic=loyalty-points partition=5 offset=330918 key=BM-88102 error="Unexpected character at 1:42" next=loyalty-points.dlt correlationId=f60b3d',
      'Bad record: 7b22637573746f6d6572223a7b226e616d65223a...',
      'Poison record!!!',
      'Record sent to DLT',
    ],
    answer: 0,
    explain:
      'Topic, partition and offset find the original record, and the error says what is wrong with it. The second option logs the raw bytes, which may hold personal data and help nobody.',
  },
  {
    id: 'log-2073',
    kind: 'multi',
    situation:
      'Brightmoor Stores: before the dead-letter topic existed, the loyalty-points listener had this in its On Error Propagate. The bad record failed again and again. Pick every problem.',
    code: `<logger level="WARN" message="Retrying record" />`,
    options: [
      'The same offset fails again and again, and every record behind it on that partition waits',
      'WARN on every attempt hides that the partition is stuck. After a few attempts it needs ERROR',
      'There is no partition, offset or key, so the stuck record cannot be found',
      'Kafka moves a bad record to a dead-letter topic by itself after 3 attempts',
      'Logging the offset leaks private data',
    ],
    answers: [0, 1, 2],
    explain:
      'Kafka has no dead-letter topic of its own: your flow must publish the record there and commit. An offset is a position, not private data, and it is the fact you need most here.',
  },
  {
    id: 'log-2074',
    kind: 'write',
    situation:
      'Brightmoor Stores: a record could not be read as JSON. The listener uses MANUAL ack mode, so the flow publishes the record to loyalty-points.dlt and then calls Commit. Write the logger in the On Error Continue. The attributes are still the Kafka record attributes.',
    available: ['attributes.key', 'attributes.partition', 'attributes.offset', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/poison|cannot be read|unreadable|not valid|dead-letter/i, 'Poison record sent to dead-letter topic'),
      errorFacts,
      has(/attributes\.partition/, 'Add the partition: partition=$(attributes.partition).'),
      has(/attributes\.offset/, 'Add the offset: offset=$(attributes.offset).'),
      next('next=loyalty-points.dlt'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Poison record sent to dead-letter topic topic=loyalty-points partition=$(attributes.partition) offset=$(attributes.offset) key=$(attributes.key) errorType=$(error.errorType) error=$(error.description) next=loyalty-points.dlt correlationId=$(correlationId)"]',
    },
    explain:
      'Partition and offset point at the original record, the key says which customer, the error type and description say what is wrong with the data, and next= says where the copy went. The payload stays out: it is the broken data, and it may hold personal details.',
  },
  {
    id: 'log-2075',
    kind: 'write',
    situation:
      'Brightmoor Stores: an operator fixed a record and the replay flow published it from loyalty-points.dlt back to loyalty-points. vars.customerId and vars.originalOffset are set. Write the logger.',
    available: ['vars.customerId', 'vars.originalOffset', 'payload', 'payload.customer.email', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/replay|republished|resent|sent again/i, 'Fixed record replayed from dead-letter topic'),
      has(/vars\.originalOffset/, 'Add the offset of the bad record: originalOffset=$(vars.originalOffset).'),
      labelled('customerId'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Fixed record replayed from dead-letter topic customerId=$(vars.customerId) originalOffset=$(vars.originalOffset) topic=loyalty-points correlationId=$(correlationId)"]',
    },
    explain:
      'The original offset joins this line to the ERROR line written when the record failed, so the story of that record is complete in the log.',
  },
]
