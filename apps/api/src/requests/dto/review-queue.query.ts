import { IsIn, IsOptional } from 'class-validator';

export const REVIEW_VIEWS = ['queue', 'flagged', 'pending', 'decided'] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

export const REVIEW_SORTS = ['oldest', 'newest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export class ReviewQueueQuery {
  @IsOptional()
  @IsIn(REVIEW_VIEWS, {
    message: 'view must be queue, flagged, pending or decided.',
  })
  view: ReviewView = 'queue';

  @IsOptional()
  @IsIn(REVIEW_SORTS, { message: 'sort must be oldest or newest.' })
  sort: ReviewSort = 'oldest';
}
