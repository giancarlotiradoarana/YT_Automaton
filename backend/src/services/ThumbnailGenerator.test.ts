import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ThumbnailGenerator } from './ThumbnailGenerator';
import type { TopicSuggestion } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { THUMBNAIL_RESOLUTION, THUMBNAIL_LIMITS } from '../../../shared/constants';

const mockTopic: TopicSuggestion = {
  title: 'Los 10 mejores gadgets de 2024',
  description: 'Revisión de los gadgets más innovadores del año',
  tags: ['tecnología', 'gadgets', '2024'],
  viralScore: 8,
  recommendedFormat: 'long_video',
  reasoning: 'Tema con alto interés y búsqueda constante',
};

const mockOpenAIResponse = {
  imagePrompt: 'A vibrant display of futuristic gadgets with neon lighting, high contrast colors, no text',
  overlayText: ['TOP', 'GADGETS'],
};

describe('ThumbnailGenerator', () => {
  let generator: ThumbnailGenerator;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), 'temp', 'test-thumbnails', `${Date.now()}`);
    generator = new ThumbnailGenerator('test-api-key', tempDir);
    generator.setSleepFn(async () => {}); // No-op sleep for tests
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('generate', () => {
    it('should generate a thumbnail with prompt and overlay text', async () => {
      const fakeImageBuffer = Buffer.from('fake-image-data');

      generator.setOpenAIFn(async () => mockOpenAIResponse);
      generator.setFetchImageFn(async () => fakeImageBuffer);

      const result = await generator.generate('Test Video Title', mockTopic);

      expect(result.imagePath).toContain('thumbnail_');
      expect(result.imagePath).toContain('.png');
      expect(result.prompt).toBe(mockOpenAIResponse.imagePrompt);
      expect(result.suggestedOverlayText).toEqual(['TOP', 'GADGETS']);
    });

    it('should enforce overlay text word limit of 4 words', async () => {
      const responseWithLongOverlay = {
        imagePrompt: 'A colorful scene with gadgets',
        overlayText: ['BEST', 'TECH', 'GADGETS', 'OF', 'THE', 'YEAR'],
      };

      generator.setOpenAIFn(async () => responseWithLongOverlay);
      generator.setFetchImageFn(async () => Buffer.from('fake'));

      const result = await generator.generate('Title', mockTopic);

      expect(result.suggestedOverlayText.length).toBeLessThanOrEqual(THUMBNAIL_LIMITS.overlayMaxWords);
    });

    it('should handle empty overlay text from OpenAI', async () => {
      const responseNoOverlay = {
        imagePrompt: 'A cool scene',
        overlayText: [],
      };

      generator.setOpenAIFn(async () => responseNoOverlay);
      generator.setFetchImageFn(async () => Buffer.from('fake'));

      const result = await generator.generate('Title', mockTopic);

      expect(result.suggestedOverlayText).toEqual([]);
    });

    it('should save the image to disk', async () => {
      const fakeImageBuffer = Buffer.from('fake-image-content');

      generator.setOpenAIFn(async () => mockOpenAIResponse);
      generator.setFetchImageFn(async () => fakeImageBuffer);

      const result = await generator.generate('Title', mockTopic);

      const fileExists = await fs.promises.access(result.imagePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const content = await fs.promises.readFile(result.imagePath);
      expect(content.toString()).toBe('fake-image-content');
    });

    it('should throw AppError on OpenAI failure', async () => {
      generator.setOpenAIFn(async () => {
        throw { 
          code: ErrorCode.OPENAI_API_ERROR,
          message: 'API key invalid',
          service: 'ThumbnailGenerator',
          retryable: false,
        };
      });

      await expect(generator.generate('Title', mockTopic)).rejects.toMatchObject({
        code: ErrorCode.OPENAI_API_ERROR,
      });
    });

    it('should throw AppError on Pollinations failure after retries', async () => {
      generator.setOpenAIFn(async () => mockOpenAIResponse);
      generator.setFetchImageFn(async () => {
        throw new Error('Network error');
      });

      await expect(generator.generate('Title', mockTopic)).rejects.toMatchObject({
        code: ErrorCode.POLLINATIONS_GENERATION_FAILED,
        retryable: true,
      });
    });

    it('should use correct Pollinations URL format with 1280x720', async () => {
      let capturedUrl = '';

      generator.setOpenAIFn(async () => mockOpenAIResponse);
      generator.setFetchImageFn(async (url: string) => {
        capturedUrl = url;
        return Buffer.from('fake');
      });

      await generator.generate('Title', mockTopic);

      expect(capturedUrl).toContain(`width=${THUMBNAIL_RESOLUTION.width}`);
      expect(capturedUrl).toContain(`height=${THUMBNAIL_RESOLUTION.height}`);
      expect(capturedUrl).toContain('nologo=true');
      expect(capturedUrl).toContain('https://image.pollinations.ai/prompt/');
    });
  });

  describe('regenerate', () => {
    it('should regenerate thumbnail with adjusted prompt', async () => {
      const fakeImageBuffer = Buffer.from('regenerated-image');
      generator.setFetchImageFn(async () => fakeImageBuffer);

      const adjustedPrompt = 'A bright and colorful tech gadgets display with blue neon';
      const result = await generator.regenerate(adjustedPrompt);

      expect(result.prompt).toBe(adjustedPrompt);
      expect(result.imagePath).toContain('thumbnail_');
      expect(result.suggestedOverlayText).toEqual([]);
    });

    it('should save regenerated image to disk', async () => {
      const fakeImageBuffer = Buffer.from('new-image-data');
      generator.setFetchImageFn(async () => fakeImageBuffer);

      const result = await generator.regenerate('new prompt');

      const fileExists = await fs.promises.access(result.imagePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should throw on Pollinations failure during regeneration', async () => {
      generator.setFetchImageFn(async () => {
        throw new Error('Timeout');
      });

      await expect(generator.regenerate('some prompt')).rejects.toMatchObject({
        code: ErrorCode.POLLINATIONS_GENERATION_FAILED,
        retryable: true,
      });
    });
  });
});
