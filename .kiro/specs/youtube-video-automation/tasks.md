# Implementation Plan: YouTube Video Automation

## Overview

Implementación de una plataforma web TypeScript con React frontend y Node.js/Express backend para la automatización completa de creación y publicación de videos en YouTube. La implementación sigue un enfoque incremental: primero la infraestructura y tipos compartidos, luego los servicios backend individualmente, después el frontend, y finalmente la integración completa.

## Tasks

- [x] 1. Project setup and core infrastructure
  - [x] 1.1 Initialize monorepo structure with backend and frontend packages
    - Create directory structure: `backend/src/`, `frontend/src/`, `shared/`
    - Initialize package.json for root, backend, and frontend
    - Configure TypeScript tsconfig.json for each package with shared types
    - Install core dependencies: express, cors, uuid, dotenv (backend); react, react-dom, react-router-dom (frontend)
    - Install dev dependencies: vitest, fast-check, @types/express, @types/node, typescript
    - Configure Vitest with fast-check support
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Define shared types and interfaces
    - Create `shared/types.ts` with all TypeScript interfaces from the design: VideoFormat, Region, PipelineStage, StageStatus, TrendVideo, TopicSuggestion, Script, ScriptSection, GeneratedImage, VoiceOption, VoiceResult, CompilationInputs, CompilationResult, ValidationResult, ThumbnailResult, UploadMetadata, UploadResult, PipelineState, ProjectState, AppConfig, TrendCache, AppError, ErrorCode
    - Create `shared/constants.ts` with format constraints, retry configs, timeout values
    - _Requirements: 1.5, 2.1, 3.2, 3.3, 3.4, 6.1, 7.6, 8.2, 9.1_

  - [x] 1.3 Implement configuration manager with persistence
    - Create `backend/src/services/ConfigManager.ts`
    - Implement load/save configuration from JSON file on disk
    - Implement API key validation (test requests to OpenAI and YouTube)
    - Implement default values (region: 'MX')
    - Create REST endpoints: GET `/api/config`, PUT `/api/config`, POST `/api/config/validate-keys`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 1.4 Write property test for configuration persistence (Property 14)
    - **Property 14: Configuration persistence round-trip**
    - Generate arbitrary valid AppConfig objects and verify save-then-load produces equal output
    - **Validates: Requirements 9.2**

- [x] 2. Trend Analysis service
  - [x] 2.1 Implement TrendAnalyzer service
    - Create `backend/src/services/TrendAnalyzer.ts` implementing ITrendAnalyzer
    - Implement `getPopularVideos(region)`: call YouTube Data API v3 for top 20 popular videos
    - Implement `getVideosByNiche(niche, region)`: search top 20 by view count, published within 7 days
    - Implement `getRecentVideosByNiche(niche, region)`: search 15 most recent, published within 2 days
    - Implement `generateTopicSuggestions(trends)`: send trends to OpenAI, return 8 suggestions sorted by viralScore descending
    - Implement error handling for YouTube API errors and OpenAI errors
    - Implement 60-second timeout for OpenAI calls
    - Create REST endpoints: GET `/api/trends/:region`, GET `/api/trends/:region/:niche`, POST `/api/trends/suggestions`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8_

  - [ ]* 2.2 Write property tests for TrendAnalyzer (Properties 1, 2)
    - **Property 1: Topic suggestions are sorted and capped** — verify output has exactly 8 items sorted by viralScore descending
    - **Property 2: Topic suggestion field constraints** — verify description ≤ 200 chars, tags ≤ 10, viralScore 1-10, reasoning ≤ 300 chars
    - **Validates: Requirements 1.4, 1.5**

