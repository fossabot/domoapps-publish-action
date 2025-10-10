const exec = require('@actions/exec');
const core = require('@actions/core');

/**
 * Runs the build command if provided
 * @param {string} buildCommand - The build command to run
 */
async function runBuild(buildCommand) {
  if (!buildCommand) {
    return;
  }

  core.info(`🔨 Running build command: ${buildCommand}`);
  try {
    await exec.exec('bash', ['-c', buildCommand]);
    core.info('✅ Build completed successfully');
  } catch (error) {
    core.setFailed(`❌ Build failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  runBuild,
};
