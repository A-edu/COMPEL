import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import type { DecisionOutcome } from '@prisma/client';

export const OUTCOMES: DecisionOutcome[] = ['APPROVED', 'REJECTED'];

export const OUTCOME_MESSAGE = 'Choose an outcome.';
export const JUSTIFICATION_MESSAGE =
  'The justification must be 10 to 1000 characters.';

// The body of POST /review/requests/:id/decision (Sprint 2 spec §8.1).
export class RecordDecisionDto {
  @IsIn(OUTCOMES, { message: OUTCOME_MESSAGE })
  outcome: DecisionOutcome;

  // Counted after trimming, so spaces alone are no justification.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: JUSTIFICATION_MESSAGE })
  @Length(10, 1000, { message: JUSTIFICATION_MESSAGE })
  justification: string;
}
