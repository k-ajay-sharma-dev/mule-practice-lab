export default {
  id: 'ms-237',
  category: 'mulesoft',
  title: 'IP Allowlist Behind a Load Balancer: remoteAddress, X-Forwarded-For and Spoofed Headers',
  level: 'ADVANCED',
  tags: ['api-manager', 'policies', 'ip-allowlist', 'x-forwarded-for', 'load-balancer', 'security', 'networking', 'banking'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'An IP Allowlist policy uses the remote address of the connection. The API sits behind a load balancer. What address does the policy see?',
      options: [
        'The partner\'s own public address',
        'The address of the load balancer',
        'The address of the partner\'s DNS server',
        'The first address in X-Forwarded-For',
      ],
      answer: 1,
      explain: 'The connection to Mule comes from the load balancer, so the remote address is the load balancer, not the partner.',
    },
    {
      type: 'single',
      prompt: 'Your load balancer appends the address of whoever connects to it. A request arrives with `X-Forwarded-For: 203.0.113.9, 198.51.100.20`, and nothing else sits between your load balancer and Mule. Which address did your load balancer add?',
      options: [
        '203.0.113.9, the first entry in the list',
        '198.51.100.20',
        'Both, as it writes the whole chain',
        'Neither, as it adds a header of its own',
      ],
      answer: 1,
      explain: 'Each proxy appends to the end of the list. The last entry is the one your own load balancer added. Earlier entries came from the client or other proxies.',
    },
    {
      type: 'single',
      prompt: 'An allowlist checks the first entry of X-Forwarded-For against the partner range. A call from an unknown address on the internet gets through. How?',
      options: [
        'The first entry is the address your load balancer added',
        'Each proxy on the way rewrote the first entry',
        'The policy fell back to the remote address of the connection',
        'The caller sent its own header, so the first entry was faked',
      ],
      answer: 3,
      explain: 'A client can send its own X-Forwarded-For header, so the first entry can be anything it likes. Proxies append to the end of the list and do not rewrite earlier entries, so your load balancer added the last one. Only entries added by proxies you control can be trusted.',
    },
    {
      type: 'single',
      prompt: 'The partner says its servers sit in 198.51.100.0/24, and that block is on the allowlist. A call arrives from 198.51.100.200. What happens?',
      options: [
        'Blocked, as /24 covers only 198.51.100.0 to 198.51.100.24',
        'Blocked, as a block with .0 at the end means that one address',
        'Allowed, as /24 covers all of 198.51.0.0 to 198.51.255.255',
        'Allowed, as /24 covers 198.51.100.0 to 198.51.100.255',
      ],
      answer: 3,
      explain: '/24 fixes the first 24 bits, so the last part of the address can be any of 256 values, from 198.51.100.0 to 198.51.100.255. The number after the slash counts fixed bits, not addresses. 198.51.0.0 to 198.51.255.255 would be /16.',
    },
    {
      type: 'multi',
      prompt: 'A bank partner API must only accept calls from the partner. Which controls make sense together?',
      options: [
        'An IP allowlist that reads the client address your own load balancer recorded',
        'Client ID enforcement or OAuth 2.0, so each call proves which app sent it',
        'Mutual TLS, so the partner proves itself with a certificate',
        'An allowlist on the remote address of the connection, set to the partner range',
        'An allowlist that reads the first address in X-Forwarded-For',
        'A CORS policy that allows only the partner\'s web domain',
      ],
      answer: [0, 1, 2],
      explain: 'IP rules are one layer, and they must read the client address your own load balancer recorded. Client ID enforcement or OAuth 2.0 proves which app sent each call. Mutual TLS proves the partner with a certificate, even when addresses change or are shared. Behind a load balancer, the remote address of the connection is the load balancer, so a rule on it with the partner range blocks the partner too. The first address in X-Forwarded-For is whatever the caller wrote, so it can be faked. CORS only tells browsers which pages may call the API, and a server to server caller ignores it.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to roll out an IP allowlist behind a load balancer.',
      items: [
        'In a test environment, log the remote address and the X-Forwarded-For header Mule receives',
        'Set the policy to read the client address your load balancer added',
        'Call from an allowed address and from a blocked one, and check the results',
        'Apply the policy in production with the partner\'s ranges',
        'Watch the rejected calls for a few days',
      ],
      explain: 'What reaches Mule depends on your network. Look at real requests before you write the expression.',
    },
  ],
  description: `
Harwick Mutual Bank exposes a statements API to one partner, a mortgage broker. The security team asked for an IP allowlist with the broker's two office ranges. After the policy was applied in API Manager, every call from the broker was rejected. A developer then added the load balancer's address to the list, and now **every** caller on the internet gets through.

**Questions**
1. Why did the policy reject the broker and then accept everyone?
2. What does X-Forwarded-For hold, and which part can you trust?
3. How should the policy find the client address?
4. Is an IP allowlist enough for a partner API?
`,
  answerTemplate: `## What went wrong

## X-Forwarded-For

## Finding the client address

## Is it enough
`,
  keyPoints: [
    'Behind a load balancer, the connection to Mule comes from the load balancer.',
    'X-Forwarded-For lists addresses, and each proxy appends to the end.',
    'Only entries added by proxies you control can be trusted.',
    'The IP allowlist policy can read the address from an expression instead of the connection.',
    'Allowing the load balancer address allows everyone behind it.',
    'Combine IP rules with credentials or mutual TLS for partner APIs.',
  ],
  solution: `
**1. What went wrong.** The policy looked at the address of the connection. Behind a load balancer, every connection to Mule comes from the load balancer, so the broker's address was never seen and every call failed. Adding the load balancer's address made every call match, because every call comes through it.

**2. X-Forwarded-For.** Load balancers and proxies usually add the address that connected to them to the end of the \`X-Forwarded-For\` header. A client can also send this header itself, with any value. So in \`203.0.113.9, 198.51.100.20\`, only the last entry, added by your own load balancer, is trustworthy. Earlier entries may be real proxies or may be made up.

**3. Finding the client address.** The IP Allowlist policy lets you set the expression it reads the address from. Point it at the entry your load balancer adds, which is the last one when nothing else sits between the load balancer and Mule. First log the headers Mule receives in a test environment, because each platform and load balancer setup differs. Then test from an allowed address and from a blocked one.

**4. Is it enough.** No. Addresses change, offices share them, and a mistake in the expression opens the API. Use the allowlist as one layer and add client credentials, OAuth 2.0 or mutual TLS, so each call also proves which partner sent it.
`,
  followUps: [
    {
      q: 'The broker moves to a cloud provider whose addresses change. What now?',
      a: 'An IP list becomes hard to keep right. Rely on mutual TLS or OAuth 2.0 for identity, and keep IP rules only where the partner can give stable ranges.',
    },
    {
      q: 'Should the app also log the client address?',
      a: 'Yes, log the trusted client address with each call. It helps with audits and with tuning the policy, but treat it as personal data where the law says so.',
    },
    {
      q: 'Does a Blocklist have the same problem?',
      a: 'Yes. It also needs the real client address, and a spoofed header could let a blocked client slip through if the policy reads the wrong entry.',
    },
  ],
}
