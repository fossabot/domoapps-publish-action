const core = require('@actions/core');
const exec = require('@actions/exec');

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

    // Run build command if provided (before changing directory)
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

    // Add Domo token and login
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
