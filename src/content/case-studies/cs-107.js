import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-107',
  category: 'case-studies',
  title: 'Parcel Carrier Opening a Track-and-Trace API to Retailers',
  level: 'BEGINNER',
  tags: ['logistics', 'track-and-trace', 'api-led', 'api-management', 'caching', 'rate-limiting', 'legacy'],
  estMinutes: 30,
  diagram: {
    task: 'draw the track-and-trace API: retailers, the website and the app calling through the gateway, one Experience API, a Process API with a short cache, and System APIs in front of the DB2 tracking system and the proof-of-delivery photo bucket.',
    checks: [
      { label: 'Retailers, the website and the app each call through the gateway', rule: { type: 'each', of: ['partner', 'web-app', 'mobile-app'], min: 3, edgeTo: 'api-gateway' } },
      { label: 'Every call into the tracking Experience API passes the gateway policies', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The Experience API never calls a System API directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The DB2 tracking system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Every route from a channel to DB2 passes the tracking Process API', rule: { type: 'no-path', from: ['partner', 'web-app', 'mobile-app'], to: 'legacy', unless: 'process-api' } },
      { label: 'Tracking results are cached for a short time to protect DB2 at peak', rule: { type: 'edge', from: ['process-api', 'system-api', 'experience-api'], to: 'cache' } },
      { label: 'Proof-of-delivery photos are fetched only through a System API', rule: { type: 'only-via', target: ['s3-bucket', 'file-store'], from: 'system-api' } },
      { label: 'Tracking lookups are synchronous calls (the caller waits for the answer)', rule: { type: 'lines', touching: 'experience-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        ret: ['partner', 'Retailers (240 web shops)'],
        web: ['web-app', 'Carrier website'],
        mob: ['mobile-app', 'Carrier app'],
        gw: ['api-gateway', 'Client ID + rate limit tiers'],
        exp: ['experience-api', 'exp-tracking-api'],
        prc: ['process-api', 'prc-shipment-tracking-api'],
        cache: ['cache', 'Tracking cache (60 s TTL)'],
        sys: ['system-api', 'sys-tracking-db2-api'],
        pod: ['system-api', 'sys-pod-photos-api'],
        db2: ['legacy', 'Tracking system (IBM i, DB2)'],
        s3: ['s3-bucket', 'Proof-of-delivery photos'],
      },
      [
        'ret -> gw', 'web -> gw', 'mob -> gw', 'gw -> exp', 'exp -> prc', 'prc -> cache', 'prc -> sys', 'prc -> pod',
        'sys -> db2', 'pod -> s3',
      ],
    ),
  },
  description: `
**Context.** A national parcel carrier delivers 1.2 million parcels a day. Every depot scan (collected, sorted, out for delivery, delivered) is written to a tracking system on **IBM i with a DB2 database**. Drivers take a photo at the door, and the photo is stored in an **Amazon S3 bucket**.

Today:
- The carrier website reads DB2 directly over JDBC.
- About 240 retailers screen-scrape the website to show parcel status in their own order pages. Scraping breaks every time the website changes.
- Tracking traffic is 9 million requests a day, and rises to **4,000 requests per second** in the two weeks before Christmas. Last December the DB2 server reached 100% CPU and the website went down for three hours.

**Goals**
- One supported tracking API for retailers, the website and the new mobile app.
- Retailers sign up through a portal and get their own credentials, with limits per contract tier (Standard 20 requests per second, Premium 100).
- Show the proof-of-delivery photo for delivered parcels.
- Protect DB2 during peak.

**Constraints**
- The IBM i team allows at most 300 queries per second against DB2.
- The same parcel is looked up many times: retailers poll, and customers refresh the page.
- The team has two Mule developers and one quarter to go live.

**Your task.** Draw the API-led design for track and trace and explain how it protects DB2 and controls retailer access.
`,
  answerTemplate: `## Layers and responsibilities

## Access control for retailers

## Protecting DB2 at peak

## Proof-of-delivery photos

## Rollout
`,
  keyPoints: [
    'All consumers, including the carrier website, go through one gateway with client ID enforcement and rate limits per contract tier.',
    'One Experience API (or one per audience) calls a Process API that combines scan events and the proof-of-delivery photo link.',
    'DB2 and S3 are reached only through System APIs; the website stops using JDBC.',
    'A short cache (about 60 seconds) on the tracking result turns repeated lookups for the same parcel into one DB2 query.',
    'Rate limits are sized so total traffic after the cache stays under the 300 queries per second the IBM i team allows.',
  ],
  solution: `
**Layers.**
- \`exp-tracking-api\`: one resource \`GET /parcels/{trackingNumber}\`, returning a simple status history. Retailers, the website and the app all use it.
- \`prc-shipment-tracking-api\`: reads scan events, maps internal scan codes to customer-friendly statuses, and adds a short-lived link to the delivery photo.
- \`sys-tracking-db2-api\`: the only component that queries DB2, with a connection pool sized to the 300 queries per second budget.
- \`sys-pod-photos-api\`: returns a pre-signed S3 URL valid for 10 minutes, so photos never flow through Mule.

**Access control.** The API is published in Exchange with a public portal. Each retailer requests access and gets a client ID and secret. API Manager applies Client ID Enforcement and an SLA-based rate limit: Standard 20 requests per second, Premium 100. The website and app have their own client applications, so their traffic shows separately in analytics.

**Protecting DB2.** The Process API caches each tracking result in Object Store for 60 seconds. Most traffic is repeated lookups of the same parcel, so the cache hit rate is high at peak. DB2 sees at most one query per parcel per minute. A Spike Control policy in front of the System API is the last line of defence.

**Rollout.** Launch with the app and five pilot retailers, then move the website off JDBC, then open the portal to all retailers. Block screen-scraping once retailers have moved.
`,
  followUps: [
    { q: 'Why is the cache in the Process API and not in each retailer integration?', a: 'One cache shared by every consumer gives the highest hit rate. Retailers cannot be trusted to cache, and many poll every few seconds.' },
    { q: 'How do you choose the 60 second TTL?', a: 'Depot scans arrive minutes apart, so a minute of staleness is invisible to customers. Business owners confirm it, and load tests show the DB2 query rate it produces at peak.' },
    { q: 'Why return a pre-signed S3 URL instead of the photo itself?', a: 'Photos are large binary files. Streaming them through Mule wastes memory and bandwidth, while a signed link lets the browser download directly from S3 for a limited time.' },
    { q: 'What happens when a retailer exceeds its rate limit?', a: 'The gateway returns HTTP 429 with a Retry-After header. Analytics show who hits the limit, which is a sales conversation about the Premium tier.' },
  ],
}
