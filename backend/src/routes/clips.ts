import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VideoClipGenerator } from '../services/VideoClipGenerator';
import type { AppError, Script, VideoFormat } from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';

function saveClipsToProject(projectId: string, clips: any[]) {
  const projectsPath = path.join(os.homedir(), '.youtube-automation', 'projects');
  const statePath = path.join(projectsPath, projectId, 'state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    // Save clips as images array (compatible with compilation step)
    state.images = clips.map(clip => ({
      sectionNumber: clip.sectionNumber,
      localPath: clip.clipPath,
      imageUrl: '',
      prompt: clip.prompt,
    }));
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}

export function createClipsRouter(): Router {
  const router = Router();
  const clipGenerator = new VideoClipGenerator();

  /**
   * POST /api/project/:id/clips
   * Generates animated video clips for each section of the script.
   * Body: { script: Script, clipDuration?: number }
   */
  router.post('/:id/clips', async (req: Request, res: Response) => {
    try {
      const { script, clipDuration } = req.body as { script: Script; clipDuration?: number };
      const projectId = req.params.id;

      if (!script || !script.sections || script.sections.length === 0) {
        const appError: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: 'A valid script with sections is required',
          service: 'VideoClipGenerator',
          retryable: false,
        };
        res.status(400).json(appError);
        return;
      }

      // Set output directory for this project
      const outputDir = path.join(process.cwd(), 'temp', 'projects', projectId, 'clips');
      clipGenerator.setOutputDir(outputDir);

      // Calculate total audio duration from project state
      let totalAudioDuration = clipDuration ? clipDuration * script.sections.length : 60;
      
      const projectsPath = path.join(os.homedir(), '.youtube-automation', 'projects');
      const statePath = path.join(projectsPath, projectId, 'state.json');
      if (fs.existsSync(statePath)) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        if (state.voice?.durationSeconds && state.voice.durationSeconds > 0) {
          totalAudioDuration = state.voice.durationSeconds;
        }
      }

      const clips = await clipGenerator.generateAll(script, totalAudioDuration);

      // Persist clips in project state
      saveClipsToProject(projectId, clips);

      res.json({
        projectId,
        clips,
        total: clips.length,
      });
    } catch (err) {
      const appError: AppError = {
        code: ErrorCode.FFMPEG_PROCESS_ERROR,
        message: err instanceof Error ? err.message : 'Failed to generate video clips',
        service: 'VideoClipGenerator',
        retryable: true,
      };
      res.status(500).json(appError);
    }
  });

  return router;
}
