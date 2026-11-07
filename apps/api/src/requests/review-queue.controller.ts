import { Controller, Get, Query } from '@nestjs/common';
import { OfficerOnly } from '../auth/route-access.js';
import { ReviewQueueQuery } from './dto/review-queue.query.js';
import {
  ReviewQueueService,
  type ReviewQueueItem,
} from './review-queue.service.js';

@OfficerOnly()
@Controller('review')
export class ReviewQueueController {
  constructor(private readonly queue: ReviewQueueService) {}

  @Get('requests')
  list(@Query() query: ReviewQueueQuery): Promise<ReviewQueueItem[]> {
    return this.queue.list(query.view, query.sort);
  }
}
