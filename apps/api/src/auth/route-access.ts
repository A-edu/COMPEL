import { SetMetadata } from '@nestjs/common';

export const ROUTE_ACCESS = 'routeAccess';

export type RouteAccess = 'ANY_ROLE' | 'OFFICER_ONLY';

// Routes are for DPOs unless marked, so an officer can reach only what is
// explicitly opened to them (AGENTS.md -> Access rules 6).

// For any logged-in account, whatever its role.
export const AnyRole = () => SetMetadata(ROUTE_ACCESS, 'ANY_ROLE');

// For compliance officers only: the review console.
export const OfficerOnly = () => SetMetadata(ROUTE_ACCESS, 'OFFICER_ONLY');
