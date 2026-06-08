# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub Action that deploys Domo Custom Apps to a Domo instance using the new [Domo CLI](https://app.domo.com/domo-cli/install.sh). Handles authentication, optional build steps, publishing, and opens a PR to write the design id back to the source manifest on first publish.

## Key Commands

- `npm run build` — Build with @vercel/ncc (compiles `src/index.js` → `dist/index.js`)
- `npm run lint` — ESLint on source files
- `npm test` — Jest tests (`__tests__/`)
- CI uses yarn (`yarn install --frozen-lockfile`); local dev uses npm

**Critical**: After any code change, run `npm run build` to regenerate `dist/index.js`. This is what GitHub Actions actually executes (per `action.yml` `main: 'dist/index.js'`).

Pre-commit hooks (Husky + lint-staged) auto-run ESLint on JS files and Prettier on JSON/YAML files.

## Architecture

### Inputs

- `domo-token` — Domo developer token (required)
- `domo-instance` — Domo instance URL (required)
- `github-token` — optional; enables the auto-PR flow on first publish
- `working-directory` (default `.`) — source dir where deps install and `build-command` runs
- `build-command` — optional shell command, run inside `working-directory`
- `publish-dir` (default `.`) — built artifact to upload, resolved relative to `working-directory`

### Pipeline

`src/index.js` orchestrates a sequential pipeline:

1. **validateInputs** — Validates domo-token and domo-instance
2. **setupEnvironment** — Detects package manager, installs deps, installs the new Domo CLI via curl
3. **authenticateDomo** — `domo auth login <instance> --token <token>`
4. **changeDirectory(workingDirectory)** — chdirs into source dir before build
5. **runBuild** — Runs user-specified build command (in source dir)
6. **publishAppStep** — Runs `domo app publish [--build-dir <publishDir>]` from `workingDirectory`

Each step is a separate module in `src/steps/` that throws on failure.

### Utilities

- `domoHelpers.js` — Domo CLI operations: `ensureDomoCliInstalled()`, `authenticateWithDomo()`, `publishApp()`, `findSourceManifest()`, `openDesignIdPR()`
- `packageManager.js` — Detects package manager (npm/yarn/pnpm) from lock files

### Domo CLI Invocation

```javascript
// Install
await exec.exec('bash', ['-c', 'curl -fsSL https://app.domo.com/domo-cli/install.sh | bash']);

// Auth
await exec.exec('domo', ['auth', 'login', instanceName, '--token', domoToken]);

// Publish (from workingDirectory; --build-dir only added when publishDir !== '.')
await exec.getExecOutput('domo', ['app', 'publish', '--build-dir', publishDir]);
```

### New Design Flow

On first publish, `domo app publish` outputs `Created design <uuid>`. The action:
1. Parses the uuid from stdout
2. Finds the source `manifest.json` (`workingDirectory/manifest.json` → `public/manifest.json` → `src/manifest.json`)
3. Writes the `id` field to that file
4. Opens a PR against `main` via the GitHub API (requires `github-token` + `pull-requests: write` permission)
5. Emits a Job Summary and `core.warning` annotation with the id and PR link

Action inputs/outputs are defined in `action.yml`.
