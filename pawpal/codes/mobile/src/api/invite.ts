import type { InviteInfo } from '@pawpal/shared';
import { api } from './client';

/** Me → Invite friends (E5-7): my code, counts and credit. */
export const getInvite = () => api<InviteInfo>('/invite');
