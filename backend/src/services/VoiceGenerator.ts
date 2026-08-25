import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { Script, ScriptSection, VoiceOption, VoiceResult, AppError } from 'shared/types';
import { ErrorCode } from 'shared/types';
import { DEFAULT_LANGUAGE } from 'shared/constants';

export interface IVoiceGenerator {
  getAvailableVoices(language: string): Promise<VoiceOption[]>;
  generate(script: Script, voiceId: string): Promise<VoiceResult>;
}

/**
 * Concatenates all narration text from a Script in sequential order:
 * hook → introduction → section narrations (in order) → closingCTA
 */
export function concatenateNarration(script: Script): string {
  const parts: string[] = [
    script.hook,
    script.introduction,
    ...script.sections
      .sort((a: ScriptSection, b: ScriptSection) => a.number - b.number)
      .map((s: ScriptSection) => s.narration),
    script.closingCTA,
  ];
  return parts.join('\n\n');
}

/**
 * Filters a list of voices by language prefix.
 */
export function filterVoicesByLanguage(
  voices: VoiceOption[],
  language: string
): VoiceOption[] {
  const normalizedLang = language.toLowerCase();
  return voices.filter((v) =>
    v.language.toLowerCase().startsWith(normalizedLang)
  );
}

// Default Spanish voices available in Edge TTS
const DEFAULT_VOICES: VoiceOption[] = [
  { id: 'es-MX-JorgeNeural', name: 'es-MX-JorgeNeural', language: 'es-MX', gender: 'Male' },
  { id: 'es-MX-DaliaNeural', name: 'es-MX-DaliaNeural', language: 'es-MX', gender: 'Female' },
  { id: 'es-ES-AlvaroNeural', name: 'es-ES-AlvaroNeural', language: 'es-ES', gender: 'Male' },
  { id: 'es-ES-ElviraNeural', name: 'es-ES-ElviraNeural', language: 'es-ES', gender: 'Female' },
  { id: 'es-CO-GonzaloNeural', name: 'es-CO-GonzaloNeural', language: 'es-CO', gender: 'Male' },
  { id: 'es-CO-SalomeNeural', name: 'es-CO-SalomeNeural', language: 'es-CO', gender: 'Female' },
  { id: 'es-AR-TomasNeural', name: 'es-AR-TomasNeural', language: 'es-AR', gender: 'Male' },
  { id: 'es-AR-ElenaNeural', name: 'es-AR-ElenaNeural', language: 'es-AR', gender: 'Female' },
  { id: 'en-US-GuyNeural', name: 'en-US-GuyNeural', language: 'en-US', gender: 'Male' },
  { id: 'en-US-JennyNeural', name: 'en-US-JennyNeural', language: 'en-US', gender: 'Female' },
];

