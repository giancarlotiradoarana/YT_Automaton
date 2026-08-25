import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImageGenerator } from './ImageGenerator';
import type { Script, VideoFormat } from '../../../shared/types';
import { FORMAT_CONSTRAINTS, RETRY_CONFIG, TIMEOUTS } from '../../../shared/constants';

describe('ImageGenerator', () => {
  let tempDir: string;
  let generator: ImageGenerator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imggen-test-'));
    generator = new ImageGenerator(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createMockFetch(imageBuffer?: Buffer) {
    const buffer = imageBuffer || Buffer.from('fake-png-data');
    return vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      )),
    });
  }

  function createMockScript(format: VideoFormat, sectionCount: number = 3): Script {
    const sections = Array.from({ length: sectionCount }, (_, i) => ({
      number: i + 1,
      title: `Section ${i + 1}`,
      narration: `Narration for section ${i + 1}`,
      visualDescription: `A beautiful landscape scene ${i + 1}`,
    }));

    return {
      hook: 'Test hook',
      introduction: 'Test intro',
      sections,
      closingCTA: 'Subscribe!',
      format,
      totalWordCount: 200,
      metadata: {
        topic: 'Test',
        generatedAt: new Date().toISOString(),
        language: 'es',
      },
    };
  }

  describe('generateForSection', () => {
    it('should generate an image for a section and save to disk', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const result = await generator.generateForSection(
        'A futuristic city skyline',
        1,
        'long_video'
      );

      expect(result.sectionNumber).toBe(1);
      expect(result.prompt).toContain('A futuristic city skyline');
      expect(result.prompt).toContain('high quality, 4k, cinematic, photorealistic');
      expect(result.localPath).toContain('section_1_');
      expect(fs.existsSync(result.localPath)).toBe(true);
    });

    it('should use 1920x1080 resolution for long_video format', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      await generator.generateForSection('test prompt', 1, 'long_video');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('width=1920');
      expect(calledUrl).toContain('height=1080');
    });

    it('should use 1080x1920 resolution for short format', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      await generator.generateForSection('test prompt', 1, 'short');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('width=1080');
      expect(calledUrl).toContain('height=1920');
    });

    it('should include nologo=true in the URL', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      await generator.generateForSection('test', 1, 'short');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('nologo=true');
    });

    it('should include quality modifiers in the prompt', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      await generator.generateForSection('sunset over mountains', 2, 'long_video');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const decodedUrl = decodeURIComponent(calledUrl);
      expect(decodedUrl).toContain('high quality, 4k, cinematic, photorealistic');
    });

    it('should encode the prompt in the URL', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      await generator.generateForSection('a scene with spaces & special chars', 1, 'short');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      // URL should not contain unencoded spaces
      expect(calledUrl).not.toContain(' ');
      expect(calledUrl).toContain('image.pollinations.ai/prompt/');
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      // Use instant sleep for retry tests to avoid real delays
      generator.setSleepFn(() => Promise.resolve());
    });

    it('should retry up to 3 times on failure', async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'))
        .mockRejectedValueOnce(new Error('Network error 3'))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('data').buffer),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await generator.generateForSection('test', 1, 'short');

      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 original + 3 retries
      expect(result.sectionNumber).toBe(1);
    });

    it('should throw AppError after all retries exhausted', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Persistent failure'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        generator.generateForSection('test', 1, 'short')
      ).rejects.toMatchObject({
        code: 'POLLINATIONS_GENERATION_FAILED',
        service: 'pollinations',
        retryable: true,
      });

      // 1 original + 3 retries = 4 total attempts
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should throw timeout error when fetch times out', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const mockFetch = vi.fn().mockRejectedValue(abortError);
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        generator.generateForSection('test', 1, 'long_video')
      ).rejects.toMatchObject({
        code: 'POLLINATIONS_TIMEOUT',
        service: 'pollinations',
        retryable: true,
      });
    });

    it('should succeed on second attempt after first failure', async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('image-data').buffer),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await generator.generateForSection('test', 1, 'short');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.sectionNumber).toBe(1);
    });

    it('should throw when HTTP response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        generator.generateForSection('test', 1, 'short')
      ).rejects.toMatchObject({
        code: 'POLLINATIONS_GENERATION_FAILED',
        service: 'pollinations',
        retryable: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should call sleep with 5-second delay between retries', async () => {
      const sleepCalls: number[] = [];
      generator.setSleepFn(async (ms) => { sleepCalls.push(ms); });

      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('err1'))
        .mockRejectedValueOnce(new Error('err2'))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('ok').buffer),
        });
      vi.stubGlobal('fetch', mockFetch);

      await generator.generateForSection('test', 1, 'short');

      // Should have slept twice (after 1st and 2nd failures, not after 3rd success)
      expect(sleepCalls).toEqual([5000, 5000]);
    });
  });

  describe('generateAll', () => {
    it('should generate images for all sections in a script', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const script = createMockScript('long_video', 3);
      const images = await generator.generateAll(script);

      expect(images).toHaveLength(3);
      expect(images[0].sectionNumber).toBe(1);
      expect(images[1].sectionNumber).toBe(2);
      expect(images[2].sectionNumber).toBe(3);
    });

    it('should track progress for each section', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const script = createMockScript('short', 3);
      const progressUpdates: Array<{ completed: number; total: number }> = [];

      await generator.generateAll(script, (progress) => {
        progressUpdates.push({ completed: progress.completed, total: progress.total });
      });

      // Should have progress updates: before each section + final
      expect(progressUpdates.length).toBe(4);
      expect(progressUpdates[0]).toEqual({ completed: 0, total: 3 });
      expect(progressUpdates[1]).toEqual({ completed: 1, total: 3 });
      expect(progressUpdates[2]).toEqual({ completed: 2, total: 3 });
      expect(progressUpdates[3]).toEqual({ completed: 3, total: 3 });
    });

    it('should use the correct format resolution for all images', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const script = createMockScript('short', 2);
      await generator.generateAll(script);

      for (const call of mockFetch.mock.calls) {
        const url = call[0] as string;
        expect(url).toContain('width=1080');
        expect(url).toContain('height=1920');
      }
    });

    it('should save each image to disk', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const script = createMockScript('long_video', 2);
      const images = await generator.generateAll(script);

      for (const img of images) {
        expect(fs.existsSync(img.localPath)).toBe(true);
      }
    });
  });

  describe('regenerate', () => {
    it('should generate an image with the new prompt', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const result = await generator.regenerate(2, 'A new custom prompt', 'long_video');

      expect(result.sectionNumber).toBe(2);
      expect(result.prompt).toContain('A new custom prompt');
      expect(result.prompt).toContain('high quality, 4k, cinematic, photorealistic');
    });

    it('should use the correct resolution for the specified format', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      await generator.regenerate(1, 'test', 'short');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('width=1080');
      expect(calledUrl).toContain('height=1920');
    });

    it('should save the regenerated image to disk', async () => {
      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const result = await generator.regenerate(3, 'regenerated prompt', 'long_video');

      expect(fs.existsSync(result.localPath)).toBe(true);
    });
  });

  describe('setOutputDir', () => {
    it('should update the output directory for subsequent images', async () => {
      const newDir = path.join(tempDir, 'custom-output');
      generator.setOutputDir(newDir);

      const mockFetch = createMockFetch();
      vi.stubGlobal('fetch', mockFetch);

      const result = await generator.generateForSection('test', 1, 'short');

      expect(result.localPath).toContain('custom-output');
      expect(fs.existsSync(result.localPath)).toBe(true);
    });
  });
});
