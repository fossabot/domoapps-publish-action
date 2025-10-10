const core = require('@actions/core');

/**
 * Changes to the working directory if needed
 * @param {string} workingDirectory - The working directory path
 */
function changeDirectory(workingDirectory) {
  if (workingDirectory !== '.') {
    core.info(`📂 Changing to working directory: ${workingDirectory}`);
    process.chdir(workingDirectory);
  }
}

module.exports = {
  changeDirectory,
};
