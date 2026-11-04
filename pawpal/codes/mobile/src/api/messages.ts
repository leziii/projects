import type { MessageCategory, MessageList, OpenedMessage } from '@pawpal/shared';
import { api, getToken } from './client';

export const listMessages = (category: MessageCategory | '' = '') => api<MessageList>(`/messages${category ? `?category=${category}` : ''}`);

/** Opens a message: the server checks the role and returns the linked item's latest state. */
export const openMessage = (id: number) => api<OpenedMessage>(`/messages/${id}/open`, {});

export const readAllMessages = () => api<{ read: number }>('/messages/read-all', {});

/** Unread count for the badge; 0 for guests or when offline. */
export async function unreadCount(): Promise<number> {
  if (!getToken()) return 0;
  try {
    return (await listMessages()).unread;
  } catch {
    return 0;
  }
}
