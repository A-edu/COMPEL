import { IsString, Matches } from 'class-validator';
import { RequestOtpDto } from './request-otp.dto.js';

export class VerifyOtpDto extends RequestOtpDto {
  @IsString({ message: 'Enter the 6-digit code.' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
  code: string;
}
