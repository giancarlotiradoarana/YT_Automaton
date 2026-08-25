import { Router, Request, Response } from 'express';
import { ConfigManager } from '../services/ConfigManager';
import type { AppConfig, AppError } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';

export function createConfigRouter(configManager: ConfigManager): Router {
  const router = Router();

  /**
   * GET /api/config
   * Returns the current configuration.
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const config = configManager.getConfig();
      res.json(config);
    } catch (err) {
      const appError: AppError = {
        code: ErrorCode.OPENAI_API_ERROR,
        message: err instanceof Error ? err.message : 'Failed to get configuration',
        service: 'config',
        retryable: false,
      };
      res.status(500).json(appError);
    }
  });

  /**
   * PUT /api/config
   * Saves configuration to disk.
   */
  router.put('/', async (req: Request, res: Response) => {
    try {
      const config = req.body as AppConfig;

      // Basic validation
      if (!config || !config.apiKeys || !config.defaults || !config.paths) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'Invalid configuration: missing required fields (apiKeys, defaults, paths)',
          service: 'config',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      await configManager.save(config);
      res.json(config);
    } catch (err) {
      const appError: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: err instanceof Error ? err.message : 'Failed to save configuration',
        service: 'config',
        retryable: false,
      };
      res.status(500).json(appError);
    }
  });

  /**
   * POST /api/config/validate-keys
   * Validates the API keys by making test requests to OpenAI and YouTube.
   */
  router.post('/validate-keys', async (req: Request, res: Response) => {
    try {
      const config = req.body as AppConfig;

      if (!config?.apiKeys?.openai && !config?.apiKeys?.youtube) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_INVALID_API_KEY,
          message: 'No API keys provided for validation',
          service: 'config',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      const results = await configManager.validateKeys(config);

      // If either key is invalid, return with validation error indicator
      const allValid = results.openai.valid && results.youtube.valid;

      res.status(allValid ? 200 : 200).json({
        valid: allValid,
        openai: results.openai,
        youtube: results.youtube,
      });
    } catch (err) {
      const appError: AppError = {
        code: ErrorCode.VALIDATION_INVALID_API_KEY,
        message: err instanceof Error ? err.message : 'Failed to validate API keys',
        service: 'config',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  return router;
}
