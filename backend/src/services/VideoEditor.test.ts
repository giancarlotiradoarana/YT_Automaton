import { describe, it, expect } from 'vitest';
import {
  VideoEditor,
  calculateImageDuration,
  parseFFmpegProgress,
} from './VideoEditor';
import type { CompilationInputs, GeneratedImage } from 'shared/types';

// ─── Helper factories ────────────────────────────────────────────────────────

function makeImage(sectionNumber: number): GeneratedImage {
  return {
    sectionNumber,
    imageUrl: `https://example.com/img${sectionNumber}.png`,
    localPath: `/tmp/images/img${sectionNumber}.png`,
    prompt: `Image for section ${sectionNumber}`,
  };
}

function makeValidInputs(overrides?: Partial<CompilationInputs>): CompilationInputs {
  return {
    images: [makeImage(1), makeImage(2), makeImage(3)],
    audioPath: '/tmp/audio/narration.mp3',
    subtitlePath: '/tmp/audio/narration.vtt',
    format: 'long_video',
    ...overrides,
  };
}

// ─── validateInputs tests ────────────────────────────────────────────────────

describe('VideoEditor.validateInputs', () => {
  const editor = new VideoEditor('/tmp/test-output');

  it('returns valid=true when all inputs are present', () => {
    const result = editor.validateInputs(makeValidInputs());
    expect(result.valid).toBe(true);
    expect(result.missingInputs).toEqual([]);
  });

  it('reports missing images when images array is empty', () => {
    const result = editor.validateInputs(makeValidInputs({ images: [] }));
    expect(result.valid).toBe(false);
    expect(result.missingInputs).toContain('images');
  });

  it('reports missing audio when audioPath is empty string', () => {
    const result = editor.validateInputs(makeValidInputs({ audioPath: '' }));
    expect(result.valid).toBe(false);
    expect(result.missingInputs).toContain('audio');
  });

  it('reports missing audio when audioPath is whitespace', () => {
    const result = editor.validateInputs(makeValidInputs({ audioPath: '   ' }));
    expect(result.valid).toBe(false);
    expect(result.missingInputs).toContain('audio');
  });

  it('reports missing subtitles when subtitlePath is empty string', () => {
    const result = editor.validateInputs(makeValidInputs({ subtitlePath: '' }));
    expect(result.valid).toBe(false);
    expect(result.missingInputs).toContain('subtitles');
  });

  it('reports multiple missing inputs', () => {
    const result = editor.validateInputs({
      images: [],
      audioPath: '',
      subtitlePath: '',
      format: 'short',
    });
    expect(result.valid).toBe(false);
    expect(result.missingInputs).toContain('images');
    expect(result.missingInputs).toContain('audio');
    expect(result.missingInputs).toContain('subtitles');
    expect(result.missingInputs.length).toBe(3);
  });

  it('returns valid=true with a single image', () => {
    const result = editor.validateInputs(makeValidInputs({ images: [makeImage(1)] }));
    expect(result.valid).toBe(true);
    expect(result.missingInputs).toEqual([]);
  });
});

// ─── calculateImageDuration tests ────────────────────────────────────────────

describe('calculateImageDuration', () => {
  it('distributes duration evenly across images', () => {
    expect(calculateImageDuration(60, 3)).toBeCloseTo(20, 5);
  });

  it('handles a single image (full duration)', () => {
    expect(calculateImageDuration(120, 1)).toBeCloseTo(120, 5);
  });

  it('handles many images', () => {
    expect(calculateImageDuration(100, 10)).toBeCloseTo(10, 5);
  });

  it('returns 0 for zero images', () => {
    expect(calculateImageDuration(60, 0)).toBe(0);
  });

  it('returns 0 for zero duration', () => {
    expect(calculateImageDuration(0, 5)).toBe(0);
  });

  it('returns 0 for negative image count', () => {
    expect(calculateImageDuration(60, -1)).toBe(0);
  });

  it('sum of all image durations equals total audio duration', () => {
    const duration = 90;
    const count = 7;
    const perImage = calculateImageDuration(duration, count);
    expect(perImage * count).toBeCloseTo(duration, 10);
  });
});

// ─── parseFFmpegProgress tests ───────────────────────────────────────────────

describe('parseFFmpegProgress', () => {
  it('parses time from FFmpeg stderr line', () => {
    const line = 'frame=  120 fps= 30 q=28.0 size=    1024kB time=00:00:30.00 bitrate= 279.6kbits/s';
    const percent = parseFFmpegProgress(line, 60);
    expect(percent).toBe(50);
  });

  it('returns 100 when time equals total duration', () => {
    const line = 'time=00:01:00.00';
    const percent = parseFFmpegProgress(line, 60);
    expect(percent).toBe(100);
  });

  it('caps at 100% even if time exceeds duration', () => {
    const line = 'time=00:02:00.00';
    const percent = parseFFmpegProgress(line, 60);
    expect(percent).toBe(100);
  });

  it('returns null for lines without time info', () => {
    const line = 'Input #0, mp3, from narration.mp3';
    const percent = parseFFmpegProgress(line, 60);
    expect(percent).toBeNull();
  });

  it('returns null for zero total duration', () => {
    const line = 'time=00:00:10.00';
    const percent = parseFFmpegProgress(line, 0);
    expect(percent).toBeNull();
  });

  it('handles three-digit milliseconds', () => {
    const line = 'time=00:00:30.500';
    const percent = parseFFmpegProgress(line, 61);
    expect(percent).toBe(50);
  });
});
