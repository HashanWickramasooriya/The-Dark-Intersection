"use client";

import { useSyncExternalStore } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import type { translations } from "../i18n/translations";

type TranslationKey = keyof typeof translations.si;

/** Shared with GameShell.tsx's other media-query use (portrait detection) —
 * kept here too since this is the only thing ControlsPanel needs from it,
 * and importing a hook out of a page component would be backwards. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false, // SSR: assume desktop, corrected on hydration
  );
}

const TOUCH_KEYS: TranslationKey[] = [
  "menu.controls.touch1",
  "menu.controls.touch2",
  "menu.controls.touch3",
  "menu.controls.touch4",
];

const DESKTOP_KEYS: TranslationKey[] = [
  "menu.controls.wasd",
  "menu.controls.mouse",
  "menu.controls.shift",
  "menu.controls.crouch",
  "menu.controls.torch",
  "menu.controls.interact",
  "menu.controls.pause",
];

/**
 * Pure content (heading + the game's ACTUAL key bindings) — no back button,
 * so each caller (main menu, pause menu, multiplayer lobby) keeps its own
 * button styling instead of this component dictating one. Reads the real
 * bindings from the same translation keys the main menu's inline control
 * hints already use, so this can never drift from what the game truly does.
 */
export function ControlsPanel({ headingClassName }: { headingClassName?: string }) {
  const { t } = useLanguage();
  const isTouch = useMediaQuery("(pointer: coarse)");
  const rows = isTouch ? TOUCH_KEYS : DESKTOP_KEYS;

  return (
    <>
      <h2
        className={
          headingClassName ?? "vhs-title font-sinhala text-3xl tracking-[0.15em] text-amber-50/90"
        }
      >
        {t("controls.title")}
      </h2>
      <div className="font-sinhala mt-8 flex w-full max-w-xs flex-col gap-2.5 text-[13px] tracking-[0.05em] text-amber-100/70">
        {rows.map((key) => (
          <div key={key} className="border-b border-amber-100/10 pb-2.5 text-left">
            {t(key)}
          </div>
        ))}
      </div>
    </>
  );
}
