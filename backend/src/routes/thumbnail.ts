import { Router, Request, Response } from 'express';
import { ThumbnailGenerator } from '../services/ThumbnailGenerator';
import type { AppError, TopicSuggestion } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';

export function createThumbnailRouter(thumbnailGenerator: ThumbnailGenerator): Router {
  const router = Router();

  /**
   * POST /api/project/:id/thumbnail
   * Generates a thumbnail for the project using OpenAI for prompt creation
   * and Pollinations.ai for image generation.
   * Body: { title: string, topic: TopicSuggestion }
   */
  router.post('/:id/thumbnail', async (req: Request, res: Response) => {
    try {
      const { title, topic } = req.body as { title: string; topic: TopicSuggestion };

      if (!title || title.trim().length === 0) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A non-empty title is required for thumbnail generation',
          service: 'ThumbnailGenerator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      if (!topic || !topic.title) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A valid topic with at least a title is required',
          service: 'ThumbnailGenerator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      // Set output directory based on project ID
      const projectId = req.params.id;
      const outputDir = `temp/projects/${projectId}/thumbnails`;
      thumbnailGenerator.setOutputDir(outputDir);

      const result = await thumbnailGenerator.generate(title, topic);

      // Convert local path to a URL the frontend can access
      const normalizedPath = result.imagePath.replace(/\\/g, '/');
      const tempIndex = normalizedPath.indexOf('/temp/');
      const relativePath = tempIndex >= 0 
        ? normalizedPath.substring(tempIndex + 6)  // removes everything up to and including '/temp/'
        : normalizedPath.split('/').slice(-4).join('/');
      
      res.json({
        projectId,
        ...result,
        imagePath: `/api/files/${relativePath}`,
      });
    } catch (err) {
      if (isAppError(err)) {
        const status = err.code === ErrorCode.VALIDATION_MISSING_INPUTS ? 400 : 500;
        res.status(status).json(err);
        return;
      }

      const appError: AppError = {
        code: ErrorCode.POLLINATIONS_GENERATION_FAILED,
        message: err instanceof Error ? err.message : 'Failed to generate thumbnail',
        service: 'ThumbnailGenerator',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  /**
   * POST /api/project/:id/thumbnail/regenerate
   * Regenerates a thumbnail with a user-adjusted prompt.
   * Body: { adjustedPrompt: string }
   */
  router.post('/:id/thumbnail/regenerate', async (req: Request, res: Response) => {
    try {
      const { adjustedPrompt } = req.body as { adjustedPrompt: string };

      if (!adjustedPrompt || adjustedPrompt.trim().length === 0) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A non-empty adjustedPrompt is required for thumbnail regeneration',
          service: 'ThumbnailGenerator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      // Set output directory based on project ID
      const projectId = req.params.id;
      const outputDir = `temp/projects/${projectId}/thumbnails`;
      thumbnailGenerator.setOutputDir(outputDir);

      const result = await thumbnailGenerator.regenerate(adjustedPrompt);

      res.json({
        projectId,
        ...result,
      });
    } catch (err) {
      if (isAppError(err)) {
        const status = err.code === ErrorCode.VALIDATION_MISSING_INPUTS ? 400 : 500;
        res.status(status).json(err);
        return;
      }

      const appError: AppError = {
        code: ErrorCode.POLLINATIONS_GENERATION_FAILED,
        message: err instanceof Error ? err.message : 'Failed to regenerate thumbnail',
        service: 'ThumbnailGenerator',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  return router;
}

function isAppError(err: unknown): err is AppError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    'service' in err &&
    'retryable' in err
  );
}
