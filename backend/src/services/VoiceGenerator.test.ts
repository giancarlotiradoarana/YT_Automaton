import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  concatenateNarration,
  filterVoicesByLanguage,
  parseVoiceList,
  VoiceGenerator,
} from './VoiceGenerator';
import type { Script, ScriptSection, VoiceOption } from 'shared/types';

// ─── Helper Factories ────────────────────────────────────────────────────────

function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    hook: 'Hook text here',
    introduction: 'Introduction text here',
    sections: [
      { number: 1, title: 'Section 1', narration: 'Narration one', visualDescription: 'Visual 1' },
      { number: 2, title: 'Section 2', narration: 'Narration two', visualDescription: 'Visual 2' },
      { number: 3, title: 'Section 3', narration: 'Narration three', visualDescription: 'Visual 3' },
    ],
    closingCTA: 'Closing call to action',
    format: 'short',
    totalWordCount: 120,
    metadata: {
      topic: 'Test topic',
      generatedAt: new Date().toISOString(),
      language: 'es',
    },
    ...overrides,
  };
}

function makeVoiceOptions(): VoiceOption[] {
  return [
    { id: 'es-MX-DaliaNeural', name: 'es-MX-DaliaNeural', language: 'es-MX', gender: 'Female' },
    { id: 'es-MX-JorgeNeural', name: 'es-MX-JorgeNeural', language: 'es-MX', gender: 'Male' },
    { id: 'es-ES-ElviraNeural', name: 'es-ES-ElviraNeural', language: 'es-ES', gender: 'Female' },
    { id: 'en-US-JennyNeural', name: 'en-US-JennyNeural', language: 'en-US', gender: 'Female' },
    { id: 'en-US-GuyNeural', name: 'en-US-GuyNeural', language: 'en-US', gender: 'Male' },
    { id: 'fr-FR-DeniseNeural', name: 'fr-FR-DeniseNeural', language: 'fr-FR', gender: 'Female' },
  ];
}

// ─── concatenateNarration ────────────────────────────────────────────────────

