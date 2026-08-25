import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import multer from 'multer';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';
const router = Router();

// Multer for file upload
const upload = multer({ dest: path.join(process.cwd(), 'temp', 'uploads') });

const LOVE_TYPE_PROMPTS: Record<string, string> = {
  desamor: 'una ruptura dolorosa, cuando el amor termina y no puedes dejarlo ir. El narrador esta destrozado recordando los momentos felices que ya no volveran.',
  no_correspondido: 'amar a alguien que no te corresponde, dar todo sin recibir nada. El dolor de ver a esa persona con alguien mas mientras tu mueres por dentro.',
  distancia: 'dos personas que se aman separadas por la distancia. Noches largas mirando el telefono, extraÃ±ando su presencia fisica.',
  perdido: 'recordar un amor del pasado que fue hermoso pero termino. Nostalgia pura, preguntandose que hubiera pasado si...',
  imposible: 'amar a alguien prohibido o inalcanzable. Puede ser alguien comprometido o de mundos diferentes.',
  traicion: 'descubrir una infidelidad, sentir que tu mundo se derrumba. La confianza rota y el corazon destrozado.',
  despedida: 'el ultimo adios, saber que no volveras a ver a esa persona. Aceptar que se acabo pero no poder soltar.',
  soledad: 'la vida despues de perder a alguien. Las noches sola/solo, el silencio de la casa, aprender a vivir sin esa persona.',
};

/**
 * POST /api/song/generate
 * Generates song lyrics + Suno description for a romantic song.
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { loveType } = req.body;
    const context = LOVE_TYPE_PROMPTS[loveType] || LOVE_TYPE_PROMPTS['desamor'];

    const apiKey = process.env.OPENAI_API_KEY || '';
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
            content: `Eres el compositor mas emotivo del mundo. Tus canciones han hecho llorar a millones. Escribes como si cada palabra fuera tu ultimo aliento. Tus letras son tan reales y dolorosas que la gente siente un nudo en la garganta desde la primera linea.

Tu estilo combina:
- La profundidad poetica de Joaquin Sabina
- El dolor visceral de Ricardo Arjona en "Fuiste tu"
- La vulnerabilidad de Luis Fonsi en "No me doy por vencido"
- La crudeza emocional de Sin Bandera en "Que me alcance la vida"

Genera una cancion sobre: ${context}

Responde con JSON:
{
  "title": "Titulo emotivo y poetico",
  "sunoDescription": "Descripcion para Suno: genero, BPM, instrumentos, voz, emocion. Max 200 chars.",
  "lyrics": "Letra completa con [Verso 1], [Pre-coro], [Coro], [Verso 2], [Bridge], [Coro final]",
  "style": "Genero musical"
}

REGLAS PARA LA LETRA:
- Escribe como si estuvieras llorando mientras compones
- Cada verso debe provocar un escalofrio o un nudo en la garganta
- Usa imagenes sensoriales: olores, sabores, texturas (su perfume en la almohada, el sabor de su ultimo beso)
- Incluye un momento de QUIEBRE donde la emocion explota (una frase que destruya al oyente)
- El coro debe ser tan simple y doloroso que cualquiera lo cante llorando
- Usa preguntas sin respuesta ("por que te fuiste si yo daba todo?")
- Mezcla momentos de esperanza con golpes de realidad
- Los versos deben contar una HISTORIA, no solo emociones genericas
- Incluye UN detalle hiperspecifico que haga la cancion unica (un lugar, un objeto, un momento exacto)
- La cancion debe escalar emocionalmente: tristeza â†’ dolor â†’ desesperacion â†’ aceptacion dolorosa
- El final debe dejar un vacio en el pecho del oyente
- NO uses cliches como "sin ti no soy nada" o "me muero sin ti" â€” busca formas NUEVAS de expresar el dolor
- Cada linea debe poder ser un caption de Instagram que haga llorar a alguien`
          },
          { role: 'user', content: `Genera la cancion romantica mas dolorosa y hermosa que puedas sobre "${loveType}". Que cualquiera que la escuche sienta que fue escrita para el/ella.` }
        ],
        temperature: 0.9,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI failed: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      let jsonStr = content.trim();
      // Remove markdown code blocks
      const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) jsonStr = codeMatch[1].trim();
      // Fix trailing commas
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
      parsed = JSON.parse(jsonStr);
    } catch {
      // If JSON parse fails, extract fields manually with regex
      try {
        const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
        const descMatch = content.match(/"sunoDescription"\s*:\s*"([^"]+)"/);
        const styleMatch = content.match(/"style"\s*:\s*"([^"]+)"/);
        // Extract lyrics (everything between "lyrics": " and the closing ")
        const lyricsMatch = content.match(/"lyrics"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        
        parsed = {
          title: titleMatch?.[1] || 'Cancion sin titulo',
          sunoDescription: descMatch?.[1] || 'Balada romantica emotiva en espaÃ±ol, tempo lento, piano y cuerdas, voz vulnerable',
          lyrics: lyricsMatch?.[1]?.replace(/\\n/g, '\n') || content.slice(content.indexOf('[Verso'), content.lastIndexOf(']') + 1) || content,
          style: styleMatch?.[1] || 'balada romantica',
        };
      } catch {
        parsed = {
          title: 'Cancion romantica',
          sunoDescription: 'Balada romantica emotiva en espaÃ±ol, tempo lento 65 BPM, piano melancolico, voz vulnerable con vibrato emocional',
          lyrics: content,
          style: 'balada',
        };
      }
    }

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error generando cancion' });
  }
});

/**
 * POST /api/song/create-video
 * Creates a music video from uploaded MP3 + lyrics.
 * 1. OpenAI generates image prompts for each section of the lyrics
 * 2. Pollinations generates images for each section
 * 3. FFmpeg compiles: images (with zoom/pan) + audio + subtitles
 * 4. Generates thumbnail with characters
 * 5. Generates YouTube metadata
 */
