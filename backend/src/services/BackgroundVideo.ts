import * as fs from 'fs';
import * as path from 'path';

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'gTkUj0t7Jy7x0MMXvv6TxnylsZJfJulNToeyjHOX2BNpQmmRbRoRPno7';

// Search terms for background videos that work well with storytelling
const BACKGROUND_QUERIES = [
  'satisfying',
  'relaxing nature',
  'city night timelapse',
  'rain window',
  'ocean waves',
  'driving night',
  'abstract colors',
  'clouds timelapse',
  'walking city',
  'fire fireplace',
];

export interface BackgroundVideoResult {
  videoPath: string;
  durationSeconds: number;
  source: string;
}

/**
 * Downloads background videos from Pexels for use as storytelling backdrop.
 * Uses segment-specific search to find videos that match what the narration says.
 */
export class BackgroundVideoService {
  private outputDir: string;
  private openaiApiKey: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'temp', 'backgrounds');
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
  }

  setOutputDir(dir: string) {
    this.outputDir = dir;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Download MULTIPLE background videos that match specific segments of the narration.
   * Uses OpenAI to extract search keywords from the story text, then searches Pexels
   * for relevant video clips for each segment.
   */
  async getSegmentedBackgrounds(
    storyText: string,
    totalDuration: number,
    segmentCount: number = 6
  ): Promise<string[]> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Step 1: Use OpenAI to extract search keywords for each segment
    const keywords = await this.extractVideoKeywords(storyText, segmentCount);

    // Step 2: Search and download videos in PARALLEL for speed
    const downloadPromises = keywords.map((kw, i) => this.searchAndDownload(kw, i));
    const results = await Promise.all(downloadPromises);
    const videoPaths = results.filter((p): p is string => p !== null);

    // If we got fewer videos than expected, repeat what we have
    if (videoPaths.length === 0) {
      // Ultimate fallback: download one generic video
      const fallback = await this.searchAndDownload('cinematic atmospheric mood', 0);
      if (fallback) videoPaths.push(fallback);
    }

    return videoPaths;
  }

  /**
   * Legacy method for backwards compatibility
   */
  async getBackgroundVideo(storyCategory: string, minDuration: number): Promise<BackgroundVideoResult> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    const query = this.getQueryForCategory(storyCategory);
    const videoPath = await this.searchAndDownload(query, 0);
    return {
      videoPath: videoPath || '',
      durationSeconds: 0,
      source: 'pexels',
    };
  }

  /**
   * Use OpenAI to extract precise English search terms for each story segment.
   */
  private async extractVideoKeywords(storyText: string, segmentCount: number): Promise<string[]> {
    try {
      // For many segments, ask for diverse keywords by breaking story into parts
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a video editor choosing B-roll footage for a YouTube storytime video. Read this story and extract EXACTLY ${segmentCount} short video search queries (in English, 2-4 words each) that would visually MATCH what's being narrated at each point.

RULES:
- Each query must represent what the narrator is DESCRIBING at that moment
- Be VERY specific: "woman looking phone" not "technology"
- Think cinematically: locations, actions, emotions, objects mentioned
- Cover the story sequentially from start to finish
- The LAST query should be: "subscribe button animation" (for the CTA ending)
- NO abstract queries - only concrete visual scenes

Return ONLY a JSON array of ${segmentCount} strings.`
            },
            { role: 'user', content: storyText.slice(0, 4000) }
          ],
          temperature: 0.4,
        }),
      });

      if (!response.ok) throw new Error('OpenAI failed');

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '[]';
      
      let keywords: string[];
      try {
        keywords = JSON.parse(content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim());
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        keywords = match ? JSON.parse(match[0]) : [];
      }

      // If we got fewer than needed, repeat with variations
      while (keywords.length < segmentCount) {
        const existing = keywords[keywords.length % Math.max(keywords.length, 1)] || 'cinematic mood';
        keywords.push(existing + ' different angle');
      }

      return keywords.slice(0, segmentCount);
    } catch {
      // Fallback: generate generic atmospheric keywords
      const fallbacks = ['dark moody atmosphere', 'person walking night', 'dramatic lighting', 'city night rain', 'suspense mystery', 'emotional moment', 'dark corridor', 'rain window', 'sunset dramatic', 'forest fog'];
      const result: string[] = [];
      for (let i = 0; i < segmentCount; i++) {
        result.push(fallbacks[i % fallbacks.length]);
      }
      return result;
    }
  }

  /**
   * Search Pexels and download a video matching the query.
   */
  private async searchAndDownload(query: string, index: number): Promise<string | null> {
    try {
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&size=medium`;
      const response = await fetch(url, {
        headers: { 'Authorization': PEXELS_API_KEY },
      });

      if (!response.ok) return null;

      const data = await response.json();
      const videos = data.videos || [];

      if (videos.length === 0) return null;

      // Pick a random video from results for variety
      const video = videos[Math.floor(Math.random() * Math.min(videos.length, 3))];
      const hdFile = video.video_files?.find((f: any) => f.quality === 'hd' || f.height >= 720);
      const fileUrl = hdFile?.link || video.video_files?.[0]?.link;

      if (!fileUrl) return null;

      // Download
      const filename = `bg_${index}_${Date.now()}.mp4`;
      const filePath = path.join(this.outputDir, filename);
      const videoResponse = await fetch(fileUrl);
      if (!videoResponse.ok) return null;

      const buffer = Buffer.from(await videoResponse.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch {
      return null;
    }
  }

  /**
   * Map story categories to appropriate background video search terms.
   */
  private getQueryForCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      'confesion anonima': 'rain window night',
      'venganza epica': 'dark city night',
      'historia de terror real': 'dark forest fog',
      'descubri un secreto': 'mystery dark corridor',
      'mi vecino loco': 'suburban neighborhood',
      'experiencia paranormal': 'dark abandoned house',
      'peor cita de mi vida': 'restaurant night city',
      'secreto de familia': 'old house interior',
      'me despidieron por esto': 'office building city',
      'historia de karma instantaneo': 'satisfying compilation',
    };

    return categoryMap[category] || BACKGROUND_QUERIES[Math.floor(Math.random() * BACKGROUND_QUERIES.length)];
  }
}
