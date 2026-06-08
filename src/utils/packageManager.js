const fs = require('fs');
const exec = require('@actions/exec');
const core = require('@actions/core');

/**
 * Detects which package manager to use based on lock files
 * @returns {string} The package manager name ('pnpm', 'yarn', 'npm')
 */
function detectPackageManager() {
  const hasPnpmLock = fs.existsSync('pnpm-lock.yaml');
  const hasYarnLock = fs.existsSync('yarn.lock');
  const hasNpmLock = fs.existsSync('package-lock.json');

  if (hasPnpmLock) return 'pnpm';
  if (hasYarnLock) return 'yarn';
  if (hasNpmLock) return 'npm';
  return 'npm'; // Default to npm
}

// Read the packageManager field from package.json (e.g. "pnpm@9.15.0") or default to pnpm@9
function getPnpmVersion() {
  try {
    if (fs.existsSync('package.json')) {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const pm = pkg.packageManager;
      if (pm && pm.startsWith('pnpm@')) {
        return pm.split('@')[1];
      }
    }
  } catch {
    // fall through to default
  }
  return '9';
}


async function ensurePackageManager() {
  try {
    const packageManager = detectPackageManager();

    if (packageManager === 'pnpm') {
      core.info('📦 Detected pnpm lock file, ensuring pnpm is available...');
      try {
        await exec.exec('pnpm', ['--version'], { silent: true });
        core.info('✅ pnpm is already available');
      } catch (error) {
        core.info('📦 Installing pnpm...');
        const pnpmVersion = getPnpmVersion();
        await exec.exec('npm', ['install', '-g', `pnpm@${pnpmVersion}`]);
        core.info('✅ pnpm installed successfully');
      }
    } else if (packageManager === 'yarn') {
      core.info('📦 Detected yarn lock file, ensuring yarn is available...');
      try {
        await exec.exec('yarn', ['--version'], { silent: true });
        core.info('✅ yarn is already available');
      } catch (error) {
        core.info('📦 Installing yarn...');
        await exec.exec('npm', ['install', '-g', 'yarn']);
        core.info('✅ yarn installed successfully');
      }
    } else {
      core.info('📦 Using npm (default package manager)');
    }

    return packageManager;
  } catch (error) {
    core.warning(`⚠️ Could not detect package manager: ${error.message}`);
    return 'npm';
  }
}

/**
 * Installs dependencies using the appropriate package manager
 */
async function installDependencies() {
  try {
    // Check if package.json exists
    if (!fs.existsSync('package.json')) {
      core.info('📦 No package.json found, skipping dependency installation');
      return;
    }

    // Check if node_modules exists
    if (fs.existsSync('node_modules')) {
      core.info('📦 node_modules already exists, skipping installation');
      return;
    }

    const packageManager = detectPackageManager();
    core.info('📦 Installing dependencies...');

    if (packageManager === 'pnpm') {
      await exec.exec('pnpm', ['install', '--frozen-lockfile']);
    } else if (packageManager === 'yarn') {
      await exec.exec('yarn', ['install', '--frozen-lockfile']);
    } else if (packageManager === 'npm') {
      if (fs.existsSync('package-lock.json')) {
        await exec.exec('npm', ['ci']);
      } else {
        await exec.exec('npm', ['install']);
      }
    }

    core.info('✅ Dependencies installed successfully');
  } catch (error) {
    core.warning(`⚠️ Could not install dependencies: ${error.message}`);
  }
}

module.exports = {
  detectPackageManager,
  ensurePackageManager,
  installDependencies,
};
