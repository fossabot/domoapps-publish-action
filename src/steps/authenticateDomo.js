const { authenticateWithDomo } = require('../utils/domoHelpers');

/**
 * Authenticates with Domo
 * @param {string} domoToken - The Domo API token
 * @param {string} domoInstance - The Domo instance URL
 */
async function authenticateDomo(domoToken, domoInstance) {
  await authenticateWithDomo(domoToken, domoInstance);
}

module.exports = {
  authenticateDomo,
};
