import { Body, Controller, Param, Post } from '@nestjs/common';
import type { DecisionOutcome } from '@prisma/client';
import { OfficerOnly } from '../auth/route-access.js';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import { RecordDecisionDto } from './dto/record-decision.dto.js';
import { ReviewDecisionService } from './review-decision.service.js';

@OfficerOnly()
@Controller('review/requests')
export class ReviewDecisionController {
  constructor(private readonly decisions: ReviewDecisionService) {}

  @Post(':id/decision')
  decide(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: RecordDecisionDto,
  ): Promise<{ status: DecisionOutcome }> {
    return this.decisions.decide(user, id, body);
  }
}
