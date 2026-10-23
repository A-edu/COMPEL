import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import type { Position } from '@prisma/client';

export const POSITIONS: Position[] = ['ENDORSED', 'OBJECTED'];

export const POSITION_MESSAGE = 'Choose a position.';
export const REASON_MESSAGE = 'The reason must be 10 to 1000 characters.';

// The text fields of POST /requests/:id/response (multipart, §4). The RoPA
// file arrives separately through @DocumentUpload.
export class RespondToRequestDto {
  @IsIn(POSITIONS, { message: POSITION_MESSAGE })
  position: Position;

  // Counted after trimming. Only checked for an objection; with ENDORSED
  // the service ignores it.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((dto: RespondToRequestDto) => dto.position === 'OBJECTED')
  @IsString({ message: REASON_MESSAGE })
  @Length(10, 1000, { message: REASON_MESSAGE })
  objectionReason?: string;
}
