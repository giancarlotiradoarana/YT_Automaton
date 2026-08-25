import type {
  AppConfig,
  TrendVideo,
  TopicSuggestion,
  PipelineState,
  VideoFormat,
  Script,
  GeneratedImage,
  VoiceOption,
  VoiceResult,
  CompilationResult,
  ThumbnailResult,
  UploadMetadata,
  UploadResult,
  AppError,
} from 'shared/types';

const BASE_URL = '/api';

// ─── Generic fetch helper ────────────────────────────────────────────────────

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    const error = data as AppError;
    throw error;
  }

  return data as T;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/config');
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  return request<AppConfig>('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export interface ValidateKeysResult {
  valid: boolean;
  openai: { valid: boolean; error?: string };
  youtube: { valid: boolean; error?: string };
}

export async function validateKeys(config: AppConfig): Promise<ValidateKeysResult> {
  return request<ValidateKeysResult>('/config/validate-keys', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// ─── Trends ──────────────────────────────────────────────────────────────────

export async function getTrendingVideos(region: string): Promise<{ videos: TrendVideo[] }> {
  return request<{ videos: TrendVideo[] }>(`/trends/${region}`);
}

export async function getTrendsByNiche(
  region: string,
  niche: string
): Promise<{ nicheVideos: TrendVideo[]; recentVideos: TrendVideo[] }> {
  return request<{ nicheVideos: TrendVideo[]; recentVideos: TrendVideo[] }>(
    `/trends/${region}/${encodeURIComponent(niche)}`
  );
}

export async function getTopicSuggestions(
  trends: TrendVideo[]
): Promise<{ suggestions: TopicSuggestion[] }> {
  return request<{ suggestions: TopicSuggestion[] }>('/trends/suggestions', {
    method: 'POST',
    body: JSON.stringify({ trends }),
  });
}

// ─── Project ─────────────────────────────────────────────────────────────────

export async function createProject(
  topic: TopicSuggestion,
  format: VideoFormat
): Promise<{ id: string } & Record<string, unknown>> {
  return request<{ id: string } & Record<string, unknown>>('/project', {
    method: 'POST',
    body: JSON.stringify({ topic, format }),
  });
}

export async function getProjectState(projectId: string): Promise<any> {
  return request<any>(`/project/${projectId}`);
}

// ─── Script ──────────────────────────────────────────────────────────────────

export async function generateScript(projectId: string, topic: TopicSuggestion, format: VideoFormat): Promise<Script> {
  const result = await request<{ projectId: string; script: Script }>(`/project/${projectId}/script`, {
    method: 'POST',
    body: JSON.stringify({ topic, format }),
  });
  return result.script;
}

export async function saveScript(projectId: string, script: Script): Promise<Script> {
  return request<Script>(`/project/${projectId}/script`, {
    method: 'PUT',
    body: JSON.stringify(script),
  });
}

// ─── Images ──────────────────────────────────────────────────────────────────

export async function generateImages(projectId: string, script?: any): Promise<GeneratedImage[]> {
  const body = script ? JSON.stringify({ script }) : undefined;
  const result = await request<{ images: GeneratedImage[] } | GeneratedImage[]>(`/project/${projectId}/images`, {
    method: 'POST',
    body,
  });
  return Array.isArray(result) ? result : result.images;
}

export async function regenerateImage(
  projectId: string,
  sectionNumber: number,
  prompt: string,
  format?: string
): Promise<GeneratedImage> {
  const result = await request<{ image: GeneratedImage } | GeneratedImage>(
    `/project/${projectId}/images/${sectionNumber}/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify({ newPrompt: prompt, format: format || 'long_video' }),
    }
  );
  return 'image' in result ? result.image : result;
}

// ─── Voice ───────────────────────────────────────────────────────────────────

export async function getVoices(language: string): Promise<{ voices: VoiceOption[] }> {
  return request<{ voices: VoiceOption[] }>(`/voices/${language}`);
}

export async function generateVoice(
  projectId: string,
  script: Script,
  voiceId: string
): Promise<VoiceResult> {
  return request<VoiceResult>(`/project/${projectId}/voice`, {
    method: 'POST',
    body: JSON.stringify({ script, voiceId }),
  });
}

// ─── Compile ─────────────────────────────────────────────────────────────────

export async function compileVideo(projectId: string, inputs?: any): Promise<CompilationResult> {
  return request<CompilationResult>(`/project/${projectId}/compile`, {
    method: 'POST',
    body: inputs ? JSON.stringify(inputs) : undefined,
  });
}

// ─── Thumbnail ───────────────────────────────────────────────────────────────

export async function generateThumbnail(projectId: string): Promise<ThumbnailResult> {
  // Get project state to send title and topic
  const state = await getProjectState(projectId) as any;
  const title = state.topic?.title || 'Video';
  const topic = state.topic || { title: 'Video', description: '', tags: [], viralScore: 5, recommendedFormat: 'short', reasoning: '' };
  
  return request<ThumbnailResult>(`/project/${projectId}/thumbnail`, {
    method: 'POST',
    body: JSON.stringify({ title, topic }),
  });
}

export async function regenerateThumbnail(
  projectId: string,
  prompt: string
): Promise<ThumbnailResult> {
  return request<ThumbnailResult>(`/project/${projectId}/thumbnail/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function uploadToYouTube(
  projectId: string,
  metadata: UploadMetadata
): Promise<UploadResult> {
  return request<UploadResult>(`/project/${projectId}/upload`, {
    method: 'POST',
    body: JSON.stringify(metadata),
  });
}
