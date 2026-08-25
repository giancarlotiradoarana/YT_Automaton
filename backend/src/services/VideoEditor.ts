import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import type {
  CompilationInputs,
  CompilationResult,
  ValidationResult,
  AppError,
} from 'shared/types';
import { ErrorCode } from 'shared/types';
import { FORMAT_CONSTRAINTS, VIDEO_ENCODING } from 'shared/constants';

export interface IVideoEditor {
  validateInputs(inputs: CompilationInputs): ValidationResult;
  compile(
    inputs: CompilationInputs,
    onProgress?: (percent: number) => void
  ): Promise<CompilationResult>;
}

/**
 * Calculates the display duration for each image based on audio duration and image count.
 * Each image displays for exactly (audioDuration / imageCount) seconds.
 */
export function calculateImageDuration(
  audioDurationSeconds: number,
  imageCount: number
): number {
  if (imageCount <= 0 || audioDurationSeconds <= 0) {
    return 0;
  }
  return audioDurationSeconds / imageCount;
}

/**
 * Parses FFmpeg stderr output to extract progress percentage.
 * FFmpeg reports progress via lines like: "time=00:01:23.45"
 * We compare this against the total duration to calculate percent.
 */
export function parseFFmpegProgress(
  stderrLine: string,
  totalDurationSeconds: number
): number | null {
  const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
  if (!timeMatch || totalDurationSeconds <= 0) {
    return null;
  }

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = parseInt(timeMatch[3], 10);
  const centis = parseInt(timeMatch[4], 10);
  const divisor = timeMatch[4].length === 3 ? 1000 : 100;

  const currentTime = hours * 3600 + minutes * 60 + seconds + centis / divisor;
  const percent = Math.min(100, Math.round((currentTime / totalDurationSeconds) * 100));
  return percent;
}

// FFmpeg path - use full path on Windows
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';

