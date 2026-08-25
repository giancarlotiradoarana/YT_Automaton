import { Router, Request, Response } from 'express';
import { PipelineController } from '../services/PipelineController';
import type { TopicSuggestion, VideoFormat } from '../../../shared/types';

export function createProjectRouter(controller: PipelineController): Router {
  const router = Router();

  // POST /api/project — creates a new project
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { topic, format } = req.body as { topic: TopicSuggestion; format: VideoFormat };

      if (!topic || !format) {
        return res.status(400).json({
          code: 'VALIDATION_MISSING_INPUTS',
          message: 'Missing required fields: topic and format',
          service: 'ProjectRouter',
          retryable: false,
        });
      }

      if (format !== 'short' && format !== 'long_video') {
        return res.status(400).json({
          code: 'VALIDATION_MISSING_INPUTS',
          message: 'Invalid format: must be "short" or "long_video"',
          service: 'ProjectRouter',
          retryable: false,
        });
      }

      const state = await controller.createProject(topic, format);
      return res.status(201).json(state);
    } catch (err: any) {
      return res.status(500).json({
        code: err.code ?? 'UNKNOWN_ERROR',
        message: err.message ?? 'Internal server error',
        service: 'ProjectRouter',
        retryable: false,
      });
    }
  });

  // GET /api/project/:id — gets project state
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const state = await controller.getState(id);
      return res.status(200).json(state);
    } catch (err: any) {
      if (err.code === 'VALIDATION_MISSING_INPUTS' && err.message?.includes('not found')) {
        return res.status(404).json(err);
      }
      return res.status(500).json({
        code: err.code ?? 'UNKNOWN_ERROR',
        message: err.message ?? 'Internal server error',
        service: 'ProjectRouter',
        retryable: false,
      });
    }
  });

  return router;
}