- [x] 3. Script Generation service
  - [x] 3.1 Implement ScriptGenerator service
    - Create `backend/src/services/ScriptGenerator.ts` implementing IScriptGenerator
    - Implement `generate(topic, format)`: construct structured prompt for OpenAI requesting Spanish-language script
    - For Long_Video: enforce 8-12 sections, 1500-2250 word count
    - For Short: enforce 3 sections, 110-150 word count
    - Ensure script structure: hook, introduction, numbered sections (title, narration, visualDescription), closingCTA
    - Implement 60-second timeout with cancellation
    - Implement error handling with retry option
    - Create REST endpoints: POST `/api/project/:id/script`, PUT `/api/project/:id/script`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.2 Write property tests for ScriptGenerator (Properties 3, 4)
    - **Property 3: Script format constraints** — verify Long_Video has 8-12 sections / 1500-2250 words; Short has 3 sections / 110-150 words
    - **Property 4: Script structural completeness** — verify non-empty hook, introduction, at least one section with all fields, non-empty closingCTA
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 4. Image Generation service
  - [x] 4.1 Implement ImageGenerator service
    - Create `backend/src/services/ImageGenerator.ts` implementing IImageGenerator
    - Implement `generateForSection(visualDescription, sectionNumber, format)`: call Pollinations.ai with correct resolution (1920x1080 for Long_Video, 1080x1920 for Short) and quality parameters
    - Implement `generateAll(script)`: generate images for all sections with progress tracking
    - Implement `regenerate(sectionNumber, newPrompt, format)`: regenerate single image with user-modified prompt
    - Implement retry logic: max 3 retries, 5-second delay, 60-second timeout per image
    - Save generated images to local disk
    - Create REST endpoints: POST `/api/project/:id/images`, POST `/api/project/:id/images/:section/regenerate`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 4.2 Write property test for ImageGenerator retry (Property 5)
    - **Property 5: Image generation retry bound** — verify at most 3 retries with 5s delay; total attempts never exceed 4
    - **Validates: Requirements 4.6**

- [~] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Voice Generation service
  - [x] 6.1 Implement VoiceGenerator service
    - Create `backend/src/services/VoiceGenerator.ts` implementing IVoiceGenerator
    - Implement `getAvailableVoices(language)`: list edge-tts neural voices filtered by language
    - Implement `generate(script, voiceId)`: concatenate narration in section order, invoke edge-tts as child process, produce MP3 at 192kbps minimum
    - Generate VTT subtitle file from edge-tts word boundary events
    - Implement error handling for edge-tts process failures
    - Create REST endpoints: GET `/api/voices/:language`, POST `/api/project/:id/voice`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 6.2 Write property tests for VoiceGenerator (Properties 6, 7)
    - **Property 6: Narration concatenation preserves section order** — verify sections appear in sequential order in concatenated text
    - **Property 7: Voice filter returns only matching languages** — verify filtered list contains only matching voices and all matching voices
    - **Validates: Requirements 5.1, 5.3**

- [x] 7. Video Editor service
  - [x] 7.1 Implement VideoEditor service
    - Create `backend/src/services/VideoEditor.ts` implementing IVideoEditor
    - Implement `validateInputs(inputs)`: check at least 1 image, 1 audio path, 1 subtitle path; report missing inputs
    - Implement `compile(inputs, onProgress)`: build FFmpeg command with libx264, CRF 23, AAC 192kbps
    - For Long_Video: 1920x1080, subtitle font size 24px
    - For Short: 1080x1920, subtitle font size 36px
    - Distribute images evenly: each displays for (audio duration / image count) seconds
    - Burn subtitles: white text, black outline 2px, bottom-center alignment
    - Execute FFmpeg as child process with progress parsing
    - Implement error handling for FFmpeg failures
    - Create REST endpoint: POST `/api/project/:id/compile`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ]* 7.2 Write property tests for VideoEditor (Properties 8, 9)
    - **Property 8: Compilation input validation identifies missing inputs** — verify valid=true iff all inputs present; missingInputs lists exactly absent categories
    - **Property 9: Image time distribution is uniform and covers audio** — verify each image displays D/N seconds and sum equals D within 0.001s tolerance
    - **Validates: Requirements 6.1, 6.2, 6.5**

- [x] 8. Thumbnail Generation service
  - [x] 8.1 Implement ThumbnailGenerator service
    - Create `backend/src/services/ThumbnailGenerator.ts` implementing IThumbnailGenerator
    - Implement `generate(title, topic)`: use OpenAI to create thumbnail prompt, generate via Pollinations at 1280x720
    - Ensure prompt produces no text in image, vibrant colors, high contrast
    - Generate up to 4 words of overlay text suggestion
    - Implement `regenerate(adjustedPrompt)`: regenerate with modified prompt
    - Create REST endpoints: POST `/api/project/:id/thumbnail`, POST `/api/project/:id/thumbnail/regenerate`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 8.2 Write property test for ThumbnailGenerator (Property 10)
    - **Property 10: Thumbnail overlay text word limit** — verify suggested overlay text contains at most 4 words
    - **Validates: Requirements 7.6**

