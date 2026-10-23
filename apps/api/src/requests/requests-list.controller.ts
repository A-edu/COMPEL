import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import { ListRequestsQuery } from './dto/list-requests.query.js';
import {
  RequestsListService,
  type RequestListItem,
} from './requests-list.service.js';

@Controller('requests')
export class RequestsListController {
  constructor(private readonly requests: RequestsListService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query() query: ListRequestsQuery,
  ): Promise<RequestListItem[]> {
    return this.requests.list(user, query.direction);
  }
}
