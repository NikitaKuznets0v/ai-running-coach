import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import type { UserProfile } from '../domain/types.js';

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
  auth: { persistSession: false }
});

export async function getUserByTelegramId(telegramId: number): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as UserProfile) || null;
}

export async function upsertUserProfile(patch: Partial<UserProfile> & { telegram_id: number }): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .upsert(patch, { onConflict: 'telegram_id' })
    .select('*')
    .limit(1)
    .single();

  if (error) throw error;
  return data as UserProfile;
}

export async function appendChatHistory(params: {
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type?: string;
  telegram_message_id?: number;
}) {
  const { error } = await supabase.from('chat_history').insert({
    user_id: params.user_id,
    role: params.role,
    content: params.content,
    message_type: params.message_type || 'general',
    telegram_message_id: params.telegram_message_id
  });
  if (error) throw error;
}

export async function getCompletedUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('onboarding_stage', 'completed');
  if (error) throw error;
  return (data as UserProfile[]) || [];
}
