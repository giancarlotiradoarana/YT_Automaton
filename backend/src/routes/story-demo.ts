import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { StoryGenerator, Story } from '../services/StoryGenerator';
import { BackgroundVideoService } from '../services/BackgroundVideo';
import { VoiceGenerator } from '../services/VoiceGenerator';
import { spawn } from 'child_process';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';

const router = Router();
const storyGenerator = new StoryGenerator();
const backgroundService = new BackgroundVideoService();
const voiceGenerator = new VoiceGenerator();

/**
 * GET /api/story/categories
 * Returns available story categories.
 */
router.get('/categories', (_req: Request, res: Response) => {
  res.json({ categories: storyGenerator.getCategories() });
});

/**
 * GET /api/story/trending
 * Analyzes YouTube trending to suggest the best story categories for today.
 * Uses YouTube API to find what storytelling topics are popular right now.
 */
router.get('/trending', async (_req: Request, res: Response) => {
  try {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
    const openaiApiKey = process.env.OPENAI_API_KEY || '';

    // Search YouTube for popular storytime/confession videos from the last 3 days
    const queries = ['storytime español', 'confesiones anonimas', 'historia real', 'reddit español'];
    const allTitles: string[] = [];

    for (const query of queries) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&publishedAfter=${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()}&maxResults=5&regionCode=MX&key=${youtubeApiKey}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const titles = (data.items || []).map((item: any) => item.snippet?.title || '');
          allTitles.push(...titles);
        }
      } catch { /* continue */ }
    }

    // Use OpenAI to analyze trending titles and suggest categories
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Analiza estos titulos de videos de YouTube en tendencia y sugiere las 5 mejores categorias de historias/storytime para hoy. Responde con JSON: {"trending": [{"category": "nombre en espanol", "reason": "por que esta en tendencia hoy", "score": 9}]}`
          },
          {
            role: 'user',
            content: `Videos trending de storytime hoy:\n${allTitles.join('\n')}\n\nCategorias disponibles: ${storyGenerator.getCategories().join(', ')}\n\nSugiere las 5 mejores para hoy basandote en lo que esta funcionando.`
          }
        ],
        temperature: 0.5,
      }),
    });

    let trending: any[] = [];
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      try {
        let parsed = JSON.parse(content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim().replace(/,\s*([}\]])/g, '$1'));
        trending = parsed.trending || [];
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
          trending = parsed.trending || [];
        }
      }
    }

    const today = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    res.json({
      date: today,
      trending: trending.length > 0 ? trending : [
        { category: 'confesion anonima', reason: 'Siempre popular en storytime', score: 8 },
        { category: 'venganza epica', reason: 'Alto engagement y comentarios', score: 7 },
        { category: 'historia de karma instantaneo', reason: 'Contenido satisfactorio y viral', score: 7 },
      ],
    });
  } catch (err: any) {
    res.status(500).json({
      code: 'TRENDING_ERROR',
      message: err.message || 'Failed to get trending categories',
      service: 'StoryDemo',
      retryable: true,
    });
  }
});

/**
 * POST /api/story/generate
 * Generates story options for the user to choose.
 * Body: { category?: string, duration?: 'short'|'medium'|'long', count?: number }
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { category, duration, count } = req.body;
    const stories = await storyGenerator.generateStoryOptions(count || 5, { category, duration });
    res.json({ stories });
  } catch (err: any) {
    res.status(500).json({
      code: err.code || 'STORY_GENERATION_ERROR',
      message: err.message || 'Failed to generate stories',
      service: 'StoryGenerator',
      retryable: true,
    });
  }
});

/**
 * POST /api/story/create-video
 * Creates a complete video from a selected story.
 * Body: { story: Story, voiceId?: string, format?: 'long'|'short' }
 */
router.post('/create-video', async (req: Request, res: Response) => {
  try {
    const { story, voiceId, format } = req.body as { story: Story; voiceId?: string; format?: string };

    if (!story || !story.fullText) {
      res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Story with fullText is required', service: 'Demo', retryable: false });
      return;
    }

    const projectDir = path.join(process.cwd(), 'temp', 'demo', `story_${Date.now()}`);
    fs.mkdirSync(projectDir, { recursive: true });

    // Step 1: Generate voice narration
    // For shorts, truncate text to ~150 words max (45-60 seconds of audio)
    let narrationText = story.fullText;
    if (format === 'short') {
      const words = narrationText.split(/\s+/);
      if (words.length > 150) {
        narrationText = words.slice(0, 140).join(' ') + '. Si te gusto, suscribete y dale me gusta.';
      } else {
        narrationText += ' Si te gusto, suscribete y dale me gusta.';
      }
    } else {
      // For long videos, add CTA at the end
      narrationText += ' Si te gusto esta historia, suscribete al canal, dale me gusta y comenta tu experiencia. Comparte con tus amigos para mas historias como esta.';
    }

    const script = {
      hook: story.hook,
      introduction: '',
      sections: [{ number: 1, title: story.title, narration: narrationText, visualDescription: '' }],
      closingCTA: '',
      format: 'short' as const,
      totalWordCount: narrationText.split(/\s+/).length,
      metadata: { topic: story.title, generatedAt: new Date().toISOString(), language: 'es' },
    };

    const voice = voiceId || 'es-MX-JorgeNeural';
    const voiceResult = await voiceGenerator.generate(script, voice);

    // Get real audio duration with ffprobe and regenerate VTT to match
    let realDuration = voiceResult.durationSeconds;
    
    // Try to get real duration from ffprobe
    try {
      const probeResult = await new Promise<number>((resolve) => {
        const ffprobe = spawn(FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe'), [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          voiceResult.audioPath,
        ]);
        let out = '';
        ffprobe.stdout.on('data', (d: Buffer) => { out += d.toString(); });
        ffprobe.on('close', () => resolve(parseFloat(out.trim()) || 0));
        ffprobe.on('error', () => resolve(0));
      });
      if (probeResult > 0) realDuration = probeResult;
    } catch { /* use estimated */ }

    // ALWAYS regenerate VTT with the FULL narrated text (hook + narration)
    // This must match what concatenateNarration produces
    const fullNarratedText = [story.hook, narrationText].filter(Boolean).join('. ');
    const words = fullNarratedText.split(/\s+/).filter((w: string) => w.length > 0);
    const MAX_WORDS = 6;
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += MAX_WORDS) {
      chunks.push(words.slice(i, i + MAX_WORDS).join(' '));
    }
    let vtt = 'WEBVTT\n\n';
    let t = 0;
    for (const chunk of chunks) {
      const dur = (chunk.split(/\s+/).length / words.length) * realDuration;
      const s = formatVTTTime(t);
      const e = formatVTTTime(t + dur);
      vtt += `${s} --> ${e}\n${chunk}\n\n`;
      t += dur;
    }
    fs.writeFileSync(voiceResult.subtitlePath, vtt, 'utf-8');
    voiceResult.durationSeconds = realDuration;

    // Step 2: Download MULTIPLE background videos (matched to story)
    backgroundService.setOutputDir(path.join(projectDir, 'bg'));
    const segmentCount = format === 'short' ? 6 : 15;
    const bgVideoPaths = await backgroundService.getSegmentedBackgrounds(
      story.fullText,
      voiceResult.durationSeconds,
      segmentCount
    );

    // Normalize all videos to same resolution then concatenate
    const isVertical = format === 'short';
    const targetW = isVertical ? 1080 : 1920;
    const targetH = isVertical ? 1920 : 1080;
    const bgConcatPath = path.join(projectDir, 'bg_concat.mp4');
    
    if (bgVideoPaths.length > 0) {
      await normalizeAndConcatenate(bgVideoPaths, bgConcatPath, targetW, targetH);
    } else {
      throw new Error('No se pudieron descargar videos de fondo');
    }
    
    if (bgVideoPaths.length > 0) {
      await normalizeAndConcatenate(bgVideoPaths, bgConcatPath, targetW, targetH);
    } else {
      throw new Error('No se pudieron descargar videos de fondo');
    }

    // Step 3: Compile final video (background + audio + subtitles)
    const outputPath = path.join(projectDir, 'final_video.mp4');
    const width = targetW;
    const height = targetH;

    await compileStoryVideo({
      backgroundVideoPath: bgConcatPath,
      audioPath: voiceResult.audioPath,
      subtitlePath: voiceResult.subtitlePath,
      outputPath,
      width,
      height,
      audioDuration: voiceResult.durationSeconds,
    });

    // Step 4: Generate short/reel from the most dramatic part
    let shortPath: string | null = null;
    if (format !== 'short' && story.shortClipText) {
      shortPath = path.join(projectDir, 'short_reel.mp4');
      // Cut the most impactful 60 seconds from the video (around 60% mark)
      const shortStart = Math.max(0, voiceResult.durationSeconds * 0.5 - 30);
      await cutShortFromVideo(outputPath, shortPath, shortStart, 60);
    }

    // Step 5: Generate YouTube metadata (title, description, hashtags)
    const metadata = await generateYouTubeMetadata(story);

    // Step 6: Generate thumbnails (video largo 16:9 + short 9:16)
    let thumbnailLong: string | null = null;
    let thumbnailShort: string | null = null;
    try {
      const thumbText = metadata.title.split(' ').slice(0, 2).join(' ').toUpperCase();
      thumbnailLong = await generateThumbnail(story, projectDir, 1280, 720, thumbText);
      const shortText = metadata.title.split(' ').slice(0, 2).join(' ').toUpperCase();
      thumbnailShort = await generateThumbnail(story, projectDir, 720, 1280, shortText);
    } catch (err) {
      console.error('Thumbnail generation failed:', err);
    }

    res.json({
      success: true,
      video: {
        path: outputPath,
        url: `/api/files/demo/story_${path.basename(projectDir).split('_')[1]}/final_video.mp4`,
        durationSeconds: voiceResult.durationSeconds,
      },
      short: shortPath ? {
        path: shortPath,
        url: `/api/files/demo/story_${path.basename(projectDir).split('_')[1]}/short_reel.mp4`,
        durationSeconds: 60,
      } : null,
      audio: voiceResult,
      story: story.title,
      metadata,
      thumbnails: {
        long: thumbnailLong ? `/api/files/demo/${path.basename(projectDir)}/thumb_long.png` : null,
        short: thumbnailShort ? `/api/files/demo/${path.basename(projectDir)}/thumb_short.png` : null,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      code: err.code || 'VIDEO_CREATION_ERROR',
      message: err.message || 'Failed to create video',
      service: 'Demo',
      retryable: true,
    });
  }
});

/**
 * Format seconds to VTT timestamp (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Normalize all videos to same resolution and concatenate.
 * This fixes the issue where Pexels videos have different sizes/codecs.
 */
async function normalizeAndConcatenate(
  videoPaths: string[],
  outputPath: string,
  width: number,
  height: number
): Promise<void> {
  // Normalize each video to the target resolution
  const normalizedPaths: string[] = [];
  const dir = path.dirname(outputPath);

  for (let i = 0; i < videoPaths.length; i++) {
    const normPath = path.join(dir, `norm_${i}.mp4`);
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y', '-i', videoPaths[i],
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
        '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
        '-an', // No audio
        '-t', '30', // Max 30s per clip to keep files small
        '-pix_fmt', 'yuv420p',
        normPath,
      ]);
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Normalize ${i} failed`)));
      ffmpeg.on('error', reject);
    });
    if (fs.existsSync(normPath)) normalizedPaths.push(normPath);
  }

  if (normalizedPaths.length === 0) {
    throw new Error('No videos could be normalized');
  }

  // Concatenate normalized videos
  const listFile = path.join(dir, 'concat_list.txt');
  const listContent = normalizedPaths.map(p => `file '${path.resolve(p).replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listFile, listContent, 'utf-8');

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c', 'copy', outputPath,
    ]);
    ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Concat failed ${code}`)));
    ffmpeg.on('error', reject);
  });
}

