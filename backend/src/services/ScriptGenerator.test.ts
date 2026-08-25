import { describe, it, expect } from 'vitest';
import {
  countWords,
  calculateTotalWordCount,
  buildScriptPrompt,
  validateScript,
} from './ScriptGenerator';
import type { ScriptSection, TopicSuggestion } from 'shared/types';

describe('ScriptGenerator - utility functions', () => {
  describe('countWords', () => {
    it('counts words in a simple sentence', () => {
      expect(countWords('hola mundo esto es una prueba')).toBe(6);
    });

    it('handles extra whitespace', () => {
      expect(countWords('  hola   mundo  ')).toBe(2);
    });

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
      expect(countWords('   ')).toBe(0);
    });
  });

  describe('calculateTotalWordCount', () => {
    it('sums words from hook, introduction, narrations, and closingCTA', () => {
      const sections: ScriptSection[] = [
        { number: 1, title: 'Sección 1', narration: 'primera narración aquí', visualDescription: 'desc' },
        { number: 2, title: 'Sección 2', narration: 'segunda narración corta', visualDescription: 'desc' },
      ];
      // hook: 2 words, introduction: 3 words, narrations: 3+3=6 words, closingCTA: 2 words = 13
      const total = calculateTotalWordCount('Hola amigos', 'Bienvenidos al canal', sections, 'Suscríbete ya');
      expect(total).toBe(13);
    });

    it('handles empty sections array', () => {
      const total = calculateTotalWordCount('hook word', 'intro word', [], 'cta word');
      expect(total).toBe(6);
    });
  });

  describe('buildScriptPrompt', () => {
    const topic: TopicSuggestion = {
      title: 'Inteligencia Artificial en 2024',
      description: 'Los avances más importantes de la IA este año',
      tags: ['IA', 'tecnología'],
      viralScore: 8,
      recommendedFormat: 'long_video',
      reasoning: 'Tema en tendencia',
    };

    it('includes topic title in the prompt', () => {
      const prompt = buildScriptPrompt(topic, 'long_video');
      expect(prompt).toContain('Inteligencia Artificial en 2024');
    });

    it('specifies section count range for long_video', () => {
      const prompt = buildScriptPrompt(topic, 'long_video');
      expect(prompt).toContain('entre 8 y 12 secciones');
    });

    it('specifies word count range for long_video', () => {
      const prompt = buildScriptPrompt(topic, 'long_video');
      expect(prompt).toContain('entre 1500 y 2250 palabras');
    });

    it('specifies exactly 3 sections for short', () => {
      const prompt = buildScriptPrompt(topic, 'short');
      expect(prompt).toContain('exactamente 3 secciones');
    });

    it('specifies word count range for short', () => {
      const prompt = buildScriptPrompt(topic, 'short');
      expect(prompt).toContain('entre 110 y 150 palabras');
    });

    it('requests Spanish language', () => {
      const prompt = buildScriptPrompt(topic, 'long_video');
      expect(prompt).toContain('español');
    });

    it('requests JSON response', () => {
      const prompt = buildScriptPrompt(topic, 'long_video');
      expect(prompt).toContain('JSON');
    });
  });

  describe('validateScript', () => {
    // Each narration needs ~150 words to reach 1500+ total across 10 sections (+ hook/intro/cta)
    const longNarration = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor praesent commodo cursus magna vel scelerisque nisl consectetur';

    const validLongVideoScript = {
      hook: 'Esto te sorprenderá mucho amigos',
      introduction: 'Hoy hablaremos de un tema increíble que cambiará tu perspectiva',
      sections: Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `Sección ${i + 1}`,
        narration: longNarration,
        visualDescription: 'Una imagen descriptiva',
      })),
      closingCTA: 'Suscríbete y activa la campanita para más contenido',
    };

    it('passes validation for valid long_video script', () => {
      const errors = validateScript(validLongVideoScript, 'long_video');
      expect(errors).toEqual([]);
    });

    it('fails for too few sections in long_video', () => {
      const script = {
        ...validLongVideoScript,
        sections: validLongVideoScript.sections.slice(0, 3),
      };
      const errors = validateScript(script, 'long_video');
      expect(errors.some(e => e.includes('Section count'))).toBe(true);
    });

    it('fails for empty hook', () => {
      const script = { ...validLongVideoScript, hook: '' };
      const errors = validateScript(script, 'long_video');
      expect(errors.some(e => e.includes('Hook is empty'))).toBe(true);
    });

    it('fails for empty section narration', () => {
      const script = {
        ...validLongVideoScript,
        sections: [
          { number: 1, title: 'Title', narration: '', visualDescription: 'desc' },
          ...validLongVideoScript.sections.slice(1),
        ],
      };
      const errors = validateScript(script, 'long_video');
      expect(errors.some(e => e.includes('narration is empty'))).toBe(true);
    });

    it('validates short format requires exactly 3 sections', () => {
      const shortScript = {
        hook: 'Esto te sorprenderá enormemente ahora mismo',
        introduction: 'Hoy hablaremos de un tema increíble que cambiará tu vida',
        sections: [
          { number: 1, title: 'Sec 1', narration: 'Primera sección con contenido de narración suficiente para el conteo de palabras requerido por el formato corto', visualDescription: 'desc' },
          { number: 2, title: 'Sec 2', narration: 'Segunda sección con más contenido narrado que complementa el video', visualDescription: 'desc' },
          { number: 3, title: 'Sec 3', narration: 'Tercera sección final del video corto', visualDescription: 'desc' },
        ],
        closingCTA: 'Suscríbete y comenta qué te pareció este video',
      };
      const errors = validateScript(shortScript, 'short');
      // Should not have section count error (has exactly 3)
      expect(errors.some(e => e.includes('Section count'))).toBe(false);
    });

    it('fails for wrong section count in short format', () => {
      const shortScript = {
        hook: 'Hook',
        introduction: 'Introduction',
        sections: [
          { number: 1, title: 'Sec 1', narration: 'Narration one', visualDescription: 'desc' },
          { number: 2, title: 'Sec 2', narration: 'Narration two', visualDescription: 'desc' },
        ],
        closingCTA: 'CTA',
      };
      const errors = validateScript(shortScript, 'short');
      expect(errors.some(e => e.includes('Section count 2 must be exactly 3'))).toBe(true);
    });
  });
});
