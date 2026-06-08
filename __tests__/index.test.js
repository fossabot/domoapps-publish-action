jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/io');
jest.mock('@actions/github');

const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const fs = require('fs');

const mockGetRef = jest.fn().mockResolvedValue({ data: { object: { sha: 'abc123' } } });
const mockCreateRef = jest.fn().mockResolvedValue({});
const mockGetContent = jest.fn().mockResolvedValue({ data: { sha: 'fileSha' } });
const mockCreateOrUpdateFile = jest.fn().mockResolvedValue({});
const mockCreatePR = jest.fn().mockResolvedValue({ data: { html_url: 'https://github.com/org/repo/pull/1' } });
github.getOctokit = jest.fn().mockReturnValue({
  rest: {
    git: { getRef: mockGetRef, createRef: mockCreateRef },
    repos: { getContent: mockGetContent, createOrUpdateFileContents: mockCreateOrUpdateFile },
    pulls: { create: mockCreatePR },
  },
});

// core.summary chains — set up once here, reset in beforeEach
const mockSummary = {
  addHeading: jest.fn().mockReturnThis(),
  addRaw: jest.fn().mockReturnThis(),
  addBreak: jest.fn().mockReturnThis(),
  addCodeBlock: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined),
};

const { extractInstanceName } = require('../src/utils/domoHelpers');
const { validateInputs } = require('../src/steps/validateInputs');
const { changeDirectory } = require('../src/steps/changeDirectory');
const { detectPackageManager } = require('../src/utils/packageManager');

