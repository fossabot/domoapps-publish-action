const { publishApp } = require('../utils/domoHelpers');

async function publishAppStep(appPath, domoInstance, workingDirectory, githubToken) {
  await publishApp(appPath, domoInstance, workingDirectory, githubToken);
}

module.exports = {
  publishAppStep,
};
