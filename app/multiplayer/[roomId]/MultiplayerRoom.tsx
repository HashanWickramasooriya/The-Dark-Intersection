"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Engine, EngineCallbacks, EngineNetContext, GameState, HudState, MinimapState } from "../../game/engine/Engine";
import Minimap from "../../game/Minimap";
import { RoomClient } from "../../game/net/RoomClient";
import { takePendingRoom } from "../../game/net/pendingRoom";
import type { PlayerInfo, ServerMessage } from "../../game/net/protocol";

const GameCanvas = dynamic(() => import("../../game/GameCanvas"), { ssr: false });

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

type Phase = "connecting" | "join_error" | "lobby" | "playing";

export default function MultiplayerRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const clientRef = useRef<RoomClient | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostId, setHostId] = useState<string>("");
  const [localId, setLocalId] = useState<string>("");
  const [net, setNet] = useState<EngineNetContext | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [gameState, setGameState] = useState<GameState>("idle");
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [minimap, setMinimap] = useState<MinimapState | null>(null);
  const [pageLines, setPageLines] = useState<string[] | null>(null);
  const [banner, setBanner] = useState<{ title: string; hint: string } | null>(null);
  const bannerKindRef = useRef("");
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHost = localId !== "" && localId === hostId;
  const canStart = players.length >= 2 && players.length <= 4;

  const callbacksRef = useRef<EngineCallbacks>({
    onState: (s) => setGameState(s),
    onHud: (h) => {
      setHud(h);
      const kind = h.objective.split("—")[0].trim();
      if (kind !== bannerKindRef.current) {
        bannerKindRef.current = kind;
        const hint =
          kind === "පිටු එකතු කරන්න"
            ? "බිත්තිවල අලවා ඇත — ඒවා ගැනීමට [E] එබන්න"
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
    onStats: () => {},
    onToast: (m) => setToast(m),
  });

  const handleReady = useCallback((engine: Engine) => {
    engineRef.current = engine;
    engine.start();
  }, []);

  useEffect(() => {
    if (!pageLines) return;
    const id = setTimeout(() => setPageLines(null), 6500);
    return () => clearTimeout(id);
  }, [pageLines]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // Refs mirroring state so the message handler below (subscribed once on
  // mount) always reads current values without needing to be re-subscribed.
  const localIdRef = useRef("");
  const playersRef = useRef<PlayerInfo[]>([]);
  useEffect(() => {
    localIdRef.current = localId;
  }, [localId]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Connect + join once on mount — unless a room we just created on the
  // previous screen is waiting for us, in which case reuse that exact
  // live connection instead of opening a second one (see pendingRoom.ts).
  useEffect(() => {
    let cancelled = false;
    const handoff = takePendingRoom(roomId);
    const client = handoff?.client ?? new RoomClient();
    clientRef.current = client;

    const name = typeof window !== "undefined" ? sessionStorage.getItem("mp_name") ?? "" : "";

    const onMessage = (msg: ServerMessage) => {
      if (cancelled) return;
      switch (msg.type) {
        case "join_ok":
          setLocalId(msg.playerId);
          setPlayers(msg.players);
          setHostId(msg.players.find((p) => p.isHost)?.id ?? msg.playerId);
          setPhase("lobby");
          break;
        case "join_error": {
          const text =
            msg.reason === "full"
              ? "කාමරය පිරී ඇත."
              : msg.reason === "already_started"
                ? "ක්‍රීඩාව දැනටමත් ආරම්භ වී ඇත"
                : "කාමරය සොයාගත නොහැක";
          setErrorMsg(text);
          setPhase("join_error");
          break;
        }
        case "player_list":
          setPlayers(msg.players);
          setHostId(msg.hostId);
          break;
        case "host_migrated":
          setHostId(msg.newHostId);
          break;
        case "player_left":
          setToast("ක්‍රීඩකයෙක් කාමරයෙන් ඉවත් විය");
          break;
        case "game_start": {
          const localSpawn = msg.spawns[localIdRef.current] ?? { x: 0, y: 0, z: 0 };
          const remotePlayers = playersRef.current
            .filter((p) => p.id !== localIdRef.current)
            .map((p) => ({ id: p.id, name: p.name, spawn: msg.spawns[p.id] ?? { x: 0, y: 0, z: 0 } }));
          setNet({
            client,
            seed: msg.seed,
            localPlayerId: localIdRef.current,
            isHost: msg.monsterAuthorityId === localIdRef.current,
            localSpawn,
            remotePlayers,
          });
          setPhase("playing");
          break;
        }
      }
    };

    const unsub = client.on(onMessage);
    if (handoff) {
      // Already connected, and this connection already IS the host of this
      // room (from the create flow) — applying that known state directly
      // instead of reconnecting avoids opening a second socket (which,
      // besides being redundant, would race a real join_room against a
      // room that at that instant has no server-side record of "us" as a
      // second identity) and skips waiting on a join_ok that isn't coming.
      // Deferred a tick (matches the async .connect().then() branch below)
      // rather than calling setState synchronously in the effect body.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setLocalId(handoff.playerId);
        setPlayers(handoff.players);
        setHostId(handoff.players.find((p) => p.isHost)?.id ?? handoff.playerId);
        setPhase("lobby");
      });
    } else {
      client
        .connect()
        .then(() => client.send({ type: "join_room", roomId, name }))
        .catch(() => {
          if (!cancelled) {
            setErrorMsg("multiplayer server එකට සම්බන්ධ විය නොහැක");
            setPhase("join_error");
          }
        });
    }

    return () => {
      cancelled = true;
      unsub();
      client.send({ type: "leave_room" });
      client.close();
    };
  }, [roomId]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/multiplayer/${roomId}`;
  }, [roomId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1800);
    } catch {
      setToast("පිටපත් කිරීම අසාර්ථක විය");
    }
  };

  const startGame = () => clientRef.current?.send({ type: "start_game" });
  const leaveRoom = () => {
    engineRef.current?.dispose();
    clientRef.current?.send({ type: "leave_room" });
    clientRef.current?.close();
    router.push("/");
  };

  /* ------------------------------ render ------------------------------ */

  if (phase === "connecting") {
    return (
      <Screen>
        <p className="font-sinhala text-lg tracking-widest text-amber-100/70">සම්බන්ධ වෙමින්…</p>
      </Screen>
    );
  }

  if (phase === "join_error") {
    return (
      <Screen>
        <h2 className="font-sinhala text-2xl tracking-widest text-red-300/90">{errorMsg}</h2>
        <button
          onClick={() => router.push("/")}
          className="font-sinhala mt-8 border border-amber-100/30 px-8 py-2.5 text-sm tracking-widest text-amber-100/70 hover:border-amber-100/80 hover:bg-amber-100/5"
        >
          මෙනුවට ආපසු
        </button>
      </Screen>
    );
  }

  if (phase === "lobby") {
    return (
      <Screen>
        <div className="flicker-slow font-sinhala text-[11px] tracking-[0.3em] text-amber-200/40">
          බහු ක්‍රීඩක කාමරය
        </div>
        <h1 className="vhs-title font-sinhala mt-2 text-3xl tracking-[0.1em] text-amber-50/95">
          කාමර කේතය — {roomId}
        </h1>

        <div className="font-sinhala mt-6 w-full max-w-sm">
          <div className="text-[11px] tracking-widest text-amber-100/50">කාමර සබැඳිය</div>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="min-w-0 flex-1 truncate border border-amber-100/25 bg-black/40 px-3 py-2 text-[12px] text-amber-100/70"
            />
            <button
              onClick={copyLink}
              className="whitespace-nowrap border border-amber-100/40 px-4 py-2 text-[12px] tracking-widest text-amber-100/80 hover:border-amber-100/80 hover:bg-amber-100/5"
            >
              {copyFeedback ? "පිටපත් විය" : "සබැඳිය පිටපත් කරන්න"}
            </button>
          </div>
        </div>

        <div className="font-sinhala mt-6 text-sm tracking-widest text-amber-100/60">
          ක්‍රීඩකයින් {players.length}/4
        </div>

        <ul className="font-sinhala mt-3 w-full max-w-sm divide-y divide-amber-100/10 border border-amber-100/15">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px] text-amber-100/85">
              <span>{p.name}</span>
              {p.id === hostId && (
                <span className="text-[10px] tracking-widest text-amber-300/70">සත්කාරක</span>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <>
            <button
              onClick={startGame}
              disabled={!canStart}
              className="font-sinhala mt-7 bg-amber-100/90 px-10 py-3 text-base tracking-[0.15em] text-black transition-all hover:bg-amber-50 disabled:opacity-40"
            >
              ක්‍රීඩාව ආරම්භ කරන්න
            </button>
            {!canStart && (
              <p className="font-sinhala mt-3 text-[12px] tracking-widest text-amber-100/45">
                ක්‍රීඩාව ආරම්භ කිරීමට අවම වශයෙන් ක්‍රීඩකයින් දෙදෙනෙකු අවශ්‍යයි.
              </p>
            )}
          </>
        ) : (
          <p className="font-sinhala mt-7 animate-pulse text-sm tracking-widest text-amber-100/50">
            සත්කාරකයා ආරම්භ කරනතුරු රැඳී සිටින්න
          </p>
        )}

        <button
          onClick={leaveRoom}
          className="font-sinhala mt-6 text-[12px] tracking-widest text-amber-100/40 hover:text-red-200/80"
        >
          කාමරයෙන් ඉවත් වන්න
        </button>
      </Screen>
    );
  }

  // phase === "playing"
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      {net && <GameCanvas callbacksRef={callbacksRef} onReady={handleReady} net={net} />}

      {toast && (
        <div className="font-sinhala pointer-events-none absolute left-1/2 top-[8%] z-20 -translate-x-1/2 border border-emerald-200/20 bg-black/80 px-5 py-2 text-[12px] tracking-widest text-emerald-100/90">
          {toast}
        </div>
      )}

      {(gameState === "playing" || gameState === "dying") && (
        <div className="pointer-events-none absolute inset-0 cursor-none">
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100/40" />
          {hud.mapCheat && <Minimap data={minimap} />}
          <div className="font-sinhala absolute left-5 top-4 text-sm tracking-widest text-amber-50/95 [text-shadow:0_0_14px_rgba(255,225,150,0.5)]">
            {hud.objective}
          </div>
          {banner && (
            <div className="objective-pop absolute left-1/2 top-[28%] border-y border-amber-100/15 bg-black/45 px-10 py-4 text-center backdrop-blur-[2px]">
              <div className="font-sinhala text-[11px] tracking-[0.3em] text-amber-100/55">අරමුණ</div>
              <div className="font-sinhala mt-2 whitespace-nowrap text-2xl tracking-widest text-amber-50">{banner.title}</div>
              <div className="font-sinhala mt-3 text-[12px] tracking-widest text-amber-100/80">{banner.hint}</div>
            </div>
          )}
          {hud.sneaking && (
            <div className="font-sinhala absolute bottom-14 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.2em] text-amber-100/45">
              — සෙමින් ගමන් කරමින් —
            </div>
          )}
          <div className="font-sinhala absolute bottom-4 left-5 text-sm tracking-[0.15em] text-amber-100/60">
            පිටු {hud.pages}/{hud.totalPages}
          </div>
          <div className="font-sinhala absolute bottom-4 right-5 text-[11px] tracking-widest text-amber-100/35">
            [F] ටෝච් {hud.flashlight ? "ක්‍රියාත්මකයි" : "නිෂ්ක්‍රියයි"} · [SHIFT] දුවන්න · [C] සෙමින්{" "}
            {hud.sneaking ? "ක්‍රියාත්මකයි" : "නිෂ්ක්‍රියයි"}
          </div>
          {hud.stamina < 0.995 && (
            <div className="absolute bottom-9 left-1/2 h-[3px] w-44 -translate-x-1/2 overflow-hidden rounded bg-white/10">
              <div
                className={`h-full transition-[width] duration-150 ${hud.stamina < 0.25 ? "bg-red-400/80" : "bg-amber-100/70"}`}
                style={{ width: `${hud.stamina * 100}%` }}
              />
            </div>
          )}
          {hud.prompt && (
            <div className="font-sinhala absolute bottom-[18%] left-1/2 -translate-x-1/2 animate-pulse text-base tracking-[0.15em] text-amber-100/90">
              {hud.prompt}
            </div>
          )}
          {pageLines && (
            <div className="page-pop absolute left-1/2 top-[16%] -translate-x-1/2">
              <div className="font-sinhala max-w-sm -rotate-1 border border-amber-100/10 bg-[#171410]/90 px-7 py-5 text-center text-[15px] leading-7 text-amber-100/85">
                {pageLines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {gameState === "paused" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0905]/92">
          <h2 className="font-sinhala text-3xl tracking-[0.15em] text-amber-100/80">විරාමය</h2>
          <p className="font-sinhala mt-3 text-sm tracking-widest text-amber-100/40">අනෙක් ක්‍රීඩකයින් දිගටම ක්‍රීඩා කරති.</p>
          <button
            onClick={() => engineRef.current?.resume()}
            className="font-sinhala mt-8 border border-amber-100/30 px-10 py-3 tracking-[0.2em] text-amber-100/80 hover:border-amber-100/80 hover:bg-amber-100/5"
          >
            නැවත ආරම්භ කරන්න
          </button>
          <button
            onClick={leaveRoom}
            className="font-sinhala mt-4 border border-amber-100/15 px-10 py-2.5 text-sm tracking-[0.2em] text-amber-100/45 hover:border-red-300/50 hover:text-red-200/80"
          >
            කාමරයෙන් ඉවත් වන්න
          </button>
        </div>
      )}

      {gameState === "dead" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#180404]/90">
          <h2 className="font-sinhala glitch-text text-4xl tracking-widest text-red-300/90">ඔබව රැගෙන ගියා</h2>
          <p className="font-sinhala mt-4 text-xs tracking-widest text-red-200/30">අනෙක් ක්‍රීඩකයින්ට දිගටම ක්‍රීඩා කළ හැක.</p>
          <button
            onClick={leaveRoom}
            className="font-sinhala mt-10 border border-red-300/30 px-10 py-3 tracking-[0.2em] text-red-200/80 hover:border-red-300/80 hover:bg-red-300/5"
          >
            කාමරයෙන් ඉවත් වන්න
          </button>
        </div>
      )}

      {gameState === "won" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#15130c]/85">
          <h2 className="font-sinhala text-4xl tracking-widest text-amber-50">ඔබ පිටතට පැමිණියා</h2>
          <p className="font-sinhala mt-4 text-xs tracking-widest text-amber-100/40">පිටු 8ම එකතු විය</p>
          <button
            onClick={leaveRoom}
            className="font-sinhala mt-10 border border-amber-100/40 px-10 py-3 tracking-[0.2em] text-amber-100/90 hover:border-amber-100/90 hover:bg-amber-100/10"
          >
            මෙනුවට ආපසු
          </button>
        </div>
      )}
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black px-6 text-center">
      <div className="crt-grain pointer-events-none absolute inset-0 opacity-[0.07]" />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}
