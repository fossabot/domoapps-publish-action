const exec = require('@actions/exec');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

/**
 * Extracts instance name from Domo URL
 * @param {string} domoInstance - The full Domo instance URL
 * @returns {string} The instance name
 */
function extractInstanceName(domoInstance) {
  return domoInstance.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function ensureDomoCliInstalled() {
  core.info('📦 Checking for Domo CLI installation...');
  try {
    await exec.exec('domo', ['--version'], { silent: true });
    core.info('✅ Domo CLI is already installed');
  } catch {
    core.info('📦 Installing Domo CLI...');
    await exec.exec('bash', ['-c', 'curl -fsSL https://app.domo.com/domo-cli/install.sh | bash']);
    core.info('✅ Domo CLI installed successfully');
  }
}

async function authenticateWithDomo(domoToken, domoInstance) {
  core.info('🔐 Authenticating with Domo...');
  const instanceName = extractInstanceName(domoInstance);
  await exec.exec('domo', ['auth', 'login', instanceName, '--token', domoToken]);
  const { stdout } = await exec.getExecOutput('domo', ['auth', 'whoami']);
  core.info(`✅ Authenticated as: ${stdout.trim()}`);
}

// Search order mirrors ryuu's findManifest lookup
const MANIFEST_SEARCH_PATHS = [
  'manifest.json',
  path.join('public', 'manifest.json'),
  path.join('src', 'manifest.json'),
];

function findSourceManifest(workingDirectory) {
  for (const rel of MANIFEST_SEARCH_PATHS) {
    const abs = path.join(workingDirectory, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

async function commitManifestId(manifestPath, githubToken) {
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const base64Token = Buffer.from(`x-access-token:${githubToken}`).toString(
    'base64',
  );

  await exec.exec(
    'git',
    [
      'config',
      '--local',
      `http.${serverUrl}/.extraheader`,
      `AUTHORIZATION: basic ${base64Token}`,
    ],
    { silent: true },
  );

  try {
    await exec.exec('git', ['config', 'user.name', 'github-actions[bot]']);
    await exec.exec('git', [
      'config',
      'user.email',
      '41898282+github-actions[bot]@users.noreply.github.com',
    ]);
    await exec.exec('git', ['add', manifestPath]);
    await exec.exec('git', [
      'commit',
      '-m',
      'chore: add Domo design id to manifest.json [skip ci]',
    ]);
    await exec.exec('git', ['push', 'origin', 'HEAD']);
  } finally {
    await exec
      .exec(
        'git',
        ['config', '--local', '--unset', `http.${serverUrl}/.extraheader`],
        { silent: true },
      )
      .catch(() => {});
  }
}

async function handleNewDesign(designId, workingDirectory, githubToken) {
  core.setOutput('design-id', designId);

  const manifestPath = findSourceManifest(workingDirectory);
  let committed = false;

  if (manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.id = designId;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    core.info(`✅ Wrote design id to ${manifestPath}`);

    if (githubToken) {
      try {
        await commitManifestId(manifestPath, githubToken);
        committed = true;
        core.info('✅ Committed manifest.json with design id');
      } catch (err) {
        core.warning(
          `Auto-commit failed: ${err.message}. Add the id to your manifest manually.`,
        );
      }
    }
  }

  core.warning(
    committed
      ? `New Domo design created (id: ${designId}). manifest.json committed automatically.`
      : `New Domo design created (id: ${designId}). ${manifestPath ? `Commit ${manifestPath} to prevent duplicate designs on future runs.` : 'Add the id to your manifest.json.'}`,
  );

  const s = core.summary
    .addHeading('🎉 New Domo Design Created')
    .addRaw('Your app was published to Domo for the first time.')
    .addBreak()
    .addBreak();

  if (committed) {
    s.addRaw(
      `✅ **\`manifest.json\` has been updated and committed automatically.** Future deployments will update this same design.`,
    )
      .addBreak()
      .addBreak()
      .addRaw(`Design id: \`${designId}\``);
  } else {
    s.addRaw(
      `To ensure future deployments update this same design, add the \`id\` to your source \`manifest.json\` and commit it.`,
    )
      .addBreak()
      .addBreak()
      .addRaw('Add this to your `manifest.json`:')
      .addCodeBlock(`"id": "${designId}"`, 'json');

    if (manifestPath) {
      s.addRaw(`**Manifest location:** \`${manifestPath}\``);
    } else {
      s.addRaw(
        `⚠️ Could not locate \`manifest.json\` in \`${workingDirectory}\`. Add the id manually.`,
      );
    }
  }

  await s.write();
}

/**
 * Publishes the app to Domo. Caller is expected to have chdir'd into the
 * directory containing manifest.json — we run plain `domo publish` (no
 * --build-dir) so ryuu's findManifest resolves against the right CWD.
 * @param {string} appPath - The publish dir, used only for the app-url output
 * @param {string} domoInstance - The Domo instance URL
 * @param {string} workingDirectory - Absolute path to working dir (for manifest write-back)
 */
/**
 * Publishes the app to Domo using the new Domo CLI.
 * @param {string} publishDir - Path to the built artifact (relative to CWD / workingDirectory)
 * @param {string} domoInstance - The Domo instance URL
 * @param {string} workingDirectory - Absolute path to working dir (for manifest write-back)
 * @param {string} githubToken - Optional GitHub token for auto-committing the design id
 */
async function publishApp(publishDir, domoInstance, workingDirectory, githubToken) {
  core.info('📤 Publishing app to Domo...');

  const args = ['app', 'publish'];
  if (publishDir && publishDir !== '.') {
    args.push('--build-dir', publishDir);
  }

  const { stdout } = await exec.getExecOutput('domo', args);
  core.info('✅ App published successfully');

  core.setOutput('deployment-status', 'success');
  core.setOutput('app-url', `${domoInstance}/app/${publishDir}`);

  if (stdout.includes('Created design')) {
    const match = stdout.match(/Created design ([a-f0-9-]{36})/);
    if (match) {
      await handleNewDesign(match[1], workingDirectory, githubToken);
    }
  }
}

module.exports = {
  extractInstanceName,
  ensureDomoCliInstalled,
  authenticateWithDomo,
  publishApp,
  findSourceManifest,
};
