import type { TrendVideo, TopicSuggestion, AppError } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { TREND_ANALYSIS, TOPIC_SUGGESTION_LIMITS, TIMEOUTS } from '../../../shared/constants';

// ─── ITrendAnalyzer Interface ────────────────────────────────────────────────

export interface ITrendAnalyzer {
  getPopularVideos(region: string): Promise<TrendVideo[]>;
  getVideosByNiche(niche: string, region: string): Promise<TrendVideo[]>;
  getRecentVideosByNiche(niche: string, region: string): Promise<TrendVideo[]>;
  generateTopicSuggestions(trends: TrendVideo[]): Promise<TopicSuggestion[]>;
}

// ─── TrendAnalyzer Implementation ───────────────────────────────────────────

export class TrendAnalyzer implements ITrendAnalyzer {
  private youtubeApiKey: string;
  private openaiApiKey: string;

  constructor(youtubeApiKey: string, openaiApiKey: string) {
    this.youtubeApiKey = youtubeApiKey;
    this.openaiApiKey = openaiApiKey;
  }

  /**
   * Retrieves the top 20 most popular videos from YouTube for a given region.
   * Uses the YouTube Data API v3 videos.list endpoint with chart=mostPopular.
   */
  async getPopularVideos(region: string): Promise<TrendVideo[]> {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,statistics');
    url.searchParams.set('chart', 'mostPopular');
    url.searchParams.set('regionCode', region);
    url.searchParams.set('maxResults', String(TREND_ANALYSIS.popularVideosCount));
    url.searchParams.set('key', this.youtubeApiKey);

    const response = await this.fetchYouTube(url.toString());
    return this.mapVideosResponse(response);
  }

  /**
   * Retrieves the top 20 videos by view count for a niche published within the last 7 days.
   * Uses the YouTube Data API v3 search endpoint with order=viewCount.
   */
  async getVideosByNiche(niche: string, region: string): Promise<TrendVideo[]> {
    const publishedAfter = this.getDateDaysAgo(TREND_ANALYSIS.nicheDaysRange);

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', niche);
    url.searchParams.set('type', 'video');
    url.searchParams.set('order', 'viewCount');
    url.searchParams.set('regionCode', region);
    url.searchParams.set('publishedAfter', publishedAfter);
    url.searchParams.set('maxResults', String(TREND_ANALYSIS.nicheVideosCount));
    url.searchParams.set('key', this.youtubeApiKey);

    const response = await this.fetchYouTube(url.toString());
    return this.mapSearchResponse(response);
  }

  /**
   * Retrieves the 15 most recent videos for a niche published within the last 2 days.
   * Uses the YouTube Data API v3 search endpoint with order=date.
   */
  async getRecentVideosByNiche(niche: string, region: string): Promise<TrendVideo[]> {
    const publishedAfter = this.getDateDaysAgo(TREND_ANALYSIS.recentDaysRange);

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', niche);
    url.searchParams.set('type', 'video');
    url.searchParams.set('order', 'date');
    url.searchParams.set('regionCode', region);
    url.searchParams.set('publishedAfter', publishedAfter);
    url.searchParams.set('maxResults', String(TREND_ANALYSIS.recentVideosCount));
    url.searchParams.set('key', this.youtubeApiKey);

    const response = await this.fetchYouTube(url.toString());
    return this.mapSearchResponse(response);
  }

  /**
   * Sends trend data to OpenAI and returns exactly 8 topic suggestions
   * sorted by viralScore in descending order.
   * Applies a 60-second timeout for the OpenAI call.
   */
  async generateTopicSuggestions(trends: TrendVideo[]): Promise<TopicSuggestion[]> {
    const prompt = this.buildSuggestionPrompt(trends);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.openaiSuggestions);

    try {
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
              content: `You are a YouTube content strategist. Analyze trending videos and suggest viral video topics. Always respond with valid JSON array containing exactly ${TOPIC_SUGGESTION_LIMITS.count} suggestions.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw this.createOpenAIError(
          `OpenAI API returned status ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw this.createOpenAIError('OpenAI returned empty response');
      }

      const parsed = JSON.parse(content);
      const suggestions: TopicSuggestion[] = Array.isArray(parsed)
        ? parsed
        : parsed.suggestions || parsed.topics || [];

