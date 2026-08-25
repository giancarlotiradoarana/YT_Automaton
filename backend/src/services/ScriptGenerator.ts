import type { Script, ScriptSection, TopicSuggestion, VideoFormat, AppError } from 'shared/types';
import { FORMAT_CONSTRAINTS, TIMEOUTS } from 'shared/constants';

/**
 * Interface for the ScriptGenerator service.
 */
export interface IScriptGenerator {
  generate(topic: TopicSuggestion, format: VideoFormat): Promise<Script>;
}

/**
 * Counts words in a text string by splitting on whitespace.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Calculates total word count from script parts:
 * hook + introduction + all narrations + closingCTA
 */
export function calculateTotalWordCount(
  hook: string,
  introduction: string,
  sections: ScriptSection[],
  closingCTA: string
): number {
  const narrations = sections.map(s => s.narration).join(' ');
  const fullText = [hook, introduction, narrations, closingCTA].join(' ');
  return countWords(fullText);
}

/**
 * Builds the structured prompt for OpenAI requesting a Spanish-language script.
 */
export function buildScriptPrompt(topic: TopicSuggestion, format: VideoFormat): string {
  const constraints = FORMAT_CONSTRAINTS[format];

  let sectionCountInstruction: string;
  let wordCountInstruction: string;
  let durationInstruction: string;

  if (format === 'long_video') {
    sectionCountInstruction = `OBLIGATORIO: genera EXACTAMENTE 12 secciones. NO menos de 12. Cada sección debe ser un punto diferente del tema.`;
    wordCountInstruction = `entre 1500 y 2250 palabras en total (aproximadamente 150+ palabras por sección)`;
    durationInstruction = 'El video debe durar entre 10 y 15 minutos.';
  } else {
    sectionCountInstruction = `OBLIGATORIO: genera EXACTAMENTE 6 secciones. NO menos de 6. Cada sección cubre un aspecto diferente.`;
    wordCountInstruction = `entre 200 y 400 palabras en total (6 secciones cortas)`;
    durationInstruction = 'El video es un short de 45-90 segundos. Ritmo rapido con 6 escenas.';
  }

  return `Eres un guionista profesional de YouTube con millones de vistas. Genera un guión COMPLETO y EXTENSO en español para un video sobre el siguiente tema.

TEMA: ${topic.title}
DESCRIPCIÓN: ${topic.description}
FORMATO: ${format === 'long_video' ? 'Video LARGO (10-15 minutos)' : 'Video corto (45-60 segundos)'}

REQUISITOS ESTRICTOS:
- El guión DEBE tener ${sectionCountInstruction}
- ${durationInstruction}
- El conteo total de palabras DEBE ser ${wordCountInstruction}
- Idioma: Español latino
- Tono: Profesional, entretenido, con datos curiosos y ganchos de retención
- Cada sección debe ser sustancial con narración larga y detallada

ESTRUCTURA REQUERIDA (responde SOLO con JSON válido):
{
  "hook": "Frase impactante de enganche",
  "introduction": "Introduccion breve al tema",
  "sections": [
    {"number": 1, "title": "Titulo seccion 1", "narration": "Narracion completa seccion 1...", "visualDescription": "Escena visual unica para seccion 1..."},
    {"number": 2, "title": "Titulo seccion 2", "narration": "Narracion completa seccion 2...", "visualDescription": "Escena visual diferente para seccion 2..."},
    {"number": 3, "title": "Titulo seccion 3", "narration": "Narracion completa seccion 3...", "visualDescription": "Otra escena totalmente distinta..."},
    {"number": 4, "title": "Titulo seccion 4", "narration": "Narracion seccion 4...", "visualDescription": "Escena diferente..."},
    {"number": 5, "title": "Titulo seccion 5", "narration": "Narracion seccion 5...", "visualDescription": "Otra escena..."},
    {"number": 6, "title": "Titulo seccion 6", "narration": "Narracion seccion 6...", "visualDescription": "Escena final diferente..."}
  ],
  "closingCTA": "Llamada a la accion"
}

CRITICO: El array "sections" DEBE tener ${format === 'long_video' ? '12 objetos' : '6 objetos'}. Si generas menos, el video no funcionara. Cada seccion es una escena diferente del video.

REGLAS PARA DESCRIPCIONES VISUALES (MUY IMPORTANTE):
- Cada visualDescription DEBE estar en INGLES (es para generar video con IA que solo entiende ingles)
- Describe EXACTAMENTE lo que se deberia VER mientras se escucha la narracion de esa seccion
- Si la narracion habla de "ceviche en la playa", la visualDescription debe ser: "Fresh ceviche dish on a wooden table at a sunny beach, waves in background, close-up shot"
- Si habla de "personas riendo", debe ser: "Group of friends laughing together at a party, warm lighting"
- Cada escena debe ser DIFERENTE y ESPECIFICA a lo que dice la narracion
- NO uses descripciones genericas como "beautiful scene" — se ESPECIFICO

REGLAS PARA LA NARRACION (en espanol):
- El tono debe ser DIVERTIDO y ENTRETENIDO, como si hablaras con un amigo
- Agrega humor ligero: comparaciones graciosas, exageraciones comicas, frases coloquiales
- Usa expresiones como "no me vas a creer pero...", "esto te va a volar la cabeza", "literal es como si..."
- Incluye datos curiosos que sorprendan
- Haz preguntas retoricas para enganchar: "alguna vez te has preguntado...?"
- Usa un ritmo rapido y dinamico, no seas aburrido
- Cada seccion debe tener un mini-gancho que haga querer seguir viendo

Responde ÚNICAMENTE con el JSON, sin texto adicional ni markdown.`;
}

