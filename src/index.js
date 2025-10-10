const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');

async function ensurePackageManager() {
  try {
    // Check for lock files to determine package manager
    const hasPnpmLock = fs.existsSync('pnpm-lock.yaml');
    const hasYarnLock = fs.existsSync('yarn.lock');
    const hasNpmLock = fs.existsSync('package-lock.json');

    if (hasPnpmLock) {
      core.info('📦 Detected pnpm lock file, ensuring pnpm is available...');
      try {
        await exec.exec('pnpm', ['--version'], { silent: true });
        core.info('✅ pnpm is already available');
      } catch (error) {
        core.info('📦 Installing pnpm...');
        await exec.exec('npm', ['install', '-g', 'pnpm']);
        core.info('✅ pnpm installed successfully');
      }
    } else if (hasYarnLock) {
      core.info('📦 Detected yarn lock file, ensuring yarn is available...');
      try {
        await exec.exec('yarn', ['--version'], { silent: true });
        core.info('✅ yarn is already available');
      } catch (error) {
        core.info('📦 Installing yarn...');
        await exec.exec('npm', ['install', '-g', 'yarn']);
        core.info('✅ yarn installed successfully');
      }
    } else if (hasNpmLock) {
      core.info('📦 Detected npm lock file, npm should be available');
    } else {
      core.info('📦 No lock file detected, assuming npm is available');
    }
  } catch (error) {
    core.warning(`⚠️ Could not detect package manager: ${error.message}`);
  }
}

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

    // Determine which package manager to use
    const hasPnpmLock = fs.existsSync('pnpm-lock.yaml');
    const hasYarnLock = fs.existsSync('yarn.lock');
    const hasNpmLock = fs.existsSync('package-lock.json');

    core.info('📦 Installing dependencies...');

    if (hasPnpmLock) {
      await exec.exec('pnpm', ['install', '--frozen-lockfile']);
    } else if (hasYarnLock) {
      await exec.exec('yarn', ['install', '--frozen-lockfile']);
    } else if (hasNpmLock) {
      await exec.exec('npm', ['ci']);
    } else {
      await exec.exec('npm', ['install']);
    }

    core.info('✅ Dependencies installed successfully');
  } catch (error) {
    core.warning(`⚠️ Could not install dependencies: ${error.message}`);
  }
}

async function run() {
  try {
    // Get inputs
    const domoToken = core.getInput('domo-token', { required: true });
    const domoInstance = core.getInput('domo-instance', { required: true });
    const buildCommand = core.getInput('build-command', { required: false });
    const workingDirectory =
      core.getInput('working-directory', { required: false }) || '.';

    // The app path is determined by the working directory
    const appPath = workingDirectory;

    // Validate inputs
    if (!domoInstance || !domoInstance.includes('domo.com')) {
      core.setFailed(
        'Invalid Domo instance URL. Must be a valid Domo instance.',
      );
      return;
    }

    if (!domoToken) {
      core.setFailed('Domo token is required for authentication.');
      return;
    }

    core.info('🚀 Starting Domo app deployment...');
    core.info(`📁 App path: ${appPath}`);
    core.info(`🌐 Domo instance: ${domoInstance}`);

    // Check for package manager and install if needed
    await ensurePackageManager();

    // Install dependencies if package.json exists
    await installDependencies();

    // Install ryuu if not already installed
    core.info('📦 Checking for ryuu installation...');
    try {
      await exec.exec('npm', ['list', '-g', 'ryuu'], { silent: true });
      core.info('✅ ryuu is already installed');
    } catch (error) {
      core.info('📦 Installing ryuu globally...');
      await exec.exec('npm', ['install', '-g', 'ryuu']);
      core.info('✅ ryuu installed successfully');
    }

    // Add Domo token and login (before build, in case build needs Domo access)
    core.info('🔐 Adding Domo token and authenticating...');
    try {
      // Extract instance name from URL (e.g., https://company.domo.com -> company.domo.com)
      const instanceName = domoInstance
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      // Add token to domo CLI
      const addTokenCommand = `domo token -i ${instanceName} -t ${domoToken} add`;
      await exec.exec('bash', ['-c', addTokenCommand]);
      core.info('✅ Token added successfully');

      // Login to Domo
      const loginCommand = `domo login --instance ${instanceName}`;
      await exec.exec('bash', ['-c', loginCommand]);
      core.info('✅ Successfully authenticated with Domo');
    } catch (error) {
      core.setFailed(`❌ Failed to authenticate with Domo: ${error.message}`);
      return;
    }

    // Run build command if provided (after authentication, in case it needs Domo access)
    if (buildCommand) {
      core.info(`🔨 Running build command: ${buildCommand}`);
      try {
        await exec.exec('bash', ['-c', buildCommand]);
        core.info('✅ Build completed successfully');
      } catch (error) {
        core.setFailed(`❌ Build failed: ${error.message}`);
        return;
      }
    }

    // Change to working directory (after build, so the directory exists)
    if (workingDirectory !== '.') {
      core.info(`📂 Changing to working directory: ${workingDirectory}`);
      process.chdir(workingDirectory);
    }

    // Publish the app
    core.info('📤 Publishing app to Domo...');
    try {
      const publishCommand = `domo publish "${appPath}"`;
      await exec.exec('bash', ['-c', publishCommand]);
      core.info('✅ App published successfully');

      // Set outputs
      core.setOutput('deployment-status', 'success');
      core.setOutput('app-url', `${domoInstance}/app/${appPath}`);
    } catch (error) {
      core.setFailed(`❌ Failed to publish app: ${error.message}`);
      core.setOutput('deployment-status', 'failed');
      return;
    }

    core.info('🎉 Deployment completed successfully!');
  } catch (error) {
    core.setFailed(`❌ Action failed: ${error.message}`);
    core.setOutput('deployment-status', 'failed');
  }
}

// Run the action
run();
