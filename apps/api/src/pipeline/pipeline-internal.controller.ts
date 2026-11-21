import {
  Controller,
  Headers,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { NOT_FOUND } from '../auth/role.guard.js';
import { PipelineRunner } from './pipeline-runner.service.js';
import {
  ADVANCE_HEARTBEAT_MS,
  INTERNAL_TOKEN_HEADER,
} from './pipeline.constants.js';

// The app calling itself to run the next step of a pipeline run (Sprint 3
// spec §4.3). Not for users: it needs the internal token from Secrets, and
// without it the route is a 404 like any unknown path. With it, it can only
// advance a run that is already queued, by its ID; a repeated call does
// nothing, and it never creates a run or a decision (AGENTS.md -> Access
// rules 7).
//
// It answers 202 at once and keeps the response open, writing a space every
// 10 s, until the step ends. On Autoscale an open request keeps the instance
// working; the bytes keep the Next.js rewrite proxy from dropping it.
@Controller('internal/pipeline-runs')
export class PipelineInternalController {
  constructor(private readonly runner: PipelineRunner) {}

  @Public()
  @Post(':id/advance')
  async advance(
    @Param('id') id: string,
    @Headers(INTERNAL_TOKEN_HEADER) token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.runner.acceptsToken(token)) {
      throw new NotFoundException(NOT_FOUND);
    }

    res.status(202);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.flushHeaders();
    const heartbeat = setInterval(() => res.write(' '), ADVANCE_HEARTBEAT_MS);
    try {
      await this.runner.advance(id);
    } finally {
      clearInterval(heartbeat);
      res.end('\n');
    }
  }
}
