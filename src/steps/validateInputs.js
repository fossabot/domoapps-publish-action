const core = require('@actions/core');

/**
 * Validates the required inputs
 * @param {string} domoToken - The Domo API token
 * @param {string} domoInstance - The Domo instance URL
 */
const VALID_DOMO_DOMAINS = ['.domo.com', '.domorig.io', '.domotech.io'];

function validateInputs(domoToken, domoInstance) {
  if (!domoToken) {
    core.setFailed('Domo token is required for authentication.');
    return false;
  }

  if (!domoInstance) {
    core.setFailed('Invalid Domo instance URL. Must be a valid Domo instance.');
    return false;
  }

  try {
    const url = new URL(
      domoInstance.startsWith('http') ? domoInstance : `https://${domoInstance}`
    );
    if (!VALID_DOMO_DOMAINS.some((d) => url.hostname.endsWith(d))) {
      core.setFailed('Invalid Domo instance URL. Must be a valid Domo instance.');
      return false;
    }
  } catch {
    core.setFailed('Invalid Domo instance URL. Must be a valid Domo instance.');
    return false;
  }

  return true;
}

module.exports = {
  validateInputs,
};
