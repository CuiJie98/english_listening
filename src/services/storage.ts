import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID_KEY = 'user_id';
const PLAYBACK_SPEED_KEY = 'playback_speed';
const FAVORITE_EPISODES_KEY = 'favorite_episode_ids';
const RECENT_PLAYBACK_KEY = 'recent_playback';

export interface RecentPlayback {
  episodeId: number;
  position: number;
  updatedAt: number;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

async function getWithLegacyMigration(key: string): Promise<string | null> {
  const stored = await AsyncStorage.getItem(key);
  if (stored !== null) return stored;

  if (typeof window !== 'undefined' && window.localStorage) {
    const legacy = window.localStorage.getItem(key);
    if (legacy !== null) {
      await AsyncStorage.setItem(key, legacy);
      return legacy;
    }
  }

  return null;
}

export async function getOrCreateUserId(): Promise<string> {
  const stored = await getWithLegacyMigration(USER_ID_KEY);
  if (stored) return stored;

  const id = randomId();
  await AsyncStorage.setItem(USER_ID_KEY, id);
  return id;
}

export async function getPlaybackSpeed(defaultSpeed = 1.0): Promise<number> {
  const stored = await getWithLegacyMigration(PLAYBACK_SPEED_KEY);
  const speed = stored ? Number(stored) : defaultSpeed;
  return Number.isFinite(speed) && speed > 0 ? speed : defaultSpeed;
}

export async function setPlaybackSpeed(speed: number): Promise<void> {
  await AsyncStorage.setItem(PLAYBACK_SPEED_KEY, speed.toString());
}

export async function getPlaybackPosition(episodeId: number): Promise<number> {
  const stored = await AsyncStorage.getItem(`playback_pos_${episodeId}`);
  const pos = stored ? Number(stored) : 0;
  return Number.isFinite(pos) && pos > 0 ? pos : 0;
}

export async function setPlaybackPosition(episodeId: number, time: number): Promise<void> {
  if (time <= 0) {
    await AsyncStorage.removeItem(`playback_pos_${episodeId}`);
  } else {
    await AsyncStorage.setItem(`playback_pos_${episodeId}`, time.toString());
    if (time >= 5) {
      await AsyncStorage.setItem(RECENT_PLAYBACK_KEY, JSON.stringify({
        episodeId,
        position: time,
        updatedAt: Date.now(),
      }));
    }
  }
}

export async function getRecentPlayback(): Promise<RecentPlayback | null> {
  const stored = await getWithLegacyMigration(RECENT_PLAYBACK_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (
      Number.isInteger(parsed.episodeId) &&
      Number.isFinite(parsed.position) &&
      parsed.position >= 5 &&
      Number.isFinite(parsed.updatedAt)
    ) {
      return parsed;
    }
  } catch {}
  return null;
}

export async function getFavoriteEpisodeIds(): Promise<number[]> {
  const stored = await getWithLegacyMigration(FAVORITE_EPISODES_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => Number.isInteger(id));
  } catch {
    return [];
  }
}

export async function isFavoriteEpisode(episodeId: number): Promise<boolean> {
  const ids = await getFavoriteEpisodeIds();
  return ids.includes(episodeId);
}

export async function toggleFavoriteEpisode(episodeId: number): Promise<boolean> {
  const ids = await getFavoriteEpisodeIds();
  const isFavorite = ids.includes(episodeId);
  const nextIds = isFavorite ? ids.filter((id) => id !== episodeId) : [...ids, episodeId];
  await AsyncStorage.setItem(FAVORITE_EPISODES_KEY, JSON.stringify(nextIds));
  return !isFavorite;
}