      return this.validateAndSortSuggestions(suggestions);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createOpenAITimeoutError();
      }
      if (this.isAppError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown OpenAI error';
      throw this.createOpenAIError(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async fetchYouTube(url: string): Promise<any> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorBody = await response.text();
        throw this.createYouTubeError(
          `YouTube API returned status ${response.status}: ${errorBody}`
        );
      }

      return await response.json();
    } catch (error) {
      if (this.isAppError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown YouTube API error';
      throw this.createYouTubeError(message);
    }
  }

  private mapVideosResponse(data: any): TrendVideo[] {
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: any) => ({
      videoId: item.id,
      title: item.snippet?.title || '',
      channelTitle: item.snippet?.channelTitle || '',
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      publishedAt: item.snippet?.publishedAt || '',
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ||
                    item.snippet?.thumbnails?.default?.url || '',
    }));
  }

  private mapSearchResponse(data: any): TrendVideo[] {
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: any) => ({
      videoId: item.id?.videoId || '',
      title: item.snippet?.title || '',
      channelTitle: item.snippet?.channelTitle || '',
      viewCount: 0, // Search endpoint doesn't return statistics
      publishedAt: item.snippet?.publishedAt || '',
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ||
                    item.snippet?.thumbnails?.default?.url || '',
    }));
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  private buildSuggestionPrompt(trends: TrendVideo[]): string {
    const trendSummary = trends
      .slice(0, 30)
      .map((v, i) => `${i + 1}. "${v.title}" by ${v.channelTitle} (${v.viewCount} views)`)
      .join('\n');

    return `Based on these trending YouTube videos, suggest exactly ${TOPIC_SUGGESTION_LIMITS.count} viral video topic ideas.

Trending Videos:
${trendSummary}

For each suggestion, provide a JSON object with:
- title: catchy video title
- description: brief description (max ${TOPIC_SUGGESTION_LIMITS.descriptionMaxChars} characters)
- tags: array of relevant tags (max ${TOPIC_SUGGESTION_LIMITS.maxTags} tags)
- viralScore: predicted virality 1-10 (${TOPIC_SUGGESTION_LIMITS.viralScoreMin}-${TOPIC_SUGGESTION_LIMITS.viralScoreMax})
- recommendedFormat: either "short" or "long_video"
- reasoning: why this topic will perform well (max ${TOPIC_SUGGESTION_LIMITS.reasoningMaxChars} characters)

Respond with a JSON object: { "suggestions": [...] }
Sort by viralScore from highest to lowest.`;
  }

  /**
   * Validates and sorts the suggestions ensuring they meet field constraints.
   * Returns exactly 8 suggestions sorted by viralScore descending.
   */
  private validateAndSortSuggestions(suggestions: TopicSuggestion[]): TopicSuggestion[] {
    const validated = suggestions.map((s) => ({
      title: String(s.title || ''),
      description: String(s.description || '').slice(0, TOPIC_SUGGESTION_LIMITS.descriptionMaxChars),
      tags: Array.isArray(s.tags)
        ? s.tags.slice(0, TOPIC_SUGGESTION_LIMITS.maxTags).map(String)
        : [],
      viralScore: Math.max(
        TOPIC_SUGGESTION_LIMITS.viralScoreMin,
        Math.min(TOPIC_SUGGESTION_LIMITS.viralScoreMax, Number(s.viralScore) || 5)
      ),
      recommendedFormat: (s.recommendedFormat === 'short' || s.recommendedFormat === 'long_video')
        ? s.recommendedFormat
        : 'short' as const,
      reasoning: String(s.reasoning || '').slice(0, TOPIC_SUGGESTION_LIMITS.reasoningMaxChars),
    }));

    // Sort by viralScore descending
    validated.sort((a, b) => b.viralScore - a.viralScore);

    // Return exactly TOPIC_SUGGESTION_LIMITS.count (8) suggestions
    // Pad with defaults if needed, trim if too many
    while (validated.length < TOPIC_SUGGESTION_LIMITS.count) {
      validated.push({
        title: 'Topic Suggestion',
        description: 'Generated topic suggestion',
        tags: [],
        viralScore: TOPIC_SUGGESTION_LIMITS.viralScoreMin,
        recommendedFormat: 'short',
        reasoning: 'Based on current trends',
      });
    }

    return validated.slice(0, TOPIC_SUGGESTION_LIMITS.count);
  }

  private createYouTubeError(message: string): AppError {
    return {
      code: ErrorCode.YOUTUBE_API_ERROR,
      message,
      service: 'TrendAnalyzer',
      retryable: true,
    };
  }

  private createOpenAIError(message: string): AppError {
    return {
      code: ErrorCode.OPENAI_API_ERROR,
      message,
      service: 'TrendAnalyzer',
      retryable: false,
    };
  }

  private createOpenAITimeoutError(): AppError {
    return {
      code: ErrorCode.OPENAI_TIMEOUT,
      message: 'OpenAI request timed out after 60 seconds',
      service: 'TrendAnalyzer',
      retryable: false,
    };
  }

  private isAppError(error: unknown): error is AppError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'service' in error &&
      'retryable' in error
    );
  }
}
