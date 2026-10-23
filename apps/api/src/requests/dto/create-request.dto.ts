import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export const CHOOSE_PROVIDER = 'Choose a providing entity.';
export const TITLE_LENGTH = 'Title must be between 5 and 120 characters.';

// The text fields of POST /requests (multipart). The requesting entity and
// submitter come from the session, never from the body.
export class CreateRequestDto {
  @IsString({ message: CHOOSE_PROVIDER })
  @IsNotEmpty({ message: CHOOSE_PROVIDER })
  providingEntityId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: TITLE_LENGTH })
  @Length(5, 120, { message: TITLE_LENGTH })
  title: string;
}
