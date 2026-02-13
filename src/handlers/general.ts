import type { UserProfile } from '../domain/types.js';
import { chatReply } from '../ai/chat.js';

export async function handleGeneral(user: UserProfile, message: string) {
  return await chatReply(user, message);
}
