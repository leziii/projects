import type { SupportInfo } from '@pawpal/shared';
import { api } from './client';

export const supportInfo = () => api<SupportInfo>('/support');
