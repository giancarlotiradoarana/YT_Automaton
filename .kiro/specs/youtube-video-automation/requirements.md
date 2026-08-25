# Requirements Document

## Introduction

Plataforma web desarrollada en TypeScript para la automatización completa de la creación y publicación de videos en YouTube. La plataforma proporciona una interfaz visual donde el usuario puede analizar tendencias, generar guiones, crear materiales multimedia con IA, editar videos y publicarlos directamente en YouTube. Se integra con la API de OpenAI, la API de YouTube Data v3, edge-tts para voz, Pollinations.ai para imágenes y FFmpeg para edición de video.

## Glossary

- **Platform**: La aplicación web TypeScript que orquesta todo el proceso de automatización de videos
- **Trend_Analyzer**: Módulo que consulta la API de YouTube Data v3 para obtener videos en tendencia y videos populares por nicho
- **Script_Generator**: Módulo que utiliza la API de OpenAI para generar guiones estructurados para videos
- **Image_Generator**: Módulo que genera imágenes usando Pollinations.ai (servicio gratuito de generación de imágenes con IA)
- **Voice_Generator**: Módulo que genera narración en off usando edge-tts con voces neurales
- **Video_Editor**: Módulo que utiliza FFmpeg para compilar el video final con imágenes, audio y subtítulos
- **YouTube_Uploader**: Módulo que sube el video final a YouTube mediante la API de YouTube Data v3
- **Thumbnail_Generator**: Módulo que genera miniaturas profesionales usando IA
- **Script**: Estructura JSON que contiene hook, introducción, secciones con narración y descripciones visuales, y cierre
- **Short**: Video vertical (1080x1920) de 45-60 segundos de duración
- **Long_Video**: Video horizontal (1920x1080) de 8-15 minutos de duración
- **Niche**: Categoría temática configurada por el usuario para filtrar tendencias (ej: tecnología, gaming, finanzas)
- **Region**: Código de país ISO para filtrar tendencias geográficamente (ej: MX, ES, US)

## Requirements

### Requirement 1: Trend Analysis Dashboard

**User Story:** As a content creator, I want to see trending videos and popular topics in my niche, so that I can choose the best topic for my next video.

#### Acceptance Criteria

1. WHEN the user opens the dashboard, THE Trend_Analyzer SHALL retrieve the top 20 most popular videos from YouTube for the configured Region, using the default Region "MX" if no Region has been configured
2. WHEN the user configures a Niche, THE Trend_Analyzer SHALL retrieve the top 20 videos by view count for that Niche published within the last 7 days
3. WHEN the user configures a Niche, THE Trend_Analyzer SHALL retrieve the 15 most recent videos for that Niche published within the last 2 days
4. WHEN trend data is retrieved, THE Platform SHALL send the trending data to OpenAI to generate exactly 8 topic suggestions ranked by viral score from highest to lowest
5. THE Platform SHALL display each suggested topic with its title, a description of no more than 200 characters, up to 10 tags, a viral score (1-10), recommended format (Short or Long_Video), and reasoning of no more than 300 characters
6. WHEN the user selects a suggested topic, THE Platform SHALL store the selection and enable the script generation phase
7. IF the YouTube API returns an error, THEN THE Trend_Analyzer SHALL display an error message indicating the failure reason and offer a retry option
8. IF OpenAI returns an error during topic suggestion generation, THEN THE Platform SHALL display an error message indicating the failure reason and offer a retry option without losing the retrieved trend data
9. WHILE trend data is being retrieved or topic suggestions are being generated, THE Platform SHALL display a loading indicator showing the current operation in progress

### Requirement 2: Video Format Selection

**User Story:** As a content creator, I want to choose the video format (Short or Long Video) before generating the script, so that all subsequent content is optimized for my chosen format.

#### Acceptance Criteria

1. WHEN the user selects a topic, THE Platform SHALL display a format selection screen with two options: Short (vertical 1080x1920, 45-60 seconds) and Long_Video (horizontal 1920x1080, 8-15 minutes)
2. WHEN the format selection screen is displayed, THE Platform SHALL show a visual preview of each format including an aspect ratio frame, resolution label, and estimated duration range
3. WHEN the user selects a format, THE Platform SHALL highlight the selected format with a visual indicator and store the selection for all subsequent stages
4. WHILE the user has not yet started script generation, THE Platform SHALL allow the user to change the format selection without losing the selected topic
5. IF the user has configured a default format in the configuration panel, THEN THE Platform SHALL pre-select that format on the format selection screen

### Requirement 3: Script Generation

**User Story:** As a content creator, I want to generate professional scripts automatically, so that I can produce engaging videos without writing manually.

