export default {
  id: 'ar-012',
  category: 'architecture',
  title: 'CI/CD and Environment Promotion',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'environments', 'deployment', 'munit'],
  estMinutes: 25,
  quiz: [
    {
      type: 'order',
      prompt: 'Put the pipeline stages in order from commit to production.',
      items: [
        'PR build: compile, MUnit with coverage threshold, spec governance checks, secret scan, code review',
        'Main build: version the artifact, tag Git, publish the JAR once',
        'Automatic deploy of that version to Sandbox/Test',
        'Automated smoke, integration and contract tests in Test',
        'Approval gate, then deploy the same version to Prod and run smoke tests',
      ],
      explain: 'The artifact is built once on main and only promoted afterwards; tests in Test validate the exact version that later reaches Prod.',
    },
    {
      type: 'single',
      prompt: 'How do you guarantee that Prod runs exactly what was tested?',
      options: [
        'Rebuild from the same Git commit for Prod',
        'Deploy the same versioned artifact that passed Test; only environment properties differ',
        'Ask the senior developer to compare the JARs manually',
        'Run MUnit again in Prod',
      ],
      answer: 1,
      explain: 'A rebuild can differ (dependencies, local changes). Promoting the identical artifact removes the "untested local build" incident by design.',
    },
    {
      type: 'single',
      prompt: 'Which identity should the pipeline use to deploy to CloudHub 2.0?',
      options: [
        'The senior developer\'s personal Anypoint account',
        'A shared admin username and password',
        'A Connected App (client credentials) with only the deployment scopes it needs',
        'An anonymous API key',
      ],
      answer: 2,
      explain: 'Connected Apps give the pipeline its own least-privilege identity. Humans keep read-only access to Prod.',
    },
    {
      type: 'single',
      prompt: 'A release breaks Prod. What does rollback look like?',
      options: [
        'Find the previous JAR on someone\'s laptop',
        'Run the deploy job with the previous known-good artifact version from the deployment record',
        'Revert the Git commit and wait for the next sprint',
        'Restore a VM snapshot',
      ],
      answer: 1,
      explain: 'Versioned artifacts and a deployment record turn rollback into minutes. It is only safe if DB and contract changes are backward compatible (expand/contract).',
    },
    {
      type: 'single',
      prompt: 'API Manager policies differ between Test and Prod because they were clicked by hand. What is the fix?',
      options: [
        'Take screenshots of Test and copy them to Prod',
        'Script API instances, Autodiscovery IDs and policies per environment (REST APIs, CLI or IaC) in Git, run by the pipeline',
        'Remove policies from Test',
        'Configure policies inside the Mule app XML instead',
      ],
      answer: 1,
      explain: 'As code, environments differ only in values such as rate limits, not in which policies exist.',
    },
    {
      type: 'multi',
      prompt: 'Which controls belong around Prod deployments for a 6-developer team?',
      options: [
        'A reviewer approves the Prod stage, linked to a change ticket',
        'Only the pipeline identity has deploy permission in Prod',
        'Deploy in working hours rather than Friday evenings, except emergencies',
        'A two-week change advisory board for every release',
      ],
      answer: [0, 1, 2],
      explain: 'Lightweight approval plus pipeline-only deploy rights fits a small team. A heavy board would slow delivery without adding safety the pipeline does not already give.',
    },
  ],
  description: `
A retail company has 40 Mule apps and 6 developers. Today:

- Developers build JARs on their laptops and upload them to Runtime Manager manually.
- There are environments **Sandbox, Test, Prod**, but prod deployments are done by one senior developer on Friday evenings.
- Last month a prod deployment contained code that had **never been tested** (a different local build); rollback took 3 hours because nobody knew which JAR was previously deployed.
- API Manager policies were configured by hand and differ between Test and Prod.

The company uses **GitHub** and **Jenkins** (or GitHub Actions — your choice), and CloudHub 2.0.

**Questions:**
- Design the pipeline from commit to production. What runs at each stage?
- How do you guarantee that what you tested is exactly what runs in prod?
- How does rollback work?
- How do you keep API Manager configuration and policies consistent across environments?
- Who approves prod deployments?
`,
  answerTemplate: `## Pipeline stages

## Build once, promote the same artifact

## Rollback

## API Manager configuration as code

## Approvals and access
`,
  keyPoints: [
    'Every merge to main triggers a CI build: compile, MUnit tests with a coverage threshold, static checks, and a versioned artifact published once (e.g. to Exchange or an artifact repository).',
    'The same versioned artifact is promoted Sandbox → Test → Prod; only environment properties change — no rebuild per environment.',
    'Deployment is automated with the Mule Maven plugin or Anypoint CLI using a Connected App (client credentials), not personal accounts.',
    'Rollback = redeploy the previous known-good artifact version through the same pipeline; versions are traceable from Git tag to deployment.',
    'API instances and policies are scripted/automated per environment (API Manager APIs, CLI or Terraform-style tooling) instead of manual clicks.',
    'Prod deployment requires an approval gate (change ticket/reviewer) and only the pipeline identity has deploy permission in Prod.',
  ],
  solution: `
**Pipeline stages.**
1. **PR build:** compile, MUnit tests (fail if coverage < agreed %, e.g. 80% of flows), API spec governance checks, secret scan. Code review required to merge.
2. **Main build:** same checks, then version the artifact (\`1.8.0\` / build number), tag Git, **publish the JAR once** to Exchange (or Nexus/Artifactory).
3. **Deploy to Sandbox/Test** automatically: Mule Maven plugin (\`mvn deploy -DmuleDeploy\`) or Anypoint CLI, authenticating with a **Connected App** that has only deployment scopes.
4. **Automated tests in Test:** smoke tests, integration/regression (Postman/Newman, contract tests), optional performance test for critical APIs.
5. **Approval gate → Prod:** deploy the **same version** with prod properties; run smoke tests; auto-notify the team.

**Build once, promote.** The pipeline never rebuilds for Prod; it deploys artifact \`1.8.0\` that already passed Test. Environment differences are only in properties (\`env=prod\`, secure properties key from the pipeline's secret store). This removes the "untested local build" incident by design — nobody uploads JARs by hand; Prod permissions for humans are read-only.

**Rollback.** Keep a deployment record (app → version → time → commit). Rollback is "run the deploy job with the previous version" — minutes, not hours. CloudHub 2.0 rolling updates keep the old replicas serving until new ones are healthy, so a failed start does not take the API down. Database or contract changes must be backward compatible (expand/contract) so rolling back the app is safe.

**API Manager as code.** Script the API instance creation, Autodiscovery ID and policies per environment (API Manager REST APIs, Anypoint CLI, or an infrastructure-as-code tool), stored in Git and run by the pipeline. Then Test and Prod policies only differ in values (rate limits), not in which policies exist.

**Approvals.** Small team → lightweight: a reviewer approves the prod stage in Jenkins/GitHub Environments, linked to a change ticket. Remove Friday-evening deployments as a rule unless it is an emergency; deploy in working hours when people can react.

**Trade-off:** more automation means upfront effort (pipeline templates, a shared parent POM), but the template is written once and reused by all 40 apps.
`,
  followUps: [
    { q: 'How do you handle 40 apps without 40 different pipelines?', a: 'Use a shared pipeline template/library and a parent POM with common plugins and versions; each app only declares its name and environment properties. Changes to the template roll out to all apps.' },
    { q: 'MUnit tests mock all external systems. How do you know integrations really work?', a: 'MUnit covers flow logic; add integration/contract tests in the Test environment against real or virtualised backends, plus post-deploy smoke tests. Both layers are needed.' },
    { q: 'The business wants faster releases — daily instead of monthly. What has to be true?', a: 'Fully automated tests and deployments, backward-compatible changes, fast rollback and good monitoring. Small frequent releases reduce risk per change, but only if the pipeline is trusted.' },
  ],
}
