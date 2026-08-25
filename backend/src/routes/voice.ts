import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VoiceGenerator } from '../services/VoiceGenerator';
import type { AppError, Script } from 'shared/types';
import { ErrorCode } from 'shared/types';
import { DEFAULT_LANGUAGE } from 'shared/constants';

const router = Router();
const voiceGenerator = new VoiceGenerator();

function saveVoiceToProject(projectId: string, voiceResult: any) {
  const projectsPath = path.join(os.homedir(), '.youtube-automation', 'projects');
  const statePath = path.join(projectsPath, projectId, 'state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.voice = voiceResult;
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}

/**
 * GET /api/voices/:language
 * Lists available edge-tts neural voices filtered by language.
 */
router.get('/voices/:language', async (req: Request, res: Response) => {
  try {
    const language = req.params.language || DEFAULT_LANGUAGE;
    const voices = await voiceGenerator.getAvailableVoices(language);
    res.json({ voices });
  } catch (error) {
    const appError = error as AppError;
    res.status(500).json({
      code: appError.code || ErrorCode.TTS_PROCESS_ERROR,
      message: appError.message || 'Failed to list voices',
      service: 'VoiceGenerator',
      retryable: true,
    });
  }
});

/**
 * POST /api/project/:id/voice
 * Generates voice narration and VTT subtitles for a project's script.
 * Body: { script: Script, voiceId: string }
 */
router.post('/project/:id/voice', async (req: Request, res: Response) => {
  try {
    const { script, voiceId } = req.body as { script: Script; voiceId: string };

    if (!script) {
      const error: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: 'Script is required for voice generation',
        service: 'VoiceGenerator',
        retryable: false,
      };
      res.status(400).json(error);
      return;
    }

    if (!voiceId) {
      const error: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: 'Voice ID is required. Please select a voice before generating.',
        service: 'VoiceGenerator',
        retryable: false,
      };
      res.status(400).json(error);
      return;
    }

    const result = await voiceGenerator.generate(script, voiceId);
    
    // Persist voice result in project state
    const projectId = req.params.id;
    saveVoiceToProject(projectId, result);
    
    res.json(result);
  } catch (error) {
    const appError = error as AppError;
    res.status(500).json({
      code: appError.code || ErrorCode.TTS_PROCESS_ERROR,
      message: appError.message || 'Voice generation failed',
      service: 'VoiceGenerator',
      retryable: appError.retryable ?? true,
      details: appError.details,
    });
  }
});

export default router;