#### Acceptance Criteria

1. WHEN the user has selected a topic and format, THE Script_Generator SHALL send a structured prompt to OpenAI requesting a Script for the selected format and generate the script content in Spanish
2. WHEN generating a Script for a Long_Video, THE Script_Generator SHALL produce 8-12 sections with a total narration word count between 1,500 and 2,250 words, targeting 10-15 minutes of audio
3. WHEN generating a Script for a Short, THE Script_Generator SHALL produce 3 sections with a total narration word count between 110 and 150 words, targeting 45-60 seconds of audio
4. THE Script_Generator SHALL structure every Script with a hook, introduction, numbered sections (each with title, narration text, and visual description), and a closing call-to-action
5. WHEN a Script is generated, THE Platform SHALL display the full script in an editable view where the user can modify the narration text, visual descriptions, and section titles, and save changes before proceeding to the next stage
6. IF OpenAI returns an error during script generation, THEN THE Script_Generator SHALL display an error message indicating the failure reason and allow the user to retry
7. IF OpenAI does not respond within 60 seconds during script generation, THEN THE Script_Generator SHALL cancel the request, display a timeout error message, and allow the user to retry

### Requirement 4: AI Image Generation

**User Story:** As a content creator, I want to generate high-quality images for each section of my video, so that the video has professional visuals without manual design.

#### Acceptance Criteria

1. WHEN the user confirms the Script as final, THE Image_Generator SHALL extract the visual description from each section and generate one image per section using Pollinations.ai
2. WHEN generating images for a Long_Video, THE Image_Generator SHALL request images at 1920x1080 resolution with photorealistic, cinematic, 4K quality parameters
3. WHEN generating images for a Short, THE Image_Generator SHALL request images at 1080x1920 resolution with photorealistic, cinematic, 4K quality parameters
4. WHILE images are being generated, THE Platform SHALL display a progress indicator showing how many images have been generated out of the total number of sections
5. WHEN all images are generated, THE Platform SHALL display a gallery showing each generated image alongside its section title and the prompt used to generate it
6. IF an image fails to generate or does not return within 60 seconds, THEN THE Image_Generator SHALL retry the failed image up to 3 times with a 5-second delay between attempts before reporting the error to the user
7. WHEN the user selects an image in the gallery for regeneration, THE Platform SHALL display the original prompt in an editable field and allow the user to submit the modified prompt to generate a replacement image
8. WHEN a replacement image is generated, THE Platform SHALL replace the previous image for that section in the gallery

### Requirement 5: Voice-Over Generation

**User Story:** As a content creator, I want to generate natural-sounding narration from my script, so that the video has professional audio without recording manually.

#### Acceptance Criteria

1. WHEN the user triggers voice generation, THE Voice_Generator SHALL concatenate all narration text from every section of the Script in sequential order and produce a single MP3 audio file using edge-tts with the user-selected neural voice at a minimum bitrate of 192kbps
2. WHEN voice generation completes, THE Voice_Generator SHALL generate a VTT subtitle file with timing markers derived from edge-tts word boundary data, aligned to the produced audio
3. THE Platform SHALL display a voice selection list filtered by the Region's language (e.g., Spanish voices for MX/ES regions) from the available edge-tts neural voices before generation
4. IF the user has not selected a voice before triggering generation, THEN THE Platform SHALL prompt the user to select a voice before proceeding
5. WHEN voice generation completes, THE Platform SHALL display an audio player for the user to preview the narration and a download link for the VTT subtitle file
6. IF edge-tts returns an error, THEN THE Voice_Generator SHALL display an error message indicating the failure reason and allow the user to retry with the same or a different voice without losing the current Script

### Requirement 6: Video Compilation and Editing

**User Story:** As a content creator, I want the platform to automatically compile my images, audio, and subtitles into a finished video, so that I get a professional result without manual editing.

#### Acceptance Criteria

1. WHEN the user triggers video compilation, THE Video_Editor SHALL verify that all required inputs (at least one generated image, one audio file, and one subtitle file) are present before starting the FFmpeg process
2. IF any required input is missing when the user triggers video compilation, THEN THE Video_Editor SHALL display an error message indicating which inputs are missing and prevent compilation from starting
3. WHEN compiling a Long_Video, THE Video_Editor SHALL render at 1920x1080 resolution with libx264 encoding, CRF 23, and AAC audio at 192kbps
4. WHEN compiling a Short, THE Video_Editor SHALL render at 1080x1920 resolution with libx264 encoding, CRF 23, and AAC audio at 192kbps
5. WHEN compiling the video, THE Video_Editor SHALL distribute images evenly across the video duration, where total video duration equals the audio file length and each image displays for (audio length / number of images) seconds
6. WHEN compiling the video, THE Video_Editor SHALL burn subtitles into the video with white text, black outline of 2 pixels, bottom-center alignment, and a font size of 24 pixels for Long_Video or 36 pixels for Short
7. WHILE video rendering is in progress, THE Platform SHALL display a progress indicator showing the rendering status
8. WHEN video rendering completes, THE Platform SHALL display a video player for the user to preview the final result
9. IF FFmpeg returns an error during rendering, THEN THE Video_Editor SHALL display an error message indicating the failure reason and allow the user to retry the compilation

