import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type {
  PipelineState,
  ProjectState,
  PipelineStage,
  StageStatus,
  TopicSuggestion,
  VideoFormat,
  AppError,
} from '../../../shared/types';
import { ErrorCode } from '../../../shared/types';
import { PIPELINE_STAGES_ORDER } from '../../../shared/constants';

export interface IPipelineController {
  createProject(topic: TopicSuggestion, format: VideoFormat): Promise<ProjectState>;
  getState(projectId: string): Promise<ProjectState>;
  executeStage(projectId: string, stage: PipelineStage): Promise<ProjectState>;
  retryStage(projectId: string, stage: PipelineStage): Promise<ProjectState>;
}

export class PipelineController implements IPipelineController {
  private projectsPath: string;

  constructor(projectsPath?: string) {
    this.projectsPath = projectsPath ?? path.join(os.homedir(), '.youtube-automation', 'projects');
  }

  async createProject(topic: TopicSuggestion, format: VideoFormat): Promise<ProjectState> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stages: Record<PipelineStage, StageStatus> = {} as Record<PipelineStage, StageStatus>;
    for (const stage of PIPELINE_STAGES_ORDER) {
      stages[stage] = 'pending';
    }

    const pipeline: PipelineState = {
      projectId: id,
      currentStage: PIPELINE_STAGES_ORDER[0],
      stages,
      topic,
      format,
    };

    const projectState: ProjectState = {
      id,
      createdAt: now,
      updatedAt: now,
      topic,
      format,
      pipeline,
    };

    await this.saveState(projectState);
    return projectState;
  }

  async getState(projectId: string): Promise<ProjectState> {
    const statePath = this.getStatePath(projectId);

    if (!fs.existsSync(statePath)) {
      const error: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: `Project not found: ${projectId}`,
        service: 'PipelineController',
        retryable: false,
      };
      throw error;
    }

    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as ProjectState;
  }

  async executeStage(projectId: string, stage: PipelineStage): Promise<ProjectState> {
    const state = await this.getState(projectId);

    // Validate stage accessibility: all preceding stages must be completed
    this.validateStageAccessibility(state, stage);

    // Set stage to in_progress
    state.pipeline.stages[stage] = 'in_progress';
    state.pipeline.currentStage = stage;
    state.updatedAt = new Date().toISOString();
    await this.saveState(state);

    try {
      // Execute the stage service (placeholder - actual service execution is handled by route handlers)
      // Mark stage as completed
      state.pipeline.stages[stage] = 'completed';
      state.updatedAt = new Date().toISOString();
      await this.saveState(state);
      return state;
    } catch (err) {
      // Mark stage as error, preserving all previous data
      state.pipeline.stages[stage] = 'error';
      state.updatedAt = new Date().toISOString();
      await this.saveState(state);
      throw err;
    }
  }

  async retryStage(projectId: string, stage: PipelineStage): Promise<ProjectState> {
    const state = await this.getState(projectId);

    // Only allow retry on stages with 'error' status
    if (state.pipeline.stages[stage] !== 'error') {
      const error: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: `Cannot retry stage '${stage}': stage status is '${state.pipeline.stages[stage]}', expected 'error'`,
        service: 'PipelineController',
        retryable: false,
      };
      throw error;
    }

    // Reset stage to pending and re-execute
    state.pipeline.stages[stage] = 'pending';
    state.updatedAt = new Date().toISOString();
    await this.saveState(state);

    return this.executeStage(projectId, stage);
  }

  /**
   * Validates that all stages preceding the target stage are completed.
   */
  private validateStageAccessibility(state: ProjectState, stage: PipelineStage): void {
    const stageIndex = PIPELINE_STAGES_ORDER.indexOf(stage);

    if (stageIndex === -1) {
      const error: AppError = {
        code: ErrorCode.VALIDATION_MISSING_INPUTS,
        message: `Invalid pipeline stage: ${stage}`,
        service: 'PipelineController',
        retryable: false,
      };
      throw error;
    }

    for (let i = 0; i < stageIndex; i++) {
      const precedingStage = PIPELINE_STAGES_ORDER[i];
      if (state.pipeline.stages[precedingStage] !== 'completed') {
        const error: AppError = {
          code: ErrorCode.VALIDATION_MISSING_INPUTS,
          message: `Cannot execute stage '${stage}': preceding stage '${precedingStage}' has status '${state.pipeline.stages[precedingStage]}', expected 'completed'`,
          service: 'PipelineController',
          retryable: false,
        };
        throw error;
      }
    }
  }

  /**
   * Persists project state to disk as JSON.
   */
  private async saveState(state: ProjectState): Promise<void> {
    const projectDir = this.getProjectDir(state.id);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    const statePath = path.join(projectDir, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private getProjectDir(projectId: string): string {
    return path.join(this.projectsPath, projectId);
  }

  private getStatePath(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'state.json');
  }
}
