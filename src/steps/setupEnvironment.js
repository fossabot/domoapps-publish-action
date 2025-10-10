const {
  ensurePackageManager,
  installDependencies,
} = require('../utils/packageManager');
const { ensureRyuuInstalled } = require('../utils/domoHelpers');

/**
 * Sets up the environment by ensuring package manager and installing dependencies
 */
async function setupEnvironment() {
  // Check for package manager and install if needed
  await ensurePackageManager();

  // Install dependencies if package.json exists
  await installDependencies();

  // Install ryuu if not already installed
  await ensureRyuuInstalled();
}

module.exports = {
  setupEnvironment,
};
