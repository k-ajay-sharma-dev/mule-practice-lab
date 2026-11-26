export default {
  id: 'ms-283',
  category: 'mulesoft',
  title: 'Active and Passive FTP Behind Firewalls and NAT: PASV, EPSV and Port Ranges',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'passive-mode', 'active-mode', 'firewall', 'nat', 'troubleshooting'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule app on CloudHub 2.0 uses active mode to reach a partner FTP server. Login works, but every listing hangs and then times out. What is happening?',
      options: [
        'The server opens the data connection in to the worker, and nothing routes in to it',
        'Active mode sends the listing on the control connection, which times out on big folders',
        'The worker connects to the server on port 20, which the partner opens only for passive',
        'Login uses port 21, but active mode needs the partner to open port 22 for the data',
      ],
      answer: 0,
      explain: 'In active mode the client announces an address and port, and the server connects back to it. A cloud worker behind NAT and a firewall cannot be reached from outside, so the data connection never opens. Passive mode keeps both connections outbound from Mule. A listing always travels on a data connection, not on port 21. Port 20 is the server side source port in active mode, and port 22 is SFTP.',
    },
    {
      type: 'single',
      prompt: 'The PASV reply contains 10.20.0.15, but Mule connects to the server through a public address. Listings time out. Why?',
      options: [
        'The server is in active mode and is trying to connect back to Mule',
        'Mule tries the data connection to 10.20.0.15, which it cannot reach',
        'The control connection is going through NAT, so the login is dropped',
        'Mule is sending EPSV, which this server does not answer',
      ],
      answer: 1,
      explain: 'The server must be set to announce its public address in PASV replies, or the client must ignore the address and reuse the control host. Not every client supports the second option.',
    },
    {
      type: 'single',
      prompt: 'A server behind NAT keeps sending its private address in PASV replies, and its team cannot change that this month. The server supports EPSV. Why can a client that sends EPSV list files where PASV failed?',
      options: [
        'The EPSV reply holds the public address, because EPSV was made for NAT',
        'With EPSV the server opens the data connection, so no address is needed',
        'The EPSV reply holds only a port, and the client reuses the control host',
        'EPSV sends the data on the control connection, so port 21 is enough',
      ],
      answer: 2,
      explain: 'The EPSV reply carries a port and no address, so the client connects to the same host it used for the control connection, which also works with IPv6. The wrong private address never reaches the client. EPSV is still passive: the client opens the data connection, and the data still uses a separate connection to that port. Some old servers and firewalls do not support it.',
    },
    {
      type: 'multi',
      prompt: 'What must the network team open for passive FTP from Mule to a partner server?',
      options: [
        'Outbound to the server on port 21',
        'Outbound to the server on its passive port range',
        'Inbound to the Mule worker on port 20',
        'Outbound to the server on port 22',
      ],
      answer: [0, 1],
      explain: 'Passive mode needs the control port and the passive range. Inbound rules to Mule are for active mode. Port 22 is SFTP.',
    },
    {
      type: 'single',
      prompt: 'A firewall reads FTP control traffic to open data ports on the fly. What stops this from working?',
      options: [
        'Switching the transfer mode from ASCII to binary',
        'Encrypting the control channel with FTPS',
        'Sending EPSV instead of PASV from the client',
        'Using a passive port range above 50000 on the server',
      ],
      answer: 1,
      explain: 'With FTPS the firewall can no longer read the PASV reply. FTP inspection relies on reading the commands. With FTPS the firewall needs a fixed passive range opened instead.',
    },
    {
      type: 'order',
      prompt: 'Put the passive mode steps in order.',
      items: [
        'The client connects to port 21 and logs in',
        'The client sends PASV or EPSV',
        'The server replies with a port, and for PASV an address',
        'The client opens a data connection to that port',
        'The client sends RETR and the file flows on the data connection',
        'The server replies 226 when the transfer is complete',
      ],
      explain: 'Each transfer repeats the PASV and data connection steps, so a listing and a download use two different data connections.',
    },
  ],
  description: `
Larkfield Grocers moves its distribution center receipts from an on premises FTP server to Mule running in a cloud network. Login works. Every listing and download times out. The FTP server sits behind NAT, and the logs show PASV replies with an address in 10.20.0.0/16.

**Questions**
1. What is the difference between active and passive mode?
2. Why do the transfers fail here?
3. How would you fix it with the network and server teams?
4. What changes if the partner moves to FTPS?
`,
  answerTemplate: `## Active and passive

## Why it fails

## The fix

## With FTPS
`,
  keyPoints: [
    'Active: the server connects back to the client. Passive: the client connects out.',
    'Passive is the norm behind firewalls and NAT.',
    'A PASV reply with a private address breaks the data connection.',
    'Set the server to announce its public address, or use EPSV.',
    'Open the passive port range, not only port 21.',
    'FTPS hides PASV from firewall inspection, so the range must be open.',
  ],
  solution: `
**1. Active and passive.** In active mode the client announces an address and port, and the server connects back to it. In passive mode the client asks with PASV or EPSV, the server replies with a port, and the client opens the data connection. Passive mode keeps all connections outbound from Mule.

**2. Why it fails.** The server sits behind NAT and announces its private address in the PASV reply. Mule cannot route to 10.20.x.x from the cloud network, so each data connection times out. Login works because it only uses port 21.

**3. The fix.** Ask the server team to set the external address for passive replies, and to use a fixed passive port range. Ask the network team to allow outbound traffic from the Mule workers to port 21 and that range. If the server and client support EPSV, the reply has no address, which avoids the problem. Test with a command line client from the same network as the Mule workers.

**4. With FTPS.** The control channel is encrypted, so firewalls cannot read the PASV reply to open ports on the fly. The fixed passive range must be open, and the external address must be set on the server.
`,
  followUps: [
    {
      q: 'How do you test from the Mule network when you cannot log in to the worker?',
      a: 'Deploy a small test app that lists the folder and logs the result, or use a test VM in the same network with a command line client.',
    },
    {
      q: 'Why is a small passive port range a risk?',
      a: 'Each concurrent transfer needs a port. With many parallel transfers the range runs out and new transfers fail.',
    },
    {
      q: 'What would make you use active mode?',
      a: 'Very rarely. Only when the server cannot do passive and the network can route back to the client, which is uncommon for cloud runtimes.',
    },
  ],
}
