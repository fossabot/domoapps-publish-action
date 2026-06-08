# Domo Publish Action

A GitHub Action for deploying Domo Custom Apps to a Domo instance using the [new Domo CLI](https://app.domo.com/domo-cli/install.sh).

**v3** cleanly separates the _source directory_ (where your build runs) from the _publish directory_ (the artifact uploaded to Domo). Supports React/Vite, ProCode, and pnpm monorepo layouts.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Examples](#examples)
  - [React / Vite app](#react--vite-app-recommended-pattern)
  - [ProCode / flat app (no build)](#procode--flat-app-no-build)
  - [With pre-build checks (lint, test, type-check)](#with-pre-build-checks-lint-test-type-check)
  - [With per-environment manifest overrides (`@domoinc/da`)](#with-per-environment-manifest-overrides-domoinc-da)
  - [Multi-environment deploys (dev / qa / prod)](#multi-environment-deploys-dev--qa--prod)
  - [Deploy only when app code changes](#deploy-only-when-app-code-changes)
  - [Using outputs (status checks, notifications)](#using-outputs-status-checks-notifications)
  - [pnpm / yarn](#pnpm--yarn)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [How it works](#how-it-works)
- [Setup](#setup)
- [Migrating from v2](#migrating-from-v2)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- 🔐 Token-based authentication with Domo
- 📦 Auto-detects npm / yarn / pnpm from your lockfile and installs dependencies
- 🛠 Auto-installs the [Domo CLI](https://app.domo.com/domo-cli/install.sh) on the runner
- ⚛️ React / Vite / pnpm friendly — separate `working-directory` (source) and `publish-dir` (build output)
- 🔨 Optional build step run inside your source directory
- 📤 Publishes only the build artifact, not the whole repo
- 🆔 On first deploy, opens a PR to write the design id back to your source `manifest.json`
- 📊 Outputs `deployment-status`, `app-url`, and `design-id` for downstream steps

> **You don't need a separate install step.** The action runs it for you. Add your own only if pre-build steps (lint, test) need `node_modules` before the action runs.

---

## Quick start

```yaml
# .github/workflows/deploy.yml
name: Deploy to Domo
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DomoApps/domoapps-publish-action@v3.0.0
        with:
          domo-token: ${{ secrets.DOMO_TOKEN }}
          domo-instance: ${{ vars.DOMO_INSTANCE }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          build-command: npm run build
          publish-dir: ./build
```

---

## Examples

### React / Vite app (recommended pattern)

Source lives at the repo root, Vite emits to `./build`:

```yaml
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: npm run build
    publish-dir: ./build
```

Source lives in a subfolder (`./app`):

```yaml
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    working-directory: ./app
    build-command: npm run build
    publish-dir: ./dist
```

> `publish-dir` is resolved **relative to `working-directory`**, so `./dist` above means `./app/dist`.

### ProCode / flat app (no build)

When `manifest.json`, `index.html`, etc. live at the repo root and there's no build step:

```yaml
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
```

Defaults handle this — `working-directory: .` and `publish-dir` falls back to `working-directory`.

### With pre-build checks (lint, test, type-check)

`build-command` is a shell string — chain with `&&` to gate the publish on quality checks:

```yaml
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: npm run lint && npm test -- --watchAll=false && npm run build
    publish-dir: ./build
```

Or split into a dedicated checks step _before_ this one — failures block the deploy:

```yaml
- run: npm ci # only needed because the steps below run before the action's auto-install

- name: Lint & test
  run: |
    npm run lint
    npm test -- --watchAll=false

- name: Build & deploy
  uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: npm run build
    publish-dir: ./build
```

### With per-environment manifest overrides (`@domoinc/da`)

Domo Apps templates use `da apply-manifest` (from the [`@domoinc/da`](https://www.npmjs.com/package/@domoinc/da) CLI) to swap dataset IDs / app IDs per environment. **`@domoinc/da` must be in your `devDependencies`** — it's typically installed globally on developer machines, so locally it works without this, but CI's clean install won't have it on PATH and your build will fail with `sh: 1: da: not found`.

```jsonc
// package.json
{
  "scripts": {
    "build:prod": "da apply-manifest production && vite build",
  },
  "devDependencies": {
    "@domoinc/da": "^2.3.0",
  },
}
```

```yaml
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: npm run build:prod
    publish-dir: ./build
```

#### Full workflow — pnpm + `da apply-manifest`

A complete example using pnpm, pre-build checks, and `da apply-manifest`. **Requires `@domoinc/da` in `devDependencies`** (see above).

```jsonc
// package.json — one build script per target environment
{
  "scripts": {
    "build:ci": "da apply-manifest production && pnpm run-checks && vite build",
    "run-checks": "tsc --noEmit && eslint src",
  },
  "devDependencies": {
    "@domoinc/da": "^2.3.0",
  },
}
```

```yaml
# .github/workflows/deploy.yml
name: Deploy to Domo
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - uses: DomoApps/domoapps-publish-action@v3.0.0
        with:
          domo-token: ${{ secrets.DOMO_TOKEN }}
          domo-instance: ${{ vars.DOMO_INSTANCE }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          build-command: pnpm run build:ci
          publish-dir: ./build
```

> **`da apply-manifest`** must be called with the environment name as an argument (e.g., `da apply-manifest production`). Calling it without an argument triggers an interactive prompt that fails in CI with `ENXIO: no such device or address, open '/dev/tty'`. Also use a script name other than `build` — the `prebuild` lifecycle hook would fire and call `da apply-manifest` without an arg.

`da apply-manifest <env>` reads `src/manifestOverrides.json` and writes a build-time manifest with that env's `id` / `proxyId` / dataset UUIDs.

### Multi-environment deploys (dev / qa / prod)

A single workflow keyed off the branch:

```yaml
name: Deploy to Domo
on:
  push:
    branches: [main, qa, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Resolve environment
        id: env
        run: |
          case "${{ github.ref_name }}" in
            main)    echo "name=prod" >> $GITHUB_OUTPUT
                     echo "instance=https://yourcompany.domo.com" >> $GITHUB_OUTPUT ;;
            qa)      echo "name=qa"   >> $GITHUB_OUTPUT
                     echo "instance=https://yourcompany-qa.domo.com" >> $GITHUB_OUTPUT ;;
            develop) echo "name=dev"  >> $GITHUB_OUTPUT
                     echo "instance=https://yourcompany-dev.domo.com" >> $GITHUB_OUTPUT ;;
          esac

      - uses: DomoApps/domoapps-publish-action@v3.0.0
        with:
          domo-token: ${{ secrets[format('DOMO_TOKEN_{0}', steps.env.outputs.name)] }}
          domo-instance: ${{ steps.env.outputs.instance }}
          build-command: npm run build:${{ steps.env.outputs.name }}
          publish-dir: ./build
```

Stash three secrets (`DOMO_TOKEN_DEV`, `DOMO_TOKEN_QA`, `DOMO_TOKEN_PROD`) and three build scripts (`build:dev`, `build:qa`, `build:prod`).

### Deploy only when app code changes

Skip a deploy when only docs or workflows change:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'public/**'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/deploy.yml'
```

### Using outputs (status checks, notifications)

```yaml
- name: Deploy
  id: deploy
  uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: npm run build
    publish-dir: ./build

- name: Slack on failure
  if: failure() && steps.deploy.outputs.deployment-status == 'failed'
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"❌ Deploy failed for ${{ github.repository }} @ ${{ github.sha }}\"}"

- name: Comment on PR
  if: github.event_name == 'pull_request' && steps.deploy.outputs.app-url
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `Deployed to ${{ steps.deploy.outputs.app-url }}`
      })
```

### pnpm / yarn

The action auto-detects your package manager from the lockfile and runs the install for you. For pnpm you still need to make the `pnpm` binary available on the runner:

```yaml
# pnpm
- uses: actions/checkout@v4
- uses: pnpm/action-setup@v4
  with: { version: 9 }  # match your project's pnpm version
- uses: actions/setup-node@v4
  with: { node-version: '24', cache: 'pnpm' }
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: pnpm build
    publish-dir: ./build
```

```yaml
# yarn
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '24', cache: 'yarn' }
- uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: yarn build
    publish-dir: ./build
```

---

## Inputs

| Input               | Required | Default                       | Description                                                                                                                                                                                                                                               |
| ------------------- | :------: | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domo-token`        |    ✅    | —                             | Domo API token for authentication. Store as a GitHub secret.                                                                                                                                                                                              |
| `domo-instance`     |    ✅    | —                             | Domo instance URL, e.g. `https://your-company.domo.com`.                                                                                                                                                                                                  |
| `github-token`      |    ❌    | —                             | GitHub token used to commit the updated `manifest.json` when a new design is created. Pass `secrets.GITHUB_TOKEN`. Requires `permissions: contents: write` on the workflow. Without it the action still publishes and surfaces the id in the Job Summary. |
| `working-directory` |    ❌    | `.`                           | Source directory. Where dependencies install and `build-command` runs.                                                                                                                                                                                    |
| `build-command`     |    ❌    | —                             | Optional shell command, run inside `working-directory`. Chain multiple steps with `&&`.                                                                                                                                                                   |
| `publish-dir`       |    ❌    | (matches `working-directory`) | Built artifact to upload. Resolved **relative to `working-directory`**. Set to your build output folder.                                                                                                                                                  |

---

## Outputs

| Output              | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `deployment-status` | `success` or `failed`                                                           |
| `app-url`           | URL of the deployed app on the Domo instance                                    |
| `design-id`         | The Domo design UUID — only set when a new design is created for the first time |

---

## How it works

1. **Detect package manager** from your lockfile (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`).
2. **Install dependencies** with that package manager.
3. **Install the Domo CLI** on the runner via the official install script.
4. **Authenticate**: `domo auth login <instance> --token <token>`.
5. **Build**: change to `working-directory` and run `build-command` (if provided).
6. **Publish**: `domo app publish [--build-dir <publish-dir>]` from `working-directory`.
7. **First publish only**: if a new design is created, write the `id` to the source `manifest.json` and open a PR against `main`.

For pnpm you need `pnpm/action-setup` before the action. For npm/yarn, `actions/setup-node` is sufficient.

---

## Setup

### 1. Create a Domo developer token

1. Log in to your Domo instance as the CICD service account
2. **Admin → Security → Access Tokens → Generate Access Token**
3. Save it as a GitHub secret named `DOMO_TOKEN`

### 2. Configure your app

Your `publish-dir` must contain a valid `manifest.json` after the build. Minimal example:

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "size": { "width": 5, "height": 3 },
  "fullpage": true,
  "id": "f46a7a19-9237-1234-1234-ef453e181614",
  "mapping": [
    {
      "alias": "Sales",
      "dataSetId": "a918ca2b-1234-42ec-1234-a71a2e1f9b43",
      "fields": []
    }
  ]
}
```

For React/Vite apps, place `manifest.json` in `public/` so the build copies it into `publish-dir`.

#### Manifest fields

| Field         | Required | Description                                                                                                                                                                                           |
| ------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        |    ✅    | Display name of your app                                                                                                                                                                              |
| `version`     |    ✅    | Semantic version (e.g. `"1.0.0"`)                                                                                                                                                                     |
| `size.width`  |    ✅    | Grid width (1–12)                                                                                                                                                                                     |
| `size.height` |    ✅    | Grid height (1–12)                                                                                                                                                                                    |
| `fullpage`    |    ❌    | If `true`, app takes full page                                                                                                                                                                        |
| `id`          |    ❌    | App UUID. On first publish the action writes this back to your source `manifest.json` automatically (when `github-token` is provided) — or surfaces it in the Job Summary so you can add it manually. |
| `proxyId`     |    ❌    | Required if using AppDB collections                                                                                                                                                                   |
| `mapping`     |    ❌    | Array of `{ alias, dataSetId, fields }` for dataset mappings                                                                                                                                          |
| `collections` |    ❌    | Array of AppDB collection schemas (STRING-only columns)                                                                                                                                               |

---

## Migrating from v2

v3 reframes `working-directory` to mean the **source** directory. The new `publish-dir` input names the build output. In v2, the action used `working-directory` for both — which meant if you set it to `./build`, your build command tried to run from there (no `package.json`). If you left it at `.`, the publish step uploaded the entire repo (including `docs/`, `node_modules/`, etc.).

```diff
- uses: DomoApps/domoapps-publish-action@v2
+ uses: DomoApps/domoapps-publish-action@v3.0.0
  with:
    domo-token: ${{ secrets.DOMO_TOKEN }}
    domo-instance: ${{ vars.DOMO_INSTANCE }}
    build-command: npm run build
-   working-directory: ./build
+   publish-dir: ./build
```

If you don't run a build (flat ProCode app), no change is needed — defaults still publish from the repo root.

### Also fixed in v3

- **Each deploy no longer creates a new design.** v2 invoked `domo publish --build-dir <dir>`, which resolved the manifest against the caller's CWD (typically `public/manifest.json` with no `id`), creating a new app on every run. v3 passes `--build-dir` to the new Domo CLI correctly, so the manifest your build emitted is what gets published.
- **`./build/build` resolution bug** (the old action's `changeDirectory` + `--build-dir` interaction) is gone.

---

## Troubleshooting

| Symptom                                                 | Likely cause                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Manifest not found`                                    | `publish-dir` doesn't contain `manifest.json` after build                                                                       | Ensure your build copies `manifest.json` into the publish output (e.g. via Vite's `public/` folder). Verify locally: `ls $(your-build-dir)/manifest.json`                                                                                                                                                                                                                  |
| `Authentication failed`                                 | Bad / expired token, or wrong instance URL                                                                                      | Regenerate token in Domo admin. Ensure `domo-instance` includes the `https://` scheme.                                                                                                                                                                                                                                                                                     |
| Each deploy creates a new app                           | `manifest.json` inside `publish-dir` has no `id`, or its `id` doesn't exist on the target instance                              | On first deploy, the action writes the new `design-id` back to your source `manifest.json` and commits it automatically (requires `github-token`). Without `github-token`, check the Job Summary after the first run for the id and add it manually. If using `da apply-manifest` for per-env overrides, confirm `manifestOverrides.json` has the right `id` for that env. |
| Repo files leak into the published app                  | Using v2 without an isolated `working-directory`, or upgraded to v3 but didn't set `publish-dir`                                | Set `publish-dir` to your build output folder.                                                                                                                                                                                                                                                                                                                             |
| `ENXIO: no such device or address, open '/dev/tty'`     | `da apply-manifest` called without an environment argument — falls back to an interactive prompt, which fails in CI with no TTY | Pass the environment name directly: `da apply-manifest production` (not bare `da apply-manifest`). The `[id]` argument is required in non-interactive environments.                                                                                                                                                                                                        |
| `sh: 1: da: not found` (or other CLI not on PATH in CI) | `@domoinc/da` is installed globally locally but not in CI's clean install                                                       | Add `@domoinc/da` to `devDependencies` — it's required for `da apply-manifest` to work in CI. `npm ci` / `pnpm install` will then put the binary in `node_modules/.bin` where scripts can find it.                                                                                                                                                                         |
| AppDB calls fail at runtime                             | Missing `proxyId` in `manifest.json`                                                                                            | After first publish with `collections`, copy `proxyId` from `build/manifest.json`.                                                                                                                                                                                                                                                                                         |

### Debug logs

Enable verbose logs by setting these as GitHub Actions secrets on your repo:

- `ACTIONS_STEP_DEBUG` = `true`
- `ACTIONS_RUNNER_DEBUG` = `true`

---

## License

MIT — see [LICENSE](LICENSE).

## Support

- **Issues** — open one on this repo
- **Domo Developer Documentation** — https://developer.domo.com/
- **Domo CLI** — https://app.domo.com/domo-cli/install.sh
- **`@domoinc/da` on npm** — https://www.npmjs.com/package/@domoinc/da