export class VideoEditor implements IVideoEditor {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'output', 'video');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Validates that all required compilation inputs are present.
   * Returns valid=true if at least 1 image, 1 audio path, and 1 subtitle path exist.
   * Otherwise returns valid=false with a list of missing input categories.
   */
  validateInputs(inputs: CompilationInputs): ValidationResult {
    const missingInputs: string[] = [];

    if (!inputs.images || inputs.images.length === 0) {
      missingInputs.push('images');
    }

    if (!inputs.audioPath || inputs.audioPath.trim() === '') {
      missingInputs.push('audio');
    }

    if (!inputs.subtitlePath || inputs.subtitlePath.trim() === '') {
      missingInputs.push('subtitles');
    }

    return {
      valid: missingInputs.length === 0,
      missingInputs,
    };
  }

  /**
   * Compiles images, audio, and subtitles into a final video using FFmpeg.
   *
   * Steps:
   * 1. Create images_list.txt with duration per image = audio_duration / num_images
   * 2. Run FFmpeg with -f concat to combine images with audio
   * 3. Add subtitle filter with styling appropriate for the video format
   *
   * @param inputs - The compilation inputs (images, audio, subtitles, format)
   * @param onProgress - Optional callback reporting rendering progress (0-100)
   */
  async compile(
    inputs: CompilationInputs,
    onProgress?: (percent: number) => void
  ): Promise<CompilationResult> {
    // Validate inputs first
    const validation = this.validateInputs(inputs);
    if (!validation.valid) {
      const error: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: `Missing required inputs: ${validation.missingInputs.join(', ')}`,
        service: 'VideoEditor',
        retryable: false,
        details: { missingInputs: validation.missingInputs },
      };
      throw error;
    }

    // Get audio duration - use provided duration or fallback to ffprobe
    let audioDuration = (inputs as any).audioDuration || 0;
    if (audioDuration <= 0) {
      try {
        audioDuration = await this.getAudioDuration(inputs.audioPath);
      } catch {
        audioDuration = 0;
      }
    }
    // Last resort: estimate from image count (8 seconds per image)
    if (audioDuration <= 0) {
      audioDuration = inputs.images.length * 8;
    }
    if (audioDuration <= 0) {
      const error: AppError = {
        code: ErrorCode.FFMPEG_PROCESS_ERROR,
        message: 'Could not determine audio duration',
        service: 'VideoEditor',
        retryable: true,
      };
      throw error;
    }

    const imageDuration = calculateImageDuration(audioDuration, inputs.images.length);
    const formatConfig = FORMAT_CONSTRAINTS[inputs.format];
    const { width, height } = formatConfig.resolution;
    const subtitleFontSize = formatConfig.subtitleFontSize;

    // Create images list file for FFmpeg concat demuxer
    const timestamp = Date.now();
    const imagesListPath = path.join(this.outputDir, `images_list_${timestamp}.txt`);
    const outputPath = path.join(this.outputDir, `output_${timestamp}.mp4`);

    // Build image/video list with durations for concat demuxer
    // Detect if inputs are video clips (.mp4) or static images
    const isVideoClips = inputs.images.some(img => 
      img.localPath.endsWith('.mp4') || img.localPath.endsWith('.webm')
    );

    let imagesListContent: string;
    if (isVideoClips) {
      // For video clips, just list them without duration (they have their own duration)
      imagesListContent = inputs.images
        .map((img) => {
          const filePath = path.resolve(img.localPath).replace(/\\/g, '/');
          return `file '${filePath}'`;
        })
        .join('\n');
    } else {
      // For static images, add duration per image
      imagesListContent = inputs.images
        .map((img) => {
          const filePath = path.resolve(img.localPath).replace(/\\/g, '/');
          return `file '${filePath}'\nduration ${imageDuration.toFixed(6)}`;
        })
        .join('\n');
      // Add last image again without duration (FFmpeg concat demuxer requirement)
      const lastImagePath = path
        .resolve(inputs.images[inputs.images.length - 1].localPath)
        .replace(/\\/g, '/');
      imagesListContent += `\nfile '${lastImagePath}'`;
    }

    writeFileSync(imagesListPath, imagesListContent, 'utf-8');

    // Build subtitle filter
    const subtitlePathNormalized = path
      .resolve(inputs.subtitlePath)
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:');

    const subtitleStyle = `FontSize=${subtitleFontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=${VIDEO_ENCODING.subtitleOutlineWidth},Alignment=2,MarginV=30`;

    // Video filter depends on input type
    let videoFilter: string;
    if (isVideoClips) {
      // For video clips, only add subtitles (clips already have correct resolution)
      videoFilter = `subtitles='${subtitlePathNormalized}':force_style='${subtitleStyle}'`;
    } else {
      // For static images: scale + pad + subtitles
      videoFilter = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        `subtitles='${subtitlePathNormalized}':force_style='${subtitleStyle}'`,
      ].join(',');
    }

    // Build FFmpeg command
    // -t ensures video matches audio duration exactly
    const ffmpegArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', imagesListPath,
      '-i', path.resolve(inputs.audioPath),
      '-t', audioDuration.toFixed(2),
      '-vf', videoFilter,
      '-c:v', VIDEO_ENCODING.codec,
      '-crf', String(VIDEO_ENCODING.crf),
      '-c:a', VIDEO_ENCODING.audioCodec,
      '-b:a', VIDEO_ENCODING.audioBitrate,
      '-pix_fmt', 'yuv420p',
      outputPath,
    ];

    // Execute FFmpeg as child process with progress parsing
    await this.executeFFmpeg(ffmpegArgs, audioDuration, onProgress);

    // Verify output file exists
    if (!existsSync(outputPath)) {
      const error: AppError = {
        code: ErrorCode.FFMPEG_PROCESS_ERROR,
        message: 'FFmpeg did not produce an output file',
        service: 'VideoEditor',
        retryable: true,
      };
      throw error;
    }

    const fileStats = statSync(outputPath);

    return {
      videoPath: outputPath,
      durationSeconds: audioDuration,
      fileSize: fileStats.size,
    };
  }

  /**
   * Executes FFmpeg as a child process and parses progress from stderr.
   */
  private executeFFmpeg(
    args: string[],
    totalDuration: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, args);
      let stderrOutput = '';

      ffmpeg.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrOutput += chunk;

        if (onProgress) {
          const percent = parseFFmpegProgress(chunk, totalDuration);
          if (percent !== null) {
            onProgress(percent);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          if (onProgress) {
            onProgress(100);
          }
          resolve();
        } else {
          const error: AppError = {
            code: ErrorCode.FFMPEG_PROCESS_ERROR,
            message: `FFmpeg exited with code ${code}`,
            service: 'VideoEditor',
            retryable: true,
            details: { exitCode: code, stderr: stderrOutput.slice(-2000) },
          };
          reject(error);
        }
      });

      ffmpeg.on('error', (err) => {
        const error: AppError = {
          code: ErrorCode.FFMPEG_PROCESS_ERROR,
          message: `Failed to spawn FFmpeg process: ${err.message}`,
          service: 'VideoEditor',
          retryable: true,
          details: { originalError: err.message },
        };
        reject(error);
      });
    });
  }

  /**
   * Gets audio duration using FFprobe.
   */
  private getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn(FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe'), [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        path.resolve(audioPath),
      ]);

      let stdout = '';
      let stderr = '';

      ffprobe.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(stdout.trim());
          resolve(isNaN(duration) ? 0 : duration);
        } else {
          resolve(0);
        }
      });

      ffprobe.on('error', () => {
        resolve(0);
      });
    });
  }
}
