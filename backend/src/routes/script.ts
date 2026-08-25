import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ScriptGenerator, calculateTotalWordCount } from '../services/ScriptGenerator';
import type { Script, TopicSuggestion, VideoFormat, AppError } from 'shared/types';

const router = Router();
const scriptGenerator = new ScriptGenerator();

function saveScriptToProject(projectId: string, script: Script) {
  const projectsPath = path.join(os.homedir(), '.youtube-automation', 'projects');
  const statePath = path.join(projectsPath, projectId, 'state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.script = script;
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}

/**
 * POST /api/project/:id/script
 * Generates a script for the given project.
 * Body: { topic: TopicSuggestion, format: VideoFormat }
 */
router.post('/api/project/:id/script', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { topic, format } = req.body as { topic: TopicSuggestion; format: VideoFormat };

    if (!topic || !format) {
      const error: AppError = {
        code: 'OPENAI_API_ERROR',
        message: 'Missing required fields: topic and format',
        service: 'ScriptGenerator',
        retryable: false,
      };
      res.status(400).json(error);
      return;
    }

    if (format !== 'short' && format !== 'long_video') {
      const error: AppError = {
        code: 'OPENAI_API_ERROR',
        message: 'Invalid format. Must be "short" or "long_video"',
        service: 'ScriptGenerator',
        retryable: false,
      };
      res.status(400).json(error);
      return;
    }

    const script = await scriptGenerator.generate(topic, format);

    // Persist script in project state
    saveScriptToProject(id, script);

    res.status(200).json({
      projectId: id,
      script,
    });
  } catch (err: unknown) {
    const appError = err as AppError;

    if (appError.code === 'OPENAI_TIMEOUT') {
      res.status(504).json(appError);
      return;
    }

    res.status(500).json(appError);
  }
});

/**
 * PUT /api/project/:id/script
 * Saves user edits to the script.
 * Body: Script (the edited script object)
 */
router.put('/api/project/:id/script', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const script = req.body as Script;

    if (!script || !script.hook || !script.sections || !script.closingCTA) {
      const error: AppError = {
        code: 'OPENAI_API_ERROR',
        message: 'Invalid script structure. Must include hook, introduction, sections, and closingCTA',
        service: 'ScriptGenerator',
        retryable: false,
      };
      res.status(400).json(error);
      return;
    }

    // Recalculate totalWordCount based on edited content
    const totalWordCount = calculateTotalWordCount(
      script.hook,
      script.introduction,
      script.sections,
      script.closingCTA
    );

    const updatedScript: Script = {
      ...script,
      totalWordCount,
    };

    res.status(200).json({
      projectId: id,
      script: updatedScript,
    });
  } catch (err: unknown) {
    const error: AppError = {
      code: 'OPENAI_API_ERROR',
      message: err instanceof Error ? err.message : 'Unknown error while saving script',
      service: 'ScriptGenerator',
      retryable: false,
    };
    res.status(500).json(error);
  }
});

export default router;
