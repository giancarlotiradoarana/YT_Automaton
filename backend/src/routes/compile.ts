import { Router, Request, Response } from 'express';
import { VideoEditor } from '../services/VideoEditor';
import type { AppError, CompilationInputs } from 'shared/types';
import { ErrorCode } from 'shared/types';

export function createCompileRouter(videoEditor: VideoEditor): Router {
  const router = Router();

  /**
   * POST /api/project/:id/compile
   * Compiles images, audio, and subtitles into a final video.
   * Body: { images, audioPath, subtitlePath, format }
   */
  router.post('/:id/compile', async (req: Request, res: Response) => {
    try {
      const { images, audioPath, subtitlePath, format, audioDuration } = req.body as CompilationInputs & { audioDuration?: number };

      const inputs: any = {
        images: images || [],
        audioPath: audioPath || '',
        subtitlePath: subtitlePath || '',
        format: format || 'long_video',
        audioDuration: audioDuration || 0,
      };

      // Validate inputs before starting compilation
      const validation = videoEditor.validateInputs(inputs);
      if (!validation.valid) {
        const error: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: `Missing required inputs for video compilation: ${validation.missingInputs.join(', ')}`,
          service: 'VideoEditor',
          retryable: false,
          details: { missingInputs: validation.missingInputs },
        };
        res.status(400).json(error);
        return;
      }

      if (format !== 'short' && format !== 'long_video') {
        const error: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A valid format (short or long_video) is required',
          service: 'VideoEditor',
          retryable: false,
        };
        res.status(400).json(error);
        return;
      }

      // Compile the video (progress tracking would use SSE or WebSocket in production)
      const result = await videoEditor.compile(inputs);

      res.json({
        projectId: req.params.id,
        ...result,
      });
    } catch (err) {
      if (isAppError(err)) {
        const statusCode = err.code === ErrorCode.VALIDATION_MISSING_INPUTS ? 400 : 500;
        res.status(statusCode).json(err);
        return;
      }

      const appError: AppError = {
        code: ErrorCode.FFMPEG_PROCESS_ERROR,
        message: err instanceof Error ? err.message : 'Video compilation failed',
        service: 'VideoEditor',
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
