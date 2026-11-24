import { DEFAULT_RULES, type RuleSet } from '@pawpal/shared';
import { api } from './client';

/** E14-3 (R59-7): the rules in effect today; the code defaults if the server cannot be reached. */
export const currentRules = () => api<RuleSet>('/rules').catch(() => DEFAULT_RULES);