### Requirement 7: Thumbnail Generation

**User Story:** As a content creator, I want to generate an eye-catching thumbnail for my video, so that my video attracts more clicks on YouTube.

#### Acceptance Criteria

1. WHEN the video is compiled, THE Thumbnail_Generator SHALL use OpenAI to generate a prompt for a professional YouTube thumbnail based on the video title and topic
2. THE Thumbnail_Generator SHALL generate the thumbnail image using Pollinations.ai at 1280x720 resolution with vibrant colors and high contrast
3. THE Thumbnail_Generator SHALL produce a thumbnail without text embedded in the image
4. WHEN the thumbnail is generated, THE Platform SHALL display it for user review
5. WHEN the user reviews the thumbnail, THE Platform SHALL allow the user to regenerate the thumbnail with an adjusted prompt
6. THE Platform SHALL suggest up to 4 words of overlay text that the user can optionally add to the thumbnail

### Requirement 8: YouTube Upload

**User Story:** As a content creator, I want to upload my video directly to YouTube from the platform, so that I can publish without leaving the application.

#### Acceptance Criteria

1. WHEN the user triggers upload, THE YouTube_Uploader SHALL authenticate with YouTube using OAuth2 within 60 seconds, or display a timeout error message indicating the authentication could not be completed
2. WHEN authenticated, THE YouTube_Uploader SHALL upload the video file (maximum 256 GB), thumbnail, title (maximum 100 characters), description (maximum 5000 characters), and tags (maximum 500 characters total) to the user's YouTube channel
3. THE YouTube_Uploader SHALL set the video privacy status to unlisted by default
4. WHEN the user selects a privacy status before uploading, THE YouTube_Uploader SHALL apply the selected status (public, unlisted, or private) to the video
5. WHEN the upload completes, THE Platform SHALL display the YouTube video URL to the user
6. WHILE the upload is in progress, THE Platform SHALL display a progress bar showing the upload percentage, updated at least every 2 seconds
7. IF the YouTube API returns an authentication error, THEN THE YouTube_Uploader SHALL prompt the user to re-authenticate
8. IF the upload fails due to a network error, THEN THE YouTube_Uploader SHALL retry the upload up to 3 times with exponential backoff starting at 2 seconds (2s, 4s, 8s), and display an error message indicating upload failure if all retries are exhausted
9. IF the video file format is not supported by YouTube, THEN THE YouTube_Uploader SHALL display an error message indicating the unsupported format and SHALL NOT initiate the upload

### Requirement 9: Project Configuration

**User Story:** As a content creator, I want to configure my preferences (niche, region, voice, API keys), so that the platform generates content tailored to my channel.

#### Acceptance Criteria

1. THE Platform SHALL provide a configuration panel where the user can set the Niche, Region, preferred voice, and video format defaults
2. THE Platform SHALL store configuration persistently so settings are preserved between sessions
3. WHEN the user has not configured API keys, THE Platform SHALL prompt the user to enter the OpenAI API key and YouTube API key before allowing other operations
4. THE Platform SHALL validate API keys by making a test request upon entry
5. IF an API key validation fails, THEN THE Platform SHALL display a specific error message indicating which key is invalid

### Requirement 10: Workflow Pipeline Interface

**User Story:** As a content creator, I want to see the full video creation workflow as a step-by-step pipeline, so that I can track progress and navigate between stages.

#### Acceptance Criteria

1. THE Platform SHALL display the video creation process as a sequential pipeline with stages: Trend Analysis, Format Selection, Script Generation, Image Generation, Voice Generation, Video Compilation, Thumbnail Generation, and Upload
2. WHILE a stage is in progress, THE Platform SHALL display a loading indicator and disable navigation to subsequent stages
3. WHEN a stage completes successfully, THE Platform SHALL enable the next stage and mark the completed stage with a success indicator
4. THE Platform SHALL allow the user to navigate back to any completed stage to review or regenerate content
5. IF a stage fails, THEN THE Platform SHALL mark the stage with an error indicator and provide a retry option without losing data from previous stages
