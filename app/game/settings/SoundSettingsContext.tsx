"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "soundSettings";
const DEFAULT_MUSIC_VOLUME = 0.7;
const DEFAULT_EFFECTS_VOLUME = 1;

interface StoredSoundSettings {
  musicVolume: number;
  effectsVolume: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function readStoredSettings(): StoredSoundSettings {
  if (typeof window === "undefined") {
    return { musicVolume: DEFAULT_MUSIC_VOLUME, effectsVolume: DEFAULT_EFFECTS_VOLUME };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { musicVolume: DEFAULT_MUSIC_VOLUME, effectsVolume: DEFAULT_EFFECTS_VOLUME };
    const parsed = JSON.parse(raw) as Partial<StoredSoundSettings>;
    return {
      musicVolume: typeof parsed.musicVolume === "number" ? clamp01(parsed.musicVolume) : DEFAULT_MUSIC_VOLUME,
      effectsVolume: typeof parsed.effectsVolume === "number" ? clamp01(parsed.effectsVolume) : DEFAULT_EFFECTS_VOLUME,
    };
  } catch {
    return { musicVolume: DEFAULT_MUSIC_VOLUME, effectsVolume: DEFAULT_EFFECTS_VOLUME };
  }
}

interface SoundSettingsContextValue {
  musicVolume: number;
  effectsVolume: number;
  setMusicVolume: (v: number) => void;
  setEffectsVolume: (v: number) => void;
}

const SoundSettingsContext = createContext<SoundSettingsContextValue | null>(null);

export function SoundSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StoredSoundSettings>(() => readStoredSettings());

  const persist = useCallback((next: StoredSoundSettings) => {
    setSettings(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setMusicVolume = useCallback(
    (v: number) => persist({ musicVolume: clamp01(v), effectsVolume: settings.effectsVolume }),
    [persist, settings.effectsVolume],
  );
  const setEffectsVolume = useCallback(
    (v: number) => persist({ musicVolume: settings.musicVolume, effectsVolume: clamp01(v) }),
    [persist, settings.musicVolume],
  );

  const value = useMemo(
    () => ({ musicVolume: settings.musicVolume, effectsVolume: settings.effectsVolume, setMusicVolume, setEffectsVolume }),
    [settings, setMusicVolume, setEffectsVolume],
  );

  return <SoundSettingsContext.Provider value={value}>{children}</SoundSettingsContext.Provider>;
}

/** `{ musicVolume, effectsVolume, setMusicVolume, setEffectsVolume }` — 0..1
 * each, persisted to localStorage, local to this browser only (never sent
 * over the network). Must be used within SoundSettingsProvider. */
export function useSoundSettings(): SoundSettingsContextValue {
  const ctx = useContext(SoundSettingsContext);
  if (!ctx) throw new Error("useSoundSettings must be used within a SoundSettingsProvider");
  return ctx;
}
