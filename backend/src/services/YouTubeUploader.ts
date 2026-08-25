import * as fs from 'fs';
import * as path from 'path';
import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import {
  UploadMetadata,
  UploadResult,
  PrivacyStatus,
  AppError,
  ErrorCode,
} from '../../../shared/types';
import {
  UPLOAD_LIMITS,
  SUPPORTED_VIDEO_FORMATS,
  RETRY_CONFIG,
  TIMEOUTS,
  DEFAULT_PRIVACY_STATUS,
} from '../../../shared/constants';

export interface IYouTubeUploader {
  authenticate(): Promise<void>;
  upload(
    videoPath: string,
    metadata: UploadMetadata,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult>;
}

export interface YouTubeUploaderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AuthCallbacks {
  /** Called with the URL the user must visit to authorize */
  onAuthUrl: (url: string) => void;
  /** Called to get the authorization code from the user */
  getAuthCode: () => Promise<string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates the video file format against YouTube-supported formats.
 * Returns true if the format is supported.
 */
export function validateVideoFormat(videoPath: string): boolean {
  const ext = path.extname(videoPath).toLowerCase().replace('.', '');
  return (SUPPORTED_VIDEO_FORMATS as readonly string[]).includes(ext);
}

/**
 * Validates upload metadata against character limits.
 * Returns an AppError if validation fails, null if valid.
 */
export function validateMetadata(metadata: UploadMetadata): AppError | null {
  if (metadata.title.length > UPLOAD_LIMITS.titleMaxChars) {
    return {
      code: ErrorCode.VALIDATION_INVALID_METADATA,
      message: `Title exceeds maximum of ${UPLOAD_LIMITS.titleMaxChars} characters (got ${metadata.title.length})`,
      service: 'YouTubeUploader',
      retryable: false,
    };
  }

  if (metadata.description.length > UPLOAD_LIMITS.descriptionMaxChars) {
    return {
      code: ErrorCode.VALIDATION_INVALID_METADATA,
      message: `Description exceeds maximum of ${UPLOAD_LIMITS.descriptionMaxChars} characters (got ${metadata.description.length})`,
      service: 'YouTubeUploader',
      retryable: false,
    };
  }

  const totalTagsChars = metadata.tags.join(',').length;
  if (totalTagsChars > UPLOAD_LIMITS.tagsMaxTotalChars) {
    return {
      code: ErrorCode.VALIDATION_INVALID_METADATA,
      message: `Tags total exceeds maximum of ${UPLOAD_LIMITS.tagsMaxTotalChars} characters (got ${totalTagsChars})`,
      service: 'YouTubeUploader',
      retryable: false,
    };
  }

  return null;
}

/**
 * Determines if an error is a network-related error (retryable).
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('socket hang up') ||
      message.includes('network') ||
      message.includes('fetch failed') ||
      message.includes('aborted')
    );
  }
  return false;
}

export class YouTubeUploader implements IYouTubeUploader {
  private oauth2Client: OAuth2Client;
  private config: YouTubeUploaderConfig;
  private authCallbacks: AuthCallbacks;
  private authenticated = false;
  private _sleepFn: (ms: number) => Promise<void> = sleep;

  constructor(config: YouTubeUploaderConfig, authCallbacks: AuthCallbacks) {
    this.config = config;
    this.authCallbacks = authCallbacks;
    this.oauth2Client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  /** For testing: override the sleep function to avoid real delays */
  setSleepFn(fn: (ms: number) => Promise<void>): void {
    this._sleepFn = fn;
  }

  /** Check if the client is currently authenticated */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Authenticate with YouTube using OAuth2.
   * Generates an auth URL for the user, waits for the authorization code,
   * and exchanges it for tokens. Times out after 60 seconds.
   */
  async authenticate(): Promise<void> {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube.upload'],
    });

    // Notify the caller of the URL
    this.authCallbacks.onAuthUrl(authUrl);