describe('concatenateNarration', () => {
  it('concatenates narration in correct order: hook, introduction, sections, closingCTA', () => {
    const script = makeScript();
    const result = concatenateNarration(script);

    expect(result).toContain('Hook text here');
    expect(result).toContain('Introduction text here');
    expect(result).toContain('Narration one');
    expect(result).toContain('Narration two');
    expect(result).toContain('Narration three');
    expect(result).toContain('Closing call to action');

    // Verify order
    const hookIdx = result.indexOf('Hook text here');
    const introIdx = result.indexOf('Introduction text here');
    const sec1Idx = result.indexOf('Narration one');
    const sec2Idx = result.indexOf('Narration two');
    const sec3Idx = result.indexOf('Narration three');
    const ctaIdx = result.indexOf('Closing call to action');

    expect(hookIdx).toBeLessThan(introIdx);
    expect(introIdx).toBeLessThan(sec1Idx);
    expect(sec1Idx).toBeLessThan(sec2Idx);
    expect(sec2Idx).toBeLessThan(sec3Idx);
    expect(sec3Idx).toBeLessThan(ctaIdx);
  });

  it('sorts sections by number regardless of input order', () => {
    const script = makeScript({
      sections: [
        { number: 3, title: 'S3', narration: 'Third', visualDescription: 'V3' },
        { number: 1, title: 'S1', narration: 'First', visualDescription: 'V1' },
        { number: 2, title: 'S2', narration: 'Second', visualDescription: 'V2' },
      ],
    });
    const result = concatenateNarration(script);

    const firstIdx = result.indexOf('First');
    const secondIdx = result.indexOf('Second');
    const thirdIdx = result.indexOf('Third');

    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it('handles a script with a single section', () => {
    const script = makeScript({
      sections: [
        { number: 1, title: 'Only', narration: 'Only narration', visualDescription: 'V1' },
      ],
    });
    const result = concatenateNarration(script);

    expect(result).toContain('Hook text here');
    expect(result).toContain('Only narration');
    expect(result).toContain('Closing call to action');
  });
});

// ─── filterVoicesByLanguage ──────────────────────────────────────────────────

describe('filterVoicesByLanguage', () => {
  const voices = makeVoiceOptions();

  it('filters voices by language prefix "es"', () => {
    const result = filterVoicesByLanguage(voices, 'es');
    expect(result).toHaveLength(3);
    expect(result.every((v) => v.language.startsWith('es'))).toBe(true);
  });

  it('filters voices by language prefix "en"', () => {
    const result = filterVoicesByLanguage(voices, 'en');
    expect(result).toHaveLength(2);
    expect(result.every((v) => v.language.startsWith('en'))).toBe(true);
  });

  it('returns empty array for non-matching language', () => {
    const result = filterVoicesByLanguage(voices, 'pt');
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const result = filterVoicesByLanguage(voices, 'ES');
    expect(result).toHaveLength(3);
  });

  it('filters by full locale when specified', () => {
    const result = filterVoicesByLanguage(voices, 'es-MX');
    expect(result).toHaveLength(2);
    expect(result.every((v) => v.language === 'es-MX')).toBe(true);
  });
});

// ─── parseVoiceList ──────────────────────────────────────────────────────────

describe('parseVoiceList', () => {
  it('parses edge-tts --list-voices output correctly', () => {
    const output = `Name: es-MX-DaliaNeural
Gender: Female

Name: es-MX-JorgeNeural
Gender: Male

Name: en-US-JennyNeural
Gender: Female
`;
    const voices = parseVoiceList(output);

    expect(voices).toHaveLength(3);
    expect(voices[0]).toEqual({
      id: 'es-MX-DaliaNeural',
      name: 'es-MX-DaliaNeural',
      language: 'es-MX',
      gender: 'Female',
    });
    expect(voices[1]).toEqual({
      id: 'es-MX-JorgeNeural',
      name: 'es-MX-JorgeNeural',
      language: 'es-MX',
      gender: 'Male',
    });
    expect(voices[2]).toEqual({
      id: 'en-US-JennyNeural',
      name: 'en-US-JennyNeural',
      language: 'en-US',
      gender: 'Female',
    });
  });

  it('handles empty output', () => {
    const voices = parseVoiceList('');
    expect(voices).toHaveLength(0);
  });

  it('handles output with extra whitespace', () => {
    const output = `  Name: fr-FR-DeniseNeural  
  Gender: Female  
`;
    const voices = parseVoiceList(output);
    expect(voices).toHaveLength(1);
    expect(voices[0].id).toBe('fr-FR-DeniseNeural');
    expect(voices[0].language).toBe('fr-FR');
  });
});

// ─── VoiceGenerator class ────────────────────────────────────────────────────

describe('VoiceGenerator', () => {
  describe('getAvailableVoices', () => {
    it('throws AppError when edge-tts command fails', async () => {
      // Mock execSync to simulate failure
      vi.mock('child_process', () => ({
        execSync: vi.fn(() => { throw new Error('Command not found: edge-tts'); }),
        exec: vi.fn(),
      }));

      const { VoiceGenerator: VG } = await import('./VoiceGenerator');
      const generator = new VG('/tmp/test-voice');

      await expect(generator.getAvailableVoices('es')).rejects.toMatchObject({
        code: 'TTS_PROCESS_ERROR',
        service: 'VoiceGenerator',
        retryable: true,
      });

      vi.restoreAllMocks();
    });
  });

  describe('generate', () => {
    it('throws AppError with correct error code when edge-tts fails', async () => {
      vi.mock('child_process', () => ({
        execSync: vi.fn(),
        exec: vi.fn((_cmd: string, _opts: unknown, cb: Function) => {
          cb(new Error('Process exited with code 1'), '', 'edge-tts error');
        }),
      }));
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actual,
          existsSync: vi.fn((p: string) => {
            if (p.endsWith('.mp3') || p.endsWith('.vtt')) return false;
            return true;
          }),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
        };
      });

      const { VoiceGenerator: VG } = await import('./VoiceGenerator');
      const generator = new VG('/tmp/test-voice');
      const script = makeScript();

      await expect(generator.generate(script, 'es-MX-DaliaNeural')).rejects.toMatchObject({
        code: 'TTS_PROCESS_ERROR',
        service: 'VoiceGenerator',
        retryable: true,
      });

      vi.restoreAllMocks();
    });
  });
});
