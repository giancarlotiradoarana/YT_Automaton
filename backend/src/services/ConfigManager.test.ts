import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager, getDefaultConfig } from './ConfigManager';
import type { AppConfig } from '../../../shared/types';

describe('ConfigManager', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getDefaultConfig', () => {
    it('should return default config with region MX', () => {
      const config = getDefaultConfig();
      expect(config.defaults.region).toBe('MX');
      expect(config.apiKeys.openai).toBe('');
      expect(config.apiKeys.youtube).toBe('');
    });

    it('should set default output and temp directories', () => {
      const config = getDefaultConfig();
      expect(config.paths.outputDir).toContain('.youtube-automation');
      expect(config.paths.tempDir).toContain('.youtube-automation');
    });
  });

  describe('load', () => {
    it('should return defaults when config file does not exist', async () => {
      const manager = new ConfigManager(configPath);
      const config = await manager.load();
      expect(config.defaults.region).toBe('MX');
      expect(config.apiKeys.openai).toBe('');
    });

    it('should load config from an existing JSON file', async () => {
      const testConfig: AppConfig = {
        apiKeys: { openai: 'test-openai-key', youtube: 'test-youtube-key' },
        defaults: { region: 'US', niche: 'tech' },
        paths: { outputDir: '/tmp/out', tempDir: '/tmp/tmp' },
      };
      fs.writeFileSync(configPath, JSON.stringify(testConfig), 'utf-8');

      const manager = new ConfigManager(configPath);
      const config = await manager.load();
      expect(config.apiKeys.openai).toBe('test-openai-key');
      expect(config.apiKeys.youtube).toBe('test-youtube-key');
      expect(config.defaults.region).toBe('US');
      expect(config.defaults.niche).toBe('tech');
      expect(config.paths.outputDir).toBe('/tmp/out');
    });

    it('should return defaults when config file has invalid JSON', async () => {
      fs.writeFileSync(configPath, 'not valid json{{{', 'utf-8');

      const manager = new ConfigManager(configPath);
      const config = await manager.load();
      expect(config.defaults.region).toBe('MX');
    });

    it('should merge partial config with defaults', async () => {
      const partial = { apiKeys: { openai: 'key123', youtube: '' } };
      fs.writeFileSync(configPath, JSON.stringify(partial), 'utf-8');

      const manager = new ConfigManager(configPath);
      const config = await manager.load();
      expect(config.apiKeys.openai).toBe('key123');
      expect(config.defaults.region).toBe('MX');
      expect(config.paths.outputDir).toContain('.youtube-automation');
    });
  });

  describe('save', () => {
    it('should persist config to disk as JSON', async () => {
      const manager = new ConfigManager(configPath);
      const config: AppConfig = {
        apiKeys: { openai: 'sk-saved', youtube: 'yt-saved' },
        defaults: { region: 'ES' },
        paths: { outputDir: '/out', tempDir: '/tmp' },
      };

      await manager.save(config);

      const raw = fs.readFileSync(configPath, 'utf-8');
      const loaded = JSON.parse(raw);
      expect(loaded.apiKeys.openai).toBe('sk-saved');
      expect(loaded.defaults.region).toBe('ES');
    });

    it('should create directories if they do not exist', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'deep', 'config.json');
      const manager = new ConfigManager(nestedPath);

      await manager.save(getDefaultConfig());

      expect(fs.existsSync(nestedPath)).toBe(true);
    });

    it('should update in-memory config after save', async () => {
      const manager = new ConfigManager(configPath);
      const config: AppConfig = {
        apiKeys: { openai: 'new-key', youtube: 'yt-key' },
        defaults: { region: 'AR' },
        paths: { outputDir: '/o', tempDir: '/t' },
      };

      await manager.save(config);
      expect(manager.getConfig().defaults.region).toBe('AR');
    });
  });

  describe('validateOpenAIKey', () => {
    it('should return valid:true when fetch succeeds with 200', async () => {
      const manager = new ConfigManager(configPath);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      }));

      const result = await manager.validateOpenAIKey('sk-valid');
      expect(result.valid).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should return valid:false when fetch returns 401', async () => {
      const manager = new ConfigManager(configPath);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid key' } }),
      }));

      const result = await manager.validateOpenAIKey('sk-bad');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid key');

      vi.unstubAllGlobals();
    });

    it('should return valid:false on network error', async () => {
      const manager = new ConfigManager(configPath);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const result = await manager.validateOpenAIKey('sk-any');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');

      vi.unstubAllGlobals();
    });
  });

  describe('validateYouTubeKey', () => {
    it('should return valid:true when fetch succeeds with 200', async () => {
      const manager = new ConfigManager(configPath);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      }));

      const result = await manager.validateYouTubeKey('yt-valid');
      expect(result.valid).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should return valid:false when YouTube returns 403', async () => {
      const manager = new ConfigManager(configPath);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { message: 'Forbidden' } }),
      }));

      const result = await manager.validateYouTubeKey('yt-bad');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Forbidden');

      vi.unstubAllGlobals();
    });

    it('should return valid:false on network error', async () => {
      const manager = new ConfigManager(configPath);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS lookup failed')));

      const result = await manager.validateYouTubeKey('yt-any');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DNS lookup failed');

      vi.unstubAllGlobals();
    });
  });

  describe('validateKeys', () => {
    it('should validate both keys concurrently', async () => {
      const manager = new ConfigManager(configPath);
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        callCount++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }));

      const config: AppConfig = {
        apiKeys: { openai: 'sk-test', youtube: 'yt-test' },
        defaults: { region: 'MX' },
        paths: { outputDir: '/o', tempDir: '/t' },
      };

      const results = await manager.validateKeys(config);
      expect(results.openai.valid).toBe(true);
      expect(results.youtube.valid).toBe(true);
      expect(callCount).toBe(2);

      vi.unstubAllGlobals();
    });
  });
});
