import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID_KEY = 'user_id';
const PLAYBACK_SPEED_KEY = 'playback_speed';

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
  }
}
