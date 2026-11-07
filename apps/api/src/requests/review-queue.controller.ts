import { Controller, Get } from '@nestjs/common';
import { OfficerOnly } from '../auth/route-access.js';
import {
  ReviewQueueService,
  type ReviewQueueItem,
} from './review-queue.service.js';

@OfficerOnly()
@Controller('review')
export class ReviewQueueController {
  constructor(private readonly queue: ReviewQueueService) {}

  @Get('requests')
  list(): Promise<ReviewQueueItem[]> {
    return this.queue.list();
  }
}
