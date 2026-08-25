import * as fs from 'fs';
import * as path from 'path';
import type { Script, VideoFormat, AppError } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { FORMAT_CONSTRAINTS } from '../../../shared/constants';

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || '';

export interface VideoClip {
  sectionNumber: number;
  clipPath: string;
  durationSeconds: number;
  prompt: string;
}

/**
 * Generates AI video clips using Pollinations Video API.
 * Each section of the script gets a unique video clip.
 */
export class VideoClipGenerator {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'temp', 'clips');
  }

  setOutputDir(dir: string) {
    this.outputDir = dir;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate video clips for all sections.
   * Total duration of all clips = audioDuration.
   */
  async generateAll(
    script: Script,
    totalAudioDuration: number,
    onProgress?: (completed: number, total: number) => void
  ): Promise<VideoClip[]> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const clips: VideoClip[] = [];
    const total = script.sections.length;
    const clipsPerSection = 3; // 3 different clips per section for dynamic feel
    const clipDuration = Math.ceil(totalAudioDuration / (total * clipsPerSection));

    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];

      for (let j = 0; j < clipsPerSection; j++) {
        // Build different prompts for variety within same section
        const variations = [
          '', 
          ', close-up detail shot',
          ', wide angle different perspective',
        ];
        const prompt = this.buildVideoPrompt(section.title, section.visualDescription + variations[j], section.narration);

        try {
          const clip = await this.generateImageClip(prompt, (i * clipsPerSection) + j + 1, clipDuration, script.format);
          clips.push(clip);
        } catch (err) {
          console.error(`Error generating clip ${j+1} for section ${section.number}:`, err);
        }

        if (onProgress) {
          onProgress(clips.length, total * clipsPerSection);
        }
      }
    }

    return clips;
  }

  /**
   * Build a video prompt that's specific to the section content.
   * Translate the concept to English for better AI comprehension.
   */
  private buildVideoPrompt(title: string, visualDescription: string, narration: string): string {
    // The visual description from the script is in Spanish but Pollinations works better with English
    // Use the visual description directly (it's already meant for image generation)
    // Add cinematic qualifiers to get better results
    return `${visualDescription}, cinematic shot, professional lighting, high quality video, 4K, smooth camera movement`;
  }

  /**
   * Generate a video clip using Pollinations Video API.
   */
  private async generateVideoClip(
    prompt: string,
    sectionNumber: number,
    duration: number,
    format: VideoFormat
  ): Promise<VideoClip> {
    const { width, height } = FORMAT_CONSTRAINTS[format].resolution;
    const seed = Math.floor(Math.random() * 999999);

    // Pollinations video endpoint
    const encodedPrompt = encodeURIComponent(prompt + ', cinematic, professional video, smooth motion');
    const videoUrl = `https://gen.pollinations.ai/video/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&duration=${Math.min(duration, 5)}&key=${POLLINATIONS_API_KEY}`;

    const clipPath = path.join(this.outputDir, `clip_${sectionNumber}_${Date.now()}.mp4`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout for video

      const response = await fetch(videoUrl, {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Pollinations video API returned ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(clipPath, buffer);

      return {
        sectionNumber,
        clipPath,
        durationSeconds: duration,
        prompt,
      };
    } catch (err) {
      // If video generation fails, fall through to image fallback
      throw err;
    }
  }

  /**
   * Fallback: Generate an image and convert to video clip with Ken Burns effect.
   */
  private async generateImageClip(
    prompt: string,
    sectionNumber: number,
    duration: number,
    format: VideoFormat
  ): Promise<VideoClip> {
    const { width, height } = FORMAT_CONSTRAINTS[format].resolution;
    const seed = Math.floor(Math.random() * 999999);

    // Generate high-res image
    const imagePrompt = `${prompt}, ultra realistic, 8k UHD, cinematic lighting`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=${width * 2}&height=${height * 2}&nologo=true&seed=${seed}&key=${POLLINATIONS_API_KEY}`;

    const imagePath = path.join(this.outputDir, `img_${sectionNumber}_${Date.now()}.png`);
    const clipPath = path.join(this.outputDir, `clip_${sectionNumber}_${Date.now()}.mp4`);

    // Download image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(imagePath, buffer);

    // Convert to video with Ken Burns using FFmpeg
    const { spawn } = require('child_process');
    const FFMPEG_PATH = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';
    const fps = 30;
    const totalFrames = Math.floor(duration * fps);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y', '-loop', '1', '-i', imagePath,
        '-vf', `zoompan=z='min(zoom+0.002,1.4)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
        '-t', duration.toFixed(2),
        '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
        clipPath,
      ]);
      ffmpeg.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}`)));
      ffmpeg.on('error', reject);
    });

    return { sectionNumber, clipPath, durationSeconds: duration, prompt };
  }
}
