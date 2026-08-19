"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Engine, EngineCallbacks, GameState, HudState, MinimapState } from "./engine/Engine";
import Minimap from "./Minimap";
import { RoomClient } from "./net/RoomClient";

const GameCanvas = dynamic(() => import("./GameCanvas"), { ssr: false });

const INITIAL_HUD: HudState = {
  pages: 0,
  totalPages: 8,
  stamina: 1,
  prompt: null,
  objective: "පිටු එකතු කරන්න — 0/8",
  flashlight: true,
  sneaking: false,
  cheats: null,
  mapCheat: false,
};

export default function GameShell() {
  const engineRef = useRef<Engine | null>(null);
  const autoStartRef = useRef(false);
  const [runId, setRunId] = useState(0);
  const [state, setState] = useState<GameState>("idle");
  const [booted, setBooted] = useState(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [minimap, setMinimap] = useState<MinimapState | null>(null);
  const [pageLines, setPageLines] = useState<string[] | null>(null);
  const [stats, setStats] = useState({ pages: 0, seconds: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [banner, setBanner] = useState<{ title: string; hint: string } | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [mpPanel, setMpPanel] = useState(false);
  const [mpName, setMpName] = useState("");
  const [mpCode, setMpCode] = useState("");
  const [mpBusy, setMpBusy] = useState(false);
  const [mpError, setMpError] = useState<string | null>(null);
  const router = useRouter();
  const isTouch = useMediaQuery("(pointer: coarse)");
  const portrait = useMediaQuery("(orientation: portrait)");

  const bannerKindRef = useRef("");
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchRef = useRef(false);
  useEffect(() => {
    isTouchRef.current = isTouch;
  }, [isTouch]);

  const callbacksRef = useRef<EngineCallbacks>({
    onState: (s) => {
      setState(s);
      if (s !== "paused") setResuming(false); // clears "RESUMING…" feedback
    },
    onHud: (h) => {
      setHud(h);
      // Big objective banner whenever the objective *kind* changes (run
      // start, all pages found, door opened) — not on every counter tick.
      // New players were missing the tiny corner text entirely.
      const kind = h.objective.split("—")[0].trim();
      if (kind !== bannerKindRef.current) {
        bannerKindRef.current = kind;
        const hint =
          kind === "පිටු එකතු කරන්න"
            ? isTouchRef.current
              ? "බිත්තිවල අලවා ඇත — ළං වී 'පිටුව ලබා ගන්න' ඔබන්න"
              : "බිත්තිවල අලවා ඇත — ඒවා ගැනීමට [E] එබන්න"
            : kind === "පිටවීමේ දොර සොයන්න"
              ? "පිටු සියල්ල සොයා ගන්නා ලදී — කොහේ හරි දොරක් අගුළු ඇරී ඇත"
              : "දොර හරහා පිටවන්න — දුවන්න";
        setBanner({ title: h.objective, hint });
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), 5200);
      }
    },
    onMinimap: (m) => setMinimap(m),
    onPageText: (lines) => setPageLines(lines),
    onStats: (s) => setStats(s),
    onToast: (m) => setToast(m),
  });

  const handleReady = useCallback((engine: Engine) => {
    engineRef.current = engine;
    setBooted(true);
    if (autoStartRef.current) {
      autoStartRef.current = false;
      engine.start();
    }
  }, []);

  // Page text fades out on its own.
  useEffect(() => {
    if (!pageLines) return;
    const id = setTimeout(() => setPageLines(null), 6500);
    return () => clearTimeout(id);
  }, [pageLines]);

  // Toasts fade out on their own.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // Rotating to portrait mid-run pauses the game (phones play landscape).
  useEffect(() => {
    if (isTouch && portrait) engineRef.current?.pause();
  }, [isTouch, portrait]);

  const begin = () => engineRef.current?.start();

  const createMultiplayerRoom = async () => {
    setMpBusy(true);
    setMpError(null);
    const client = new RoomClient();
    try {
      await client.connect();
    } catch {
      setMpError("සම්බන්ධතාවය අසාර්ථක විය — multiplayer server එක ක්‍රියාත්මකද කියා පරීක්ෂා කරන්න");
      setMpBusy(false);
      return;
    }
    const unsub = client.on((msg) => {
      if (msg.type === "room_created") {
        unsub();
        sessionStorage.setItem("mp_name", mpName.trim());
        client.close();
        router.push(`/multiplayer/${msg.roomId}`);
      }
    });
    client.send({ type: "create_room", name: mpName.trim() });
  };

  const joinMultiplayerRoom = () => {
    const code = mpCode.trim().toUpperCase();
    if (!code) return;
    sessionStorage.setItem("mp_name", mpName.trim());
    router.push(`/multiplayer/${code}`);
  };
  const resume = () => {
    setResuming(true);
    engineRef.current?.resume();
  };
  /** Tear down the current run and remount a fresh engine (new maze). */
  const resetRun = (autoStart: boolean) => {
    autoStartRef.current = autoStart;
    setBooted(false);
    setState("idle");
    setHud(INITIAL_HUD);
    setMinimap(null);
    setPageLines(null);
    setBanner(null);
    setShowCredits(false);
    bannerKindRef.current = ""; // next run re-announces the objective
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    engineRef.current = null;
    setRunId((r) => r + 1);
  };
  const retry = () => resetRun(true);
  const exitToMenu = () => resetRun(false);

  const mmss = useMemo(() => {
    const m = Math.floor(stats.seconds / 60);
    const s = stats.seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [stats.seconds]);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      <GameCanvas key={runId} callbacksRef={callbacksRef} onReady={handleReady} />

      {/* dev/cheat toast — sits above everything */}
      {toast && (
        <div className="font-sinhala pointer-events-none absolute left-1/2 top-[8%] z-20 -translate-x-1/2 border border-emerald-200/20 bg-black/80 px-5 py-2 text-[12px] tracking-widest text-emerald-100/90 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
          {toast}
        </div>
      )}

      {/* phones must play in landscape */}
      {isTouch && portrait && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#0a0905]/97">
          <div className="phone-spin h-16 w-10 rounded-md border-2 border-amber-100/60" />

          <div className="font-sinhala text-lg tracking-widest text-amber-100/80">
            ඔබේ උපාංගය හරවන්න
          </div>
          <p className="font-sinhala max-w-xs text-center text-xs leading-5 tracking-[0.05em] text-amber-100/40">
            අඳුරු මංසන්ධිය පවතින්නේ තිරස් දිශාවේ පමණි
          </p>
        </div>
      )}

      {/* touch controls */}
      {isTouch && !portrait && state === "playing" && (
        <TouchControls
          engineRef={engineRef}
          prompt={hud.prompt}
          flashlight={hud.flashlight}
          sneaking={hud.sneaking}
        />
      )}

      {/* ------------------------------ HUD ------------------------------ */}
      {(state === "playing" || state === "dying") && (
        <div className="pointer-events-none absolute inset-0 cursor-none">
          {/* crosshair */}
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100/40" />

          {/* minimap */}
          {hud.mapCheat && <Minimap data={minimap} />}

          {/* objective — bright + glowing so new players actually see it */}
          <div className="font-sinhala absolute left-5 top-4 text-sm tracking-widest text-amber-50/95 [text-shadow:0_0_14px_rgba(255,225,150,0.5)]">
            {hud.objective}
          </div>

          {/* objective banner — announces goal changes front and center */}
          {banner && (
            <div className="objective-pop absolute left-1/2 top-[28%] border-y border-amber-100/15 bg-black/45 px-10 py-4 text-center shadow-[0_0_50px_rgba(0,0,0,0.55)] backdrop-blur-[2px]">
              <div className="font-sinhala text-[11px] tracking-[0.3em] text-amber-100/55">
                අරමුණ
              </div>
              <div className="font-sinhala mt-2 whitespace-nowrap text-2xl tracking-widest text-amber-50 [text-shadow:0_0_26px_rgba(255,230,160,0.7)]">
                {banner.title}
              </div>
              <div className="font-sinhala mt-3 text-[12px] tracking-widest text-amber-100/80">
                {banner.hint}
              </div>
            </div>
          )}

          {/* active cheats — always visible while any cheat is on */}
          {hud.cheats && (
            <div className="font-sinhala absolute left-5 top-10 text-[11px] tracking-widest text-emerald-300/80 [text-shadow:0_0_10px_rgba(60,255,160,0.35)]">
              වංචා ක්‍රම: {hud.cheats}
            </div>
          )}

          {/* sneaking indicator */}
          {hud.sneaking && (
            <div className="font-sinhala absolute bottom-14 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.2em] text-amber-100/45">
              — සෙමින් ගමන් කරමින් —
            </div>
          )}

          {/* pages */}
          <div className="font-sinhala absolute bottom-4 left-5 text-sm tracking-[0.15em] text-amber-100/60">
            පිටු {hud.pages}/{hud.totalPages}
          </div>

          {/* key hints (desktop only) */}
          {!isTouch && (
            <div className="font-sinhala absolute bottom-4 right-5 text-[11px] tracking-widest text-amber-100/35">
              [F] ටෝච් {hud.flashlight ? "ක්‍රියාත්මකයි" : "නිෂ්ක්‍රියයි"} · [SHIFT] දුවන්න · [C] සෙමින්{" "}
              {hud.sneaking ? "ක්‍රියාත්මකයි" : "නිෂ්ක්‍රියයි"}
            </div>
          )}

          {/* stamina */}
          {hud.stamina < 0.995 && (
            <div className="absolute bottom-9 left-1/2 h-[3px] w-44 -translate-x-1/2 overflow-hidden rounded bg-white/10">
              <div
                className={`h-full transition-[width] duration-150 ${
                  hud.stamina < 0.25 ? "bg-red-400/80" : "bg-amber-100/70"
                }`}
                style={{ width: `${hud.stamina * 100}%` }}
              />
            </div>
          )}

          {/* interaction prompt */}
          {hud.prompt && (
            <div className="font-sinhala absolute bottom-[18%] left-1/2 -translate-x-1/2 animate-pulse text-base tracking-[0.15em] text-amber-100/90 [text-shadow:0_0_12px_rgba(255,220,150,0.5)]">
              {hud.prompt}
            </div>
          )}

          {/* collected page readout */}
          {pageLines && (
            <div className="page-pop absolute left-1/2 top-[16%] -translate-x-1/2">
              <div className="font-sinhala max-w-sm -rotate-1 border border-amber-100/10 bg-[#171410]/90 px-7 py-5 text-center text-[15px] leading-7 text-amber-100/85 shadow-[0_0_60px_rgba(0,0,0,0.9)]">
                {pageLines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------- START MENU --------------------------- */}
      {state === "idle" && (
        <Overlay vhs>
          {showCredits ? (
            <>
              <h2 className="vhs-title font-sinhala text-3xl tracking-[0.15em] text-amber-50/90">
                නිර්මාණකරුවන්
              </h2>
              <div className="font-sinhala mt-8 flex max-w-md flex-col items-center gap-3 text-center text-[13px] leading-6 tracking-[0.05em] text-amber-100/55">
                <p>Hashanwickramasooriya විසින් නිර්මාණය කළ ක්‍රීඩාවකි</p>
                <p className="text-amber-100/35">
                  මෙහි ඇති සෑම බිත්තියක්ම, වයනයක්ම, ශබ්දයක්ම සහ කෑගැසීමක්ම
                  කේතය මගින් ජනනය කරන ලද්දකි. මෙහි කිසිදු සම්පත් ගොනුවක් නැත.
                  මට්ටම් ගොනුවක්ද නැත. සෑම ධාවනයක්ම මීට පෙර කිසි විටෙකත්
                  නොපැවති අලුත් මාදිලියක් තනයි.
                </p>
                <p className="text-amber-100/35">
                  තැනුවේ three.js · next.js · webaudio මගිනි
                </p>
                <p className="text-amber-100/35">Developer&nbsp;&nbsp;හෂාන්</p>
              </div>
              <div className="mt-7 flex items-center gap-8">
                <GitHubBadge />
                <XBadge />
              </div>
              <ArmedButton
                onClick={() => setShowCredits(false)}
                className="font-sinhala mt-10 border border-amber-100/30 px-10 py-2.5 text-sm tracking-[0.2em] text-amber-100/70 transition-all hover:border-amber-100/80 hover:bg-amber-100/5"
              >
                ආපසු
              </ArmedButton>
            </>
          ) : (
            <>
              <div className="flicker-slow font-sinhala text-[11px] tracking-[0.3em] text-amber-200/40">
                මට්ටම 0
              </div>
              <h1 className="vhs-title font-sinhala mt-3 text-5xl tracking-[0.05em] text-amber-50/95 sm:text-6xl">
                අඳුරු මංසන්ධිය
              </h1>
              <p className="font-sinhala mt-4 max-w-md text-center text-sm italic leading-6 text-amber-100/50">
                නිමක් නැති මාවතකින් පිටවීමක් සොයන්න.
              </p>
              <p className="font-sinhala mt-5 max-w-md text-center text-sm leading-6 text-amber-100/45">
                ඔබ යථාර්ථයේ වැරදි කෙළවරකින් ලිස්සී වැටුණා, ලෝකය ඔබ පිටුපසින්
                සදහටම වැසී ගියා. කවුරුහරි මීට පෙර මෙහි සිටියා — ඔවුන් මෙම
                බිත්ති මත පිටු 8ක් අත්හැර ගියා. ඒවා සියල්ල එකතු කරගන්න, එවිට
                දොර පෙනී යනු ඇත. ආලෝකය නිවී යාමට පටන් ගත් විට, එය ඔබ ඇවිදින
                හඬ නොඇසෙන්න වගබලා ගන්න.
              </p>

              {isTouch ? (
                <div className="font-sinhala mt-7 grid grid-cols-2 gap-x-10 gap-y-1.5 text-[12px] tracking-[0.05em] text-amber-100/35">
                  <span>වම් ස්ටික් — ඇවිදින්න</span>
                  <span>දකුණු පැත්ත — බලන්න</span>
                  <span>ස්ටික් සම්පූර්ණයෙන් — දුවන්න</span>
                  <span>බොත්තම් — ටෝච් / සෙමින්</span>
                </div>
              ) : (
                <div className="font-sinhala mt-7 grid grid-cols-2 gap-x-10 gap-y-1.5 text-[12px] tracking-[0.05em] text-amber-100/35">
                  <span>WASD — ඇවිදින්න</span>
                  <span>MOUSE — බලන්න</span>
                  <span>SHIFT — දුවන්න</span>
                  <span>C — සෙමින් ගමන් කරන්න</span>
                  <span>F — විදුලි පන්දම</span>
                  <span>E — අන්තර්ක්‍රියා කරන්න</span>
                  <span>ESC — විරාමය</span>
                </div>
              )}

              {!mpPanel ? (
                <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                  <button
                    onClick={begin}
                    disabled={!booted}
                    className="font-sinhala group flex items-center gap-3 bg-amber-100/90 px-10 py-3 text-base tracking-[0.15em] text-black transition-all hover:bg-amber-50 hover:shadow-[0_0_30px_rgba(255,230,170,0.25)] disabled:opacity-40"
                  >
                    <svg viewBox="0 0 10 12" className="h-3 w-3 fill-current" aria-hidden="true">
                      <path d="M0 0 L10 6 L0 12 Z" />
                    </svg>
                    {booted ? "තනි ක්‍රීඩාව" : "පටය පූරණය වෙමින්…"}
                  </button>
                  <button
                    onClick={() => {
                      setMpPanel(true);
                      setMpError(null);
                    }}
                    className="font-sinhala border border-amber-100/40 px-8 py-3 text-base tracking-widest text-amber-100/75 transition-all hover:border-amber-100/80 hover:bg-amber-100/5 hover:text-amber-100"
                  >
                    බහු ක්‍රීඩක
                  </button>
                  <button
                    onClick={() => setShowCredits(true)}
                    className="font-sinhala border border-amber-100/15 px-8 py-3 text-sm tracking-widest text-amber-100/50 transition-all hover:border-amber-100/60 hover:bg-amber-100/5 hover:text-amber-100/90"
                  >
                    නිර්මාණකරුවන්
                  </button>
                </div>
              ) : (
                <div className="font-sinhala mt-9 flex w-full max-w-xs flex-col items-stretch gap-3">
                  <label className="text-left text-[11px] tracking-widest text-amber-100/50">
                    ඔබගේ නම
                  </label>
                  <input
                    value={mpName}
                    onChange={(e) => setMpName(e.target.value.slice(0, 24))}
                    placeholder="ක්‍රීඩකයා"
                    className="font-sinhala border border-amber-100/30 bg-black/40 px-4 py-2.5 text-sm tracking-wide text-amber-100/90 outline-none placeholder:text-amber-100/25 focus:border-amber-100/70"
                  />

                  <button
                    onClick={createMultiplayerRoom}
                    disabled={mpBusy}
                    className="mt-3 bg-amber-100/90 px-6 py-3 text-sm tracking-[0.15em] text-black transition-all hover:bg-amber-50 disabled:opacity-40"
                  >
                    {mpBusy ? "සම්බන්ධ වෙමින්…" : "කාමරයක් සාදන්න"}
                  </button>

                  <div className="my-1 text-center text-[11px] tracking-widest text-amber-100/30">— හෝ —</div>

                  <label className="text-left text-[11px] tracking-widest text-amber-100/50">
                    කාමර කේතය
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={mpCode}
                      onChange={(e) => setMpCode(e.target.value.slice(0, 10))}
                      placeholder="ABC123"
                      className="min-w-0 flex-1 border border-amber-100/30 bg-black/40 px-4 py-2.5 text-sm uppercase tracking-[0.2em] text-amber-100/90 outline-none placeholder:tracking-widest placeholder:text-amber-100/25 focus:border-amber-100/70"
                    />
                    <button
                      onClick={joinMultiplayerRoom}
                      disabled={!mpCode.trim()}
                      className="whitespace-nowrap border border-amber-100/40 px-5 py-2.5 text-sm tracking-widest text-amber-100/80 transition-all hover:border-amber-100/80 hover:bg-amber-100/5 disabled:opacity-30"
                    >
                      සම්බන්ධ වන්න
                    </button>
                  </div>

                  {mpError && (
                    <div className="mt-1 text-center text-[12px] tracking-wide text-red-300/80">{mpError}</div>
                  )}

                  <button
                    onClick={() => setMpPanel(false)}
                    className="mt-4 text-[12px] tracking-widest text-amber-100/40 transition-all hover:text-amber-100/80"
                  >
                    ආපසු
                  </button>
                </div>
              )}

              <p className="font-sinhala mt-6 text-[11px] tracking-widest text-amber-100/25">
                හෙඩ්ෆෝන් පැළඳීම තදින්ම නිර්දේශ කරමු
              </p>
              <p className="font-sinhala mt-2 text-[10px] tracking-widest text-amber-100/20">
                Developer&nbsp;&nbsp;හෂාන්
              </p>
            </>
          )}
        </Overlay>
      )}

      {/* ----------------------------- PAUSED ----------------------------- */}
      {state === "paused" && (
        <Overlay>
          <h2 className="font-sinhala text-4xl tracking-[0.15em] text-amber-100/80">
            විරාමය
          </h2>
          <p className="font-sinhala mt-4 text-sm tracking-widest text-amber-100/40">
            එය තවමත් එහි ඇත. එයට විරාමයක් නැත.
          </p>
          <ArmedButton
            onClick={resume}
            disabled={resuming}
            className="font-sinhala mt-8 border border-amber-100/30 px-10 py-3 tracking-[0.2em] text-amber-100/80 transition-all hover:border-amber-100/80 hover:bg-amber-100/5 disabled:opacity-50"
          >
            {resuming ? "නැවත ආරම්භ වෙමින්…" : "නැවත ආරම්භ කරන්න"}
          </ArmedButton>
          <ArmedButton
            onClick={exitToMenu}
            className="font-sinhala mt-4 border border-amber-100/15 px-10 py-2.5 text-sm tracking-[0.2em] text-amber-100/45 transition-all hover:border-red-300/50 hover:text-red-200/80 disabled:opacity-50"
          >
            මෙනුවට ඉවත් වන්න
          </ArmedButton>
          <p className="font-sinhala mt-3 text-[10px] tracking-widest text-amber-100/20">
            ධාවනය නැතිවුණි. පිටු රැඳී පවතී.
          </p>
          <div className="mt-8 flex items-center gap-8">
            <GitHubBadge />
            <XBadge />
          </div>
        </Overlay>
      )}

      {/* ------------------------------ DEAD ------------------------------ */}
      {state === "dead" && (
        <Overlay tint="red">
          <h2 className="font-sinhala glitch-text text-4xl tracking-widest text-red-300/90 [text-shadow:0_0_40px_rgba(255,40,40,0.4)]">
            ඔබව රැගෙන ගියා
          </h2>
          <p className="font-sinhala mt-6 text-sm tracking-widest text-red-200/40">
            සොයාගත් පිටු — {stats.pages}/8 · ජීවත්ව සිටි කාලය — {mmss}
          </p>
          <p className="font-sinhala mt-2 text-xs tracking-widest text-red-200/30">
            අඳුරු මංසන්ධිය අල්ලාගත්තේ තබාගනියි.
          </p>
          <ArmedButton
            onClick={retry}
            className="font-sinhala mt-10 border border-red-300/30 px-10 py-3 tracking-[0.2em] text-red-200/80 transition-all hover:border-red-300/80 hover:bg-red-300/5 disabled:opacity-40"
          >
            නැවත අවදි වන්න
          </ArmedButton>
        </Overlay>
      )}

      {/* ------------------------------ WON ------------------------------ */}
      {state === "won" && (
        <Overlay tint="light">
          <h2 className="font-sinhala text-4xl tracking-widest text-amber-50 [text-shadow:0_0_50px_rgba(255,255,220,0.8)]">
            ඔබ පිටතට පැමිණියා
          </h2>
          <p className="font-sinhala mt-6 text-sm tracking-widest text-amber-100/60">
            පිටු 8ම · පලා ගිය කාලය {mmss}
          </p>
          <p className="font-sinhala mt-2 text-xs tracking-widest text-amber-100/40">
            …නැත්නම් ඔබ බිත්තිය හරහා මට්ටම 1ට රිංගුනාද?
          </p>
          <ArmedButton
            onClick={retry}
            className="font-sinhala mt-10 border border-amber-100/40 px-10 py-3 tracking-[0.2em] text-amber-100/90 transition-all hover:border-amber-100/90 hover:bg-amber-100/10 disabled:opacity-40"
          >
            නැවත ඇතුළු වන්න
          </ArmedButton>
          <GitHubBadge className="mt-8" label="පැනගියාද? තරුවක් තියන්න" />
        </Overlay>
      )}
    </div>
  );
}

/**
 * A button that ignores input for its first 450ms on screen — soaks up the
 * second half of an accidental double-click (which used to instantly retry
 * or quit a run the moment an overlay appeared).
 */
function ArmedButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 450);
    return () => clearTimeout(id);
  }, []);
  return (
    <button onClick={onClick} disabled={!armed || disabled} className={className}>
      {children}
    </button>
  );
}

