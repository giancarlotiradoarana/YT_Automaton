import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import express from 'express';
import { createConfigRouter } from './config';
import { ConfigManager } from '../services/ConfigManager';
import type { AppConfig } from '../../../shared/types';

// Simple request helper using the app directly
async function makeRequest(app: express.Express, method: string, url: string, body?: unknown) {
  // We'll use a lightweight approach: just call the handler directly via supertest-like logic
  // Since we don't have supertest installed, we'll test the router logic via the ConfigManager
  // and trust Express routing. For a full integration test, let's test with a real server.
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      fetch(`${baseUrl}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          resolve({ status: res.status, body: json });
          server.close();
        })
        .catch((err) => {
          resolve({ status: 500, body: { error: err.message } });
          server.close();
        });
    });
  });
}

describe('Config REST Endpoints', () => {
  let tempDir: string;
  let configPath: string;
  let app: express.Express;
  let configManager: ConfigManager;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-route-test-'));
    configPath = path.join(tempDir, 'config.json');
    configManager = new ConfigManager(configPath);
    await configManager.load();

    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(configManager));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /api/config', () => {
    it('should return current configuration', async () => {
      const res = await makeRequest(app, 'GET', '/api/config');
      expect(res.status).toBe(200);
      const config = res.body as AppConfig;
      expect(config.defaults.region).toBe('MX');
      expect(config.apiKeys.openai).toBe('');
    });

    it('should return saved configuration', async () => {
      const newConfig: AppConfig = {
        apiKeys: { openai: 'sk-123', youtube: 'yt-456' },
        defaults: { region: 'ES' },
        paths: { outputDir: '/out', tempDir: '/tmp' },
      };
      await configManager.save(newConfig);

      const res = await makeRequest(app, 'GET', '/api/config');
      expect(res.status).toBe(200);
      const config = res.body as AppConfig;
      expect(config.apiKeys.openai).toBe('sk-123');
      expect(config.defaults.region).toBe('ES');
    });
  });

  describe('PUT /api/config', () => {
    it('should save valid configuration', async () => {
      const newConfig: AppConfig = {
        apiKeys: { openai: 'sk-new', youtube: 'yt-new' },
        defaults: { region: 'AR', niche: 'tech' },
        paths: { outputDir: '/output', tempDir: '/temp' },
      };

      const res = await makeRequest(app, 'PUT', '/api/config', newConfig);
      expect(res.status).toBe(200);

      // Verify it was persisted
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw);
      expect(saved.apiKeys.openai).toBe('sk-new');
      expect(saved.defaults.region).toBe('AR');
    });

    it('should return 400 for invalid config (missing fields)', async () => {
      const res = await makeRequest(app, 'PUT', '/api/config', { foo: 'bar' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/config/validate-keys', () => {
    it('should return validation results for both keys', async () => {
      // Mock the ConfigManager's validate methods directly
      vi.spyOn(configManager, 'validateKeys').mockResolvedValue({
        openai: { valid: true },
        youtube: { valid: true },
      });

      const config: AppConfig = {
        apiKeys: { openai: 'sk-valid', youtube: 'yt-valid' },
        defaults: { region: 'MX' },
        paths: { outputDir: '/o', tempDir: '/t' },
      };

      const res = await makeRequest(app, 'POST', '/api/config/validate-keys', config);
      expect(res.status).toBe(200);
      const body = res.body as { valid: boolean; openai: { valid: boolean }; youtube: { valid: boolean } };
      expect(body.valid).toBe(true);
      expect(body.openai.valid).toBe(true);
      expect(body.youtube.valid).toBe(true);
    });

    it('should return 400 when no API keys provided', async () => {
      const res = await makeRequest(app, 'POST', '/api/config/validate-keys', {
        apiKeys: { openai: '', youtube: '' },
        defaults: { region: 'MX' },
        paths: { outputDir: '/o', tempDir: '/t' },
      });
      expect(res.status).toBe(400);
    });
  });
});
