const { publishApp } = require('../utils/domoHelpers');

/**
 * Publishes the app to Domo
 * @param {string} appPath - The path to the app
 * @param {string} domoInstance - The Domo instance URL
 */
async function publishAppStep(appPath, domoInstance) {
  await publishApp(appPath, domoInstance);
}

module.exports = {
  publishAppStep,
};
