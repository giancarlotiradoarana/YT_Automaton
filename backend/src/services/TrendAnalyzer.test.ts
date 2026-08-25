import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrendAnalyzer } from './TrendAnalyzer';
import type { TrendVideo, TopicSuggestion } from '../../../shared/types';
import { TREND_ANALYSIS, TOPIC_SUGGESTION_LIMITS } from '../../../shared/constants';

describe('TrendAnalyzer', () => {
  let analyzer: TrendAnalyzer;

  beforeEach(() => {
    analyzer = new TrendAnalyzer('test-youtube-key', 'test-openai-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPopularVideos', () => {
    it('should call YouTube API with correct parameters', async () => {
      const mockResponse = {
        items: [
          {
            id: 'video1',
            snippet: {
              title: 'Test Video',
              channelTitle: 'Test Channel',
              publishedAt: '2024-01-01T00:00:00Z',
              thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
            },
            statistics: { viewCount: '1000' },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await analyzer.getPopularVideos('MX');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        videoId: 'video1',
        title: 'Test Video',
        channelTitle: 'Test Channel',
        viewCount: 1000,
        publishedAt: '2024-01-01T00:00:00Z',
        thumbnailUrl: 'https://example.com/thumb.jpg',
      });

      const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(fetchCall).toContain('chart=mostPopular');
      expect(fetchCall).toContain('regionCode=MX');
      expect(fetchCall).toContain(`maxResults=${TREND_ANALYSIS.popularVideosCount}`);
    });

    it('should throw YouTube error when API returns non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      } as Response);

      await expect(analyzer.getPopularVideos('MX')).rejects.toMatchObject({
        code: 'YOUTUBE_API_ERROR',
        service: 'TrendAnalyzer',
        retryable: true,
      });
    });
  });

  describe('getVideosByNiche', () => {
    it('should call YouTube search API with viewCount order and 7 day range', async () => {
      const mockResponse = { items: [] };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await analyzer.getVideosByNiche('tecnología', 'MX');

      const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(fetchCall).toContain('order=viewCount');
      expect(fetchCall).toContain('q=tecnolog');
      expect(fetchCall).toContain('regionCode=MX');
      expect(fetchCall).toContain(`maxResults=${TREND_ANALYSIS.nicheVideosCount}`);
      expect(fetchCall).toContain('publishedAfter=');
    });
  });

  describe('getRecentVideosByNiche', () => {
    it('should call YouTube search API with date order and 2 day range', async () => {
      const mockResponse = { items: [] };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await analyzer.getRecentVideosByNiche('gaming', 'US');

      const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(fetchCall).toContain('order=date');
      expect(fetchCall).toContain('q=gaming');
      expect(fetchCall).toContain('regionCode=US');
      expect(fetchCall).toContain(`maxResults=${TREND_ANALYSIS.recentVideosCount}`);
    });
  });

  describe('generateTopicSuggestions', () => {
    const mockTrends: TrendVideo[] = [
      {
        videoId: 'v1',
        title: 'Trending Video 1',
        channelTitle: 'Channel 1',
        viewCount: 50000,
        publishedAt: '2024-01-01T00:00:00Z',
        thumbnailUrl: 'https://example.com/1.jpg',
      },
      {
        videoId: 'v2',
        title: 'Trending Video 2',
        channelTitle: 'Channel 2',
        viewCount: 30000,
        publishedAt: '2024-01-02T00:00:00Z',
        thumbnailUrl: 'https://example.com/2.jpg',
      },
    ];

    it('should return exactly 8 suggestions sorted by viralScore descending', async () => {
      const mockSuggestions: TopicSuggestion[] = Array.from({ length: 10 }, (_, i) => ({
        title: `Topic ${i}`,
        description: `Description ${i}`,
        tags: ['tag1', 'tag2'],
        viralScore: Math.floor(Math.random() * 10) + 1,
        recommendedFormat: 'short' as const,
        reasoning: `Reasoning ${i}`,
      }));

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ suggestions: mockSuggestions }),
            },
          }],
        }),
      } as Response);

      const result = await analyzer.generateTopicSuggestions(mockTrends);

      expect(result).toHaveLength(TOPIC_SUGGESTION_LIMITS.count);

      // Verify sorted by viralScore descending
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].viralScore).toBeGreaterThanOrEqual(result[i + 1].viralScore);
      }
    });

    it('should enforce field constraints on suggestions', async () => {
      const mockSuggestions = [{
        title: 'Topic',
        description: 'A'.repeat(300), // exceeds 200 char limit
        tags: Array.from({ length: 15 }, (_, i) => `tag${i}`), // exceeds 10 tag limit
        viralScore: 15, // exceeds max 10
        recommendedFormat: 'invalid_format',
        reasoning: 'R'.repeat(500), // exceeds 300 char limit
      }];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ suggestions: mockSuggestions }),
            },
          }],
        }),
      } as Response);

      const result = await analyzer.generateTopicSuggestions(mockTrends);

      expect(result[0].description.length).toBeLessThanOrEqual(TOPIC_SUGGESTION_LIMITS.descriptionMaxChars);
      expect(result[0].tags.length).toBeLessThanOrEqual(TOPIC_SUGGESTION_LIMITS.maxTags);
      expect(result[0].viralScore).toBeLessThanOrEqual(TOPIC_SUGGESTION_LIMITS.viralScoreMax);
      expect(result[0].viralScore).toBeGreaterThanOrEqual(TOPIC_SUGGESTION_LIMITS.viralScoreMin);
      expect(['short', 'long_video']).toContain(result[0].recommendedFormat);
      expect(result[0].reasoning.length).toBeLessThanOrEqual(TOPIC_SUGGESTION_LIMITS.reasoningMaxChars);
    });

    it('should throw OpenAI timeout error when request exceeds 60s', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

      await expect(analyzer.generateTopicSuggestions(mockTrends)).rejects.toMatchObject({
        code: 'OPENAI_TIMEOUT',
        service: 'TrendAnalyzer',
        retryable: false,
      });
    });

    it('should throw OpenAI error when API returns non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as Response);

      await expect(analyzer.generateTopicSuggestions(mockTrends)).rejects.toMatchObject({
        code: 'OPENAI_API_ERROR',
        service: 'TrendAnalyzer',
        retryable: false,
      });
    });

    it('should pad suggestions to 8 if OpenAI returns fewer', async () => {
      const mockSuggestions = [
        {
          title: 'Only One Topic',
          description: 'Only topic',
          tags: ['tag1'],
          viralScore: 8,
          recommendedFormat: 'long_video',
          reasoning: 'Good topic',
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ suggestions: mockSuggestions }),
            },
          }],
        }),
      } as Response);

      const result = await analyzer.generateTopicSuggestions(mockTrends);
      expect(result).toHaveLength(TOPIC_SUGGESTION_LIMITS.count);
    });
  });
});
