import { Router, Request, Response } from 'express';
import { YouTubeUploader, YouTubeUploaderConfig, AuthCallbacks } from '../services/YouTubeUploader';
import type { AppError, UploadMetadata, PrivacyStatus } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { DEFAULT_PRIVACY_STATUS } from '../../../shared/constants';

/**
 * Pending auth sessions: maps a session ID to its resolve/reject callbacks
 * so the frontend can POST the auth code once the user completes OAuth.
 */
interface PendingAuth {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
}

const pendingAuthSessions = new Map<string, PendingAuth>();
let sessionCounter = 0;

export function createUploadRouter(config: YouTubeUploaderConfig): Router {
  const router = Router();

  // Create a shared uploader instance with auth callbacks
  let currentAuthUrl: string | null = null;
  let currentSessionId: string | null = null;

  const authCallbacks: AuthCallbacks = {
    onAuthUrl: (url: string) => {
      currentAuthUrl = url;
    },
    getAuthCode: () => {
      return new Promise<string>((resolve, reject) => {
        const sessionId = `auth_${++sessionCounter}`;
        currentSessionId = sessionId;
        pendingAuthSessions.set(sessionId, { resolve, reject });
      });
    },
  };

  const uploader = new YouTubeUploader(config, authCallbacks);

  /**
   * POST /api/project/:id/upload
   * Uploads the project's compiled video to YouTube.
   * Body: { videoPath: string, metadata: UploadMetadata }
   */
  router.post('/:id/upload', async (req: Request, res: Response) => {
    try {
      const { videoPath, metadata } = req.body as {
        videoPath: string;
        metadata: Partial<UploadMetadata> & { title: string; description: string; tags: string[] };
      };

      // Validate required fields
      if (!videoPath) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'videoPath is required',
          service: 'YouTubeUploader',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      if (!metadata || !metadata.title) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'metadata with at least a title is required',
          service: 'YouTubeUploader',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      // Apply defaults
      const fullMetadata: UploadMetadata = {
        title: metadata.title,
        description: metadata.description || '',
        tags: metadata.tags || [],
        privacyStatus: (metadata.privacyStatus as PrivacyStatus) || DEFAULT_PRIVACY_STATUS,
        thumbnailPath: metadata.thumbnailPath || '',
      };

      // Check if authenticated; if not, initiate auth flow
      if (!uploader.isAuthenticated()) {
        // Start async authentication (non-blocking for the response)
        const authPromise = uploader.authenticate();

        // Return the auth URL so the frontend can redirect the user
        // Wait a short moment for the auth URL to be set
        await new Promise((resolve) => setTimeout(resolve, 50));

        if (currentAuthUrl) {
          res.status(401).json({
            code: ErrorCode.YOUTUBE_AUTH_ERROR,
            message: 'Authentication required. Please visit the auth URL and submit the code.',
            service: 'YouTubeUploader',
            retryable: true,
            details: {
              authUrl: currentAuthUrl,
              sessionId: currentSessionId,
            },
          });
          // Let the auth promise resolve/reject in the background
          authPromise.catch(() => {
            // Auth will timeout if user doesn't respond; that's fine
          });
          return;
        }
      }

      // Perform upload with progress tracking
      const result = await uploader.upload(videoPath, fullMetadata, (percent) => {
        // Progress is tracked via SSE or polling in a real app
        // For this endpoint we just complete when done
      });

      res.json(result);
    } catch (err) {
      if (isAppError(err)) {
        const statusCode = getStatusCode(err);
        res.status(statusCode).json(err);
        return;
      }

      const appError: AppError = {
        code: ErrorCode.YOUTUBE_UPLOAD_FAILED,
        message: err instanceof Error ? err.message : 'Upload failed',
        service: 'YouTubeUploader',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  /**
   * POST /api/upload/auth-callback
   * Receives the OAuth2 authorization code from the frontend after the user
   * completes the Google consent screen.
   * Body: { sessionId: string, code: string }
   */
  router.post('/auth-callback', async (req: Request, res: Response) => {
    try {
      const { sessionId, code } = req.body as { sessionId: string; code: string };

      if (!sessionId || !code) {
        res.status(400).json({
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'sessionId and code are required',
          service: 'YouTubeUploader',
          retryable: false,
        });
        return;
      }

      const pending = pendingAuthSessions.get(sessionId);
      if (!pending) {
        res.status(404).json({
          code: ErrorCode.YOUTUBE_AUTH_ERROR,
          message: 'No pending authentication session found for this sessionId',
          service: 'YouTubeUploader',
          retryable: false,
        });
        return;
      }

      // Resolve the pending auth with the code
      pending.resolve(code);
      pendingAuthSessions.delete(sessionId);

      res.json({ message: 'Authentication code received. Processing...' });
    } catch (err) {
      res.status(500).json({
        code: ErrorCode.YOUTUBE_AUTH_ERROR,
        message: err instanceof Error ? err.message : 'Auth callback failed',
        service: 'YouTubeUploader',
        retryable: true,
      });
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

function getStatusCode(error: AppError): number {
  switch (error.code) {
    case ErrorCode.YOUTUBE_AUTH_ERROR:
    case ErrorCode.YOUTUBE_AUTH_TIMEOUT:
      return 401;
    case ErrorCode.VALIDATION_MISSING_INPUTS:
    case ErrorCode.VALIDATION_INVALID_METADATA:
    case ErrorCode.YOUTUBE_UNSUPPORTED_FORMAT:
      return 400;
    default:
      return 500;
  }
}