export class VoiceGenerator implements IVoiceGenerator {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'output', 'voice');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async getAvailableVoices(language: string = DEFAULT_LANGUAGE): Promise<VoiceOption[]> {
    return filterVoicesByLanguage(DEFAULT_VOICES, language);
  }

  async generate(script: Script, voiceId: string): Promise<VoiceResult> {
    const timestamp = Date.now();
    const audioFile = path.join(this.outputDir, `narration_${timestamp}.mp3`);
    const subtitleFile = path.join(this.outputDir, `narration_${timestamp}.vtt`);

    const narrationText = concatenateNarration(script);

    try {
      // Use edge-tts-node package (pure Node.js, no Python needed)
      const EdgeTTS = (await import('edge-tts-node')).default || (await import('edge-tts-node'));
      
      const tts = new EdgeTTS();
      await tts.synthesize(narrationText, voiceId, {
        outputFile: audioFile,
        subtitleFile: subtitleFile,
      });

      if (!existsSync(audioFile)) {
        throw new Error('Audio file was not generated');
      }

      // Calculate duration from subtitle file or estimate from word count
      let durationSeconds = 0;
      if (existsSync(subtitleFile)) {
        durationSeconds = this.getAudioDurationFromVTT(subtitleFile);
      }
      if (durationSeconds === 0) {
        // Estimate: ~150 words per minute for Spanish
        const wordCount = narrationText.split(/\s+/).length;
        durationSeconds = (wordCount / 150) * 60;
      }

      // If the VTT has only 1 subtitle block (or wasn't generated), replace with sentence-based VTT
      if (existsSync(subtitleFile)) {
        const { readFileSync } = require('fs');
        const vttContent = readFileSync(subtitleFile, 'utf-8');
        const arrowCount = (vttContent.match(/-->/g) || []).length;
        if (arrowCount <= 1) {
          const betterVTT = this.generateSentenceVTT(narrationText, durationSeconds);
          writeFileSync(subtitleFile, betterVTT, 'utf-8');
        }
      } else {
        const betterVTT = this.generateSentenceVTT(narrationText, durationSeconds);
        writeFileSync(subtitleFile, betterVTT, 'utf-8');
      }

      return {
        audioPath: audioFile,
        subtitlePath: subtitleFile,
        durationSeconds,
      };
    } catch (error) {
      // Fallback: try using the OpenAI TTS API if available
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          return await this.generateWithOpenAI(narrationText, openaiKey, audioFile, subtitleFile);
        } catch (openaiErr) {
          // Fall through to error
        }
      }

      const appError: AppError = {
        code: ErrorCode.TTS_PROCESS_ERROR,
        message: `Voice generation failed: ${error instanceof Error ? error.message : String(error)}`,
        service: 'VoiceGenerator',
        retryable: true,
        details: { voiceId },
      };
      throw appError;
    }
  }

  /**
   * Generates a sentence-by-sentence VTT file with proportional timing.
   */
  private generateSentenceVTT(text: string, totalDuration: number): string {
    // Split into SHORT chunks of max 8 words each (like viral videos)
    const MAX_WORDS_PER_SUBTITLE = 8;
    const allWords = text.split(/\s+/).filter(w => w.length > 0);
    const totalWords = allWords.length;
    const chunks: string[] = [];

    for (let i = 0; i < allWords.length; i += MAX_WORDS_PER_SUBTITLE) {
      chunks.push(allWords.slice(i, i + MAX_WORDS_PER_SUBTITLE).join(' '));
    }

    let currentTime = 0;
    let vtt = 'WEBVTT\n\n';

    for (const chunk of chunks) {
      const words = chunk.split(/\s+/).length;
      const duration = (words / totalWords) * totalDuration;
      const startTime = this.formatTime(currentTime);
      const endTime = this.formatTime(currentTime + duration);
      vtt += `${startTime} --> ${endTime}\n${chunk}\n\n`;
      currentTime += duration;
    }

    return vtt;
  }

  /**
   * Fallback: Use OpenAI TTS API
   * Handles texts longer than 4096 chars by splitting into chunks
   */
  private async generateWithOpenAI(
    text: string,
    apiKey: string,
    audioFile: string,
    subtitleFile: string
  ): Promise<VoiceResult> {
    const MAX_CHUNK = 4000; // Slightly under 4096 to be safe
    const chunks: string[] = [];
    
    // Split text into chunks at sentence boundaries
    if (text.length <= MAX_CHUNK) {
      chunks.push(text);
    } else {
      const sentences = text.split(/(?<=[.!?])\s+/);
      let currentChunk = '';
      for (const sentence of sentences) {
        if ((currentChunk + ' ' + sentence).length > MAX_CHUNK && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
    }

    // Generate audio for each chunk
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: chunk,
          voice: 'onyx',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS failed: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      audioBuffers.push(Buffer.from(arrayBuffer));
    }

    // Concatenate audio buffers
    const finalBuffer = Buffer.concat(audioBuffers);
    writeFileSync(audioFile, finalBuffer);

    // Estimate duration: ~150 words per minute for Spanish
    const fullText = chunks.join(' ');
    const wordCount = fullText.split(/\s+/).length;
    const durationSeconds = (wordCount / 150) * 60;

    // Generate sentence-based VTT using the ACTUAL narrated text
    const vttContent = this.generateSentenceVTT(fullText, durationSeconds);
    writeFileSync(subtitleFile, vttContent, 'utf-8');

    return {
      audioPath: audioFile,
      subtitlePath: subtitleFile,
      durationSeconds,
    };
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  private getAudioDurationFromVTT(vttPath: string): number {
    try {
      const { readFileSync } = require('fs');
      const content = readFileSync(vttPath, 'utf-8');
      const timeRegex = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/g;
      let lastMatch: RegExpExecArray | null = null;
      let match: RegExpExecArray | null;

      while ((match = timeRegex.exec(content)) !== null) {
        lastMatch = match;
      }

      if (lastMatch) {
        const hours = parseInt(lastMatch[1], 10);
        const minutes = parseInt(lastMatch[2], 10);
        const seconds = parseInt(lastMatch[3], 10);
        const millis = parseInt(lastMatch[4], 10);
        return hours * 3600 + minutes * 60 + seconds + millis / 1000;
      }

      return 0;
    } catch {
      return 0;
    }
  }
}