router.post('/create-video', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const audioFile = req.file;
    const { lyrics, title, loveType } = req.body;

    if (!audioFile) {
      res.status(400).json({ message: 'Audio file is required' });
      return;
    }
    if (!lyrics) {
      res.status(400).json({ message: 'Lyrics are required' });
      return;
    }

    const projectDir = path.join('C:\\ytvideos', `song_${Date.now()}`);
    fs.mkdirSync(projectDir, { recursive: true });

    const audioPath = path.join(projectDir, 'song.mp3');
    fs.copyFileSync(audioFile.path, audioPath);

    // Get audio duration
    const duration = await getAudioDuration(audioPath);

    // Step 1: Generate VTT subtitles from lyrics
    const vttPath = path.join(projectDir, 'lyrics.vtt');
    generateLyricsVTT(lyrics, duration, vttPath);

    // Step 2: OpenAI generates image prompts for each section
    const sections = extractSections(lyrics);
    const imagePrompts = await generateImagePrompts(sections, title, loveType);

    // Step 3: Download images from Pollinations (in parallel)
    const imgDir = path.join(projectDir, 'images');
    fs.mkdirSync(imgDir, { recursive: true });
    const imagePaths = await downloadSectionImages(imagePrompts, imgDir);

    // Step 4: Create animated clips from images (Ken Burns effect)
    const clipsDir = path.join(projectDir, 'clips');
    fs.mkdirSync(clipsDir, { recursive: true });
    const clipDuration = duration / Math.max(imagePaths.length, 1);
    
    // Convert each image to a video clip with zoom/pan
    const clipPaths: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const clipPath = path.join(clipsDir, `clip_${String(i).padStart(2, '0')}.mp4`);
      const fps = 30;
      const frames = Math.floor(clipDuration * fps);
      const effect = i % 4;
      let zoompan: string;
      switch (effect) {
        case 0: zoompan = `zoompan=z='min(zoom+0.004,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${fps}`; break;
        case 1: zoompan = `zoompan=z='if(eq(on,1),1.5,max(zoom-0.004,1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${fps}`; break;
        case 2: zoompan = `zoompan=z='min(zoom+0.003,1.3)':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${fps}`; break;
        default: zoompan = `zoompan=z='min(zoom+0.003,1.3)':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${frames}':d=${frames}:s=1920x1080:fps=${fps}`; break;
      }
      
      try {
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn(FFMPEG_PATH, [
            '-y', '-loop', '1', '-i', imagePaths[i],
            '-vf', `scale=2048:-1,${zoompan}`,
            '-t', clipDuration.toFixed(2),
            '-c:v', 'libx264', '-crf', '25', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
            clipPath,
          ]);
          ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Clip ${i} failed`)));
          ffmpeg.on('error', reject);
        });
        clipPaths.push(clipPath);
      } catch { clipPaths.push(imagePaths[i]); /* fallback to static */ }
    }

    // Concatenate clips
    const clipsListPath = path.join(projectDir, 'clips_list.txt');
    const clipsListContent = clipPaths.map(p => `file '${path.resolve(p).replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(clipsListPath, clipsListContent, 'utf-8');

    // Step 5: Compile final video (clips + audio + subtitles)
    const outputPath = path.join(projectDir, 'music_video.mp4');
    // Copy VTT to a path without spaces (FFmpeg subtitle filter issue)
    const safeVttPath = path.join(projectDir, 'subs.vtt');
    fs.copyFileSync(vttPath, safeVttPath);
    const vttNorm = path.resolve(safeVttPath).replace(/\\/g, '/').replace(/:/g, '\\:');
    const subtitleStyle = 'FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Alignment=2,MarginV=40,Bold=1,Italic=1';

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', clipsListPath,
        '-i', audioPath,
        '-t', duration.toFixed(2),
        '-vf', `subtitles='${vttNorm}':force_style='${subtitleStyle}'`,
        '-c:v', 'libx264', '-crf', '23',
        '-c:a', 'aac', '-b:a', '192k',
        '-map', '0:v', '-map', '1:a',
        '-pix_fmt', 'yuv420p',
        outputPath,
      ]);
      let stderr = '';
      ffmpeg.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg failed ${code}: ${stderr.slice(-300)}`)));
      ffmpeg.on('error', reject);
    });

    // Step 6: Generate short/reel (vertical, chorus section ~60s)
    const shortPath = path.join(projectDir, 'short.mp4');
    const chorusStart = Math.max(0, duration * 0.25);
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y', '-i', outputPath,
        '-ss', chorusStart.toFixed(2), '-t', '60',
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-c:v', 'libx264', '-crf', '23', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
        shortPath,
      ]);
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('Short failed')));
      ffmpeg.on('error', reject);
    });

    // Step 7: Generate thumbnail FIRST (before rate limit hits from video images)
    const thumbPath = path.join(projectDir, 'thumbnail.png');
    // Wait for rate limit reset
    await new Promise(r => setTimeout(r, 15000));
    await generateSongThumbnail(title, loveType, thumbPath);

    // Step 8: Generate YouTube metadata
    const metadata = await generateSongMetadata(title, loveType, lyrics);

    const folderName = path.basename(projectDir);
    res.json({
      videoUrl: `/api/files/songs/${folderName}/music_video.mp4`,
      shortUrl: `/api/files/songs/${folderName}/short.mp4`,
      thumbnailUrl: `/api/files/songs/${folderName}/thumbnail.png`,
      duration,
      metadata,
      imagesGenerated: imagePaths.length,
    });
  } catch (err: any) {
    console.error('Song video error:', err);
    res.status(500).json({ message: err.message || 'Error creando video' });
  }
});

/**
 * Extract sections from lyrics (split by [Verse], [Chorus], etc.)
 */
function extractSections(lyrics: string): string[] {
  const parts = lyrics.split(/\[.*?\]/).filter(s => s.trim().length > 10);
  if (parts.length === 0) {
    // Split by double newlines if no section markers
    return lyrics.split(/\n\n+/).filter(s => s.trim().length > 10);
  }
  return parts.map(p => p.trim());
}

/**
 * Use OpenAI to generate image prompts for each lyric section.
 */
async function generateImagePrompts(sections: string[], title: string, loveType: string): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `Generate EXACTLY 10 image descriptions (in English) for a romantic music video. Read the LYRICS carefully and create images that visually represent WHAT THE SONG IS SAYING at each point.

