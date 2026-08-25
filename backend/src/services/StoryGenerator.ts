import type { AppError } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';

export interface Story {
  title: string;
  hook: string; // First 2 sentences to grab attention
  fullText: string; // Complete narration
  category: string; // "confession", "revenge", "mystery", etc.
  estimatedDuration: number; // seconds
  shortClipStart: number; // where the most dramatic part starts (% of total)
  shortClipText: string; // the most impactful excerpt for a short/reel
}

export interface StoryOptions {
  category?: string;
  language?: string;
  duration?: 'short' | 'medium' | 'long'; // 60s, 3-5min, 10-15min
}

const CATEGORIES = [
  'confesion anonima',
  'venganza epica',
  'historia de terror real',
  'descubri un secreto',
  'mi vecino loco',
  'experiencia paranormal',
  'peor cita de mi vida',
  'secreto de familia',
  'me despidieron por esto',
  'historia de karma instantaneo',
];

/**
 * Generates viral storytelling content using OpenAI.
 */
export class StoryGenerator {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
  }

  /**
   * Generate multiple story options for the user to choose from.
   */
  async generateStoryOptions(count: number = 5, options?: StoryOptions): Promise<Story[]> {
    const category = options?.category || CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const duration = options?.duration || 'medium';

    let wordCount: string;
    let durationDesc: string;
    switch (duration) {
      case 'short':
        wordCount = '100-150 palabras MAXIMO. NO te pases de 150 palabras';
        durationDesc = '45-60 segundos MAXIMO';
        break;
      case 'long':
        wordCount = '1500-2500 palabras';
        durationDesc = '10-15 minutos';
        break;
      default:
        wordCount = '500-800 palabras';
        durationDesc = '3-5 minutos';
    }

    const prompt = `Genera ${count} historias DIFERENTES tipo "${category}" para narrar en un video de YouTube (formato storytime/confesiones anonimas).

REQUISITOS POR HISTORIA:
- Duracion estimada: ${durationDesc}
- Longitud: ${wordCount}
- Idioma: Espanol latino
- Tono: Dramatico, con suspenso, que enganche desde la primera frase
- Debe tener un GIRO INESPERADO o final impactante
- Escrita en PRIMERA PERSONA como si fuera una confesion real
- Lenguaje coloquial, como si alguien te contara la historia en persona
- Incluir detalles especificos para que se sienta real (lugares, nombres falsos, situaciones concretas)
- Al FINAL de la historia agregar: "Si te gusto esta historia, suscribete al canal, dale me gusta y comenta tu experiencia similar. Comparte con tus amigos."

PALABRAS PROHIBIDAS (NO uses estas palabras en el titulo ni en la historia):
- suicidio, suicidarse, cortarse las venas
- violacion, violar
- gore, sangre explicita
- drogas (nombres especificos)
- armas de fuego (no describir uso violento)
- terrorismo
ALTERNATIVAS PERMITIDAS:
- En vez de "muerte" usa "fallecimiento" o "lo peor que pudo pasar"
- En vez de "matar" usa "algo terrible sucedio"
- Puedes usar: misterio, terror, miedo, venganza, karma, secreto, paranormal

ESTRUCTURA DE CADA HISTORIA:
- Hook: Las primeras 2 oraciones deben ser TAN impactantes que el espectador no pueda dejar de escuchar
- Desarrollo: Construye tension gradualmente
- Climax: El momento mas dramatico o el giro inesperado
- Cierre: Final que deje pensando al espectador
- CTA: "Si te gusto esta historia, suscribete, dale me gusta y comenta"

Responde con JSON:
{
  "stories": [
    {
      "title": "Titulo clickbait pero honesto",
      "hook": "Las primeras 2 oraciones impactantes",
      "fullText": "La historia COMPLETA narrada en primera persona, con todos los detalles...",
      "category": "${category}",
      "shortClipText": "El fragmento mas impactante de la historia (30-40 palabras) para usar como short/reel"
    }
  ]
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres un escritor experto en historias virales para YouTube. Escribes en espanol latino coloquial. Tus historias son adictivas, con giros inesperados y finales impactantes.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.9,
          max_tokens: 8000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON response
      let parsed: any;
      try {
        // Clean JSON
        let jsonStr = content.trim();
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonStr = match[1].trim();
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        parsed = JSON.parse(jsonStr);
      } catch {
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0].replace(/,\s*([}\]])/g, '$1'));
        } else {
          throw new Error('Failed to parse stories from OpenAI');
        }
      }

      const stories: Story[] = (parsed.stories || []).map((s: any) => ({
        title: s.title || 'Historia sin titulo',
        hook: s.hook || s.fullText?.slice(0, 100) || '',
        fullText: s.fullText || '',
        category: s.category || category,
        estimatedDuration: Math.ceil((s.fullText || '').split(/\s+/).length / 150 * 60),
        shortClipStart: 60, // 60% into the story is usually the climax
        shortClipText: s.shortClipText || s.fullText?.slice(Math.floor((s.fullText?.length || 0) * 0.6), Math.floor((s.fullText?.length || 0) * 0.6) + 200) || '',
      }));

      return stories;
    } catch (error) {
      clearTimeout(timeout);
      const appError: AppError = {
        code: ErrorCode.OPENAI_API_ERROR,
        message: error instanceof Error ? error.message : 'Failed to generate stories',
        service: 'StoryGenerator',
        retryable: true,
      };
      throw appError;
    }
  }

  /**
   * Get available story categories.
   */
  getCategories(): string[] {
    return [...CATEGORIES];
  }
}