/**
 * Validates that a parsed script meets format constraints.
 */
export function validateScript(script: Omit<Script, 'totalWordCount' | 'format' | 'metadata'>, format: VideoFormat): string[] {
  const errors: string[] = [];
  const constraints = FORMAT_CONSTRAINTS[format];

  // Validate section count
  if (format === 'long_video') {
    const sc = constraints.sectionCount as { min: number; max: number };
    if (script.sections.length < sc.min || script.sections.length > sc.max) {
      errors.push(`Section count ${script.sections.length} is outside range [${sc.min}, ${sc.max}]`);
    }
  } else {
    if (script.sections.length !== constraints.sectionCount) {
      errors.push(`Section count ${script.sections.length} must be exactly ${constraints.sectionCount}`);
    }
  }

  // Validate word count
  const totalWords = calculateTotalWordCount(
    script.hook,
    script.introduction,
    script.sections,
    script.closingCTA
  );
  if (totalWords < constraints.wordCount.min || totalWords > constraints.wordCount.max) {
    errors.push(`Word count ${totalWords} is outside range [${constraints.wordCount.min}, ${constraints.wordCount.max}]`);
  }

  // Validate structural completeness
  if (!script.hook || script.hook.trim().length === 0) {
    errors.push('Hook is empty');
  }
  if (!script.introduction || script.introduction.trim().length === 0) {
    errors.push('Introduction is empty');
  }
  if (!script.closingCTA || script.closingCTA.trim().length === 0) {
    errors.push('ClosingCTA is empty');
  }
  if (!script.sections || script.sections.length === 0) {
    errors.push('Sections array is empty');
  }

  for (const section of script.sections) {
    if (!section.title || section.title.trim().length === 0) {
      errors.push(`Section ${section.number}: title is empty`);
    }
    if (!section.narration || section.narration.trim().length === 0) {
      errors.push(`Section ${section.number}: narration is empty`);
    }
    if (!section.visualDescription || section.visualDescription.trim().length === 0) {
      errors.push(`Section ${section.number}: visualDescription is empty`);
    }
  }

  return errors;
}

/**
 * ScriptGenerator service that uses OpenAI to generate structured scripts in Spanish.
 */