CRITICAL RULES:
- Each image MUST directly illustrate what the lyrics describe in that section
- If lyrics say "rain" -> show rain. If lyrics say "empty bed" -> show empty bed. Be LITERAL.
- Use extremely cinematic quality: shallow depth of field, dramatic lighting, rich colors
- Include specific details: time of day, weather, location, objects, emotional expressions
- Mix close-ups (hands, tears, faces) with wide atmospheric shots (cityscapes, sunsets, rain)
- Color palette: warm golds for happy memories, cold blues for sadness, deep reds for passion
- Every image should be so beautiful it could be a movie poster
- NO text in images, NO letters, NO words

Return ONLY a JSON array of exactly 10 strings.`
        }, {
          role: 'user',
          content: `Song: "${title}" (${loveType})\n\nFULL LYRICS:\n${sections.join('\n\n').slice(0, 2000)}\n\nGenerate 7 images that follow the story of the song from beginning to end.`
        }],
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error('OpenAI failed');
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    let prompts: string[];
    try {
      prompts = JSON.parse(content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim());
    } catch {
      const match = content.match(/\[[\s\S]*\]/);
      prompts = match ? JSON.parse(match[0]) : [];
    }
    // Ensure we have enough prompts
    while (prompts.length < sections.length) {
      prompts.push('romantic couple silhouette sunset, cinematic lighting, emotional');
    }
    return prompts.slice(0, sections.length);
  } catch {
    return sections.map(() => 'romantic emotional scene, couple, cinematic lighting, high contrast, music video style');
  }
}

/**
 * Download images from OpenAI sequentially with delay.
 */
async function downloadSectionImages(prompts: string[], outputDir: string): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const valid: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 13000));
    
    const filePath = path.join(outputDir, 'img_' + String(i).padStart(2, '0') + '.png');
    
    // Retry up to 3 times on failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          console.log('Retry ' + attempt + ' for image ' + i);
          await new Promise(r => setTimeout(r, 10000));
        }
        
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({ model: 'gpt-image-1', prompt: prompts[i].slice(0, 900) + ', cinematic, emotional, music video, ultra sharp focus, 8K resolution, hyper detailed', n: 1, quality: 'high' }),
        });

        if (!response.ok) {
          console.error('DALL-E failed for image ' + i + ': ' + response.status);
          if (response.status === 429) await new Promise(r => setTimeout(r, 30000));
          continue;
        }

        const data = await response.json();
        const imageData = data.data && data.data[0];
        if (!imageData) continue;

        let buffer: Buffer;
        if (imageData.b64_json) {
          buffer = Buffer.from(imageData.b64_json, 'base64');
        } else if (imageData.url) {
          const imgRes = await fetch(imageData.url);
          if (!imgRes.ok) continue;
          buffer = Buffer.from(await imgRes.arrayBuffer());
        } else {
          continue;
        }

        fs.writeFileSync(filePath, buffer);
        valid.push(filePath);
        console.log('Generated image ' + i + ' of ' + prompts.length);
        break; // Success - exit retry loop
      } catch (err) {
        console.error('Error image ' + i + ' attempt ' + attempt + ':', err);
        if (attempt === 2) console.error('Gave up on image ' + i);
      }
    }
  }

  if (valid.length === 0) throw new Error('No images generated with DALL-E');
  return valid;
}

/**
 * Generate a thumbnail with DALL-E OpenAI.
 */
async function generateSongThumbnail(title: string, loveType: string, outputPath: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const shortTitle = title.slice(0, 20).toUpperCase();
  
  // Generate thumbnail image with DALL-E
  const prompt = `Professional music video thumbnail. A beautiful young couple in an emotional moment - she looks away with tears while he reaches for her hand. Dramatic cinematic lighting, golden hour sunset in background, rain drops visible. Colors: warm golds and deep blues. Extremely detailed faces with realistic emotions. High quality professional photography, shallow depth of field. Album cover quality. The title "${title}" appears in elegant white script font at the bottom.`;

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    });

    if (!response.ok) throw new Error(`DALL-E thumbnail failed: ${response.status}`);

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) throw new Error('No image URL');

    const imgRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  } catch (err) {
    // Fallback: create simple thumbnail with FFmpeg text on black
    await new Promise<void>((resolve, reject) => {
      const escaped = shortTitle.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=1',
        '-vf', `drawtext=text='${escaped}':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:fontfile='C\\:/Windows/Fonts/impact.ttf'`,
        '-frames:v', '1', outputPath,
      ]);
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject());
      ffmpeg.on('error', reject);
    });
  }
}

/**
 * Generate YouTube metadata for the song.
 */
async function generateSongMetadata(title: string, loveType: string, lyrics: string): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: 'Genera metadata COMPLETA para YouTube de una cancion romantica. Responde JSON: {"title":"titulo SEO max 70 chars con emojis","description":"descripcion 500+ chars con CTA, emojis, keywords","hashtags":"#tag1 #tag2... 20+ hashtags","tags":["tag1","tag2"...15 tags separados],"bestTime":"mejor hora para publicar","category":"Music"}'
        }, {
          role: 'user',
          content: `Cancion: "${title}", tipo: ${loveType}, letra: ${lyrics.slice(0, 300)}`
        }],
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error('Metadata failed');
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    try {
      return JSON.parse(content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim().replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return { title: `${title} | Cancion romantica`, description: `${title} - Balada que llega al alma.\n\nSuscribete y activa la campanita.\nComenta si te hizo llorar.\n\n${lyrics.slice(0, 200)}`, hashtags: '#musica #balada #romantica #amor #desamor #cancion #llorar', tags: ['musica romantica', 'balada', 'cancion triste', loveType], bestTime: 'Viernes 6-8pm', category: 'Music' };
    }
  } catch {
    return { title: `${title} | Balada romantica`, description: 'Suscribete para mas canciones', hashtags: '#musica #balada #romantica #amor', tags: ['musica', 'balada', 'romantica'], bestTime: 'Viernes 6-8pm', category: 'Music' };
  }
}

function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = spawn(FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe'), [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', audioPath,
    ]);
    let out = '';
    ffprobe.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    ffprobe.on('close', () => resolve(parseFloat(out.trim()) || 180));
    ffprobe.on('error', () => resolve(180));
  });
}

function generateLyricsVTT(lyrics: string, duration: number, outputPath: string) {
  const lines = lyrics.split('\n').filter(l => l.trim() && !l.trim().startsWith('['));
  const totalLines = lines.length;
  const timePerLine = duration / totalLines;
  
  let vtt = 'WEBVTT\n\n';
  let t = 0;
  for (const line of lines) {
    const start = formatTime(t);
    const end = formatTime(t + timePerLine);
    vtt += `${start} --> ${end}\n${line.trim()}\n\n`;
    t += timePerLine;
  }
  fs.writeFileSync(outputPath, vtt, 'utf-8');
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

async function downloadPexelsVideo(query: string, outputPath: string) {
  const apiKey = process.env.PEXELS_API_KEY || 'gTkUj0t7Jy7x0MMXvv6TxnylsZJfJulNToeyjHOX2BNpQmmRbRoRPno7';
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&size=medium`, {
    headers: { 'Authorization': apiKey },
  });
  if (!res.ok) throw new Error('Pexels search failed');
  const data = await res.json();
  const video = data.videos?.[0];
  if (!video) throw new Error('No video found');
  const file = video.video_files?.find((f: any) => f.quality === 'hd') || video.video_files?.[0];
  if (!file) throw new Error('No video file');
  
  const videoRes = await fetch(file.link);
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