describe('Domo Publish Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exec.exec.mockResolvedValue(0);
    exec.getExecOutput.mockResolvedValue({ stdout: '', stderr: '' });
    core.summary = mockSummary;
    Object.values(mockSummary).forEach((fn) => fn.mockClear());
  });

  describe('extractInstanceName', () => {
    test('strips https:// prefix', () => {
      expect(extractInstanceName('https://company.domo.com')).toBe(
        'company.domo.com',
      );
    });

    test('strips http:// prefix', () => {
      expect(extractInstanceName('http://company.domo.com')).toBe(
        'company.domo.com',
      );
    });

    test('strips trailing slash', () => {
      expect(extractInstanceName('https://company.domo.com/')).toBe(
        'company.domo.com',
      );
    });

    test('handles subdomains', () => {
      expect(extractInstanceName('https://sub.company.domo.com')).toBe(
        'sub.company.domo.com',
      );
    });
  });

  describe('validateInputs', () => {
    test('returns true for valid inputs', () => {
      expect(validateInputs('token-123', 'https://company.domo.com')).toBe(true);
    });

    test('fails when token is empty', () => {
      expect(validateInputs('', 'https://company.domo.com')).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith('Domo token is required for authentication.');
    });

    test('fails when instance URL is empty', () => {
      expect(validateInputs('token-123', '')).toBe(false);
      expect(core.setFailed).toHaveBeenCalled();
    });

    test('fails when instance URL does not end with .domo.com', () => {
      expect(validateInputs('token-123', 'https://not-domo.com')).toBe(false);
      expect(core.setFailed).toHaveBeenCalled();
    });

    test('rejects subdomain spoofing (evil-domo.com.attacker.com)', () => {
      expect(validateInputs('token-123', 'https://evil-domo.com.attacker.com')).toBe(false);
      expect(core.setFailed).toHaveBeenCalled();
    });

    test('accepts valid subdomain of .domo.com', () => {
      expect(validateInputs('token-123', 'https://test.domo.com')).toBe(true);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('accepts bare hostname without https prefix', () => {
      expect(validateInputs('token-123', 'company.domo.com')).toBe(true);
    });
  });

  describe('changeDirectory', () => {
    test('does not change directory when path is "."', () => {
      const spy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      changeDirectory('.');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test('changes directory for non-default paths', () => {
      const spy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      changeDirectory('./build');
      expect(spy).toHaveBeenCalledWith('./build');
      spy.mockRestore();
    });

    test('throws a descriptive error for invalid directory', () => {
      const spy = jest.spyOn(process, 'chdir').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      expect(() => changeDirectory('./nonexistent')).toThrow(
        /Working directory '\.\/nonexistent' does not exist/,
      );
      spy.mockRestore();
    });
  });

  describe('detectPackageManager', () => {
    let existsSyncSpy;

    beforeEach(() => {
      existsSyncSpy = jest.spyOn(fs, 'existsSync');
    });

    afterEach(() => {
      existsSyncSpy.mockRestore();
    });

    test('detects pnpm from lock file', () => {
      existsSyncSpy.mockImplementation(
        (file) => file === 'pnpm-lock.yaml',
      );
      expect(detectPackageManager()).toBe('pnpm');
    });

    test('detects yarn from lock file', () => {
      existsSyncSpy.mockImplementation((file) => file === 'yarn.lock');
      expect(detectPackageManager()).toBe('yarn');
    });

    test('detects npm from lock file', () => {
      existsSyncSpy.mockImplementation(
        (file) => file === 'package-lock.json',
      );
      expect(detectPackageManager()).toBe('npm');
    });

    test('defaults to npm when no lock file exists', () => {
      existsSyncSpy.mockReturnValue(false);
      expect(detectPackageManager()).toBe('npm');
    });

    test('pnpm takes priority over yarn and npm', () => {
      existsSyncSpy.mockReturnValue(true);
      expect(detectPackageManager()).toBe('pnpm');
    });
  });

  describe('Build Command Execution', () => {
    const { runBuild } = require('../src/steps/runBuild');

    test('skips when no build command provided', async () => {
      await runBuild('');
      expect(exec.exec).not.toHaveBeenCalled();
    });

    test('executes build command via bash', async () => {
      await runBuild('npm run build');
      expect(exec.exec).toHaveBeenCalledWith('bash', [
        '-c',
        'npm run build',
      ]);
    });

    test('throws on build failure', async () => {
      exec.exec.mockRejectedValue(new Error('build failed'));
      await expect(runBuild('npm run build')).rejects.toThrow('build failed');
      expect(core.setFailed).toHaveBeenCalled();
    });
  });

  describe('Domo Authentication', () => {
    const { authenticateWithDomo } = require('../src/utils/domoHelpers');

    test('calls domo auth login with instance and token', async () => {
      await authenticateWithDomo('my-token', 'https://company.domo.com');
      expect(exec.exec).toHaveBeenCalledWith('domo', [
        'auth', 'login', 'company.domo.com', '--token', 'my-token',
      ]);
    });
  });

  describe('Domo Publish', () => {
    const { publishApp } = require('../src/utils/domoHelpers');

    test('calls domo app publish for root publish dir', async () => {
      await publishApp('.', 'https://company.domo.com', '/workspace');
      expect(exec.getExecOutput).toHaveBeenCalledWith('domo', ['app', 'publish']);
    });

    test('passes --build-dir when publishDir is not "."', async () => {
      await publishApp('./dist', 'https://company.domo.com', '/workspace');
      expect(exec.getExecOutput).toHaveBeenCalledWith('domo', ['app', 'publish', '--build-dir', './dist']);
    });

    test('sets success outputs', async () => {
      await publishApp('./dist', 'https://company.domo.com', '/workspace');
      expect(core.setOutput).toHaveBeenCalledWith('deployment-status', 'success');
      expect(core.setOutput).toHaveBeenCalledWith('app-url', 'https://company.domo.com/app/./dist');
    });

    test('does not trigger new-design flow when output is a normal republish', async () => {
      exec.getExecOutput.mockResolvedValue({
        stdout: 'Published my-app to company.domo.com\nView in asset library: https://company.domo.com/assetlibrary?designId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });
      await publishApp('./dist', 'https://company.domo.com', '/workspace');
      expect(core.setOutput).not.toHaveBeenCalledWith('design-id', expect.any(String));
    });

    test('does not trigger new-design flow when uuid is missing from output', async () => {
      exec.getExecOutput.mockResolvedValue({
        stdout: 'Created design \nPublished my-app to company.domo.com',
      });
      await publishApp('./dist', 'https://company.domo.com', '/workspace');
      expect(core.setOutput).not.toHaveBeenCalledWith('design-id', expect.any(String));
    });
  });

  describe('findSourceManifest', () => {
    const { findSourceManifest } = require('../src/utils/domoHelpers');
    const path = require('path');
    let existsSyncSpy;

    beforeEach(() => {
      existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    afterEach(() => {
      existsSyncSpy.mockRestore();
    });

    test('returns root manifest.json when it exists', () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));
      expect(findSourceManifest('/workspace')).toBe(path.join('/workspace', 'manifest.json'));
    });

    test('falls back to public/manifest.json', () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'public', 'manifest.json'));
      expect(findSourceManifest('/workspace')).toBe(path.join('/workspace', 'public', 'manifest.json'));
    });

    test('falls back to src/manifest.json last', () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'src', 'manifest.json'));
      expect(findSourceManifest('/workspace')).toBe(path.join('/workspace', 'src', 'manifest.json'));
    });

    test('returns null when no manifest found', () => {
      existsSyncSpy.mockReturnValue(false);
      expect(findSourceManifest('/workspace')).toBeNull();
    });

    test('prefers root manifest.json over public/ when both exist', () => {
      existsSyncSpy.mockReturnValue(true);
      expect(findSourceManifest('/workspace')).toBe(path.join('/workspace', 'manifest.json'));
    });
  });

  describe('handleNewDesign — via publishApp', () => {
    const { publishApp } = require('../src/utils/domoHelpers');
    const path = require('path');

    const NEW_DESIGN_STDOUT =
      'Created design aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n' +
      'Published Test App to company.domo.com\n' +
      'View in asset library: https://company.domo.com/assetlibrary?designId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    let existsSyncSpy;
    let readFileSyncSpy;
    let writeFileSyncSpy;

    beforeEach(() => {
      exec.getExecOutput.mockResolvedValue({ stdout: NEW_DESIGN_STDOUT });
      existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ name: 'my-app' }));
      writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    });

    afterEach(() => {
      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
      writeFileSyncSpy.mockRestore();
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_SERVER_URL;
    });

    test('sets design-id output when new design detected', async () => {
      await publishApp('./dist', 'https://company.domo.com', '/workspace');
      expect(core.setOutput).toHaveBeenCalledWith(
        'design-id',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      );
    });

    test('writes id to manifest when manifest found, no token', async () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));

      await publishApp('./dist', 'https://company.domo.com', '/workspace');

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        path.join('/workspace', 'manifest.json'),
        expect.stringContaining('"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"'),
      );
      expect(exec.exec).not.toHaveBeenCalledWith('git', expect.arrayContaining(['commit']), expect.anything());
    });

    test('emits warning and summary when no token provided', async () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));

      await publishApp('./dist', 'https://company.domo.com', '/workspace');

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'));
      expect(mockSummary.write).toHaveBeenCalled();
    });

    test('skips file write when manifest not found, still emits output and warning', async () => {
      existsSyncSpy.mockReturnValue(false);

      await publishApp('./dist', 'https://company.domo.com', '/workspace');

      expect(writeFileSyncSpy).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('design-id', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(core.warning).toHaveBeenCalled();
      expect(mockSummary.write).toHaveBeenCalled();
    });

    test('opens a PR when github-token provided and git succeeds', async () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));
      process.env.GITHUB_REPOSITORY = 'org/repo';

      await publishApp('./dist', 'https://company.domo.com', '/workspace', 'gh-token-123');

      expect(mockCreateRef).toHaveBeenCalledWith(expect.objectContaining({
        owner: 'org', repo: 'repo', ref: 'refs/heads/chore/domo-design-id-aaaaaaaa',
      }));
      expect(mockCreateOrUpdateFile).toHaveBeenCalledWith(expect.objectContaining({
        owner: 'org', repo: 'repo', branch: 'chore/domo-design-id-aaaaaaaa',
      }));
      expect(mockCreatePR).toHaveBeenCalledWith(expect.objectContaining({
        owner: 'org', repo: 'repo', head: 'chore/domo-design-id-aaaaaaaa', base: 'main',
      }));
    });

    test('summary mentions PR when opened successfully', async () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));
      process.env.GITHUB_REPOSITORY = 'org/repo';

      await publishApp('./dist', 'https://company.domo.com', '/workspace', 'gh-token-123');

      const rawCall = mockSummary.addRaw.mock.calls.flat().join(' ');
      expect(rawCall).toMatch(/PR has been opened/i);
    });

    test('falls back gracefully when PR creation fails', async () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));
      process.env.GITHUB_REPOSITORY = 'org/repo';
      mockGetRef.mockRejectedValueOnce(new Error('API error'));

      await expect(
        publishApp('./dist', 'https://company.domo.com', '/workspace', 'gh-token-123'),
      ).resolves.not.toThrow();

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Could not open PR'));
    });

    test('no git exec calls when opening PR via API', async () => {
      existsSyncSpy.mockImplementation((p) => p === path.join('/workspace', 'manifest.json'));
      process.env.GITHUB_REPOSITORY = 'org/repo';

      await publishApp('./dist', 'https://company.domo.com', '/workspace', 'gh-token-123');

      const gitCalls = exec.exec.mock.calls.filter(([cmd]) => cmd === 'git');
      expect(gitCalls).toHaveLength(0);
    });
  });
});
