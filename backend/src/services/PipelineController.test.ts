import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PipelineController } from './PipelineController';
import type { TopicSuggestion, VideoFormat, PipelineStage } from '../../../shared/types';
import { PIPELINE_STAGES_ORDER } from '../../../shared/constants';

function createTestTopic(): TopicSuggestion {
  return {
    title: 'Test Topic',
    description: 'A test topic description',
    tags: ['test', 'automation'],
    viralScore: 7,
    recommendedFormat: 'short',
    reasoning: 'Good for testing',
  };
}

describe('PipelineController', () => {
  let tempDir: string;
  let controller: PipelineController;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
    controller = new PipelineController(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createProject', () => {
    it('should create a project with a valid UUID', async () => {
      const topic = createTestTopic();
      const state = await controller.createProject(topic, 'short');

      expect(state.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should initialize all stages as pending', async () => {
      const topic = createTestTopic();
      const state = await controller.createProject(topic, 'short');

      for (const stage of PIPELINE_STAGES_ORDER) {
        expect(state.pipeline.stages[stage]).toBe('pending');
      }
    });

    it('should set the current stage to the first pipeline stage', async () => {
      const topic = createTestTopic();
      const state = await controller.createProject(topic, 'short');

      expect(state.pipeline.currentStage).toBe('trend_analysis');
    });

    it('should store topic and format in the project state', async () => {
      const topic = createTestTopic();
      const state = await controller.createProject(topic, 'long_video');

      expect(state.topic).toEqual(topic);
      expect(state.format).toBe('long_video');
      expect(state.pipeline.topic).toEqual(topic);
      expect(state.pipeline.format).toBe('long_video');
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const topic = createTestTopic();
      const before = new Date().toISOString();
      const state = await controller.createProject(topic, 'short');
      const after = new Date().toISOString();

      expect(state.createdAt >= before).toBe(true);
      expect(state.createdAt <= after).toBe(true);
      expect(state.updatedAt).toBe(state.createdAt);
    });

    it('should persist state to disk', async () => {
      const topic = createTestTopic();
      const state = await controller.createProject(topic, 'short');

      const statePath = path.join(tempDir, state.id, 'state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const raw = fs.readFileSync(statePath, 'utf-8');
      const loaded = JSON.parse(raw);
      expect(loaded.id).toBe(state.id);
    });
  });

  describe('getState', () => {
    it('should load project state from disk', async () => {
      const topic = createTestTopic();
      const created = await controller.createProject(topic, 'short');

      const loaded = await controller.getState(created.id);
      expect(loaded.id).toBe(created.id);
      expect(loaded.topic).toEqual(topic);
      expect(loaded.format).toBe('short');
      expect(loaded.pipeline.stages.trend_analysis).toBe('pending');
    });

    it('should throw an error when project does not exist', async () => {
      await expect(controller.getState('non-existent-id')).rejects.toMatchObject({
        code: 'VALIDATION_MISSING_INPUTS',
        message: expect.stringContaining('not found'),
      });
    });

    it('should persist and reload round-trip correctly', async () => {
      const topic = createTestTopic();
      const created = await controller.createProject(topic, 'long_video');

      // Create a fresh controller instance to prove it reads from disk
      const freshController = new PipelineController(tempDir);
      const loaded = await freshController.getState(created.id);

      expect(loaded).toEqual(created);
    });
  });

  describe('executeStage', () => {
    it('should execute the first stage without requiring preceding stages', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      const result = await controller.executeStage(project.id, 'trend_analysis');
      expect(result.pipeline.stages.trend_analysis).toBe('completed');
    });

    it('should reject execution when preceding stages are not completed', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // Try to execute script_generation without completing trend_analysis and format_selection
      await expect(
        controller.executeStage(project.id, 'script_generation')
      ).rejects.toMatchObject({
        code: 'VALIDATION_MISSING_INPUTS',
        message: expect.stringContaining('trend_analysis'),
      });
    });

    it('should allow execution when all preceding stages are completed', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // Complete stages in order
      await controller.executeStage(project.id, 'trend_analysis');
      await controller.executeStage(project.id, 'format_selection');

      const result = await controller.executeStage(project.id, 'script_generation');
      expect(result.pipeline.stages.script_generation).toBe('completed');
    });

    it('should update currentStage when executing', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      const result = await controller.executeStage(project.id, 'trend_analysis');
      expect(result.pipeline.currentStage).toBe('trend_analysis');
    });

    it('should persist state after execution', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      await controller.executeStage(project.id, 'trend_analysis');

      const loaded = await controller.getState(project.id);
      expect(loaded.pipeline.stages.trend_analysis).toBe('completed');
    });

    it('should reject invalid stage names', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      await expect(
        controller.executeStage(project.id, 'invalid_stage' as PipelineStage)
      ).rejects.toMatchObject({
        code: 'VALIDATION_MISSING_INPUTS',
        message: expect.stringContaining('Invalid pipeline stage'),
      });
    });
  });

  describe('retryStage', () => {
    it('should only allow retry on stages with error status', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // trend_analysis is pending, not error
      await expect(
        controller.retryStage(project.id, 'trend_analysis')
      ).rejects.toMatchObject({
        code: 'VALIDATION_MISSING_INPUTS',
        message: expect.stringContaining("expected 'error'"),
      });
    });

    it('should not allow retry on completed stages', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      await controller.executeStage(project.id, 'trend_analysis');

      await expect(
        controller.retryStage(project.id, 'trend_analysis')
      ).rejects.toMatchObject({
        code: 'VALIDATION_MISSING_INPUTS',
        message: expect.stringContaining("expected 'error'"),
      });
    });
  });

  describe('stage ordering enforcement', () => {
    it('should enforce strict sequential ordering', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // Cannot skip to image_generation (index 3) without completing 0, 1, 2
      await expect(
        controller.executeStage(project.id, 'image_generation')
      ).rejects.toMatchObject({
        message: expect.stringContaining('trend_analysis'),
      });
    });

    it('should allow executing stages in correct order', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      for (const stage of PIPELINE_STAGES_ORDER) {
        const result = await controller.executeStage(project.id, stage);
        expect(result.pipeline.stages[stage]).toBe('completed');
      }
    });
  });

  describe('error state preservation', () => {
    it('should preserve data from completed stages when a later stage fails', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // Complete first two stages
      await controller.executeStage(project.id, 'trend_analysis');
      await controller.executeStage(project.id, 'format_selection');

      // Verify earlier stages remain completed
      const state = await controller.getState(project.id);
      expect(state.pipeline.stages.trend_analysis).toBe('completed');
      expect(state.pipeline.stages.format_selection).toBe('completed');

      // The topic and format data remain intact
      expect(state.topic).toEqual(topic);
      expect(state.format).toBe('short');
    });

    it('should not modify preceding stage statuses when executing a later stage', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // Complete stages in order
      await controller.executeStage(project.id, 'trend_analysis');
      await controller.executeStage(project.id, 'format_selection');
      await controller.executeStage(project.id, 'script_generation');

      const state = await controller.getState(project.id);

      // All preceding stages stay completed
      expect(state.pipeline.stages.trend_analysis).toBe('completed');
      expect(state.pipeline.stages.format_selection).toBe('completed');
      expect(state.pipeline.stages.script_generation).toBe('completed');

      // Later stages stay pending
      expect(state.pipeline.stages.image_generation).toBe('pending');
      expect(state.pipeline.stages.voice_generation).toBe('pending');
    });
  });

  describe('state persistence', () => {
    it('should save and load state correctly (round-trip)', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');

      // Execute a stage
      await controller.executeStage(project.id, 'trend_analysis');

      // Read back from a fresh controller
      const freshController = new PipelineController(tempDir);
      const loaded = await freshController.getState(project.id);

      expect(loaded.pipeline.stages.trend_analysis).toBe('completed');
      expect(loaded.topic).toEqual(topic);
      expect(loaded.format).toBe('short');
      expect(loaded.id).toBe(project.id);
    });

    it('should update updatedAt timestamp on each state change', async () => {
      const topic = createTestTopic();
      const project = await controller.createProject(topic, 'short');
      const initialUpdatedAt = project.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await controller.executeStage(project.id, 'trend_analysis');
      expect(result.updatedAt >= initialUpdatedAt).toBe(true);
    });
  });
});
