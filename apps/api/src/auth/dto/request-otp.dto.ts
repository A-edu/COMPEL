import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Enter a valid email address.' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;
}
