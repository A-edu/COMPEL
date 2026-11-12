import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export const REVIEW_VIEWS = ['queue', 'flagged', 'pending', 'decided'] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

// `longest`: the request waiting longest first. `recent`: the reverse. The
// decided view always lists the newest decision first.
export const REVIEW_SORTS = ['longest', 'recent'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export class ReviewQueueQuery {
  @IsOptional()
  @IsIn(REVIEW_VIEWS, {
    message: 'view must be queue, flagged, pending or decided.',
  })
  view: ReviewView = 'queue';

  @IsOptional()
  @IsIn(REVIEW_SORTS, { message: 'sort must be longest or recent.' })
  sort: ReviewSort = 'longest';

  // An entity ID, matched against the requester or the provider. It only
  // narrows the officer's scope; an unknown ID matches nothing.
  @IsOptional()
  @IsString({ message: 'entity must be an entity ID.' })
  @Length(1, 64, { message: 'entity must be an entity ID.' })
  entity?: string;
}
