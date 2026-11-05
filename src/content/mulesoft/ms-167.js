export default {
  id: 'ms-167',
  category: 'mulesoft',
  title: 'API Specifications as Code: governance:api:validate as a Pipeline Gate and api-catalog publish-asset for Exchange',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'api-governance', 'exchange', 'anypoint-cli', 'api-design'],
  estMinutes: 30,
  quiz: [
    {
      type: 'multi',
      prompt: 'What can you pass to `governance:api:validate` as `api-specification`?',
      options: [
        'An API project ZIP file',
        'An API project folder',
        'An asset identifier (group ID, asset ID and version), if the `--remote` flag is specified',
        'The instance ID of the API in API Manager',
      ],
      answer: [0, 1, 2],
      explain: 'An asset identifier is the GAV of the asset in Exchange. An API instance belongs to API Manager, and the command does not take that.',
    },
    {
      type: 'match',
      prompt: 'Match each source of rulesets to how the command finds it.',
      pairs: [
        ['Ruleset dependencies that are defined for the project', '`exchange.json` in the folder or ZIP file'],
        ['Rulesets published in Exchange', '`--remote-rulesets` with asset identifiers'],
        ['Ruleset YAML files in the repository', '`--rulesets`'],
      ],
      explain: 'The dependencies appear in `exchange.json` only if they were defined for that project in API Designer. A pipeline that must apply a fixed standard should name its rulesets explicitly.',
    },
    {
      type: 'single',
      prompt: 'A script uses `exchange.json` dependencies and also passes `--rulesets` with one of the same rulesets. What does the note say?',
      options: [
        'Duplicate rulesets are not detected, so some rulesets might be validated multiple times',
        'The command fails with a duplicate error',
        'Local rulesets replace the dependencies',
        '`--rulesets` is ignored when `exchange.json` exists',
      ],
      answer: 0,
      explain: 'If you combine the ways of identifying rulesets, the same rule can report twice.',
    },
    {
      type: 'single',
      prompt: 'Which permission does the API Governance CLI page state for `api validate`?',
      options: [
        'None, because it is one of the commands that run locally without accessing Anypoint Platform',
        'Governance Administrator',
        'Governance Viewer',
        'Exchange Administrator',
      ],
      answer: 0,
      explain: 'The page lists `ruleset validate`, `ruleset document` and `api validate` as needing none. Commands that list information, such as `api inspect` and `profile list`, need Governance Viewer, and commands that update entities need Governance Administrator.',
    },
    {
      type: 'single',
      prompt: 'A step runs `governance:api:validate --rulesets a.yaml b.yaml my-api.zip`, and the parser takes the API file as a third ruleset. What does the reference advise?',
      options: [
        'Put the parameter before the flags, or use `-- ` (two dashes and a space) before the parameter',
        'Separate the rulesets with commas',
        'Use two separate commands',
        'Quote the whole list',
      ],
      answer: 0,
      explain: 'This command has multi-option flags, which take a list separated by spaces, so the parser needs to know where the list ends.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about `api-catalog publish-asset` are correct?',
      options: [
        '`--dry-run` verifies that the descriptor file is valid, and publishes no APIs',
        '`--force-publish` creates a new version regardless of the content',
        'If the descriptor file does not exist, no assets are cataloged',
        'With `triggerConditions` set globally, no APIs are published unless all conditions are matched by `--trigger-criteria` values',
        'If no version strategy applies, the default is `majorIncrease`',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The default version strategy is `patchIncrease`.',
    },
    {
      type: 'match',
      prompt: 'Match each branch policy to the version strategy in `versionStrategyConditions`.',
      pairs: [
        ['`develop`: publish a development asset, at the version in the descriptor, and republish it each time', '`snapshot`'],
        ['`main`: raise the second number of the version', '`minorIncrease`'],
        ['A release tag: publish exactly the version in the descriptor, and fail if it is already stable', '`fixed`'],
      ],
      explain: 'The same command runs for every branch, and the pipeline passes `--version-strategy-criteria` to select the strategy.',
    },
  ],
  description: `
A telecoms group keeps 50 API specifications in Git. Today a developer edits a spec in API Designer, publishes it to Exchange by hand, and tells the implementation team. Three problems keep coming back:

- Specs reach Exchange without the error model that the C4E requires. Conformance reports show this only weeks later.
- Exchange versions do not line up with Git, and nobody can say which commit a version came from.
- Implementation teams start from a spec that later changes without notice.

The architecture board wants specs treated as code: changed through pull requests, checked automatically, and published from the pipeline. The first attempt at the pipeline step looks like this:

\`\`\`bash
anypoint-cli-v4 governance:api:validate --rulesets rules/errors.yaml rules/naming.yaml orders-api
anypoint-cli-v4 exchange:asset:upload orders-api/1.0.0 --name "Orders" --files='{"oas.yaml":"orders.yaml"}'
\`\`\`

The second run of the upload fails with \`Request failed with status code 409\`, and the validation step sometimes prints \`Conforms: false\`, yet the job carries on.

**Questions**
1. Design the pull request gate. Where do the rulesets come from?
2. What is wrong with the two commands?
3. How can you publish from the pipeline with a consistent version policy for each branch?
4. How do you make the gate actually stop the pipeline?
5. How does this relate to governance profiles in the platform?
`,
  answerTemplate: `## Pull request gate

## Problems in the commands

## Publishing and versions

## Making the gate stop

## Relationship to profiles
`,
  keyPoints: [
    'governance:api:validate accepts a ZIP, a folder, or a GAV with --remote.',
    'Rulesets come from exchange.json dependencies, --remote-rulesets or --rulesets. Duplicates are not detected.',
    'api validate runs locally and the page lists no permission for it, which suits a pull request job.',
    'With multi-option flags, put the parameter first or use -- before it.',
    'The output shows Spec conforms with Ruleset, or Conforms: false with the number of results and a severity for each.',
    'The reference does not document exit codes, so test how the gate fails.',
    'exchange:asset:upload can return 409 for a duplicate. Change the version or the asset ID.',
    'api-catalog publish-asset gives trigger and version strategy conditions per branch, --dry-run and --force-publish. The default strategy is patchIncrease.',
  ],
  solution: `
**Pull request gate.** Run \`governance:api:validate\` on the project folder for every pull request, against rulesets that the C4E owns, and publish nothing at this stage. Three sources of rulesets exist:
- \`exchange.json\` dependencies, present only if they were defined for the project in API Designer.
- \`--remote-rulesets\`, with Exchange asset identifiers, which is the best fit: one published, versioned copy of the standard. Pin the version, and raise it on purpose, so that a new rule does not fail every open pull request on the same morning.
- \`--rulesets\`, for local YAML files, useful while the C4E is developing a rule.

Do not mix them for the same ruleset, because duplicates are not detected. The CLI page lists no permission for \`api validate\`, because it runs locally. With \`--remote-rulesets\`, \`--remote\` or \`exchange.json\` dependencies, the command must reach Exchange, so try it with the pipeline identity first. A ruleset that the C4E changes also has its own small pipeline: \`governance:ruleset:validate\`, then \`exchange:asset:upload\`.

**Problems in the commands.**
- The validate command has multi-option flags. The parameter should go first, or after \`-- \`, or the parser can treat \`orders-api\` as one more ruleset:

\`\`\`bash
anypoint-cli-v4 governance:api:validate orders-api --rulesets rules/errors.yaml rules/naming.yaml
\`\`\`

- The upload fixes the version as \`1.0.0\`, so the second run tries to publish a duplicate, and the troubleshooting page gives a duplicate upload as a cause of a 409. Change the version, or use a tool that works out the version. Do not change the asset ID to get round it.
- On Windows agents, JSON in \`--files\` needs escaping, or you get an error while parsing.

**Publishing and versions.** API Catalog CLI is built for this. It is agnostic of CI/CD tools, and you embed \`api-catalog publish-asset\` in the pipeline with a descriptor file, by default \`catalog.yaml\`:

\`\`\`yaml
triggerConditions:
  branches:
    - main
    - develop
    - release/(.*)
versionStrategyConditions:
  minorIncrease:
    branch:
      - main
  snapshot:
    branch:
      - develop
\`\`\`

\`\`\`bash
api-catalog publish-asset --dry-run
api-catalog publish-asset --trigger-criteria=branches:$BRANCH --version-strategy-criteria=branch:$BRANCH --json
\`\`\`

- \`--dry-run\` proves that the descriptor is valid, so run it in the pull request.
- The conditions let one command serve all branches. With a global \`triggerConditions\` section, nothing is published unless all conditions match.
- The strategies are \`majorIncrease\`, \`minorIncrease\`, \`patchIncrease\` (the default), \`snapshot\` and \`fixed\`. \`snapshot\` keeps an asset in \`development\`, which fits a spec in design. \`fixed\` publishes exactly the version in the descriptor, and it fails if that stable version is already published.
- The command compares content, so an unchanged spec does not create a new version. \`--force-publish\` bypasses this.
- Commit the published version back, or tag the commit, so that Exchange and Git agree. Implementation teams then depend on a stable version, which cannot change under them.

**Making the gate stop.** The docs show the two outcomes as text: \`Spec conforms with Ruleset\`, or \`Conforms: false\` with \`Number of results\`, followed by results that each have a \`Severity\` of \`Violation\` or \`Warning\`. The reference does not document exit codes. So test your CLI version with a bad spec. If it does not return a failure code, have the step search the output for \`Conforms: false\`, and fail the job itself. Decide whether a \`Warning\` fails the gate or is only reported, and write that down.

**Relationship to profiles.** The pipeline gate and platform governance do different jobs. A gate gives a developer an answer in the pull request, and a governance profile monitors APIs in Exchange and reports their conformance. Governance does not by itself stop a nonconformant API from reaching Production, so the pipeline gate is the part that blocks. Use the same rulesets in both, so that a spec that passes the gate does not fail the report. \`governance:api:evaluate\` shows which rulesets apply to given criteria, or to a project's \`exchange.json\`, which helps the pipeline choose.
`,
  followUps: [
    { q: 'Can you validate a spec that is already in Exchange?', a: 'Yes, with --remote and the asset identifier of the API, for example to check existing specs against a new ruleset before it goes live.' },
    { q: 'Why not let developers publish from API Designer?', a: 'They can during design, but the record of what was approved is then outside Git. Publishing from a pipeline gives one reviewed route, and the same checks each time.' },
    { q: 'What does --trigger-criteria do when a descriptor has both global and API level conditions?', a: 'The API level conditions override the global ones. So one API can publish on a branch where the others do not.' },
    { q: 'How does the implementation team learn about a new version?', a: 'Keep it in the pipeline: a notification after publication, and a dependency update in the app. The stable version they use does not change, so they move when ready.' },
    { q: 'How do you keep the API spec and the Mule app in step?', a: 'Publish the spec first, then have the app depend on that release version. Treat a breaking change as a new major version that runs beside the old one.' },
  ],
}
