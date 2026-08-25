import * as fs from 'fs';
import * as path from 'path';
import { ThumbnailResult, TopicSuggestion, AppError, ErrorCode } from '../../../shared/types';
import { THUMBNAIL_RESOLUTION, THUMBNAIL_LIMITS, TIMEOUTS, RETRY_CONFIG } from '../../../shared/constants';

export interface IThumbnailGenerator {
  generate(title: string, topic: TopicSuggestion): Promise<ThumbnailResult>;
  regenerate(adjustedPrompt: string): Promise<ThumbnailResult>;
}

interface OpenAIThumbnailResponse {
  imagePrompt: string;
  overlayText: string[];
}

function buildPollinationsUrl(prompt: string, width: number, height: number): string {
  const encodedPrompt = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;
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

export class ThumbnailGenerator implements IThumbnailGenerator {
  private outputDir: string;
  private openaiApiKey: string;
  private _sleepFn: (ms: number) => Promise<void> = sleep;
  private _fetchImageFn: (url: string, timeoutMs: number) => Promise<Buffer> = fetchWithTimeout;
  private _callOpenAI: (title: string, topic: TopicSuggestion) => Promise<OpenAIThumbnailResponse>;

  constructor(openaiApiKey?: string, outputDir?: string) {
    this.openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY || '';
    this.outputDir = outputDir || path.join(process.cwd(), 'temp', 'thumbnails');
    this._callOpenAI = this._defaultCallOpenAI.bind(this);
  }

  /** For testing: override the sleep function */
  setSleepFn(fn: (ms: number) => Promise<void>): void {
    this._sleepFn = fn;
  }

  /** For testing: override the image fetch function */
  setFetchImageFn(fn: (url: string, timeoutMs: number) => Promise<Buffer>): void {
    this._fetchImageFn = fn;
  }

  /** For testing: override the OpenAI call */
  setOpenAIFn(fn: (title: string, topic: TopicSuggestion) => Promise<OpenAIThumbnailResponse>): void {
    this._callOpenAI = fn;
  }

  setOutputDir(dir: string): void {
    this.outputDir = dir;
  }

  async generate(title: string, topic: TopicSuggestion): Promise<ThumbnailResult> {
    // Step 1: Use OpenAI to generate a thumbnail prompt and overlay text
    const openaiResponse = await this._callOpenAI(title, topic);

    // Enforce overlay text word limit
    const overlayText = openaiResponse.overlayText
      .join(' ')
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .slice(0, THUMBNAIL_LIMITS.overlayMaxWords);

    // Step 2: Generate the thumbnail image via Pollinations
    const imagePrompt = openaiResponse.imagePrompt;
    const imageBuffer = await this.fetchThumbnailWithRetry(imagePrompt);

    // Step 3: Save base image to disk
    const baseImagePath = await this.saveImage(imageBuffer);

    // Step 4: Burn text overlay onto the image with FFmpeg (big, bold, eye-catching)
    const textToOverlay = overlayText.join(' ').toUpperCase();
    let finalImagePath = baseImagePath;
    
    if (textToOverlay.length > 0) {
      try {
        finalImagePath = await this.addTextOverlay(baseImagePath, textToOverlay);
      } catch {
        // If FFmpeg fails, use the base image without text
        finalImagePath = baseImagePath;
      }
    }

    return {
      imagePath: finalImagePath,
      prompt: imagePrompt,
      suggestedOverlayText: overlayText,
    };
  }

  /**
   * Burns eye-catching text overlay onto the thumbnail using FFmpeg.
   * Large white bold text with black stroke and drop shadow.
   */
  private async addTextOverlay(imagePath: string, text: string): Promise<string> {
    const { execSync } = require('child_process');
    const FFMPEG_PATH = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';
    
    const outputPath = imagePath.replace('.png', '_text.png');
    const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    
    // Draw text at the BOTTOM - white bold with red stroke (MrBeast style)
    // Reduce font size to fit and limit text to max 2 words
    const shortText = text.split(' ').slice(0, 2).join(' ');
    const escapedShort = shortText.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    
    const drawTextFilter = [
      // Dark gradient at bottom
      `drawbox=x=0:y=ih-ih/4:w=iw:h=ih/4:color=black@0.7:t=fill`,
      // Shadow
      `drawtext=text='${escapedShort}':fontsize=56:fontcolor=black:x=(w-text_w)/2+3:y=h-h/5+3:fontfile='C\\:/Windows/Fonts/impact.ttf'`,
      // Main text
      `drawtext=text='${escapedShort}':fontsize=56:fontcolor=white:borderw=5:bordercolor=red:x=(w-text_w)/2:y=h-h/5:fontfile='C\\:/Windows/Fonts/impact.ttf'`,
    ].join(',');

    const cmd = `"${FFMPEG_PATH}" -y -i "${imagePath}" -vf "${drawTextFilter}" "${outputPath}"`;
    
    execSync(cmd, { timeout: 30000 });
    
    if (fs.existsSync(outputPath)) {
      return outputPath;
    }
    return imagePath;
  }

  async regenerate(adjustedPrompt: string): Promise<ThumbnailResult> {
    // Generate the thumbnail with the user-adjusted prompt
    const imageBuffer = await this.fetchThumbnailWithRetry(adjustedPrompt);
    const imagePath = await this.saveImage(imageBuffer);

    return {
      imagePath,
      prompt: adjustedPrompt,
      suggestedOverlayText: [],
    };
  }

  private async _defaultCallOpenAI(
    title: string,
    topic: TopicSuggestion
  ): Promise<OpenAIThumbnailResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.openaiScript);

    const systemPrompt = `Eres un disenador profesional de miniaturas de YouTube. Genera un prompt para crear una miniatura SUPER PROFESIONAL y sugiere texto overlay en ESPANOL.

REGLAS para el prompt de imagen:
- La imagen NO debe contener NINGUN texto, letra o numero
- Usa colores VIBRANTES y saturados con ALTO CONTRASTE
- Estilo cinematografico: iluminacion dramatica, composicion profesional
- La imagen debe transmitir emocion y captar atencion inmediata
- Incluye detalles visuales especificos: objetos, fondos, iluminacion, composicion
- Piensa en miniaturas de canales con millones de suscriptores

REGLAS para el texto overlay:
- Sugiere MAXIMO 3-4 palabras EN ESPANOL que se pondran encima de la miniatura
- Las palabras deben generar CURIOSIDAD y ser IMPACTANTES
- Usa palabras que provoquen clicks: INCREIBLE, SECRETO, TOP, NUNCA, etc.
- SIEMPRE en espanol

Responde en formato JSON:
{
  "imagePrompt": "descripcion detallada de la imagen sin texto, cinematografica, profesional...",
  "overlayText": ["PALABRA1", "PALABRA2", "PALABRA3"]
}`;

    const userMessage = `Titulo del video: "${title}"
Tema: ${topic.title}
Descripcion: ${topic.description}
Tags: ${topic.tags.join(', ')}
Idioma: Espanol`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI returned empty content');
      }

      const parsed = JSON.parse(content) as OpenAIThumbnailResponse;

      if (!parsed.imagePrompt) {
        throw new Error('OpenAI response missing imagePrompt field');
      }

      // Ensure overlayText is an array
      if (!Array.isArray(parsed.overlayText)) {
        parsed.overlayText = [];
      }

      return parsed;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const appError: AppError = {
          code: ErrorCode.OPENAI_TIMEOUT,
          message: 'OpenAI request timed out after 60 seconds',
          service: 'ThumbnailGenerator',
          retryable: false,
        };
        throw appError;
      }

      const appError: AppError = {
        code: ErrorCode.OPENAI_API_ERROR,
        message: error instanceof Error ? error.message : 'Failed to generate thumbnail prompt',
        service: 'ThumbnailGenerator',
        retryable: false,
        details: { title, topic: topic.title },
      };
      throw appError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchThumbnailWithRetry(prompt: string): Promise<Buffer> {
    const { width, height } = THUMBNAIL_RESOLUTION;
    const url = buildPollinationsUrl(prompt, width, height);
    const maxRetries = RETRY_CONFIG.pollinations.maxRetries;
    const delayMs = RETRY_CONFIG.pollinations.delayMs;
    const timeoutMs = TIMEOUTS.pollinationsImage;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const buffer = await this._fetchImageFn(url, timeoutMs);
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
      message: `Failed to generate thumbnail after ${maxRetries + 1} attempts: ${lastError?.message}`,
      service: 'ThumbnailGenerator',
      retryable: true,
      details: { prompt, lastError: lastError?.message },
    };

    throw appError;
  }

  private async saveImage(buffer: Buffer): Promise<string> {
    await fs.promises.mkdir(this.outputDir, { recursive: true });

    const filename = `thumbnail_${Date.now()}.png`;
    const filePath = path.join(this.outputDir, filename);

    await fs.promises.writeFile(filePath, buffer);

    return filePath;
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
