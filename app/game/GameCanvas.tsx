"use client";

import { useEffect, useRef } from "react";
import { Engine, EngineCallbacks, EngineNetContext } from "./engine/Engine";
import { Language } from "./i18n/translations";

interface Props {
  callbacksRef: React.RefObject<EngineCallbacks>;
  onReady: (engine: Engine) => void;
  lang: Language;
  /** 0..1 — local-only, never sent over the network. Applied at construction
   * and live-updated afterward if they change while this Engine is alive. */
  musicVolume: number;
  effectsVolume: number;
  masterVolume: number;
  /** present only for multiplayer runs — single-player passes nothing */
  net?: EngineNetContext;
}

export default function GameCanvas({ callbacksRef, onReady, lang, musicVolume, effectsVolume, masterVolume, net }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let engine: Engine | null = null;
    // Defer construction one frame so the menu paints before level generation.
    const raf = requestAnimationFrame(() => {
      engine = new Engine(container, canvas, {
        onState: (s) => callbacksRef.current?.onState(s),
        onHud: (h) => callbacksRef.current?.onHud(h),
        onMinimap: (m) => callbacksRef.current?.onMinimap(m),
        onPageText: (l) => callbacksRef.current?.onPageText(l),
        onStats: (s) => callbacksRef.current?.onStats(s),
        onToast: (m) => callbacksRef.current?.onToast(m),
        onGameOver: (w) => callbacksRef.current?.onGameOver?.(w),
      }, lang, musicVolume, effectsVolume, masterVolume, net);
      engineRef.current = engine;
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as Record<string, unknown>).__backrooms = engine;
      }
      onReady(engine);
    });

    return () => {
      cancelAnimationFrame(raf);
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine lives for the lifetime of this mount (keyed remount per run); volume changes are handled by the effects below, not by remounting
  }, []);

  // Live volume updates — do NOT recreate the Engine, just ramp the
  // already-running (or not-yet-started) audio buses.
  useEffect(() => {
    engineRef.current?.setMusicVolume(musicVolume);
  }, [musicVolume]);
  useEffect(() => {
    engineRef.current?.setEffectsVolume(effectsVolume);
  }, [effectsVolume]);
  useEffect(() => {
    engineRef.current?.setMasterVolume(masterVolume);
  }, [masterVolume]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
