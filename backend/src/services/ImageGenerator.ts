import * as fs from 'fs';
import * as path from 'path';
import { GeneratedImage, Script, VideoFormat, AppError, ErrorCode } from '../../../shared/types';
import { FORMAT_CONSTRAINTS, RETRY_CONFIG, TIMEOUTS } from '../../../shared/constants';

export interface IImageGenerator {
  generateForSection(
    visualDescription: string,
    sectionNumber: number,
    format: VideoFormat
  ): Promise<GeneratedImage>;

  generateAll(script: Script): Promise<GeneratedImage[]>;

  regenerate(
    sectionNumber: number,
    newPrompt: string,
    format: VideoFormat
  ): Promise<GeneratedImage>;
}

export interface ImageGenerationProgress {
  completed: number;
  total: number;
  currentSection: number;
}

export type ProgressCallback = (progress: ImageGenerationProgress) => void;

const QUALITY_MODIFIERS = 'ultra realistic, 8k UHD, DSLR quality, sharp focus, professional photography, cinematic lighting, hyper detailed, masterpiece';

function buildPollinationsUrl(prompt: string, width: number, height: number): string {
  const enhancedPrompt = `${prompt}, ${QUALITY_MODIFIERS}`;
  const encodedPrompt = encodeURIComponent(enhancedPrompt);
  const seed = Math.floor(Math.random() * 999999);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

function getResolution(format: VideoFormat): { width: number; height: number } {
  if (format === 'long_video') {
    return FORMAT_CONSTRAINTS.long_video.resolution;
  }
  return FORMAT_CONSTRAINTS.short.resolution;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ImageGenerator implements IImageGenerator {
  private outputDir: string;
  private _sleepFn: (ms: number) => Promise<void> = sleep;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'temp', 'images');
  }

  /** For testing: override the sleep function to avoid real delays */
  setSleepFn(fn: (ms: number) => Promise<void>): void {
    this._sleepFn = fn;
  }

  setOutputDir(dir: string): void {
    this.outputDir = dir;
  }

  async generateForSection(
    visualDescription: string,
    sectionNumber: number,
    format: VideoFormat
  ): Promise<GeneratedImage> {
    const { width, height } = getResolution(format);
    const prompt = visualDescription;
    const imageUrl = buildPollinationsUrl(prompt, width, height);

    const imageBuffer = await this.fetchImageWithRetry(imageUrl);
    const localPath = await this.saveImage(imageBuffer, sectionNumber);

    return {
      sectionNumber,
      imageUrl,
      localPath,
      prompt: `${prompt}, ${QUALITY_MODIFIERS}`,
    };
  }

  async generateAll(
    script: Script,
    onProgress?: ProgressCallback
  ): Promise<GeneratedImage[]> {
    const total = script.sections.length;
    const images: GeneratedImage[] = [];

    for (const section of script.sections) {
      if (onProgress) {
        onProgress({
          completed: images.length,
          total,
          currentSection: section.number,
        });
      }

      const image = await this.generateForSection(
        section.visualDescription,
        section.number,
        script.format
      );
      images.push(image);
    }

    if (onProgress) {
      onProgress({
        completed: images.length,
        total,
        currentSection: script.sections[script.sections.length - 1].number,
      });
    }

    return images;
  }

  async regenerate(
    sectionNumber: number,
    newPrompt: string,
    format: VideoFormat
  ): Promise<GeneratedImage> {
    return this.generateForSection(newPrompt, sectionNumber, format);
  }

  private async fetchImageWithRetry(url: string): Promise<Buffer> {
    const maxRetries = RETRY_CONFIG.pollinations.maxRetries;
    const delayMs = RETRY_CONFIG.pollinations.delayMs;
    const timeoutMs = TIMEOUTS.pollinationsImage;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const buffer = await fetchWithTimeout(url, timeoutMs);
        return buffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          await this._sleepFn(delayMs);
        }
      }
    }

    const appError: AppError = {
      code: lastError?.name === 'AbortError'
        ? ErrorCode.POLLINATIONS_TIMEOUT
        : ErrorCode.POLLINATIONS_GENERATION_FAILED,
      message: `Failed to generate image after ${maxRetries + 1} attempts: ${lastError?.message}`,
      service: 'pollinations',
      retryable: true,
      details: { url, lastError: lastError?.message },
    };

    throw appError;
  }

  private async saveImage(buffer: Buffer, sectionNumber: number): Promise<string> {
    await fs.promises.mkdir(this.outputDir, { recursive: true });

    const filename = `section_${sectionNumber}_${Date.now()}.png`;
    const filePath = path.join(this.outputDir, filename);

    await fs.promises.writeFile(filePath, buffer);

    return filePath;
  }
}

export const imageGenerator = new ImageGenerator();
