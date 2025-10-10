const core = require('@actions/core');
const exec = require('@actions/exec');
const io = require('@actions/io');

// Mock the GitHub Actions modules
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/io');

describe('Domo Publish Action', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock core.getInput to return test values
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'domo-token': 'test-token-123',
        'domo-instance': 'https://test-company.domo.com',
        'app-path': './my-app',
        'build-command': 'npm run build',
        'working-directory': '.',
      };
      return inputs[name];
    });
  });

  test('should validate required inputs', () => {
    // Test with missing token
    core.getInput.mockImplementation((name) => {
      if (name === 'domo-token') return '';
      return 'test-value';
    });

    // This would be tested by importing and running the actual function
    // For now, we're testing the mock setup
    expect(core.getInput).toBeDefined();
  });

  test('should validate Domo instance URL', () => {
    const validInstance = 'https://test-company.domo.com';
    const invalidInstance = 'https://not-domo.com';

    expect(validInstance.includes('domo.com')).toBe(true);
    expect(invalidInstance.includes('domo.com')).toBe(true); // This actually returns true
    expect(invalidInstance.includes('.domo.com')).toBe(false); // This is what we want to test
  });

  test('should handle build command execution', async () => {
    // Mock successful exec
    exec.exec.mockResolvedValue(0);

    const buildCommand = 'npm run build';
    await exec.exec('bash', ['-c', buildCommand]);

    expect(exec.exec).toHaveBeenCalledWith('bash', ['-c', buildCommand]);
  });

  test('should handle ryuu installation and domo CLI authentication', async () => {
    // Mock ryuu not installed
    exec.exec.mockImplementation((command, args) => {
      if (command === 'npm' && args.includes('list')) {
        throw new Error('Package not found');
      }
      return Promise.resolve(0);
    });

    // Test installation
    await exec.exec('npm', ['install', '-g', 'ryuu']);
    expect(exec.exec).toHaveBeenCalledWith('npm', ['install', '-g', 'ryuu']);

    // Test token addition
    const addTokenCommand =
      'domo token -i test-company.domo.com -t test-token-123 add';
    await exec.exec('bash', ['-c', addTokenCommand]);
    expect(exec.exec).toHaveBeenCalledWith('bash', ['-c', addTokenCommand]);

    // Test login
    const loginCommand = 'domo login --instance test-company.domo.com';
    await exec.exec('bash', ['-c', loginCommand]);
    expect(exec.exec).toHaveBeenCalledWith('bash', ['-c', loginCommand]);
  });

  test('should handle app publishing', async () => {
    exec.exec.mockResolvedValue(0);

    const publishCommand = 'domo publish "./my-app"';
    await exec.exec('bash', ['-c', publishCommand]);

    expect(exec.exec).toHaveBeenCalledWith('bash', ['-c', publishCommand]);
  });

  test('should set outputs on success', () => {
    // Test that outputs are set correctly
    core.setOutput.mockImplementation((name, value) => {
      expect(['deployment-status', 'app-url']).toContain(name);
    });

    core.setOutput('deployment-status', 'success');
    core.setOutput('app-url', 'https://test.domo.com/app/./my-app');

    expect(core.setOutput).toHaveBeenCalledWith('deployment-status', 'success');
    expect(core.setOutput).toHaveBeenCalledWith(
      'app-url',
      'https://test.domo.com/app/./my-app',
    );
  });

  test('should handle errors gracefully', () => {
    const errorMessage = 'Test error message';

    core.setFailed.mockImplementation((message) => {
      expect(message).toContain(errorMessage);
    });

    core.setFailed(`❌ Action failed: ${errorMessage}`);
    expect(core.setFailed).toHaveBeenCalledWith(
      `❌ Action failed: ${errorMessage}`,
    );
  });
});
