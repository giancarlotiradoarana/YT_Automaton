import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateVideoFormat, validateMetadata, YouTubeUploader } from './YouTubeUploader';
import type { UploadMetadata } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { UPLOAD_LIMITS, SUPPORTED_VIDEO_FORMATS } from '../../../shared/constants';

describe('YouTubeUploader', () => {
  describe('validateVideoFormat', () => {
    it('should accept all supported formats', () => {
      const supportedPaths = [
        'video.mp4',
        'video.mov',
        'video.avi',
        'video.wmv',
        'video.flv',
        'video.webm',
        'video.3gp',
      ];

      for (const videoPath of supportedPaths) {
        expect(validateVideoFormat(videoPath)).toBe(true);
      }
    });

    it('should accept formats case-insensitively', () => {
      expect(validateVideoFormat('video.MP4')).toBe(true);
      expect(validateVideoFormat('video.MoV')).toBe(true);
      expect(validateVideoFormat('video.WebM')).toBe(true);
    });

    it('should reject unsupported formats', () => {
      const unsupportedPaths = [
        'video.mkv',
        'video.gif',
        'video.txt',
        'video.mp3',
        'video.png',
        'video.jpg',
        'video.exe',
      ];

      for (const videoPath of unsupportedPaths) {
        expect(validateVideoFormat(videoPath)).toBe(false);
      }
    });

    it('should reject files with no extension', () => {
      expect(validateVideoFormat('video')).toBe(false);
    });

    it('should handle paths with directories', () => {
      expect(validateVideoFormat('/path/to/video.mp4')).toBe(true);
      expect(validateVideoFormat('C:\\Users\\video.webm')).toBe(true);
    });
  });

  describe('validateMetadata', () => {
    const validMetadata: UploadMetadata = {
      title: 'Test Video Title',
      description: 'A short description',
      tags: ['tag1', 'tag2'],
      privacyStatus: 'unlisted',
      thumbnailPath: '/path/to/thumb.jpg',
    };

    it('should return null for valid metadata', () => {
      expect(validateMetadata(validMetadata)).toBeNull();
    });

    it('should reject title exceeding 100 characters', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        title: 'a'.repeat(101),
      };
      const error = validateMetadata(metadata);
      expect(error).not.toBeNull();
      expect(error!.code).toBe(ErrorCode.VALIDATION_INVALID_METADATA);
      expect(error!.message).toContain('Title');
    });

    it('should accept title at exactly 100 characters', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        title: 'a'.repeat(100),
      };
      expect(validateMetadata(metadata)).toBeNull();
    });

    it('should reject description exceeding 5000 characters', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        description: 'a'.repeat(5001),
      };
      const error = validateMetadata(metadata);
      expect(error).not.toBeNull();
      expect(error!.code).toBe(ErrorCode.VALIDATION_INVALID_METADATA);
      expect(error!.message).toContain('Description');
    });

    it('should accept description at exactly 5000 characters', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        description: 'a'.repeat(5000),
      };
      expect(validateMetadata(metadata)).toBeNull();
    });

    it('should reject tags exceeding 500 total characters', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        tags: ['a'.repeat(250), 'b'.repeat(252)], // 250 + 1 (comma) + 252 = 503
      };
      const error = validateMetadata(metadata);
      expect(error).not.toBeNull();
      expect(error!.code).toBe(ErrorCode.VALIDATION_INVALID_METADATA);
      expect(error!.message).toContain('Tags');
    });

    it('should accept tags at exactly 500 total characters', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        tags: ['a'.repeat(250), 'b'.repeat(249)], // 250 + 1 (comma) + 249 = 500
      };
      expect(validateMetadata(metadata)).toBeNull();
    });

    it('should not be retryable', () => {
      const metadata: UploadMetadata = {
        ...validMetadata,
        title: 'a'.repeat(101),
      };
      const error = validateMetadata(metadata);
      expect(error!.retryable).toBe(false);
    });
  });

  describe('YouTubeUploader class', () => {
    let uploader: YouTubeUploader;
    let onAuthUrl: ReturnType<typeof vi.fn>;
    let getAuthCode: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onAuthUrl = vi.fn();
      getAuthCode = vi.fn();

      uploader = new YouTubeUploader(
        {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          redirectUri: 'http://localhost:3000/callback',
        },
        { onAuthUrl, getAuthCode }
      );

      // Override sleep to be instant
      uploader.setSleepFn(async () => {});
    });

    it('should not be authenticated initially', () => {
      expect(uploader.isAuthenticated()).toBe(false);
    });

    it('should throw auth error when uploading without authentication', async () => {
      try {
        await uploader.upload('video.mp4', {
          title: 'Test',
          description: 'desc',
          tags: [],
          privacyStatus: 'unlisted',
          thumbnailPath: '',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.YOUTUBE_AUTH_ERROR);
      }
    });

    it('should throw unsupported format error for invalid format', async () => {
      // Force authenticated state
      uploader.setCredentials({ access_token: 'test-token' });

      try {
        await uploader.upload('video.mkv', {
          title: 'Test',
          description: 'desc',
          tags: [],
          privacyStatus: 'unlisted',
          thumbnailPath: '',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.YOUTUBE_UNSUPPORTED_FORMAT);
        expect(err.retryable).toBe(false);
      }
    });

    it('should throw metadata validation error for invalid metadata', async () => {
      uploader.setCredentials({ access_token: 'test-token' });

      try {
        await uploader.upload('video.mp4', {
          title: 'a'.repeat(101),
          description: 'desc',
          tags: [],
          privacyStatus: 'unlisted',
          thumbnailPath: '',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.VALIDATION_INVALID_METADATA);
      }
    });

    it('should generate auth URL and wait for code during authentication', async () => {
      // Simulate the code being provided after a brief delay
      getAuthCode.mockResolvedValue('test-auth-code');

      // The getToken call will fail because it's hitting real Google
      // but we can verify the flow up to that point
      try {
        await uploader.authenticate();
      } catch {
        // Expected to fail at token exchange with fake credentials
      }

      expect(onAuthUrl).toHaveBeenCalledWith(expect.stringContaining('accounts.google.com'));
    });
  });
});