- [x] 9. YouTube Uploader service
  - [x] 9.1 Implement YouTubeUploader service
    - Create `backend/src/services/YouTubeUploader.ts` implementing IYouTubeUploader
    - Implement `authenticate()`: OAuth2 flow with 60-second timeout
    - Implement video format validation: accept only MP4, MOV, AVI, WMV, FLV, WebM, 3GP
    - Implement `upload(videoPath, metadata, onProgress)`: upload video with metadata, progress callback
    - Validate metadata: title ≤ 100 chars, description ≤ 5000 chars, tags total ≤ 500 chars
    - Default privacy status to "unlisted"
    - Implement retry: max 3 retries with exponential backoff (2s, 4s, 8s) for network errors
    - Handle authentication errors with re-auth prompt
    - Create REST endpoint: POST `/api/project/:id/upload`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [ ]* 9.2 Write property tests for YouTubeUploader (Properties 11, 12, 13)
    - **Property 11: Upload metadata validation enforces character limits** — verify title ≤ 100, description ≤ 5000, tags ≤ 500 chars
    - **Property 12: Upload retry follows exponential backoff** — verify max 3 retries with 2s, 4s, 8s delays
    - **Property 13: Video format validation** — verify only MP4, MOV, AVI, WMV, FLV, WebM, 3GP accepted
    - **Validates: Requirements 8.2, 8.8, 8.9**

- [ ] 10. Pipeline Controller
  - [~] 10.1 Implement PipelineController service
    - Create `backend/src/services/PipelineController.ts` implementing IPipelineController
    - Implement `createProject(topic, format)`: create project with UUID, initialize pipeline state, persist to disk
    - Implement `getState(projectId)`: load project state from JSON file
    - Implement `executeStage(projectId, stage)`: validate stage accessibility, execute service, update state, persist
    - Implement `retryStage(projectId, stage)`: reset stage status to pending and re-execute
    - Enforce stage ordering: a stage is executable only if all preceding stages are completed
    - Preserve data from completed stages when a later stage fails
    - Create REST endpoints: POST `/api/project`, GET `/api/project/:id`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 10.2 Write property tests for PipelineController (Properties 15, 16)
    - **Property 15: Pipeline stage accessibility invariant** — verify stage accessible iff all preceding completed; in_progress disables subsequent; completed stages navigable
    - **Property 16: Failed stage preserves previous data** — verify error in stage N leaves stages 0..N-1 data unchanged
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5**

- [~] 11. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Backend Express server and routing
  - [~] 12.1 Set up Express application with all routes
    - Create `backend/src/app.ts` with Express setup, CORS, JSON parsing
    - Create `backend/src/routes/` directory with route modules for each service group
    - Wire all API endpoints to their respective service methods
    - Add error handling middleware that returns AppError format
    - Add request validation middleware
    - Create `backend/src/server.ts` as entry point
    - _Requirements: 1.7, 1.8, 3.6, 3.7, 4.6, 5.6, 6.9, 8.7, 8.8, 9.5_

