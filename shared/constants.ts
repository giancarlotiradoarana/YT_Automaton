import type { PipelineStage, VideoFormat } from './types';

// ─── Format Constraints ──────────────────────────────────────────────────────

export const FORMAT_CONSTRAINTS = {
  short: {
    resolution: { width: 1080, height: 1920 },
    sectionCount: 6,
    wordCount: { min: 100, max: 500 },
    durationSeconds: { min: 45, max: 90 },
    subtitleFontSize: 10,
  },
  long_video: {
    resolution: { width: 1920, height: 1080 },
    sectionCount: { min: 8, max: 14 },
    wordCount: { min: 1000, max: 3000 },
    durationMinutes: { min: 8, max: 15 },
    subtitleFontSize: 10,
  },
} as const;

export const THUMBNAIL_RESOLUTION = { width: 1280, height: 720 } as const;

// ─── Video Encoding ──────────────────────────────────────────────────────────

export const VIDEO_ENCODING = {
  codec: 'libx264',
  crf: 23,
  audioCodec: 'aac',
  audioBitrate: '192k',
  subtitleOutlineWidth: 2,
  subtitleAlignment: 'bottom-center',
  subtitleColor: 'white',
  subtitleOutlineColor: 'black',
} as const;

// ─── Retry Configurations ────────────────────────────────────────────────────

export const RETRY_CONFIG = {
  pollinations: {
    maxRetries: 3,
    delayMs: 5000,         // 5 seconds linear delay
    strategy: 'linear' as const,
  },
  youtubeUpload: {
    maxRetries: 3,
    baseDelayMs: 2000,     // 2s, 4s, 8s exponential
    strategy: 'exponential' as const,
  },
  openai: {
    maxRetries: 0,         // No auto-retry, user decides
    strategy: 'none' as const,
  },
  edgeTts: {
    maxRetries: 0,         // No auto-retry, user decides
    strategy: 'none' as const,
  },
  ffmpeg: {
    maxRetries: 0,         // No auto-retry, user decides
    strategy: 'none' as const,
  },
} as const;

// ─── Timeout Values ──────────────────────────────────────────────────────────

export const TIMEOUTS = {
  openaiScript: 60_000,        // 60s for script generation
  openaiSuggestions: 60_000,   // 60s for topic suggestions
  pollinationsImage: 60_000,   // 60s per image
  youtubeOAuth: 60_000,        // 60s for OAuth2 authentication
  voiceGeneration: 0,          // No explicit timeout (process monitored)
  ffmpeg: 0,                   // No explicit timeout (progress tracked)
} as const;

// ─── Upload Validation ───────────────────────────────────────────────────────

export const UPLOAD_LIMITS = {
  titleMaxChars: 100,
  descriptionMaxChars: 5000,
  tagsMaxTotalChars: 500,
  maxFileSizeBytes: 256 * 1024 * 1024 * 1024, // 256 GB
} as const;

export const SUPPORTED_VIDEO_FORMATS = [
  'mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', '3gp',
] as const;

export type SupportedVideoFormat = typeof SUPPORTED_VIDEO_FORMATS[number];

// ─── Topic Suggestions ───────────────────────────────────────────────────────

export const TOPIC_SUGGESTION_LIMITS = {
  count: 8,
  descriptionMaxChars: 200,
  maxTags: 10,
  viralScoreMin: 1,
  viralScoreMax: 10,
  reasoningMaxChars: 300,
} as const;

// ─── Thumbnail ───────────────────────────────────────────────────────────────

export const THUMBNAIL_LIMITS = {
  overlayMaxWords: 4,
} as const;

// ─── Trend Analysis ──────────────────────────────────────────────────────────

export const TREND_ANALYSIS = {
  popularVideosCount: 20,
  nicheVideosCount: 20,
  recentVideosCount: 15,
  nicheDaysRange: 7,
  recentDaysRange: 2,
  cacheExpirationMs: 60 * 60 * 1000, // 1 hour
} as const;

// ─── Pipeline Stage Order ────────────────────────────────────────────────────

export const PIPELINE_STAGES_ORDER: PipelineStage[] = [
  'trend_analysis',
  'format_selection',
  'script_generation',
  'image_generation',
  'voice_generation',
  'video_compilation',
  'thumbnail_generation',
  'upload',
];

// ─── Default Configuration ───────────────────────────────────────────────────

export const DEFAULT_REGION = 'MX';
export const DEFAULT_LANGUAGE = 'es';
export const DEFAULT_PRIVACY_STATUS = 'unlisted' as const;
export const DEFAULT_VOICE_BITRATE = '192k';

// ─── Audio Constraints ───────────────────────────────────────────────────────

export const AUDIO_CONSTRAINTS = {
  minBitrateKbps: 192,
  format: 'mp3' as const,
} as const;
