import { IsIn } from 'class-validator';

export const DIRECTIONS = ['sent', 'received'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export class ListRequestsQuery {
  @IsIn(DIRECTIONS, { message: 'direction must be sent or received.' })
  direction: Direction;
}