/**
 * Compile story video: multiple background clips + audio + subtitles
 * Downloads several short background clips and concatenates them for visual variety.
 */
async function compileStoryVideo(opts: {
  backgroundVideoPath: string;
  audioPath: string;
  subtitlePath: string;
  outputPath: string;
  width: number;
  height: number;
  audioDuration: number;
}): Promise<void> {
  const subtitlePathNormalized = path.resolve(opts.subtitlePath).replace(/\\/g, '/').replace(/:/g, '\\:');
  
  // Subtitle style: short chunks, readable, modern
  const subtitleStyle = 'FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Alignment=2,MarginV=50,Bold=1';

  // CTA image overlay (appears in last 8 seconds)
  const ctaImagePath = path.resolve(path.join(__dirname, '..', 'assets', 'cta', 'subscribete.png')).replace(/\\/g, '/');
  const ctaStart = Math.max(0, opts.audioDuration - 8);
  
  // Build video filter: scale + crop + subtitles + CTA overlay at the end
  let vf = `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase,crop=${opts.width}:${opts.height},subtitles='${subtitlePathNormalized}':force_style='${subtitleStyle}'`;
  
  // Add CTA overlay if the image exists
  const ctaArgs: string[] = [];
  if (fs.existsSync(ctaImagePath.replace(/\//g, '\\'))) {
    ctaArgs.push('-i', ctaImagePath);
    vf = `[0:v]scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase,crop=${opts.width}:${opts.height},subtitles='${subtitlePathNormalized}':force_style='${subtitleStyle}'[bg];[2:v]scale=${Math.floor(opts.width * 0.4)}:-1[cta];[bg][cta]overlay=(W-w)/2:(H-h)/2:enable='gte(t,${ctaStart.toFixed(1)})'`;
  }

  const args = [
    '-y',
    '-stream_loop', '-1',
    '-i', path.resolve(opts.backgroundVideoPath),
    '-i', path.resolve(opts.audioPath),
    ...ctaArgs,
    '-t', opts.audioDuration.toFixed(2),
    '-filter_complex', vf,
    '-map', '[out]' in vf ? '[out]' : '0:v', // Use filter output if complex
    '-c:v', 'libx264',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-map', '1:a',
    '-pix_fmt', 'yuv420p',
    opts.outputPath,
  ];

  // If using simple filter (no CTA image), switch to -vf
  const useComplexFilter = ctaArgs.length > 0;
  const finalArgs = useComplexFilter ? args : [
    '-y',
    '-stream_loop', '-1',
    '-i', path.resolve(opts.backgroundVideoPath),
    '-i', path.resolve(opts.audioPath),
    '-t', opts.audioDuration.toFixed(2),
    '-vf', `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase,crop=${opts.width}:${opts.height},subtitles='${subtitlePathNormalized}':force_style='${subtitleStyle}'`,
    '-c:v', 'libx264',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-map', '0:v',
    '-map', '1:a',
    '-pix_fmt', 'yuv420p',
    opts.outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, finalArgs);
    let stderr = '';
    ffmpeg.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    ffmpeg.on('error', (err) => reject(err));
  });
}