/**
 * POST /api/song/upload-youtube
 * Uploads a video to YouTube using OAuth2.
 * Body (FormData): videoPath, title, description, tags, privacyStatus
 */
router.post('/upload-youtube', async (req: Request, res: Response) => {
  try {
    const { videoPath, title, description, tags, privacyStatus } = req.body;

    if (!videoPath || !title) {
      res.status(400).json({ message: 'videoPath and title are required' });
      return;
    }

    // Check if video file exists
    const fullVideoPath = path.join(process.cwd(), videoPath.replace('/api/files/', 'temp/'));
    if (!fs.existsSync(fullVideoPath)) {
      res.status(400).json({ message: 'Video file not found: ' + fullVideoPath });
      return;
    }

    // Use YouTube API to upload
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID || '',
      process.env.YOUTUBE_CLIENT_SECRET || '',
      'http://localhost:3001/api/song/youtube-callback'
    );

    // Check if we have stored tokens
    const tokensPath = path.join(process.cwd(), 'temp', 'youtube_tokens.json');
    if (fs.existsSync(tokensPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
      oauth2Client.setCredentials(tokens);

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: title.slice(0, 100),
            description: (description || '').slice(0, 5000),
            tags: Array.isArray(tags) ? tags : (tags || '').split(',').map((t: string) => t.trim()),
            categoryId: '10', // Music
          },
          status: {
            privacyStatus: privacyStatus || 'unlisted',
          },
        },
        media: {
          body: fs.createReadStream(fullVideoPath),
        },
      });

      res.json({
        success: true,
        videoId: response.data.id,
        videoUrl: 'https://www.youtube.com/watch?v=' + response.data.id,
      });
    } else {
      // No tokens - need to authenticate first
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload'],
      });

      res.json({
        success: false,
        needsAuth: true,
        authUrl,
        message: 'Necesitas autenticarte con YouTube primero. Abre el link.',
      });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error subiendo a YouTube' });
  }
});

/**
 * GET /api/song/youtube-callback
 * OAuth2 callback for YouTube authentication.
 */
router.get('/youtube-callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) {
      res.status(400).send('No code provided');
      return;
    }

    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID || '',
      process.env.YOUTUBE_CLIENT_SECRET || '',
      'http://localhost:3001/api/song/youtube-callback'
    );

    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Save tokens for future use
    const tokensPath = path.join(process.cwd(), 'temp', 'youtube_tokens.json');
    fs.mkdirSync(path.dirname(tokensPath), { recursive: true });
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));

    res.send('<h1>Autenticacion exitosa!</h1><p>Puedes cerrar esta ventana y volver a la plataforma.</p><script>window.close()</script>');
  } catch (err: any) {
    res.status(500).send('Error: ' + err.message);
  }
});

export default router;