    // Wait for the authorization code with a 60-second timeout
    const codePromise = this.authCallbacks.getAuthCode();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(createAppError(
          ErrorCode.YOUTUBE_AUTH_TIMEOUT,
          'OAuth2 authentication timed out after 60 seconds',
          false
        ));
      }, TIMEOUTS.youtubeOAuth);
    });

    let code: string;
    try {
      code = await Promise.race([codePromise, timeoutPromise]);
    } catch (error) {
      if (isAppError(error)) {
        throw error;
      }
      throw createAppError(
        ErrorCode.YOUTUBE_AUTH_ERROR,
        error instanceof Error ? error.message : 'Authentication failed',
        true
      );
    }

    // Exchange code for tokens
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.authenticated = true;
    } catch (error) {
      throw createAppError(
        ErrorCode.YOUTUBE_AUTH_ERROR,
        error instanceof Error ? error.message : 'Failed to exchange authorization code for tokens',
        true
      );
    }
  }

  /**
   * Set credentials directly (for refresh token reuse).
   */
  setCredentials(tokens: { access_token?: string; refresh_token?: string }): void {
    this.oauth2Client.setCredentials(tokens);
    this.authenticated = true;
  }

  /**
   * Upload a video to YouTube with metadata and progress tracking.
   * Validates format and metadata before uploading.
   * Retries on network errors with exponential backoff (2s, 4s, 8s).
   */
  async upload(
    videoPath: string,
    metadata: UploadMetadata,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> {
    // Validate video format (before any other checks)
    if (!validateVideoFormat(videoPath)) {
      throw createAppError(
        ErrorCode.YOUTUBE_UNSUPPORTED_FORMAT,
        `Unsupported video format. Accepted formats: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`,
        false
      );
    }

    // Validate metadata
    const metadataError = validateMetadata(metadata);
    if (metadataError) {
      throw metadataError;
    }

    // Check authentication
    if (!this.authenticated) {
      throw createAppError(
        ErrorCode.YOUTUBE_AUTH_ERROR,
        'Not authenticated. Please authenticate before uploading.',
        true
      );
    }

    // Validate file exists (after auth check, since we need auth to upload)
    if (!fs.existsSync(videoPath)) {
      throw createAppError(
        ErrorCode.YOUTUBE_UPLOAD_FAILED,
        `Video file not found: ${videoPath}`,
        false
      );
    }

    // Apply default privacy status if not specified
    const privacyStatus: PrivacyStatus = metadata.privacyStatus || DEFAULT_PRIVACY_STATUS;

    // Perform upload with retry logic
    return this.uploadWithRetry(videoPath, { ...metadata, privacyStatus }, onProgress);
  }

  private async uploadWithRetry(
    videoPath: string,
    metadata: UploadMetadata,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> {
    const maxRetries = RETRY_CONFIG.youtubeUpload.maxRetries;
    const baseDelay = RETRY_CONFIG.youtubeUpload.baseDelayMs;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.performUpload(videoPath, metadata, onProgress);
      } catch (error) {
        lastError = error;

        // If it's an auth error, don't retry — prompt re-auth
        if (isAppError(error) && error.code === ErrorCode.YOUTUBE_AUTH_ERROR) {
          throw error;
        }

        // Only retry on network errors
        if (!isNetworkError(error) && !isRetryableApiError(error)) {
          throw isAppError(error)
            ? error
            : createAppError(
                ErrorCode.YOUTUBE_UPLOAD_FAILED,
                error instanceof Error ? error.message : 'Upload failed',
                false
              );
        }

        // If we have retries remaining, wait with exponential backoff
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s
          await this._sleepFn(delay);
        }
      }
    }

    // All retries exhausted
    throw createAppError(
      ErrorCode.YOUTUBE_UPLOAD_FAILED,
      `Upload failed after ${maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
      true,
      { attempts: maxRetries + 1 }
    );
  }

  private async performUpload(
    videoPath: string,
    metadata: UploadMetadata,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> {
    const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

    const fileSize = fs.statSync(videoPath).size;
    const fileStream = fs.createReadStream(videoPath);

    try {
      const response = await youtube.videos.insert(
        {
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: metadata.title,
              description: metadata.description,
              tags: metadata.tags,
            },
            status: {
              privacyStatus: metadata.privacyStatus,
            },
          },
          media: {
            body: fileStream,
          },
        },
        {
          onUploadProgress: (evt: { bytesRead: number }) => {
            if (onProgress && fileSize > 0) {
              const percent = Math.round((evt.bytesRead / fileSize) * 100);
              onProgress(percent);
            }
          },
        }
      );

      const videoId = response.data.id;
      if (!videoId) {
        throw createAppError(
          ErrorCode.YOUTUBE_UPLOAD_FAILED,
          'Upload completed but no video ID was returned',
          true
        );
      }

      // Upload thumbnail if provided
      if (metadata.thumbnailPath && fs.existsSync(metadata.thumbnailPath)) {
        try {
          await youtube.thumbnails.set({
            videoId,
            media: {
              body: fs.createReadStream(metadata.thumbnailPath),
            },
          });
        } catch {
          // Thumbnail upload failure is non-critical, video was uploaded successfully
        }
      }

      return {
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (error) {
      // Check if it's an authentication error
      if (isAuthError(error)) {
        throw createAppError(
          ErrorCode.YOUTUBE_AUTH_ERROR,
          'Authentication expired or invalid. Please re-authenticate.',
          true
        );
      }
      throw error;
    }
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function createAppError(
  code: ErrorCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>
): AppError {
  return {
    code,
    message,
    service: 'YouTubeUploader',
    retryable,
    details,
  };
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

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid_grant') ||
      message.includes('token has been expired') ||
      message.includes('unauthorized') ||
      message.includes('401')
    );
  }
  return false;
}

function isRetryableApiError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('rate limit')
    );
  }
  return false;
}
