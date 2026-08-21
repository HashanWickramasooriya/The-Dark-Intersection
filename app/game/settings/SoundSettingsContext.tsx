"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "soundSettings";
const DEFAULT_MUSIC_VOLUME = 0.7;
const DEFAULT_EFFECTS_VOLUME = 1;
// Matches GameAudio's original hardcoded master gain, so anyone with
// settings saved from before this control existed hears no sudden change.
const DEFAULT_MASTER_VOLUME = 0.9;

interface StoredSoundSettings {
  musicVolume: number;
  effectsVolume: number;
  masterVolume: number;
}

const DEFAULTS: StoredSoundSettings = {
  musicVolume: DEFAULT_MUSIC_VOLUME,
  effectsVolume: DEFAULT_EFFECTS_VOLUME,
  masterVolume: DEFAULT_MASTER_VOLUME,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function readStoredSettings(): StoredSoundSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<StoredSoundSettings>;
    return {
      musicVolume: typeof parsed.musicVolume === "number" ? clamp01(parsed.musicVolume) : DEFAULT_MUSIC_VOLUME,
      effectsVolume: typeof parsed.effectsVolume === "number" ? clamp01(parsed.effectsVolume) : DEFAULT_EFFECTS_VOLUME,
      // Absent in settings saved before this field existed — defaults to
      // the same 0.9 the audio engine always used, not silence.
      masterVolume: typeof parsed.masterVolume === "number" ? clamp01(parsed.masterVolume) : DEFAULT_MASTER_VOLUME,
    };
  } catch {
    return DEFAULTS;
  }
}

interface SoundSettingsContextValue {
  musicVolume: number;
  effectsVolume: number;
  masterVolume: number;
  setMusicVolume: (v: number) => void;
  setEffectsVolume: (v: number) => void;
  setMasterVolume: (v: number) => void;
}

const SoundSettingsContext = createContext<SoundSettingsContextValue | null>(null);

export function SoundSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StoredSoundSettings>(() => readStoredSettings());

  const persist = useCallback((next: StoredSoundSettings) => {
    setSettings(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setMusicVolume = useCallback(
    (v: number) => persist({ ...settings, musicVolume: clamp01(v) }),
    [persist, settings],
  );
  const setEffectsVolume = useCallback(
    (v: number) => persist({ ...settings, effectsVolume: clamp01(v) }),
    [persist, settings],
  );
  const setMasterVolume = useCallback(
    (v: number) => persist({ ...settings, masterVolume: clamp01(v) }),
    [persist, settings],
  );

  const value = useMemo(
    () => ({
      musicVolume: settings.musicVolume,
      effectsVolume: settings.effectsVolume,
      masterVolume: settings.masterVolume,
      setMusicVolume,
      setEffectsVolume,
      setMasterVolume,
    }),
    [settings, setMusicVolume, setEffectsVolume, setMasterVolume],
  );

  return <SoundSettingsContext.Provider value={value}>{children}</SoundSettingsContext.Provider>;
}

/** `{ musicVolume, effectsVolume, masterVolume, setMusicVolume,
 * setEffectsVolume, setMasterVolume }` — 0..1 each, persisted to
 * localStorage, local to this browser only (never sent over the network).
 * Must be used within SoundSettingsProvider. */
export function useSoundSettings(): SoundSettingsContextValue {
  const ctx = useContext(SoundSettingsContext);
  if (!ctx) throw new Error("useSoundSettings must be used within a SoundSettingsProvider");
  return ctx;
}
