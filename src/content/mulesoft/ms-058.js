export default {
  id: 'ms-058',
  category: 'mulesoft',
  title: 'Platform Setup and End-to-End CI/CD for 30 API-Led Apps: Business Groups, Exchange and API Manager Automation',
  level: 'EXPERT',
  tags: ['api-led', 'ci-cd', 'business-groups', 'mule-maven-plugin', 'anypoint-cli', 'platform-apis', 'automation'],
  estMinutes: 35,
  quiz: [
    {
      type: 'order',
      prompt: 'Order the pipeline stages for `inventory-sapi`.',
      items: [
        'Validate the spec with governance rulesets and publish it to Exchange',
        'Build and run MUnit with coverage gates',
        'Publish the immutable app artifact to Exchange',
        'Ensure the API instance and policy set for the target environment; capture the instance ID',
        'Deploy with mule-maven-plugin, passing `api.id` and secure properties',
        'Run smoke tests, then promote the same artifact with an approval gate for Prod',
      ],
      explain: 'Spec first, then build once, then configure API Manager and deploy that same artifact everywhere — the pipeline and audit logs answer "who deployed what, and was it tested".',
    },
    {
      type: 'single',
      prompt: 'How should the pipelines authenticate to Anypoint Platform?',
      options: [
        'With a senior developer\'s personal account',
        'With Connected Apps (client credentials) granted only the scopes needed per business group and environment',
        'With the org admin username and password stored in the repo',
        'Anonymously — Exchange is public',
      ],
      answer: 1,
      explain: 'Separate non-prod and Prod connected apps with minimal scopes; secrets live in the CI secret store.',
    },
    {
      type: 'single',
      prompt: 'Why build once and promote, instead of rebuilding per environment?',
      options: [
        'It is faster, nothing else',
        'Rebuilding can produce a different artifact, so what you tested is not what you deploy; environment differences belong in properties',
        'CloudHub 2.0 forbids rebuilding',
        'Exchange stores only one version',
      ],
      answer: 1,
      explain: 'Immutable artifacts plus per-environment properties make deployments reproducible and auditable.',
    },
    {
      type: 'single',
      prompt: 'A programme has dozens of Mule apps, each in its own repository, and each needs a CI/CD pipeline. How do you avoid dozens of slightly different pipelines?',
      options: [
        'Copy the pipeline file into each repository and edit it per app',
        'One shared pipeline template, with a small descriptor file per app',
        'Let each team configure API Manager by hand for its own apps',
        'Write a separate pipeline for each app in each environment',
      ],
      answer: 1,
      explain: 'Each repo invokes one shared pipeline template, and a per-app descriptor gives the business group, layer, replicas, policy set and smoke-test path. Standard policy sets per layer, applied by the pipeline, and a shared parent POM and common library complete the picture. Hand-configured instances are exactly what caused drift between environments.',
    },
    {
      type: 'single',
      prompt: 'A Process API release needs a new field from the Inventory SAPI. What is the right release order?',
      options: [
        'Release both at the same time and hope',
        'Release the SAPI as a backward-compatible minor first; release the PAPI after, with a gate checking the SAPI version is deployed in the target environment',
        'Release the PAPI first; it will wait for the field',
        'Merge both into one app',
      ],
      answer: 1,
      explain: 'Contracts decouple layers. Breaking changes go out as a new major running alongside v1 until consumers migrate.',
    },
    {
      type: 'match',
      prompt: 'Match each organisation-design element to its purpose.',
      pairs: [
        ['Business groups per domain', 'Delegated administration, own environments and capacity'],
        ['Production-type Prod environment', 'Deploys restricted to the pipeline identity'],
        ['Exchange sharing across business groups', 'Cross-domain reuse of System APIs'],
      ],
      explain: 'Root holds shared assets; each domain manages itself, and reuse happens through Exchange plus per-environment contracts.',
    },
  ],
  description: `
You are the lead architect for a programme delivering **30 Mule apps** (6 Experience, 9 Process, 15 System APIs) across three domains (**Sales**, **Supply Chain**, **Finance**), deployed to **CloudHub 2.0**. Today:

- Everything lives in the root organisation with environments **Sandbox** and **Production** only.
- Developers deploy from Studio with their personal accounts; API instances and policies are clicked together by hand and differ between environments.
- Specs are published to Exchange manually and often lag the code.
- Audit asks: "Who deployed what to Prod, and was it tested?"

**Questions**
1. Design the Anypoint organisation: business groups, environments, teams/permissions, and how cross-domain reuse works.
2. Design the CI/CD pipeline for one app from commit to Prod, covering: spec publishing to Exchange, build/test, publishing the app artifact, API instance creation/update, policy application, deployment and promotion.
3. How do pipelines authenticate to the platform, and with what permissions?
4. How do you avoid writing 30 slightly different pipelines?
5. How do you handle the ordering problem: a Process API release that depends on a new System API version?
`,
  answerTemplate: `## Organisation design

## Pipeline stages

## Platform authentication

## Scaling to 30 apps

## Cross-layer release ordering
`,
  keyPoints: [
    'Business groups per domain (or per platform team) give delegated administration and separate environments/resources; Exchange assets can be shared across business groups for cross-domain reuse.',
    'Environments Dev, Test (or SIT/UAT), Prod — sandbox type for non-prod and production type for Prod — with Prod deploys restricted to the pipeline identity.',
    'Pipeline: lint/governance → publish spec to Exchange → build + MUnit with coverage gate → publish artifact to Exchange → ensure API instance + policies via Anypoint CLI or API Manager APIs → deploy with mule-maven-plugin passing api.id → smoke test → promote the same artifact.',
    'Pipelines authenticate with Connected Apps (client credentials) granted only the scopes needed per business group/environment — never personal accounts.',
    'A shared pipeline template + parent POM + per-app config file (domain, layer, policies, replicas) scales to 30 apps; contract versioning makes layer releases independent.',
  ],
  solution: `
**1. Organisation design**
| Element | Design |
|---|---|
| Root org | Platform/C4E administration, shared assets (parent POM, common library, rulesets) |
| Business groups | \`Sales\`, \`SupplyChain\`, \`Finance\` — each with its own admins, environments and capacity allocation |
| Environments (per BG) | \`Dev\`, \`Test\` (sandbox type), \`Prod\` (production type). A Design environment is used for spec mocking. |
| Teams | Per domain: developers (deploy to Dev, view Test/Prod), operations (manage Prod apps), API owners (API Manager per env). Pipeline identity is the only one allowed to deploy to Test/Prod. |
| Networking | CloudHub 2.0 private spaces sized per environment/region, with Process/System APIs reachable internally only |

Cross-domain reuse: a Sales Process API may call a Supply Chain System API. The SAPI's spec is shared in Exchange with the consuming business group, and the Sales app requests access to the SAPI's instance in the matching environment (contract per env).

**2. Pipeline for one app** (e.g. \`inventory-sapi\`)
1. **Spec stage** (spec repo or \`/spec\` folder): validate with API Governance rulesets; publish the API spec asset to Exchange with the semantic version from the spec project (Maven-based Exchange publishing or \`anypoint-cli-v4 exchange:asset:upload\`). Skip if the version already exists.
2. **Build stage**: \`mvn clean verify\` with the parent POM — compiles, runs MUnit, enforces coverage thresholds.
3. **Publish artifact**: \`mvn deploy\` to the Exchange Maven repository (\`distributionManagement\` in the parent POM), giving an immutable versioned JAR. Build once, deploy that same artifact everywhere.
4. **API Manager stage** for the target env: look up the API instance for asset + version; if missing, create it (\`anypoint-cli-v4 api-mgr:api:manage ...\`) or promote it from the previous environment (\`api-mgr:api:promote\`); apply the policy set declared in the app's config file (\`api-mgr:policy:apply ...\`), and capture the **instance ID**. The same can be done with the API Manager REST API (\`/apimanager/api/v1/organizations/{orgId}/environments/{envId}/apis\`).
5. **Deploy**: \`mvn deploy -DmuleDeploy\` with the \`cloudhub2Deployment\` configuration in the mule-maven-plugin: target private space, replicas, vCores, runtime version, \`properties\` (including \`api.id\` from step 4 and \`env\`) and \`secureProperties\` (decryption key, client secrets from the CI secret store).
6. **Verify**: smoke tests / functional monitor run against the new deployment; fail and roll back to the previous version if red.
7. **Promote**: Dev → Test automatically on main branch; Test → Prod with a manual approval gate, using the same artifact version. Pipeline logs + Anypoint audit logs answer "who deployed what, and was it tested".

**3. Platform authentication**
- Create **Connected Apps** (client-credentials, "app acts on its own behalf") per pipeline scope — e.g. one for non-prod, one for Prod — with only the scopes needed: Exchange contributor, Runtime Manager deploy, API Manager manage, on the specific business groups/environments.
- Store client ID/secret in the CI secret store; mule-maven-plugin and Anypoint CLI both accept connected-app credentials.
- Personal accounts are removed from deployment rights in Test/Prod.

**4. Scaling to 30 apps**
- One **pipeline template** (shared library in Jenkins/GitHub Actions/Azure DevOps/GitLab) invoked by each repo with ~10 lines.
- A per-app **descriptor** (e.g. \`deploy.yaml\`): business group, layer, asset ID, replicas/vCores per env, policy set name (\`experience-partner\`, \`process-internal\`, \`system-internal\`), smoke-test path.
- Standard **policy sets per layer** defined once (see the policy map), applied by the pipeline — no hand-configured instances.
- Shared **parent POM** and **common error library**, upgraded via automated merge requests.

**5. Cross-layer release ordering**
- Contracts decouple layers: the SAPI publishes and deploys a **backward-compatible minor** (1.3.0) first; the PAPI that needs the new field is released after, against 1.3.0 in each environment.
- Breaking changes go out as a **new major** (v2) running alongside v1 (separate API instance and base path) until consumers migrate; v1 is deprecated in Exchange and then retired.
- The pipeline can check that the dependent API version is deployed in the target environment before promoting the consumer. This is a simple gate that prevents "PAPI in Prod calls SAPI field that only exists in Test".
`,
  followUps: [
    {
      q: 'Why build once and promote, rather than rebuilding per environment?',
      a: 'Rebuilding can produce a different artifact (dependency changes, different plugin behaviour), so what you tested is not what you deploy; environment differences belong in properties, not in the build.',
    },
    {
      q: 'Where should environment-specific secrets live?',
      a: 'In the CI secret store or a vault, injected at deploy time as secure properties; the JAR only contains encrypted placeholders or no secret at all.',
    },
    {
      q: 'How do you keep API Manager configuration from drifting after manual changes?',
      a: 'Treat the pipeline descriptor as the source of truth and have the pipeline reconcile (re-apply) policies on each deployment, restricting manual API Manager edit rights in Prod.',
    },
    {
      q: 'Should each business group have its own private space?',
      a: 'Not necessarily; private spaces are a networking and capacity decision driven by isolation, region and connectivity needs. Fewer, shared private spaces simplify cross-domain calls if your isolation requirements and the platform\'s association rules allow it.',
    },
  ],
}