- [ ] 13. Frontend - Core layout and pipeline UI
  - [~] 13.1 Set up React application with routing
    - Create React app with Vite in `frontend/`
    - Configure React Router with routes for pipeline stages and configuration
    - Create main layout with pipeline navigation header
    - Create pipeline stage indicator component showing all 8 stages with status (pending, in_progress, completed, error)
    - Implement stage navigation logic: only navigate to completed/current stages
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [~] 13.2 Implement Configuration panel
    - Create configuration page with form inputs for: Niche, Region, preferred voice, default format
    - Create API key input fields for OpenAI and YouTube keys
    - Implement validation feedback (success/error indicators for each key)
    - Implement save to backend via PUT `/api/config`
    - Show prompt for API keys when not configured
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [~] 13.3 Implement Trend Analysis dashboard
    - Create dashboard page showing top 20 trending videos in cards (title, channel, views, thumbnail)
    - Add niche configuration input with search
    - Display 8 topic suggestions with: title, description, tags, viral score, recommended format, reasoning
    - Sort suggestions by viral score descending
    - Implement topic selection (highlight + store)
    - Show loading indicators during API calls
    - Show error messages with retry buttons for YouTube API and OpenAI errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [~] 13.4 Implement Format Selection screen
    - Create format selection page with two cards: Short (1080x1920, 45-60s) and Long_Video (1920x1080, 8-15min)
    - Show visual preview with aspect ratio frame, resolution label, duration range
    - Highlight selected format with visual indicator
    - Pre-select default format from configuration if set
    - Allow format change until script generation starts
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [~] 13.5 Implement Script Generation view
    - Create script generation page with generate button
    - Display full script in editable view: hook, introduction, sections (title, narration, visual description), closingCTA
    - Allow inline editing of all text fields
    - Implement save changes via PUT `/api/project/:id/script`
    - Show loading state during generation
    - Show error/timeout messages with retry
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7_

  - [~] 13.6 Implement Image Generation gallery
    - Create gallery page showing generated images with section titles and prompts
    - Show progress indicator (N of M images generated)
    - Allow clicking any image to regenerate with editable prompt field
    - Replace image in gallery upon successful regeneration
    - _Requirements: 4.1, 4.4, 4.5, 4.7, 4.8_

  - [~] 13.7 Implement Voice Generation interface
    - Create voice selection list filtered by region language
    - Prompt user to select voice if none selected
    - Show audio player for preview after generation
    - Provide download link for VTT subtitle file
    - Show error state with retry for different voice
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [~] 13.8 Implement Video Compilation view
    - Create compilation trigger with pre-check validation
    - Show error message listing missing inputs if validation fails
    - Show progress indicator during rendering
    - Display video player for preview when complete
    - Show error with retry option on FFmpeg failure
    - _Requirements: 6.1, 6.2, 6.7, 6.8, 6.9_

  - [~] 13.9 Implement Thumbnail Generation view
    - Display generated thumbnail for review
    - Allow regeneration with prompt editing
    - Show suggested overlay text (up to 4 words)
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

  - [~] 13.10 Implement YouTube Upload view
    - Show upload form with: title (max 100 chars), description (max 5000 chars), tags, privacy status selector (public/unlisted/private)
    - Default privacy to unlisted
    - Show progress bar during upload (updated every 2s minimum)
    - Display YouTube video URL on success
    - Handle auth errors with re-authentication flow
    - Show error for unsupported formats
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

- [~] 14. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Integration and final wiring
  - [~] 15.1 Wire frontend to backend API
    - Create `frontend/src/api/client.ts` with typed API client functions for all endpoints
    - Implement error handling in API client (parse AppError responses)
    - Connect all frontend views to corresponding API calls
    - Implement loading and error states across all views
    - _Requirements: 1.7, 1.8, 1.9, 10.1, 10.5_

  - [ ]* 15.2 Write integration tests for full pipeline flow
    - Test complete pipeline flow with mocked services (create project → trends → script → images → voice → video → thumbnail → upload)
    - Verify stage state transitions and data preservation on failure
    - Test error recovery scenarios
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [~] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All services use TypeScript with shared interfaces from `shared/types.ts`
- Backend services use child processes for edge-tts and FFmpeg (no external deployment needed)
- External APIs (OpenAI, YouTube, Pollinations) should be accessed only through the backend to protect API keys
- Vitest with fast-check is the test stack for both unit and property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.1", "4.1", "6.1", "7.1", "8.1", "9.1"] },
    { "id": 3, "tasks": ["1.4", "2.2", "3.2", "4.2", "6.2", "7.2", "8.2", "9.2", "10.1"] },
    { "id": 4, "tasks": ["10.2", "12.1"] },
    { "id": 5, "tasks": ["13.1"] },
    { "id": 6, "tasks": ["13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9", "13.10"] },
    { "id": 7, "tasks": ["15.1"] },
    { "id": 8, "tasks": ["15.2"] }
  ]
}
```
