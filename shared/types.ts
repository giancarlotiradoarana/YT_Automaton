// ─── Base Types ──────────────────────────────────────────────────────────────

export type VideoFormat = 'short' | 'long_video';
export type Region = string; // ISO country code (e.g., 'MX', 'ES', 'US')
export type PipelineStage =
  | 'trend_analysis'
  | 'format_selection'
  | 'script_generation'
  | 'image_generation'
  | 'voice_generation'
  | 'video_compilation'
  | 'thumbnail_generation'
  | 'upload';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'error';

// ─── TrendAnalyzer Service ───────────────────────────────────────────────────

export interface TrendVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  publishedAt: string;
  thumbnailUrl: string;
}

export interface TopicSuggestion {
  title: string;
  description: string;       // max 200 chars
  tags: string[];            // max 10
  viralScore: number;        // 1-10
  recommendedFormat: VideoFormat;
  reasoning: string;         // max 300 chars
}

// ─── ScriptGenerator Service ─────────────────────────────────────────────────

export interface ScriptSection {
  number: number;
  title: string;
  narration: string;
  visualDescription: string;
}

export interface Script {
  hook: string;
  introduction: string;
  sections: ScriptSection[];
  closingCTA: string;
  format: VideoFormat;
  totalWordCount: number;
  metadata: {
    topic: string;
    generatedAt: string;
    language: string;         // default: 'es'
  };
}

// ─── ImageGenerator Service ──────────────────────────────────────────────────

export interface GeneratedImage {
  sectionNumber: number;
  imageUrl: string;
  localPath: string;
  prompt: string;
}

// ─── VoiceGenerator Service ──────────────────────────────────────────────────

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender: string;
}

export interface VoiceResult {
  audioPath: string;
  subtitlePath: string;  // VTT format
  durationSeconds: number;
}

// ─── VideoEditor Service ─────────────────────────────────────────────────────

export interface CompilationInputs {
  images: GeneratedImage[];
  audioPath: string;
  subtitlePath: string;
  format: VideoFormat;
}

export interface CompilationResult {
  videoPath: string;
  durationSeconds: number;
  fileSize: number;
}

export interface ValidationResult {
  valid: boolean;
  missingInputs: string[];
}

// ─── ThumbnailGenerator Service ──────────────────────────────────────────────

export interface ThumbnailResult {
  imagePath: string;
  prompt: string;
  suggestedOverlayText: string[]; // max 4 words
}

// ─── YouTubeUploader Service ─────────────────────────────────────────────────

export type PrivacyStatus = 'public' | 'unlisted' | 'private';

export interface UploadMetadata {
  title: string;           // max 100 chars
  description: string;     // max 5000 chars
  tags: string[];          // max 500 chars total
  privacyStatus: PrivacyStatus;
  thumbnailPath: string;
}

export interface UploadResult {
  videoUrl: string;
  videoId: string;
}

// ─── Pipeline Controller ─────────────────────────────────────────────────────

export interface PipelineState {
  projectId: string;
  currentStage: PipelineStage;
  stages: Record<PipelineStage, StageStatus>;
  topic?: TopicSuggestion;
  format?: VideoFormat;
  script?: Script;
  images?: GeneratedImage[];
  voice?: VoiceResult;
  video?: CompilationResult;
  thumbnail?: ThumbnailResult;
  uploadResult?: UploadResult;
}

// ─── Data Models ─────────────────────────────────────────────────────────────

export interface ProjectState {
  id: string;                    // UUID
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  topic: TopicSuggestion;
  format: VideoFormat;
  pipeline: PipelineState;

  // Artefactos por etapa
  script?: Script;
  images?: GeneratedImage[];
  voice?: VoiceResult;
  video?: CompilationResult;
  thumbnail?: ThumbnailResult;
  upload?: UploadResult;
}

export interface AppConfig {
  apiKeys: {
    openai: string;
    youtube: string;
  };
  defaults: {
    region: Region;            // default: 'MX'
    niche?: string;
    voice?: string;
    format?: VideoFormat;
  };
  paths: {
    outputDir: string;         // directorio de salida para videos
    tempDir: string;           // directorio temporal para procesamiento
  };
}

export interface TrendCache {
  region: Region;
  niche?: string;
  fetchedAt: string;            // ISO timestamp
  expiresAt: string;            // fetchedAt + 1 hour
  videos: TrendVideo[];
  suggestions?: TopicSuggestion[];
}

// ─── Error Handling ──────────────────────────────────────────────────────────

export interface AppError {
  code: string;
  message: string;
  service: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export enum ErrorCode {
  // YouTube API
  YOUTUBE_API_ERROR = 'YOUTUBE_API_ERROR',
  YOUTUBE_AUTH_ERROR = 'YOUTUBE_AUTH_ERROR',
  YOUTUBE_AUTH_TIMEOUT = 'YOUTUBE_AUTH_TIMEOUT',
  YOUTUBE_UPLOAD_FAILED = 'YOUTUBE_UPLOAD_FAILED',
  YOUTUBE_UNSUPPORTED_FORMAT = 'YOUTUBE_UNSUPPORTED_FORMAT',

  // OpenAI
  OPENAI_API_ERROR = 'OPENAI_API_ERROR',
  OPENAI_TIMEOUT = 'OPENAI_TIMEOUT',

  // Pollinations
  POLLINATIONS_GENERATION_FAILED = 'POLLINATIONS_GENERATION_FAILED',
  POLLINATIONS_TIMEOUT = 'POLLINATIONS_TIMEOUT',

  // edge-tts
  TTS_PROCESS_ERROR = 'TTS_PROCESS_ERROR',

  // FFmpeg
  FFMPEG_PROCESS_ERROR = 'FFMPEG_PROCESS_ERROR',

  // Validation
  VALIDATION_MISSING_INPUTS = 'VALIDATION_MISSING_INPUTS',
  VALIDATION_INVALID_API_KEY = 'VALIDATION_INVALID_API_KEY',
  VALIDATION_INVALID_METADATA = 'VALIDATION_INVALID_METADATA',
}
