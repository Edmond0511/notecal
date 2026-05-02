import { mmkv } from '@/lib/mmkv';
import { HealthSettings, DEFAULT_HEALTH_SETTINGS } from './types';

const KEY = 'health-settings';

export function getHealthSettings(): HealthSettings {
  const raw = mmkv.getString(KEY);
  if (!raw) return { ...DEFAULT_HEALTH_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_HEALTH_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_HEALTH_SETTINGS };
  }
}

export function setHealthSettings(partial: Partial<HealthSettings>): void {
  const current = getHealthSettings();
  const next: HealthSettings = { ...current, ...partial };
  mmkv.set(KEY, JSON.stringify(next));
}

export function resetHealthSettings(): void {
  mmkv.remove(KEY);
}
