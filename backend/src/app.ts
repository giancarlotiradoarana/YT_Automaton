import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ConfigManager } from './services/ConfigManager';
import { PipelineController } from './services/PipelineController';
import { ImageGenerator } from './services/ImageGenerator';
import { VideoEditor } from './services/VideoEditor';
import { ThumbnailGenerator } from './services/ThumbnailGenerator';
import { createConfigRouter } from './routes/config';
import { createProjectRouter } from './routes/project';
import { createImagesRouter } from './routes/images';
import { createCompileRouter } from './routes/compile';
import { createClipsRouter } from './routes/clips';
import { createThumbnailRouter } from './routes/thumbnail';
import { createUploadRouter } from './routes/upload';
import trendsRouter from './routes/trends';
import scriptRouter from './routes/script';
import voiceRouter from './routes/voice';
import storyDemoRouter from './routes/story-demo';
import songRouter from './routes/song';
import type { AppError } from '../../shared/types';

/**
 * Content-Type validation middleware.
 * Rejects POST/PUT requests that lack a proper Content-Type header.
 */
function validateContentType(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.headers['content-type'];
    if (!contentType) {
      const error: AppError = {
        code: 'VALIDATION_MISSING_INPUTS',
        message: 'Content-Type header is required for POST/PUT requests',
        service: 'server',
        retryable: false,
      };
      res.status(400).json(error);
      return;
    }
  }
  next();
}

/**
 * Global error handling middleware.
 * Catches unhandled errors and returns them in the AppError format.
 */
function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    const statusCode = err.code.includes('VALIDATION') ? 400 : 500;
    res.status(statusCode).json(err);
    return;
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  const appError: AppError = {
    code: 'INTERNAL_ERROR',
    message,
    service: 'server',
    retryable: false,
  };
  res.status(500).json(appError);
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

export async function createApp(configPath?: string) {
  const app = express();

  // Global middleware
  app.use(cors());
  app.use(express.json());
  app.use(validateContentType);

  // Serve generated files (audio, images, video) as static
  const path = require('path');
  const os = require('os');
  // Serve all backend output and temp files
  app.use('/api/files', express.static(path.join(__dirname, '..', 'output')));
  app.use('/api/files', express.static(path.join(__dirname, '..', 'temp')));
  app.use('/api/files', express.static(path.join(process.cwd(), 'output')));
  app.use('/api/files', express.static(path.join(process.cwd(), 'temp')));
  app.use('/api/files', express.static(path.join(process.cwd(), 'backend', 'output')));
  app.use('/api/files', express.static(path.join(process.cwd(), 'backend', 'temp')));
  app.use('/api/files/songs', express.static(path.join(process.cwd(), 'temp', 'songs')));
  app.use('/api/files/songs', express.static('C:\\ytvideos'));

  // ─── Initialize Services ───────────────────────────────────────────────────

  const configManager = new ConfigManager(configPath);
  await configManager.load();

  const pipelineController = new PipelineController();
  const imageGenerator = new ImageGenerator();
  const videoEditor = new VideoEditor();
  const thumbnailGenerator = new ThumbnailGenerator();

  // YouTubeUploader config from environment
  const uploaderConfig = {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3001/api/auth/callback',
  };

  // ─── Routes ────────────────────────────────────────────────────────────────

  // Factory-function routes (receive service instances)
  app.use('/api/config', createConfigRouter(configManager));
  app.use('/api/project', createProjectRouter(pipelineController));
  app.use('/api/project', createImagesRouter(imageGenerator));
  app.use('/api/project', createCompileRouter(videoEditor));
  app.use('/api/project', createClipsRouter());
  app.use('/api/project', createThumbnailRouter(thumbnailGenerator));
  app.use('/api/project', createUploadRouter(uploaderConfig));

  // Direct-export routes (self-contained routers)
  app.use('/api/trends', trendsRouter);
  app.use('/api/story', storyDemoRouter);
  app.use('/api/song', songRouter);
  app.use(scriptRouter); // script.ts defines full paths internally: /api/project/:id/script
  app.use('/api', voiceRouter); // voice.ts defines: /voices/:language and /project/:id/voice

  // ─── Error Handling ────────────────────────────────────────────────────────

  app.use(errorHandler);

  return { app, configManager };
}
