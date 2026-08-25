import { Router, Request, Response } from 'express';
import { TrendAnalyzer } from '../services/TrendAnalyzer';
import type { TrendVideo, AppError } from '../../../shared/types';
import { DEFAULT_REGION } from '../../../shared/constants';

const router = Router();

/**
 * Helper to get a TrendAnalyzer instance from environment variables.
 * In a production setup this would be injected via DI.
 */
function createTrendAnalyzer(): TrendAnalyzer {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  return new TrendAnalyzer(youtubeApiKey, openaiApiKey);
}

/**
 * GET /api/trends/:region
 * Retrieves top 20 popular videos for a given region.
 * If no niche is specified, returns general trending videos.
 */
router.get('/:region', async (req: Request, res: Response) => {
  try {
    const region = req.params.region || DEFAULT_REGION;
    const analyzer = createTrendAnalyzer();
    const videos = await analyzer.getPopularVideos(region);
    res.json({ videos });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * GET /api/trends/:region/:niche
 * Retrieves top 20 videos by view count for a niche (published within 7 days)
 * and 15 most recent videos for that niche (published within 2 days).
 */
router.get('/:region/:niche', async (req: Request, res: Response) => {
  try {
    const { region, niche } = req.params;
    const analyzer = createTrendAnalyzer();

    const [nicheVideos, recentVideos] = await Promise.all([
      analyzer.getVideosByNiche(niche, region || DEFAULT_REGION),
      analyzer.getRecentVideosByNiche(niche, region || DEFAULT_REGION),
    ]);

    res.json({ nicheVideos, recentVideos });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * POST /api/trends/suggestions
 * Generates 8 topic suggestions from provided trend data using OpenAI.
 * Expects body: { trends: TrendVideo[] }
 */
router.post('/suggestions', async (req: Request, res: Response) => {
  try {
    const { trends } = req.body as { trends: TrendVideo[] };

    if (!trends || !Array.isArray(trends) || trends.length === 0) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Request body must include a non-empty "trends" array',
        service: 'TrendAnalyzer',
        retryable: false,
      } satisfies AppError);
      return;
    }

    const analyzer = createTrendAnalyzer();
    const suggestions = await analyzer.generateTopicSuggestions(trends);
    res.json({ suggestions });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * Maps errors to appropriate HTTP responses.
 */
function handleError(res: Response, error: unknown): void {
  if (isAppError(error)) {
    const statusCode = getStatusCodeForError(error);
    res.status(statusCode).json(error);
    return;
  }

  const err = error as unknown;
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message,
    service: 'TrendAnalyzer',
    retryable: false,
  } satisfies AppError);
}

function getStatusCodeForError(error: AppError): number {
  switch (error.code) {
    case 'YOUTUBE_API_ERROR':
      return 502;
    case 'OPENAI_API_ERROR':
      return 502;
    case 'OPENAI_TIMEOUT':
      return 504;
    default:
      return 500;
  }
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'service' in error &&
    'retryable' in error
  );
}

export default router;