function GitHubBadge({
  className = "",
  label = "Hashanwickramasooriya/Backroom-Escape",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href="https://github.com/Hashanwickramasooriya/Backroom-Escape"
      target="_blank"
      rel="noopener noreferrer"
      className={`font-sinhala group flex items-center gap-2 text-[11px] tracking-widest text-amber-100/30 transition-all hover:text-amber-100/80 hover:[text-shadow:0_0_14px_rgba(255,220,140,0.4)] ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="h-4 w-4 fill-current opacity-70 transition-opacity group-hover:opacity-100"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {label}
    </a>
  );
}

function XBadge({
  className = "",
  label = "Hashan Wickramasooriya",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href="https://x.com/Star_Knight12"
      target="_blank"
      rel="noopener noreferrer"
      className={`font-sinhala group flex items-center gap-2 text-[11px] tracking-widest text-amber-100/30 transition-all hover:text-amber-100/80 hover:[text-shadow:0_0_14px_rgba(255,220,140,0.4)] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5 fill-current opacity-70 transition-opacity group-hover:opacity-100"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
      </svg>
      {label}
    </a>
  );
}

/* ------------------------------ touch UI ------------------------------ */

function TouchControls({
  engineRef,
  prompt,
  flashlight,
  sneaking,
}: {
  engineRef: React.RefObject<Engine | null>;
  prompt: string | null;
  flashlight: boolean;
  sneaking: boolean;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickActive = useRef(false);
  const lookLast = useRef<{ id: number; x: number; y: number } | null>(null);

  const moveKnob = (e: React.PointerEvent) => {
    const base = baseRef.current, knob = knobRef.current;
    if (!base || !knob) return;
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const R = r.width / 2 - 18;
    const m = Math.hypot(dx, dy);
    if (m > R) {
      dx = (dx / m) * R;
      dy = (dy / m) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    engineRef.current?.setTouchMove(dx / R, dy / R);
  };
  const releaseKnob = () => {
    stickActive.current = false;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
    engineRef.current?.setTouchMove(0, 0);
  };

  return (
    <div className="absolute inset-0 z-10 select-none" style={{ touchAction: "none" }}>
      {/* look pad — right two thirds of the screen */}
      <div
        className="absolute bottom-0 right-0 top-0 w-[62%]"
        onPointerDown={(e) => {
          lookLast.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const last = lookLast.current;
          if (!last || last.id !== e.pointerId) return;
          engineRef.current?.touchLook((e.clientX - last.x) * 2.4, (e.clientY - last.y) * 2.4);
          lookLast.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (lookLast.current = null)}
        onPointerCancel={() => (lookLast.current = null)}
      />

      {/* movement stick */}
      <div
        ref={baseRef}
        className="absolute bottom-8 left-8 h-36 w-36 rounded-full border border-amber-100/25 bg-black/25"
        onPointerDown={(e) => {
          stickActive.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveKnob(e);
        }}
        onPointerMove={(e) => stickActive.current && moveKnob(e)}
        onPointerUp={releaseKnob}
        onPointerCancel={releaseKnob}
      >
        <div
          ref={knobRef}
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-7 -mt-7 h-14 w-14 rounded-full border border-amber-100/40 bg-amber-100/20"
        />
      </div>

      {/* action buttons */}
      <div className="absolute bottom-10 right-5 flex flex-col items-end gap-3">
        {prompt && (
          <button
            className="font-sinhala animate-pulse rounded border border-amber-100/60 bg-amber-100/15 px-6 py-3.5 text-sm tracking-widest text-amber-100"
            onPointerDown={() => engineRef.current?.touchInteract()}
          >
            {prompt.replace("[E] ", "")}
          </button>
        )}
        <div className="flex gap-3">
          <button
            className={`font-sinhala rounded border px-4 py-3 text-[11px] tracking-widest ${
              sneaking
                ? "border-amber-100/70 bg-amber-100/25 text-amber-100"
                : "border-amber-100/30 bg-black/30 text-amber-100/70"
            }`}
            onPointerDown={() => engineRef.current?.setSneak(!sneaking)}
          >
            සෙමින්
          </button>
          <button
            className={`font-sinhala rounded border px-4 py-3 text-[11px] tracking-widest ${
              flashlight
                ? "border-amber-100/50 bg-amber-100/15 text-amber-100/90"
                : "border-amber-100/30 bg-black/30 text-amber-100/60"
            }`}
            onPointerDown={() => engineRef.current?.touchTorch()}
          >
            ටෝච්
          </button>
        </div>
      </div>

      {/* pause */}
      <button
        className="font-elite absolute right-4 top-4 rounded border border-amber-100/30 bg-black/30 px-3.5 py-2 text-[11px] tracking-widest text-amber-100/70"
        onPointerDown={() => engineRef.current?.pause()}
      >
        ❚❚
      </button>
    </div>
  );
}

function useMediaQuery(query: string) {
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

function Overlay({
  children,
  tint = "dark",
  vhs = false,
}: {
  children: React.ReactNode;
  tint?: "dark" | "red" | "light";
  vhs?: boolean;
}) {
  const bg = vhs
    ? "bg-black"
    : tint === "red"
      ? "bg-[#180404]/90"
      : tint === "light"
        ? "bg-[#15130c]/85"
        : "bg-[#0a0905]/92";
  return (
    <div className={`absolute inset-0 z-10 ${bg}`}>
      {vhs && <VHSNoise />}
      <div className="crt-grain pointer-events-none absolute inset-0 opacity-[0.07]" />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-[0.05]" />
      {vhs && (
        <>
          <div className="tracking-band pointer-events-none absolute inset-x-0 h-32" />
          <RecOSD />
        </>
      )}
      {/* Scroll layer: on short screens (phone landscape) the menu is taller
          than the viewport — center when it fits, scroll when it doesn't.
          (Flex centering directly on the overflow container would clip the
          top of the content with no way to reach it.) */}
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Analog tape snow: a tiny canvas of random grayscale redrawn ~12fps and
 * stretched across the screen. Cheap (20k pixels) and reads far more like
 * a real camcorder than any CSS trick.
 */
function VHSNoise() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const W = 320, H = 180;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 80) return; // ~12fps — chunky, like real snow
      last = t;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.11] [image-rendering:pixelated]"
    />
  );
}

/** Camcorder on-screen display: blinking REC + a ticking tape counter. */
function RecOSD() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return (
    <>
      <div className="font-elite pointer-events-none absolute left-5 top-4 flex items-center gap-2 text-[12px] tracking-[0.3em] text-amber-50/70">
        <span className="rec-dot h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,40,40,0.8)]" />
        REC
      </div>
      <div className="font-elite pointer-events-none absolute right-5 top-4 text-[12px] tracking-[0.25em] text-amber-50/50">
        SP {h}:{m}:{s}
      </div>
    </>
  );
}
