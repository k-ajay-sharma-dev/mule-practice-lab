export default {
  id: 'ms-262',
  category: 'mulesoft',
  title: 'Reading Store Files From an Azure File Share in a Mule App on CloudHub',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'cloudhub', 'rest-api', 'http-requester', 'planning-platform', 'sales-feed'],
  estMinutes: 14,
  quiz: [
    {
      type: 'single',
      prompt: 'Why can the File connector not read the Azure file share in a Mule app on CloudHub?',
      options: [
        'The File connector only reads local CSV and XML',
        'A CloudHub worker cannot mount an SMB share',
        'Azure Files blocks requests from Mule apps',
        'The File connector needs an Azure licence',
      ],
      answer: 1,
      explain: 'The File connector only sees paths the worker can reach. The File connector reads the local file system of the runtime. A CloudHub worker has no way to mount a share over SMB.',
    },
    {
      type: 'single',
      prompt: 'What is the usual way for a CloudHub app to read files from the share?',
      options: [
        'Call the Azure Files REST API over HTTPS',
        'Open port 445 in the CloudHub firewall',
        'Read it with the SFTP connector on port 22',
        'Mount it with the FTP connector',
      ],
      answer: 0,
      explain: 'Use the HTTP connector or a connector that wraps that API. Azure Files does not offer SFTP or FTP. The REST API has calls to list a directory, get a file and delete it. They all run over port 443.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of one polling run that picks up store sales files and sends them to the planning platform.',
      items: [
        'List the inbound directory of the share',
        'Keep only data files that are complete and not yet processed',
        'Get each file with a GET call on its URL',
        'Transform it and write it to the planning platform over SFTP',
        'Record it as processed and move it to an archive directory',
      ],
      explain: 'The file is marked processed only after the target has it, so a failure in the middle leaves it for the next run.',
    },
    {
      type: 'single',
      prompt: 'Where could the File connector still read this share?',
      options: [
        'Nowhere, it cannot read file shares',
        'In a runtime on a server that mounts the share',
        'In any CloudHub app with a VPC',
        'Only when the app runs in Anypoint Studio',
      ],
      answer: 1,
      explain: 'A customer hosted runtime, on premises or in an Azure VM, can mount the share over SMB. A customer hosted runtime on a server that mounts the share sees it as a normal path.',
    },
    {
      type: 'single',
      prompt: 'A team tries to mount the share from an on premises server and the mount times out. What is a common cause?',
      options: [
        'The share is out of free space',
        'Outbound port 445 is blocked on the network',
        'SMB only works from Linux servers',
        'The share name has capital letters',
      ],
      answer: 1,
      explain: 'The company network or the internet provider often blocks port 445. Many networks block SMB on the internet. Teams use a VPN, ExpressRoute or a private endpoint, or switch to the REST API.',
    },
    {
      type: 'multi',
      prompt: 'Which details does the REST GET of a file return?',
      options: [
        'The file content in the body',
        'Headers such as Content-Length and Last-Modified',
        'The list of other files in the directory',
        'An ETag that changes when the file changes',
      ],
      answer: [0, 1, 3],
      explain: 'A GET returns one file and its properties. Listing the directory is a separate call.',
    },
  ],
  description: `
Brindle Outdoor runs a few hundred stores. Every night each store system writes a sales file and an inventory file to an Azure file share. A Mule app on CloudHub must collect these files and send them to the planning platform over SFTP before the morning planning run.

A developer first tried the File connector and found it cannot see the share.

**Questions**
1. Why does the File connector not work here?
2. How can the app read the files?
3. What does one polling run look like?
4. What other hosting choice would let the File connector work?
`,
  answerTemplate: `## Why the File connector fails

## Reading over REST

## One polling run

## Other hosting choice
`,
  keyPoints: [
    'CloudHub workers cannot mount an SMB share.',
    'The REST API over HTTPS lists directories and gets files.',
    'A run lists, filters, reads, sends, then marks processed and archives.',
    'A runtime on a server that mounts the share can use the File connector.',
    'SMB on port 445 is often blocked across networks.',
  ],
  solution: `
**1. Why the File connector fails.** The File connector reads the file system of the machine that runs Mule. On CloudHub that is a managed worker, and there is no way to mount an SMB share on it.

**2. Reading over REST.** Azure Files has a REST API over HTTPS. The app lists the directory with a GET that asks for the directory list, then reads each file with a GET on the file URL. The HTTP connector can make these calls, with a SAS token or another credential kept in secure properties. Some connectors wrap the same API.

**3. One polling run.** List the inbound directory. Keep only data files that are complete, for example those with a control file, and that are not in the processed table. Get each file, transform it, and write it to the planning platform over SFTP. Then record it as processed and move it to an archive directory, so the next run does not pick it again.

**4. Other hosting choice.** A Mule runtime on a server, on premises or in an Azure VM, can mount the share and read it with the File connector. That brings its own work: patching the server, keeping the mount alive and opening SMB through the network.
`,
  followUps: [
    {
      q: 'How does the app know a file is new?',
      a: 'It keeps a processed table with the path, size and last write time, or it moves each file to an archive after sending. Azure Files does not send an event when a file arrives.',
    },
    {
      q: 'How would you move a file to the archive directory over REST?',
      a: 'Newer API versions have a rename call. Otherwise copy the file to the archive path and delete the original after the copy completes.',
    },
    {
      q: 'Where do you keep the SAS token?',
      a: 'In secure properties or a secrets manager, never in code. Mask it in logs, since it travels in the URL query string.',
    },
  ],
}