/**
 * Cut a short/reel from a longer video.
 */
async function cutShortFromVideo(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number
): Promise<void> {
  // Re-encode to vertical 9:16 (1080x1920) for shorts/reels
  const args = [
    '-y',
    '-i', inputPath,
    '-ss', startSeconds.toFixed(2),
    '-t', durationSeconds.toFixed(2),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-c:v', 'libx264',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, args);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg cut failed with code ${code}`));
    });
    ffmpeg.on('error', reject);
  });
}

/**
 * Generate a thumbnail image using Pollinations + FFmpeg text overlay.
 */
async function generateThumbnail(
  story: any,
  projectDir: string,
  width: number,
  height: number,
  overlayText: string
): Promise<string> {
  const isVertical = height > width;
  const filename = isVertical ? 'thumb_short.png' : 'thumb_long.png';
  const outputPath = path.join(projectDir, filename);
  const basePath = path.join(projectDir, isVertical ? 'thumb_short_base.png' : 'thumb_long_base.png');

  // Map categories to specific visual themes for the thumbnail
  const categoryVisuals: Record<string, string> = {
    'confesion anonima': 'mysterious person in shadows, dark room, dramatic lighting',
    'venganza epica': 'angry person with dramatic red lighting, fist clenched',
    'historia de terror real': 'dark abandoned house, fog, creepy atmosphere, moonlight',
    'descubri un secreto': 'person peeking through door crack, mysterious light',
    'mi vecino loco': 'suburban house at night, strange lights in window',
    'experiencia paranormal': 'ghostly figure in dark hallway, eerie green light, haunted house',
    'peor cita de mi vida': 'awkward dinner table, restaurant, uncomfortable moment',
    'secreto de familia': 'old family photo, torn, dramatic shadows',
    'me despidieron por esto': 'office desk, angry boss silhouette, dramatic lighting',
    'historia de karma instantaneo': 'person with shocked face, instant karma moment',
  };

  const visual = categoryVisuals[story.category] || 'dramatic cinematic scene, dark atmosphere';

  // Generate base image (WITHOUT text - text added by FFmpeg for reliability)
  const prompt = `${visual}, YouTube thumbnail style, high contrast, vibrant saturated colors, professional photography, 4K quality, no text no letters no words`;
  const seed = Math.floor(Math.random() * 999999);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Pollinations failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(basePath, buffer);

  // Add text overlay with FFmpeg (more reliable than asking AI to write text)
  const shortText = overlayText.slice(0, 18);
  const escapedText = shortText.replace(/'/g, "'\\''").replace(/:/g, '\\:');
  const fontSize = isVertical ? 40 : 58;

  const drawFilter = [
    // Colored gradient border (top and bottom)
    `drawbox=x=0:y=0:w=iw:h=8:color=red@0.9:t=fill`,
    `drawbox=x=0:y=ih-8:w=iw:h=8:color=red@0.9:t=fill`,
    `drawbox=x=0:y=0:w=8:h=ih:color=red@0.9:t=fill`,
    `drawbox=x=iw-8:y=0:w=8:h=ih:color=red@0.9:t=fill`,
    // Dark gradient center band for text
    `drawbox=x=0:y=ih*0.3:w=iw:h=ih*0.4:color=black@0.7:t=fill`,
    // Glow effect (bigger shadow text behind)
    `drawtext=text='${escapedText}':fontsize=${fontSize + 4}:fontcolor=red@0.5:x=(w-text_w)/2+2:y=(h-text_h)/2+2:fontfile='C\\:/Windows/Fonts/impact.ttf'`,
    // Main text - white with thick red border
    `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:borderw=5:bordercolor=red:x=(w-text_w)/2:y=(h-text_h)/2:fontfile='C\\:/Windows/Fonts/impact.ttf'`,
  ].join(',');

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-y', '-i', basePath, '-vf', drawFilter, outputPath,
    ]);
    ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg thumb failed ${code}`)));
    ffmpeg.on('error', reject);
  });

  return outputPath;
}

/**
 * Generate optimized YouTube metadata using OpenAI.
 */
async function generateYouTubeMetadata(story: any): Promise<{
  title: string;
  description: string;
  hashtags: string[];
  shortTitle: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en SEO de YouTube con millones de vistas. Genera metadata VIRAL para videos de storytelling/confesiones. 
            
Reglas para el TITULO:
- Maximo 60 caracteres
- Debe generar CURIOSIDAD extrema
- Usa mayusculas estrategicas
- Emojis opcionales (maximo 1-2)
- El espectador DEBE sentir que necesita ver el video
- NO uses palabras prohibidas: muerte, matar, suicidio, violacion, drogas, sangre
- ALTERNATIVAS: usa "lo impensable", "algo terrible", "nunca imagine", "cambio mi vida"

Reglas para la DESCRIPCION:
- Primeras 2 lineas son las mas importantes (se ven sin expandir)
- Incluye CTA (suscribirse, like, comentar)
- Maximo 500 caracteres

Reglas para HASHTAGS:
- 15-20 hashtags relevantes
- Mezcla populares (#storytime #historia) con especificos
- En espanol

Reglas para TITULO DEL SHORT:
- Version corta y mas impactante (max 40 chars)
- Para TikTok/Reels/Shorts

Responde SOLO con JSON:
{"title":"...","description":"...","hashtags":["#tag1","#tag2"],"shortTitle":"..."}`
          },
          {
            role: 'user',
            content: `Historia: "${story.title}"\nCategoria: ${story.category}\nHook: ${story.hook}\nResumen: ${story.fullText?.slice(0, 200)}`
          }
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) throw new Error('OpenAI failed');

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    let parsed;
    try {
      let jsonStr = content.trim().replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim();
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1')) : {};
    }

    return {
      title: parsed.title || story.title,
      description: parsed.description || `${story.hook}\n\nSuscribete para mas historias!`,
      hashtags: parsed.hashtags || ['#storytime', '#historia', '#viral'],
      shortTitle: parsed.shortTitle || story.title.slice(0, 40),
    };
  } catch {
    return {
      title: story.title,
      description: `${story.hook}\n\nSuscribete para mas historias increibles!`,
      hashtags: ['#storytime', '#historia', '#viral', '#confesion', '#reddit'],
      shortTitle: story.title.slice(0, 40),
    };
  }
}

export default router;
