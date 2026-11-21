import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module.js';
import { AnthropicModelClient } from './model/anthropic-model-client.js';
import { MODEL_CLIENT } from './model/model-client.js';
import { PipelineInternalController } from './pipeline-internal.controller.js';
import { PipelineRunner } from './pipeline-runner.service.js';
import {
  PIPELINE_STEP_SOURCE,
  type StepSource,
  pipelineSteps,
} from './pipeline-steps.js';
import { PipelineSweeper } from './pipeline-sweeper.service.js';

// The automated review (Sprint 3 spec §2, §4.3). Tests override MODEL_CLIENT
// with a StandInModelClient, and may override PIPELINE_STEP_SOURCE with steps
// of their own.
@Module({
  imports: [StorageModule.register()],
  controllers: [PipelineInternalController],
  providers: [
    { provide: MODEL_CLIENT, useClass: AnthropicModelClient },
    {
      provide: PIPELINE_STEP_SOURCE,
      inject: [ConfigService],
      useFactory:
        (config: ConfigService): StepSource =>
        () =>
          pipelineSteps((name) => config.get<string>(name)),
    },
    PipelineRunner,
    PipelineSweeper,
  ],
  exports: [PipelineRunner, MODEL_CLIENT],
})
export class PipelineModule {}
