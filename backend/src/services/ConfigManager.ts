import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppConfig, AppError } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { DEFAULT_REGION } from '../../../shared/constants';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.youtube-automation');
const DEFAULT_CONFIG_FILE = 'config.json';

export function getDefaultConfig(): AppConfig {
  return {
    apiKeys: {
      openai: '',
      youtube: '',
    },
    defaults: {
      region: DEFAULT_REGION,
    },
    paths: {
      outputDir: path.join(os.homedir(), '.youtube-automation', 'output'),
      tempDir: path.join(os.homedir(), '.youtube-automation', 'temp'),
    },
  };
}

export class ConfigManager {
  private configPath: string;
  private config: AppConfig;

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.join(DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE);
    this.config = getDefaultConfig();
  }

  /**
   * Load configuration from disk. If the file doesn't exist, use defaults.
   */
  async load(): Promise<AppConfig> {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as AppConfig;
        this.config = this.mergeWithDefaults(parsed);
      } else {
        this.config = getDefaultConfig();
      }
    } catch {
      this.config = getDefaultConfig();
    }
    return this.config;
  }

  /**
   * Save configuration to disk (creates directories as needed).
   */
  async save(config: AppConfig): Promise<void> {
    this.config = config;
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Get the current in-memory configuration.
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Validate the OpenAI API key by making a test request to /v1/models.
   */
  async validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        return { valid: true };
      }

      const body = await response.json().catch(() => ({}));
      const message = (body as Record<string, unknown>)?.error
        ? String((body as { error: { message?: string } }).error?.message ?? 'Invalid API key')
        : `HTTP ${response.status}`;

      return { valid: false, error: message };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Network error validating OpenAI key',
      };
    }
  }

  /**
   * Validate the YouTube API key by making a test request to the videos endpoint.
   */
  async validateYouTubeKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=1&key=${apiKey}`;
      const response = await fetch(url, { method: 'GET' });

      if (response.ok) {
        return { valid: true };
      }

      const body = await response.json().catch(() => ({}));
      const errorInfo = (body as { error?: { message?: string } })?.error;
      const message = errorInfo?.message ?? `HTTP ${response.status}`;

      return { valid: false, error: message };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Network error validating YouTube key',
      };
    }
  }

  /**
   * Validate both API keys and return results.
   */
  async validateKeys(config: AppConfig): Promise<{
    openai: { valid: boolean; error?: string };
    youtube: { valid: boolean; error?: string };
  }> {
    const [openai, youtube] = await Promise.all([
      this.validateOpenAIKey(config.apiKeys.openai),
      this.validateYouTubeKey(config.apiKeys.youtube),
    ]);
    return { openai, youtube };
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist.
   */
  private mergeWithDefaults(loaded: Partial<AppConfig>): AppConfig {
    const defaults = getDefaultConfig();
    return {
      apiKeys: {
        openai: loaded.apiKeys?.openai ?? defaults.apiKeys.openai,
        youtube: loaded.apiKeys?.youtube ?? defaults.apiKeys.youtube,
      },
      defaults: {
        region: loaded.defaults?.region ?? defaults.defaults.region,
        niche: loaded.defaults?.niche,
        voice: loaded.defaults?.voice,
        format: loaded.defaults?.format,
      },
      paths: {
        outputDir: loaded.paths?.outputDir ?? defaults.paths.outputDir,
        tempDir: loaded.paths?.tempDir ?? defaults.paths.tempDir,
      },
    };
  }
}