export class ScriptGenerator implements IScriptGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  /**
   * Generate a script for the given topic and format.
   * Implements 60-second timeout with cancellation.
   */
  async generate(topic: TopicSuggestion, format: VideoFormat): Promise<Script> {
    if (!this.apiKey) {
      const error: AppError = {
        code: 'OPENAI_API_ERROR',
        message: 'OpenAI API key is not configured',
        service: 'ScriptGenerator',
        retryable: false,
      };
      throw error;
    }

    const prompt = buildScriptPrompt(topic, format);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.openaiScript);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres un guionista profesional de YouTube. Responde únicamente con JSON válido.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: format === 'long_video' ? 8000 : 1500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        const error: AppError = {
          code: 'OPENAI_API_ERROR',
          message: `OpenAI API error (${response.status}): ${errorBody}`,
          service: 'ScriptGenerator',
          retryable: true,
        };
        throw error;
      }

      const data = await response.json();
      const content: string = data.choices?.[0]?.message?.content || '';

      // Parse JSON from OpenAI response
      const parsed = this.parseScriptResponse(content);

      // Build the complete Script object
      const totalWordCount = calculateTotalWordCount(
        parsed.hook,
        parsed.introduction,
        parsed.sections,
        parsed.closingCTA
      );

      const script: Script = {
        hook: parsed.hook,
        introduction: parsed.introduction,
        sections: parsed.sections.map((s, i) => ({
          number: s.number || i + 1,
          title: s.title,
          narration: s.narration,
          visualDescription: s.visualDescription,
        })),
        closingCTA: parsed.closingCTA,
        format,
        totalWordCount,
        metadata: {
          topic: topic.title,
          generatedAt: new Date().toISOString(),
          language: 'es',
        },
      };

      return script;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (err instanceof Error && err.name === 'AbortError') {
        const error: AppError = {
          code: 'OPENAI_TIMEOUT',
          message: 'OpenAI request timed out after 60 seconds',
          service: 'ScriptGenerator',
          retryable: true,
        };
        throw error;
      }

      // Re-throw AppError as-is
      if (typeof err === 'object' && err !== null && 'code' in err && 'service' in err) {
        throw err;
      }

      // Wrap unexpected errors
      const error: AppError = {
        code: 'OPENAI_API_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error during script generation',
        service: 'ScriptGenerator',
        retryable: true,
      };
      throw error;
    }
  }

  /**
   * Parse the raw content from OpenAI response into script structure.
   */
  private parseScriptResponse(content: string): {
    hook: string;
    introduction: string;
    sections: ScriptSection[];
    closingCTA: string;
  } {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = content.trim();

    // Remove markdown code block if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Clean common JSON issues from LLM output
    // Remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    // Remove control characters
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (char) => {
      if (char === '\n' || char === '\r' || char === '\t') return char;
      return '';
    });

    try {
      const parsed = JSON.parse(jsonStr);

      if (!parsed.hook || !parsed.introduction || !parsed.sections || !parsed.closingCTA) {
        const error: AppError = {
          code: 'OPENAI_API_ERROR',
          message: 'OpenAI response is missing required script fields',
          service: 'ScriptGenerator',
          retryable: true,
        };
        throw error;
      }

      return {
        hook: parsed.hook,
        introduction: parsed.introduction,
        sections: parsed.sections,
        closingCTA: parsed.closingCTA,
      };
    } catch (parseErr) {
      if (typeof parseErr === 'object' && parseErr !== null && 'code' in parseErr && 'service' in parseErr) {
        throw parseErr;
      }

      // Last resort: try to extract JSON object manually
      try {
        const objMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objMatch) {
          let cleanJson = objMatch[0].replace(/,\s*([}\]])/g, '$1');
          const parsed = JSON.parse(cleanJson);
          if (parsed.hook && parsed.sections) {
            return {
              hook: parsed.hook,
              introduction: parsed.introduction || '',
              sections: parsed.sections,
              closingCTA: parsed.closingCTA || 'Suscríbete para más contenido.',
            };
          }
        }
      } catch {
        // fall through
      }

      const error: AppError = {
        code: 'OPENAI_API_ERROR',
        message: `Failed to parse script JSON from OpenAI response: ${parseErr instanceof Error ? parseErr.message : 'Unknown parse error'}`,
        service: 'ScriptGenerator',
        retryable: true,
      };
      throw error;
    }
  }
}
