import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFiles,
} from '@nestjs/common';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import {
  DocumentUpload,
  type UploadedFields,
} from '../documents/upload-check.js';
import { RespondToRequestDto } from './dto/respond-to-request.dto.js';
import { RequestResponseService } from './request-response.service.js';

export const ROPA_REQUIRED = 'Choose a RoPA entry file.';

@Controller('requests')
export class RequestResponseController {
  constructor(private readonly responses: RequestResponseService) {}

  @Post(':id/response')
  @DocumentUpload([{ name: 'ropaDocument', maxCount: 1 }])
  respond(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: RespondToRequestDto,
    @UploadedFiles() files: UploadedFields,
  ): Promise<{ status: 'PROVIDER_RESPONDED' }> {
    const ropaFile = files?.ropaDocument?.[0];
    if (!ropaFile) throw new BadRequestException(ROPA_REQUIRED);
    return this.responses.respond(user, id, body, ropaFile);
  }
}
