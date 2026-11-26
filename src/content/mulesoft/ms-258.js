export default {
  id: 'ms-258',
  category: 'mulesoft',
  title: 'Reaching a Locked Down Storage Account From CloudHub 2.0: Firewall Rules, Private Endpoints and DNS',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'networking', 'private-endpoint', 'firewall', 'dns', 'cloudhub-2', 'security', 'insurance'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'The storage firewall is set to deny by default. A Mule app with a valid service principal gets an authorization error. What is the likely cause?',
      options: [
        'The role assigned to it is wrong',
        'Its network address is not allowed',
        'The account key was rotated after deploy',
        'The token audience is set to the wrong resource',
      ],
      answer: 1,
      explain: 'The request comes from an address the network rules do not allow, so it is refused before the role matters. Network rules are checked as well as identity. A good credential from a blocked network is still refused.',
    },
    {
      type: 'multi',
      prompt: 'Which ways can let a CloudHub 2.0 app through the storage firewall?',
      options: [
        'Allow the public egress IP addresses of the private space in the firewall IP rules',
        'Use a private endpoint, reached from the private space over VPN or a transit gateway',
        'Add the CloudHub host name of the app to the firewall IP rules, so Azure resolves it',
        'Allow the private 10.x range of the private space in the firewall IP rules',
      ],
      answer: [0, 1],
      explain: 'IP rules take public addresses. Private traffic needs a private endpoint and a network path into Azure.',
    },
    {
      type: 'single',
      prompt: 'Security wants hub traffic to stay off the internet and public network access turned off. The app runs in a CloudHub 2.0 private space with a VPN into an Azure VNet. What should the team add?',
      options: [
        'A private endpoint for the blob service in the VNet, with its own private IP',
        'A virtual network rule for the private space subnet, with a service endpoint',
        'An IP rule for the public address of the VPN gateway on the Azure side',
        'A SAS token limited to the address range of the VNet and the private space',
      ],
      answer: 0,
      explain: 'A private endpoint gives a private IP address in an Azure virtual network that maps to the storage account blob service. Traffic to that private IP stays on private networks. Public access can then be turned off. Virtual network rules and IP rules both work on the public endpoint, so they stop working once public access is off, and a service endpoint needs a subnet in Azure. A SAS limits who may call, not the route traffic takes.',
    },
    {
      type: 'single',
      prompt: 'The private endpoint and VPN are in place, but the Mule app still reaches the public address. Why?',
      options: [
        'The VPN tunnel to Azure is down',
        'The host name still resolves to the public IP',
        'Public network access is still on, and it wins',
        'TLS to a private IP fails, so the client falls back',
      ],
      answer: 1,
      explain: 'The account name must resolve to the private IP for the caller. That needs the privatelink DNS zone, or a forwarder that uses it, on the DNS path the app uses.',
    },
    {
      type: 'match',
      prompt: 'Match each setting to its effect.',
      pairs: [
        ['Default action deny', 'Only allowed networks may connect'],
        ['IP rule', 'Allows a public address range'],
        ['Virtual network rule', 'Allows a subnet in Azure through a service endpoint'],
        ['Public network access disabled', 'Only private endpoints work'],
      ],
      explain: 'These combine. A common end state is public access off with private endpoints only.',
    },
    {
      type: 'single',
      prompt: 'How should the team test the setup before go live?',
      options: [
        'Review the network diagrams and firewall rules with security',
        'From the private space, check DNS, then list and write',
        'From a laptop on the office VPN, check DNS, then list and write',
        'From the private space, run one write, as it proves the path',
      ],
      answer: 1,
      explain: 'From a test app inside the private space, resolve the storage host name and check it gives the private IP, then run a list and a write. DNS and routing are where these setups fail. Testing from the same network as the app shows the real path.',
    },
  ],
  description: `
Ashcombe Mutual moves policy documents into an Azure storage account. The security team has set the storage firewall to deny by default and wants all traffic on private networks. The Mule apps run in a CloudHub 2.0 private space with a VPN to Azure. In test, every call from Mule fails with an authorization error, though the same service principal works from an Azure virtual machine.

**Questions**
1. Why does the call fail when the identity is valid?
2. What are the options for letting Mule in?
3. What role does DNS play with private endpoints?
4. How would you test the setup?
`,
  answerTemplate: `## Why it fails

## Options

## DNS

## Testing
`,
  keyPoints: [
    'Network rules are checked as well as identity.',
    'IP rules take public addresses, such as the private space egress IPs.',
    'A private endpoint gives the storage account a private IP in an Azure virtual network.',
    'The caller must resolve the storage host name to the private IP, through the privatelink DNS zone.',
    'From CloudHub 2.0 that means the VPN or transit gateway path and DNS forwarding.',
    'Test DNS resolution and real calls from inside the private space.',
  ],
  solution: `
**1. Why it fails.** The storage account checks the network before the identity is of any use. The virtual machine is on an allowed Azure network, but the Mule app comes from outside, so its request is refused with an authorization error even though the role is right.

**2. Options.** The quick option is to add the public egress IP addresses of the private space to the firewall IP rules. Traffic still crosses the internet, encrypted, but only from known addresses. The private option is a private endpoint for the blob service in an Azure virtual network that the private space reaches over the VPN or a transit gateway. Then public network access can be turned off. Note that IP rules cannot hold private addresses.

**3. DNS.** Clients connect by the host name \`<account>.blob.core.windows.net\`. With a private endpoint, that name must resolve to the private IP for the caller, through the \`privatelink.blob.core.windows.net\` zone. Azure networks linked to that zone get it, but the private space does not, so set up DNS forwarding for the storage domain to a resolver in Azure. Check the current private space DNS options for how to do that. Without it, the app resolves the public address and is blocked.

**4. Testing.** From a test app in the private space, resolve the host name and confirm it returns the private IP. Then list a container and write a test blob. Check the storage logs for the source address of the request. Test failover too, since a second VPN tunnel or region needs the same DNS.
`,
  followUps: [
    {
      q: 'Is the IP allow list option unsafe?',
      a: 'Not unsafe, since traffic is encrypted and still needs credentials, but it depends on the egress IPs staying stable and keeps a public endpoint open. Many security teams prefer private endpoints.',
    },
    {
      q: 'Partners upload over the internet. Can the account still be private?',
      a: 'Use a separate account or container for partner uploads with its own rules, or let partners upload through an API you host. Mixing partner access and a private only account is hard.',
    },
    {
      q: 'Where would you see the refused requests?',
      a: 'In the storage account diagnostic logs, which record the caller address and the failure reason. Turn them on before testing.',
    },
  ],
}
