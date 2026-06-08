const {
  ensurePackageManager,
  installDependencies,
} = require('../utils/packageManager');
const { ensureDomoCliInstalled } = require('../utils/domoHelpers');

async function setupEnvironment() {
  await ensurePackageManager();
  await installDependencies();
  await ensureDomoCliInstalled();
}

module.exports = {
  setupEnvironment,
};
