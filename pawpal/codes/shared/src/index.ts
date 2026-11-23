/**
 * Shared code for server, admin-web and mobile.
 */
export * from './rules';
export * from './payments';
export * from './history';
export * from './brand';
export * from './auth';
export * from './roles';
export * from './messages';
export * from './admin';
export * from './alerts';
export * from './support';
export * from './pets';
export * from './addresses';
export * from './caregivers';
export * from './schedule';
export * from './trust';
export * from './booking';
export * from './orders';
export * from './promos';
export * from './referrals';
export * from './requests';
export * from './order-list';
export * from './tasks';
export * from './location';
export * from './service';
export * from './cases';
export * from './exceptions';
export * from './substitutes';
export * from './settlements';
export * from './money';
export * from './dashboard';
export * from './reviews';

export const APP_NAME = 'PawPal';
export const SHARED_VERSION = '0.59.0';

export interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  redis: 'up' | 'down';
  version: string;
}
export * from './test-card';
export * from './cancel';
export * from './refunds';
export * from './waiting';
export * from './overtime';
export * from './extra-fees';
export * from './problems';
