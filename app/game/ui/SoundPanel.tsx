"use client";

import { useLanguage } from "../i18n/LanguageContext";
import { useSoundSettings } from "../settings/SoundSettingsContext";
import { VolumeSlider } from "./VolumeSlider";

/**
 * Pure content (heading + Master/Music/Sound Effects sliders) — no back
 * button, so each caller (main menu, pause menu, multiplayer lobby) keeps
 * its own button styling. Reads and writes the ONE shared
 * SoundSettingsContext (localStorage-persisted), so a change made here is
 * immediately visible everywhere else this panel is rendered, and applies
 * to whichever Engine (single-player or multiplayer) is currently alive.
 */
export function SoundPanel({ headingClassName }: { headingClassName?: string }) {
  const { t } = useLanguage();
  const { musicVolume, effectsVolume, masterVolume, setMusicVolume, setEffectsVolume, setMasterVolume } =
    useSoundSettings();

  return (
    <>
      <h2
        className={
          headingClassName ?? "vhs-title font-sinhala text-3xl tracking-[0.15em] text-amber-50/90"
        }
      >
        {t("sound.title")}
      </h2>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-6">
        <VolumeSlider label={t("sound.master")} value={masterVolume} onChange={setMasterVolume} />
        <VolumeSlider label={t("sound.music")} value={musicVolume} onChange={setMusicVolume} />
        <VolumeSlider label={t("sound.effects")} value={effectsVolume} onChange={setEffectsVolume} />
      </div>
    </>
  );
}
