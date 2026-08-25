import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImageGenerator } from '../services/ImageGenerator';
import type { AppError, Script, VideoFormat } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';

function saveImagesToProject(projectId: string, images: any[]) {
  const projectsPath = path.join(os.homedir(), '.youtube-automation', 'projects');
  const statePath = path.join(projectsPath, projectId, 'state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.images = images;
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}

export function createImagesRouter(imageGenerator: ImageGenerator): Router {
  const router = Router();

  /**
   * POST /api/project/:id/images
   * Generates images for all sections of the confirmed script.
   * Expects the script and format in the request body.
   */
  router.post('/:id/images', async (req: Request, res: Response) => {
    try {
      const { script } = req.body as { script: Script };

      if (!script || !script.sections || script.sections.length === 0) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A valid script with at least one section is required',
          service: 'image_generator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      if (!script.format) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'Script must include a format (short or long_video)',
          service: 'image_generator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      // Set the output directory based on project ID
      const projectId = req.params.id;
      const outputDir = `temp/projects/${projectId}/images`;
      imageGenerator.setOutputDir(outputDir);

      const images = await imageGenerator.generateAll(script);

      // Persist images in project state
      saveImagesToProject(projectId, images);

      res.json({
        projectId,
        images,
        total: images.length,
      });
    } catch (err) {
      if (isAppError(err)) {
        res.status(500).json(err);
        return;
      }

      const appError: AppError = {
        code: ErrorCode.POLLINATIONS_GENERATION_FAILED,
        message: err instanceof Error ? err.message : 'Failed to generate images',
        service: 'image_generator',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  /**
   * POST /api/project/:id/images/:section/regenerate
   * Regenerates a single section's image with a new or modified prompt.
   * Expects newPrompt and format in the request body.
   */
  router.post('/:id/images/:section/regenerate', async (req: Request, res: Response) => {
    try {
      const { newPrompt, format } = req.body as { newPrompt: string; format: VideoFormat };
      const sectionNumber = parseInt(req.params.section, 10);

      if (isNaN(sectionNumber) || sectionNumber < 1) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A valid section number is required (must be >= 1)',
          service: 'image_generator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      if (!newPrompt || newPrompt.trim().length === 0) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A non-empty newPrompt is required for regeneration',
          service: 'image_generator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      if (!format || (format !== 'short' && format !== 'long_video')) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A valid format (short or long_video) is required',
          service: 'image_generator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      // Set the output directory based on project ID
      const projectId = req.params.id;
      const outputDir = `temp/projects/${projectId}/images`;
      imageGenerator.setOutputDir(outputDir);

      const image = await imageGenerator.regenerate(sectionNumber, newPrompt, format);

      // Persist the regenerated image in the project state
      const projectsPath = path.join(os.homedir(), '.youtube-automation', 'projects');
      const statePath = path.join(projectsPath, projectId, 'state.json');
      if (fs.existsSync(statePath)) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        if (!state.images) state.images = [];
        const existingIdx = state.images.findIndex((img: any) => img.sectionNumber === sectionNumber);
        if (existingIdx >= 0) {
          state.images[existingIdx] = image;
        } else {
          state.images.push(image);
        }
        state.updatedAt = new Date().toISOString();
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
      }

      res.json({
        projectId,
        image,
      });
    } catch (err) {
      if (isAppError(err)) {
        res.status(500).json(err);
        return;
      }

      const appError: AppError = {
        code: ErrorCode.POLLINATIONS_GENERATION_FAILED,
        message: err instanceof Error ? err.message : 'Failed to regenerate image',
        service: 'image_generator',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  /**
   * POST /api/project/:id/save-images
   * Persists the generated images array in the project state.
   */
  router.post('/:id/save-images', async (req: Request, res: Response) => {
    try {
      const { images } = req.body as { images: any[] };
      const projectId = req.params.id;
      if (images && images.length > 0) {
        saveImagesToProject(projectId, images);
      }
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
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
