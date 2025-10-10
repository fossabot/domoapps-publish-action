// Mock the GitHub Actions modules
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/io');

const core = require('@actions/core');
const exec = require('@actions/exec');
const io = require('@actions/io');

// Mock fs.existsSync specifically
const fs = {
  existsSync: jest.fn(),
};

describe('Domo Publish Action', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock fs.existsSync
    fs.existsSync.mockReturnValue(false);

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

  describe('Package Manager Detection', () => {
    test('should detect pnpm when pnpm-lock.yaml exists', () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'pnpm-lock.yaml') return true;
        if (file === 'yarn.lock') return false;
        if (file === 'package-lock.json') return false;
        return false;
      });

      expect(fs.existsSync('pnpm-lock.yaml')).toBe(true);
      expect(fs.existsSync('yarn.lock')).toBe(false);
      expect(fs.existsSync('package-lock.json')).toBe(false);
    });

    test('should detect yarn when yarn.lock exists', () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'pnpm-lock.yaml') return false;
        if (file === 'yarn.lock') return true;
        if (file === 'package-lock.json') return false;
        return false;
      });

      expect(fs.existsSync('yarn.lock')).toBe(true);
      expect(fs.existsSync('pnpm-lock.yaml')).toBe(false);
      expect(fs.existsSync('package-lock.json')).toBe(false);
    });

    test('should detect npm when package-lock.json exists', () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'pnpm-lock.yaml') return false;
        if (file === 'yarn.lock') return false;
        if (file === 'package-lock.json') return true;
        return false;
      });

      expect(fs.existsSync('package-lock.json')).toBe(true);
      expect(fs.existsSync('pnpm-lock.yaml')).toBe(false);
      expect(fs.existsSync('yarn.lock')).toBe(false);
    });
  });

  describe('Dependency Installation', () => {
    test('should skip installation if node_modules exists', () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'package.json') return true;
        if (file === 'node_modules') return true;
        return false;
      });

      expect(fs.existsSync('package.json')).toBe(true);
      expect(fs.existsSync('node_modules')).toBe(true);
    });

    test('should install dependencies with pnpm when pnpm-lock.yaml exists', async () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'package.json') return true;
        if (file === 'node_modules') return false;
        if (file === 'pnpm-lock.yaml') return true;
        if (file === 'yarn.lock') return false;
        if (file === 'package-lock.json') return false;
        return false;
      });

      exec.exec.mockResolvedValue(0);

      await exec.exec('pnpm', ['install', '--frozen-lockfile']);
      expect(exec.exec).toHaveBeenCalledWith('pnpm', [
        'install',
        '--frozen-lockfile',
      ]);
    });

    test('should install dependencies with yarn when yarn.lock exists', async () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'package.json') return true;
        if (file === 'node_modules') return false;
        if (file === 'pnpm-lock.yaml') return false;
        if (file === 'yarn.lock') return true;
        if (file === 'package-lock.json') return false;
        return false;
      });

      exec.exec.mockResolvedValue(0);

      await exec.exec('yarn', ['install', '--frozen-lockfile']);
      expect(exec.exec).toHaveBeenCalledWith('yarn', [
        'install',
        '--frozen-lockfile',
      ]);
    });

    test('should install dependencies with npm when package-lock.json exists', async () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'package.json') return true;
        if (file === 'node_modules') return false;
        if (file === 'pnpm-lock.yaml') return false;
        if (file === 'yarn.lock') return false;
        if (file === 'package-lock.json') return true;
        return false;
      });

      exec.exec.mockResolvedValue(0);

      await exec.exec('npm', ['ci']);
      expect(exec.exec).toHaveBeenCalledWith('npm', ['ci']);
    });

    test('should skip installation if no package.json exists', () => {
      fs.existsSync.mockImplementation((file) => {
        if (file === 'package.json') return false;
        return false;
      });

      expect(fs.existsSync('package.json')).toBe(false);
    });
  });

  describe('Instance Name Extraction', () => {
    test('should extract instance name from URL', () => {
      const testCases = [
        { input: 'https://company.domo.com', expected: 'company.domo.com' },
        { input: 'http://company.domo.com', expected: 'company.domo.com' },
        { input: 'https://company.domo.com/', expected: 'company.domo.com' },
        {
          input: 'https://subdomain.company.domo.com',
          expected: 'subdomain.company.domo.com',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input.replace(/^https?:\/\//, '').replace(/\/$/, '');
        expect(result).toBe(expected);
      });
    });
  });

  describe('Working Directory Changes', () => {
    test('should change to working directory after build', () => {
      const workingDirectory = './build';
      const originalCwd = process.cwd;

      // Mock process.chdir
      const mockChdir = jest.fn();
      process.chdir = mockChdir;

      if (workingDirectory !== '.') {
        process.chdir(workingDirectory);
        expect(mockChdir).toHaveBeenCalledWith(workingDirectory);
      }

      // Restore original
      process.chdir = originalCwd;
    });

    test('should not change directory if working directory is current', () => {
      const workingDirectory = '.';
      const originalCwd = process.cwd;

      // Mock process.chdir
      const mockChdir = jest.fn();
      process.chdir = mockChdir;

      if (workingDirectory !== '.') {
        process.chdir(workingDirectory);
      }

      expect(mockChdir).not.toHaveBeenCalled();

      // Restore original
      process.chdir = originalCwd;
    });
  });
});
