import * as THREE from "three";
import { CELL, Level, PILLAR } from "./level";
import { Player, EYE_HEIGHT } from "./player";
import { Entity, EntityContext, EntityState, ENTITY_KILL_DIST } from "./entity";
import { GameAudio } from "./audio";
import { GameFX } from "./fx";
import { Items, TOTAL_PAGES } from "./items";
import { randRange } from "./rng";
import { RemotePlayer } from "./RemotePlayer";
import { RemoteMonster } from "./RemoteMonster";
import type { RoomClient } from "../net/RoomClient";
import type { ServerMessage, Vec3 } from "../net/protocol";
import { Language, t } from "../i18n/translations";

export type GameState = "idle" | "playing" | "paused" | "dying" | "dead" | "won";

/** Another room member's spawn assignment, known up front from `game_start`. */
export interface NetPlayerInfo {
  id: string;
  name: string;
  spawn: Vec3;
}

/** Present only for multiplayer runs — absent, Engine behaves exactly as single-player. */
export interface EngineNetContext {
  client: RoomClient;
  seed: number;
  localPlayerId: string;
  isHost: boolean;
  localSpawn: Vec3;
  remotePlayers: NetPlayerInfo[];
}

export interface HudState {
  pages: number;
  totalPages: number;
  stamina: number;
  prompt: string | null;
  objective: string;
  /** Machine-readable objective phase — for UI logic (e.g. deciding when
   * the objective banner should re-announce itself) that must not depend
   * on parsing the already-localized `objective` string. */
  objectiveKind: "collect" | "findExit" | "go";
  flashlight: boolean;
  sneaking: boolean;
  /** compact list of active cheats, e.g. "GOD · NOCLIP" — null when none */
  cheats: string | null;
  /** dev cheat: the minimap overlay, unlocked+toggled the same way as the rest */
  mapCheat: boolean;
}

export interface MinimapState {
  /** meters from the maze center to its edge, both axes */
  halfExtent: number;
  /** wall segments, flat [x1,z1,x2,z2, ...] — static per run, same array every push */
  walls: Float32Array;
  /** freestanding pillar centers, flat [x,z, ...] — static per run */
  pillars: Float32Array;
  player: { x: number; z: number; yaw: number };
  pages: { x: number; z: number; collected: boolean }[];
  exit: { x: number; z: number; open: boolean };
  /** null while the entity hasn't woken up yet */
  entity: { x: number; z: number } | null;
}

export interface EngineCallbacks {
  onState: (state: GameState) => void;
  onHud: (hud: HudState) => void;
  onMinimap: (m: MinimapState) => void;
  onPageText: (lines: string[]) => void;
  onStats: (stats: { pages: number; seconds: number }) => void;
  onToast: (msg: string) => void;
  /** Multiplayer only — the whole room's match ended (win, or everyone died). */
  onGameOver?: (winnerId: string | null) => void;
}

const POOL_SIZE = 12;
const UP = new THREE.Vector3(0, 1, 0);
/** keys the browser must not act on while playing (Ctrl+S, space scroll…) */
const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "KeyE", "KeyF", "KeyC", "Space",
]);

export class Engine {
  state: GameState = "idle";

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private level: Level;
  private player: Player;
  private entity: Entity;
  private items: Items;
  private audio = new GameAudio();
  private fx: GameFX;

  private clock = new THREE.Clock();
  private elapsed = 0;
  private raf = 0;

  private fear = 0;
  private fearSpike = 0;
  private glitch = 0;
  private beatPhase = 0;
  private deathT = 0;
  private startedAt = 0;

  private lightPool: THREE.PointLight[] = [];
  private fixtureMult: Float32Array;
  private fixtureBurst = new Map<number, number>();
  /** dead fixtures temporarily sputtering alive — index -> seconds left */
  private fixtureFlare = new Map<number, number>();
  private nextAmbientEvent = 18;
  private hudTimer = 0;
  private lastPrompt: string | null = null;
  /** minimap wall/pillar geometry — built once, reused every HUD push */
  private minimapWalls: Float32Array = new Float32Array(0);
  private minimapPillars: Float32Array = new Float32Array(0);

  /** dev cheats — unlocked by typing "redrum" while playing */
  readonly cheats = {
    unlocked: false,
    god: false,
    noclip: false,
    fullbright: false,
    freeze: false,
    map: false,
  };
  private cheatBuffer = "";
  /** one-time "sneak is C, not Ctrl" toast for muscle-memory players */
  private ctrlHintShown = false;
  private brightLight: THREE.AmbientLight | null = null;

  // pointer-lock bookkeeping (Chromium enforces a ~1.25s relock cooldown)
  private unlockAt = -10000;
  private pendingLock: ReturnType<typeof setTimeout> | null = null;
  /** true once a pointer lock has ever engaged — arms the in-game watchdog */
  private hasLockedOnce = false;
  private lockLossT = 0;
  /** ignore mousemove until this time — lock engagement fires garbage deltas */
  private lockGraceUntil = 0;
  /** primary input is touch (phone/tablet) — no pointer lock on these */
  readonly touchPrimary =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches === true;

  // scratch vectors — the hot loop must not allocate (GC pauses = stutter)
  private vCamDir = new THREE.Vector3();
  private vA = new THREE.Vector3();
  private vB = new THREE.Vector3();
  private nearestLitSq = Infinity;

  private disposed = false;
  private detachInput: (() => void) | null = null;

  /** multiplayer — all no-ops / unused when `net` is undefined (single-player) */
  private remotePlayers = new Map<string, RemotePlayer>();
  private remoteMonster: RemoteMonster | null = null;
  private isMonsterAuthority = true;
  private netUnsubscribe: (() => void) | null = null;
  private netTransformSeq = 0;
  private netMonsterSeq = 0;
  private netTransformTimer = 0;
  private netMonsterTimer = 0;
  private lastMonsterSample: { pos: Vec3; yaw: number; state: string } | null = null;
  /** last transform actually SENT — lets broadcastLocalTransform skip
   * redundant sends when nothing meaningful changed since last tick. */
  private lastSentTransform: { x: number; z: number; yaw: number; sprinting: boolean; sneaking: boolean; flashlightOn: boolean; alive: boolean } | null = null;
  private sinceLastTransformSend = 0;

  constructor(
    private container: HTMLElement,
    private canvas: HTMLCanvasElement,
    private callbacks: EngineCallbacks,
    private lang: Language,
    musicVolume: number,
    effectsVolume: number,
    private net?: EngineNetContext,
  ) {
    // Applied before audio.init() is ever called (that only happens once
    // start() runs), so the buses come up at the right level immediately —
    // no silent-then-jump-to-volume moment.
    this.audio.musicVolume = musicVolume;
    this.audio.effectsVolume = effectsVolume;

    const seed = net?.seed ?? (Date.now() ^ (Math.random() * 0xffffff)) >>> 0;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height, false);
    // Render at the device's native pixel ratio (capped — phones report 3+).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    const fogColor = new THREE.Color(0x141106);
    this.scene.background = fogColor;
    this.scene.fog = new THREE.FogExp2(fogColor, 0.036);

    // The mono-yellow wash: ceiling glow above, carpet bounce below.
    // Level 0 is BRIGHT — the horror is the emptiness, not the dark.
    this.scene.add(new THREE.AmbientLight(0x3a3420, 0.85));
    this.scene.add(new THREE.HemisphereLight(0xfff0c2, 0x4a3f24, 0.5));

    this.level = new Level(seed);
    this.level.build(this.scene);
    this.fixtureMult = new Float32Array(this.level.fixtures.length).fill(-1);
    this.buildMinimapGeometry();

    this.player = new Player(this.level, width / height);
    if (this.net) this.player.pos.set(this.net.localSpawn.x, this.net.localSpawn.y, this.net.localSpawn.z);
    this.player.addTo(this.scene);
    this.player.onStep = (sprinting) => this.audio.playerStep(sprinting);

    this.entity = new Entity(this.level, seed);
    this.entity.addTo(this.scene);
    this.entity.onScreech = () => this.onScreech();
    this.entity.onStep = () => this.onEntityStep();
    // Single-player: the entity's own dist check is against the one local
    // player, so this is unambiguous. Multiplayer: onKill fires whenever
    // ANY resolved target (possibly a remote player) is caught, which this
    // callback can't disambiguate — so death there is instead detected
    // independently by every client (see loop()'s "self-proximity" check).
    this.entity.onKill = () => { if (!this.net) this.beginDeath(); };

    this.items = new Items(this.level, seed, this.scene, lang);

    if (this.net) {
      this.isMonsterAuthority = this.net.isHost;
      if (!this.isMonsterAuthority) this.remoteMonster = new RemoteMonster(this.entity);
      for (const rp of this.net.remotePlayers) {
        if (rp.id === this.net.localPlayerId) continue;
        const remote = new RemotePlayer(rp.name);
        remote.addTo(this.scene);
        remote.setTarget(rp.spawn, 0, true, true, false);
        this.remotePlayers.set(rp.id, remote);
      }
      this.netUnsubscribe = this.net.client.on((msg) => this.handleNetMessage(msg));
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.PointLight(0xffeebb, 0, 13, 1.8);
      this.lightPool.push(l);
      this.scene.add(l);
    }

    this.fx = new GameFX(this.renderer, this.scene, this.player.camera, width, height);

    this.attachInput();
    this.loop();
  }

  /* ----------------------------- lifecycle ----------------------------- */

  start() {
    if (this.state !== "idle") return;
    this.audio.init();
    void this.audio.resume();
    this.setState("playing");
    this.startedAt = this.elapsed;
    if (this.touchPrimary) this.enterTouchFullscreen();
    else this.lockPointer();
    this.pushHud(true);
  }

  resume() {
    if (this.state !== "paused") return;
    if (this.touchPrimary) {
      // No pointer lock on touch devices — resume directly (and re-grab
      // fullscreen, the back gesture / Esc may have dropped it).
      this.enterTouchFullscreen();
      void this.audio.resume();
      this.setState("playing");
      return;
    }
    // The state flips to "playing" once the pointer lock actually engages
    // (see onLockChange) — flipping early would fight the relock cooldown.
    this.lockPointer();
  }

  /**
   * Phones only: browser chrome eats ~25% of a small landscape screen, so
   * go fullscreen on the start/resume tap (a user gesture, as required).
   * Desktop deliberately stays in-tab. iPhone Safari has no Fullscreen API
   * at all — there the manifest's display:fullscreen (add to home screen)
   * is the only route, so a rejection here is silently ignored.
   */
  private enterTouchFullscreen() {
    if (document.fullscreenElement) return;
    try {
      const p = document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
      void p
        ?.then(() => {
          // Pin landscape while fullscreen (Android; needs fullscreen first).
          const o = screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          };
          return o.lock?.("landscape");
        })
        .catch(() => {});
    } catch {
      // older WebKit throws synchronously — nothing to do
    }
  }

  /** External pause (pause button on touch UI / rotate-to-portrait). */
  pause() {
    if (this.state !== "playing") return;
    this.player.clearKeys();
    this.player.touchMove.x = 0;
    this.player.touchMove.z = 0;
    void this.audio.suspend();
    this.setState("paused");
  }

  private setState(s: GameState) {
    if (this.state === s) return;
    this.state = s;
    this.callbacks.onState(s);
  }

  /**
   * Cooldown-aware pointer lock. Chromium rejects requestPointerLock for
   * ~1.25s after an unlock; firing into that window silently fails and the
   * game feels like "the mouse stopped working". Queue the request instead.
   */
  private lockPointer() {
    if (this.pendingLock !== null) {
      clearTimeout(this.pendingLock);
      this.pendingLock = null;
    }
    const wait = 1350 - (performance.now() - this.unlockAt);
    if (wait > 0) {
      this.pendingLock = setTimeout(() => {
        this.pendingLock = null;
        if (!this.disposed && document.pointerLockElement !== this.canvas) {
          this.doLock();
        }
      }, wait);
    } else {
      this.doLock();
    }
  }

  private doLock() {
    const el = this.canvas as HTMLCanvasElement & {
      requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    try {
      const res = el.requestPointerLock({ unadjustedMovement: true });
      if (res && typeof (res as Promise<void>).catch === "function") {
        (res as Promise<void>).catch(() => el.requestPointerLock());
      }
    } catch {
      el.requestPointerLock();
    }
  }

  private attachInput() {
    const onMouseMove = (e: MouseEvent) => {
      if (this.state === "playing" && document.pointerLockElement === this.canvas) {
        // Chromium fires bogus movement deltas right as the lock engages
        // (cursor recenter leaks in) — would snap the view across the room.
        if (performance.now() < this.lockGraceUntil) return;
        this.player.onMouseDelta(e.movementX, e.movementY);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.state !== "playing") return;
      // Keep game keys away from the browser (Ctrl+S dialog, space scroll…).
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      // OS key repeat fires keydown over and over while a key is held —
      // without this, every toggle (sneak, torch) strobes on/off. Movement
      // is held-key-set based, so repeats carry no information at all.
      if (e.repeat) return;
      // Old habit guard: Ctrl is NOT sneak. A held Ctrl makes W close the
      // tab (Ctrl+W is browser-reserved, unblockable outside fullscreen).
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        if (!this.ctrlHintShown) {
          this.ctrlHintShown = true;
          this.toast(t(this.lang, "cheat.sneakHint"));
        }
        return;
      }
      this.player.keyDown(e.code);
      if (e.code === "KeyE") this.tryInteract();
      if (e.code === "KeyF") this.audio.click();
      this.handleCheatKeys(e);
    };
    const onCanvasClick = () => {
      // Safety net: relock if the browser dropped the lock without pausing us.
      if (this.state === "playing" && !this.touchPrimary &&
          document.pointerLockElement !== this.canvas) {
        this.lockPointer();
      }
    };
    const onBlur = () => {
      // Focus stolen (alt-tab, OS popup, click outside a windowed game) —
      // pause so keys don't stick and the run isn't lost blind.
      if (this.state === "playing" && !this.touchPrimary) this.pause();
    };
    const onKeyUp = (e: KeyboardEvent) => this.player.keyUp(e.code);
    const onLockChange = () => {
      if (document.pointerLockElement === this.canvas) {
        this.hasLockedOnce = true;
        this.lockGraceUntil = performance.now() + 200;
        // Lock (re)acquired — if we were waiting in the pause menu, resume.
        if (this.state === "paused") {
          void this.audio.resume();
          this.setState("playing");
        }
      } else {
        this.unlockAt = performance.now();
        if (this.state === "playing") {
          this.player.clearKeys();
          void this.audio.suspend();
          this.setState("paused");
        }
      }
    };
    const onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.player.camera.aspect = w / h;
      this.player.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.fx.setSize(w, h, this.renderer.getPixelRatio());
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onBlur);
    this.canvas.addEventListener("click", onCanvasClick);

    this.detachInput = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onBlur);
      this.canvas.removeEventListener("click", onCanvasClick);
    };
  }

  /* --------------------------- touch controls --------------------------- */
  // Driven by the React touch overlay (joystick / look pad / buttons).

  setTouchMove(x: number, z: number) {
    this.player.touchMove.x = x;
    this.player.touchMove.z = z;
  }

  touchLook(dx: number, dy: number) {
    if (this.state === "playing") this.player.onMouseDelta(dx, dy);
  }

  touchInteract() {
    if (this.state === "playing") this.tryInteract();
  }

  touchTorch() {
    if (this.state !== "playing") return;
    this.player.toggleFlashlight();
    this.audio.click();
  }

  setSneak(on: boolean) {
    this.player.sneaking = on;
  }

  /** Live volume update — 0..1. Safe to call before audio.init() (the
   * value is just stored and applied when the buses are created) or while
   * already playing (ramped immediately, no restart). Local-only setting,
   * never sent over the network. */
  setMusicVolume(v: number) {
    this.audio.setMusicVolume(v);
  }
  setEffectsVolume(v: number) {
    this.audio.setEffectsVolume(v);
  }

  /* ------------------------------ cheats ------------------------------ */

  /**
   * Developer cheats. Type "redrum" during a run to unlock, then:
   * G god · N noclip · B fullbright · X freeze entity · P all pages · T to exit
   */
  private handleCheatKeys(e: KeyboardEvent) {
    if (/^[a-z]$/i.test(e.key)) {
      this.cheatBuffer = (this.cheatBuffer + e.key.toLowerCase()).slice(-10);
      if (!this.cheats.unlocked && this.cheatBuffer.endsWith("redrum")) {
        this.cheats.unlocked = true;
        this.toast(t(this.lang, "cheat.unlocked"));
        return;
      }
    }
    if (!this.cheats.unlocked) return;

    switch (e.code) {
      case "KeyG":
        this.cheats.god = !this.cheats.god;
        this.toast(t(this.lang, "cheat.god", { state: t(this.lang, this.cheats.god ? "cheat.on" : "cheat.off") }));
        break;
      case "KeyN":
        this.cheats.noclip = !this.cheats.noclip;
        this.player.noclip = this.cheats.noclip;
        this.toast(t(this.lang, this.cheats.noclip ? "cheat.noclipOn" : "cheat.noclipOff"));
        break;
      case "KeyB":
        this.cheats.fullbright = !this.cheats.fullbright;
        if (this.cheats.fullbright && !this.brightLight) {
          this.brightLight = new THREE.AmbientLight(0xfff4d8, 2.4);
          this.scene.add(this.brightLight);
        } else if (!this.cheats.fullbright && this.brightLight) {
          this.scene.remove(this.brightLight);
          this.brightLight = null;
        }
        this.toast(t(this.lang, "cheat.fullbright", { state: t(this.lang, this.cheats.fullbright ? "cheat.on" : "cheat.off") }));
        break;
      case "KeyX":
        this.cheats.freeze = !this.cheats.freeze;
        this.toast(t(this.lang, this.cheats.freeze ? "cheat.freezeOn" : "cheat.freezeOff"));
        break;
      case "KeyM":
        this.cheats.map = !this.cheats.map;
        this.toast(t(this.lang, "cheat.map", { state: t(this.lang, this.cheats.map ? "cheat.on" : "cheat.off") }));
        break;
      case "KeyP": {
        let grabbed = 0;
        this.items.pages.forEach((p, i) => {
          if (!p.collected) {
            this.items.collectPage(i);
            grabbed++;
          }
        });
        if (grabbed > 0 && this.entity.state === "dormant") this.entity.activate();
        this.toast(t(this.lang, "cheat.grabbedPages", { count: grabbed }));
        this.pushHud(true);
        break;
      }
      case "KeyT": {
        const exit = this.level.exit;
        this.player.pos.set(
          exit.doorPos.x + exit.facing.x * 1.6,
          0,
          exit.doorPos.z + exit.facing.z * 1.6,
        );
        this.player.vel.set(0, 0, 0);
        this.player.yaw = Math.atan2(-exit.facing.x, -exit.facing.z) + Math.PI;
        this.toast(t(this.lang, "cheat.teleportExit"));
        break;
      }
    }
  }

  private toast(msg: string) {
    this.callbacks.onToast(msg);
  }

  /* ----------------------------- gameplay ----------------------------- */

  private tryInteract() {
    const camDir = this.player.camera.getWorldDirection(this.vCamDir);
    const hit = this.items.findInteractable(this.player.camera.position, camDir);
    if (!hit) return;

    if (hit.type === "page") {
      if (this.net) {
        // Server-validated: applied only once page_collected broadcasts back
        // (see handleNetMessage), so it can't be double-collected across clients.
        this.net.client.send({ type: "page_collect_request", index: hit.index });
      } else {
        const lines = this.items.collectPage(hit.index);
        this.audio.pageStinger();
        this.callbacks.onPageText(lines);
        this.fearSpike = Math.min(1, this.fearSpike + 0.22);
        if (this.items.collected === 1) this.entity.activate();
        this.pushHud(true);
      }
    } else if (hit.type === "water") {
      this.items.drinkWater(hit.index);
      this.player.restoreStamina();
      // the lore is true: it calms you down
      this.fearSpike = Math.max(0, this.fearSpike - 0.5);
      this.fear = Math.max(0, this.fear - 0.3);
      this.audio.drink();
      this.toast(t(this.lang, "item.waterRestored"));
      this.pushHud(true);
    } else if (hit.type === "door" && this.items.allCollected && !this.items.exitOpen && !this.net) {
      // Multiplayer: the door opens for every player the instant the server
      // broadcasts exit_unlocked (handleNetMessage), not on individual
      // interaction — so everyone sees it unlock together, per spec.
      this.items.openExit();
      this.audio.zap();
      this.fearSpike = Math.min(1, this.fearSpike + 0.15);
      this.pushHud(true);
    }
  }

  /* ------------------------------- net ------------------------------- */

  private handleNetMessage = (msg: ServerMessage) => {
    if (!this.net) return;
    switch (msg.type) {
      case "player_joined": {
        if (msg.player.id === this.net.localPlayerId || this.remotePlayers.has(msg.player.id)) break;
        const remote = new RemotePlayer(msg.player.name);
        remote.addTo(this.scene);
        this.remotePlayers.set(msg.player.id, remote);
        break;
      }
      case "player_left": {
        const rp = this.remotePlayers.get(msg.playerId);
        if (rp) {
          rp.removeFrom(this.scene);
          rp.dispose();
          this.remotePlayers.delete(msg.playerId);
        }
        break;
      }
      case "player_transform": {
        if (msg.playerId === this.net.localPlayerId) break;
        let rp = this.remotePlayers.get(msg.playerId);
        if (!rp) {
          rp = new RemotePlayer(msg.playerId);
          rp.addTo(this.scene);
          this.remotePlayers.set(msg.playerId, rp);
        }
        rp.setTarget(msg.pos, msg.yaw, msg.alive, msg.flashlightOn, msg.sneaking);
        break;
      }
      case "player_died": {
        if (msg.playerId !== this.net.localPlayerId) this.toast(t(this.lang, "mp.remoteDiedToast"));
        break;
      }
      case "page_collected": {
        const already = this.items.pages[msg.index]?.collected;
        if (already) break;
        const lines = this.items.collectPage(msg.index);
        if (msg.by === this.net.localPlayerId) {
          this.audio.pageStinger();
          this.callbacks.onPageText(lines);
        }
        this.fearSpike = Math.min(1, this.fearSpike + 0.12);
        if (this.items.collected === 1 && this.isMonsterAuthority) this.entity.activate();
        this.pushHud(true);
        break;
      }
      case "exit_unlocked": {
        if (!this.items.exitOpen) {
          this.items.openExit();
          this.audio.zap();
          this.pushHud(true);
        }
        break;
      }
      case "monster_transform": {
        this.lastMonsterSample = { pos: msg.pos, yaw: msg.yaw, state: msg.state };
        if (!this.isMonsterAuthority) this.remoteMonster?.setTarget(msg.pos, msg.yaw, msg.state);
        break;
      }
      case "monster_authority_changed": {
        if (msg.playerId === this.net.localPlayerId) {
          this.isMonsterAuthority = true;
          this.remoteMonster = null;
          // Seed from the last known sample rather than snapping to a fresh
          // dormant entity — avoids a jarring teleport on host handover.
          if (this.lastMonsterSample) {
            this.entity.pos.set(this.lastMonsterSample.pos.x, this.lastMonsterSample.pos.y, this.lastMonsterSample.pos.z);
            this.entity.root.position.copy(this.entity.pos);
            this.entity.root.rotation.y = this.lastMonsterSample.yaw;
            this.entity.state = this.lastMonsterSample.state as EntityState;
            this.entity.root.visible = this.entity.state !== "dormant";
          }
        } else {
          this.isMonsterAuthority = false;
          this.remoteMonster = new RemoteMonster(this.entity);
        }
        break;
      }
      case "game_over": {
        // Whole-room signal (win, or everyone eliminated) — the host page
        // decides what UI/navigation to do with this; Engine itself doesn't
        // change state here (it may already be "playing", "dead", etc. on
        // different clients simultaneously, all equally valid).
        this.callbacks.onGameOver?.(msg.winnerId);
        break;
      }
    }
  };

  /** Nearest live tracked player (local or remote) — what the host's entity AI targets. */
  private resolveEntityContext(camDir: THREE.Vector3, t: number): EntityContext {
    const local: EntityContext = {
      playerPos: this.player.pos,
      playerHead: this.player.camera.position,
      camDir,
      playerSpeed: this.player.speed,
      playerSprinting: this.player.sprinting,
      playerSneaking: this.player.sneaking,
      flashlightOn: this.player.flashlightOn,
      time: t,
    };
    if (!this.net || this.remotePlayers.size === 0) return local;

    // A dead/eliminated local player must never keep being a valid AI
    // target just because their (now-frozen) corpse happens to be nearby —
    // without this the entity gets permanently "stuck" on whoever it killed
    // first instead of re-targeting the remaining alive player(s).
    let best = local;
    let bestDist = this.state === "playing"
      ? this.entity.pos.distanceTo(this.player.pos)
      : Infinity;
    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive) continue;
      const d = this.entity.pos.distanceTo(rp.root.position);
      if (d < bestDist) {
        bestDist = d;
        // Remote camera direction isn't known — approximate with the local
        // player's, which only softens the "am I being watched" freeze cue
        // for remote targets, not the core distance-based chase/kill logic.
        best = {
          playerPos: rp.root.position,
          playerHead: rp.root.position,
          camDir,
          playerSpeed: 0,
          playerSprinting: false,
          playerSneaking: rp.sneaking,
          flashlightOn: rp.flashlightOn,
          time: t,
        };
      }
    }
    return best;
  }

  private broadcastLocalTransform(dt: number) {
    if (!this.net) return;
    this.netTransformTimer -= dt;
    this.sinceLastTransformSend += dt;
    if (this.netTransformTimer > 0) return;
    this.netTransformTimer = 1 / 15; // still evaluated at 15Hz — this only decides whether THIS tick's sample is worth sending

    const alive = this.state === "playing";
    const last = this.lastSentTransform;
    // Redundant-send guard: an idle player standing still would otherwise
    // still push an identical transform 15x/sec forever. Skip when nothing
    // meaningfully changed, with a heartbeat ceiling so the room never goes
    // fully silent for this player for more than half a second.
    if (last && this.sinceLastTransformSend < 0.5) {
      const dx = this.player.pos.x - last.x;
      const dz = this.player.pos.z - last.z;
      let yawDiff = this.player.yaw - last.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const unchanged =
        dx * dx + dz * dz < 0.0004 && // < ~2cm moved
        Math.abs(yawDiff) < 0.02 && // < ~1.1°
        this.player.sprinting === last.sprinting &&
        this.player.sneaking === last.sneaking &&
        this.player.flashlightOn === last.flashlightOn &&
        alive === last.alive;
      if (unchanged) return;
    }
    this.sinceLastTransformSend = 0;
    this.lastSentTransform = {
      x: this.player.pos.x,
      z: this.player.pos.z,
      yaw: this.player.yaw,
      sprinting: this.player.sprinting,
      sneaking: this.player.sneaking,
      flashlightOn: this.player.flashlightOn,
      alive,
    };

    this.net.client.send({
      type: "transform",
      pos: { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z },
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      sprinting: this.player.sprinting,
      sneaking: this.player.sneaking,
      flashlightOn: this.player.flashlightOn,
      alive,
      seq: this.netTransformSeq++,
    });
  }

  private broadcastMonsterTransform(dt: number) {
    if (!this.net || !this.isMonsterAuthority) return;
    this.netMonsterTimer -= dt;
    if (this.netMonsterTimer > 0) return;
    this.netMonsterTimer = 1 / 12;
    this.net.client.send({
      type: "monster_transform",
      pos: { x: this.entity.pos.x, y: this.entity.pos.y, z: this.entity.pos.z },
      yaw: this.entity.root.rotation.y,
      state: this.entity.state,
      seq: this.netMonsterSeq++,
    });
  }

  private onScreech() {
    // Multiplayer: `state === "chase"` is shared monster state (whoever it's
    // actually hunting) — this callback fires on every client the instant
    // chase begins ANYWHERE in the room (see RemoteMonster.setTarget's
    // mirrored side-effect), but the scare stinger/fear spike must stay
    // per-player. A chase happening on the other side of the map shouldn't
    // jump-scare someone nowhere near it. Single-player has no `net`, so
    // this check is always skipped there — behavior is unchanged.
    if (this.net && this.entity.pos.distanceTo(this.player.pos) > 30) return;
    this.audio.screech();
    this.fearSpike = 1;
    this.glitch = Math.min(1, this.glitch + 0.8);
    this.player.shake = 1;
  }

  private onEntityStep() {
    const toEntity = this.vA.subVectors(this.entity.pos, this.player.pos);
    const dist = toEntity.length();
    toEntity.normalize();
    const camDir = this.player.camera.getWorldDirection(this.vCamDir);
    const right = this.vB.crossVectors(camDir, UP).normalize();
    this.audio.entityStep(dist, toEntity.dot(right));
  }

  private beginDeath() {
    if (this.state !== "playing") return;
    if (this.cheats.god) return; // it reaches for you and passes through
    this.setState("dying");
    this.deathT = 0;
    this.audio.death();
    this.glitch = 1;
    this.player.clearKeys();
  }

  /* ------------------------------- loop ------------------------------- */

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    const t = this.elapsed;

    if (this.state === "playing") {
      // Watchdog: the pointer lock died without an event (browser quirk) —
      // the cursor would drift free over the close button while the game
      // runs. Pause within half a second so it's obvious and recoverable.
      if (!this.touchPrimary && this.hasLockedOnce &&
          document.pointerLockElement !== this.canvas) {
        this.lockLossT += dt;
        if (this.lockLossT > 0.5) {
          this.lockLossT = 0;
          this.pause();
        }
      } else {
        this.lockLossT = 0;
      }

      this.player.update(dt, t);

      // Auto-wake the entity even if the player stalls. In multiplayer only
      // the monster's current authority (host, or whoever it migrated to)
      // decides this — everyone else just observes via monster_transform.
      if (this.isMonsterAuthority && this.entity.state === "dormant" && t - this.startedAt > 45) {
        this.entity.activate();
      }

      const camDir = this.player.camera.getWorldDirection(this.vCamDir);
      if (this.isMonsterAuthority) {
        if (!this.cheats.freeze) {
          this.entity.update(dt, this.resolveEntityContext(camDir, t));
        }
        this.broadcastMonsterTransform(dt);
      } else {
        this.remoteMonster?.update(dt);
      }

      // Multiplayer: kill detection is self-checked by every client against
      // the (possibly network-interpolated) entity position, rather than
      // relying on entity.ts's single-target onKill callback — see its
      // wiring in the constructor for why.
      if (this.net && this.entity.state !== "dormant" &&
          this.entity.pos.distanceTo(this.player.pos) < ENTITY_KILL_DIST) {
        this.beginDeath();
      }

      for (const rp of this.remotePlayers.values()) rp.update(dt);
      this.broadcastLocalTransform(dt);

      this.items.update(dt, t);
      this.updateInteractionPrompt(camDir);

      // Walking into the light beyond the open door = escape.
      const doorDx = this.player.pos.x - this.level.exit.doorPos.x;
      const doorDz = this.player.pos.z - this.level.exit.doorPos.z;
      if (this.items.exitOpen && Math.hypot(doorDx, doorDz) < 1.05) {
        this.setState("won");
        this.audio.win();
        this.callbacks.onStats({
          pages: this.items.collected,
          seconds: Math.floor(t - this.startedAt),
        });
        document.exitPointerLock();
        if (this.net) this.net.client.send({ type: "player_won" });
      }
    } else if (this.state === "dying") {
      this.updateDeath(dt);
      this.broadcastLocalTransform(dt); // carries alive:false to the room promptly
    } else if (this.state === "dead" && this.net) {
      this.updateSpectator(dt, t);
    }

    this.updateFixtures(t, dt);
    this.updateFearAndAudio(dt);

    this.fx.update(t, this.fear, this.glitch, this.beat, this.deathT);
    this.fx.render();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && (this.state === "playing" || this.state === "dying")) {
      this.hudTimer = 0.12;
      this.pushHud();
    }
  };

  private updateDeath(dt: number) {
    this.deathT = Math.min(1, this.deathT + dt * 0.55);
    // Camera wrenched around to face it.
    const head = this.entity.headWorldPos;
    const cam = this.player.camera;
    const target = this.vA.subVectors(head, cam.position);
    const yaw = Math.atan2(-target.x, -target.z);
    const pitch = Math.atan2(target.y, Math.hypot(target.x, target.z));
    const k = Math.min(1, dt * 7);
    cam.rotation.y += (yaw - cam.rotation.y) * k;
    cam.rotation.x += (pitch - cam.rotation.x) * k;
    cam.position.y += (1.1 - cam.position.y) * dt * 0.7; // dragged down
    this.player.shake = 0.7;

    if (this.deathT >= 1) {
      this.setState("dead");
      this.callbacks.onStats({
        pages: this.items.collected,
        seconds: Math.floor(this.elapsed - this.startedAt),
      });
      document.exitPointerLock();
    }
  }

  /**
   * Multiplayer only, once this client's own player is dead: keep the match
   * alive around the eliminated player instead of freezing the world. Remote
   * players and the monster keep animating/simulating exactly as they would
   * while playing, and the camera just follows the nearest still-alive
   * remote player — purely a render-time re-target. No input is read here
   * and nothing is sent on this player's behalf, so it can't affect
   * gameplay or the other player's state.
   */
  private updateSpectator(dt: number, t: number) {
    // deathT drives the death shader's red/dark screen collapse (see
    // fx.ts's HorrorShader) and is only ever ramped up by updateDeath()
    // during the brief "dying" transition — nothing ever resets it back
    // down afterward, so without this it stays pinned at 1.0 (maximum)
    // for the rest of the spectator session, permanently crushing the
    // whole screen to ~10% brightness with a red tint. Single-player is
    // unaffected: this only runs while actually spectating in multiplayer
    // (this.net set), and single-player's own "dead" overlay is opaque UI
    // covering the canvas anyway, so its deathT was never actually visible.
    this.deathT = 0;

    for (const rp of this.remotePlayers.values()) rp.update(dt);

    if (this.isMonsterAuthority) {
      // The host dying must not freeze the AI for whoever is still playing.
      if (!this.cheats.freeze) {
        this.entity.update(dt, this.resolveEntityContext(this.vCamDir, t));
      }
      this.broadcastMonsterTransform(dt);
    } else {
      this.remoteMonster?.update(dt);
    }

    let target: RemotePlayer | null = null;
    for (const rp of this.remotePlayers.values()) {
      if (rp.alive) {
        target = rp;
        break;
      }
    }
    if (target) {
      // Chase-cam offset BEHIND the target along their own facing direction
      // — not colocated with their position. The camera used to sit exactly
      // at target.root.position, i.e. inside the target's own body mesh; at
      // zero distance that mostly shows the inside of their near-black mask
      // material filling the frame, which is what actually produced the
      // "black screen" (not just a lighting problem, though that was real
      // too — see the player.pos note below). March backward from the
      // target and stop just short of any wall instead of tunneling through
      // one — same technique player.ts already uses to dim the flashlight
      // near walls (solidAtWorld ray march), so this reuses an existing,
      // already-tuned collision query rather than inventing a new one.
      const yaw = target.root.rotation.y;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const tx = target.root.position.x;
      const tz = target.root.position.z;
      let dist = 0.6; // never closer than this — stay outside the target's own body radius
      for (let d = 0.6; d <= 2.4; d += 0.2) {
        if (this.level.solidAtWorld(tx - fx * d, tz - fz * d)) break;
        dist = d;
      }
      this.player.camera.position.set(tx - fx * dist, target.root.position.y + EYE_HEIGHT + 0.25, tz - fz * dist);
      this.player.camera.rotation.set(0.2, yaw, 0);
      // Camera repositioning alone isn't enough — updateFixtures() (the
      // light-pool "light orchestra" that does most of the actual room
      // lighting in this engine) and updateFearAndAudio() both key off
      // player.pos, not the camera. Without this, the light pool stays
      // parked at the death spot forever, so wherever the spectator camera
      // actually looks stays essentially unlit regardless of camera position.
      this.player.pos.set(tx, 0, tz);
    }
  }

  private updateInteractionPrompt(camDir: THREE.Vector3) {
    const hit = this.items.findInteractable(this.player.camera.position, camDir);
    const prompt = hit
      ? hit.type !== "door" || this.items.allCollected
        ? `[E] ${hit.label}`
        : hit.label
      : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.pushHud(true);
    }
  }

  /* --------------------------- light orchestra --------------------------- */

  private updateFixtures(t: number, dt: number) {
    const fixtures = this.level.fixtures;
    const playerPos = this.player.pos;
    const entityActive = this.entity.state !== "dormant";

    // Random ambient events. Two flavors:
    //  - choke: a nearby light strangles for a few seconds (scare)
    //  - flare: a DEAD light down some corridor sputters alive, then dies
    //    again (lure — something to walk toward)
    this.nextAmbientEvent -= dt;
    if (this.nextAmbientEvent <= 0 && this.state === "playing") {
      this.nextAmbientEvent = randRange(Math.random, 16, 38);
      if (this.entity.state !== "chase") {
        const wantFlare = Math.random() < 0.45;
        const dead = wantFlare
          ? fixtures.filter((f) => {
              if (f.state !== "off") return false;
              const d = f.pos.distanceToSquared(playerPos);
              return d > 100 && d < 484; // 10-22m: visible, not adjacent
            })
          : [];
        if (dead.length > 0) {
          const f = dead[Math.floor(Math.random() * dead.length)];
          this.fixtureFlare.set(f.index, 4.5 + Math.random() * 3);
          this.audio.buzz();
        } else {
          const near = fixtures.filter(
            (f) => f.state === "on" && f.pos.distanceToSquared(playerPos) < 169,
          );
          if (near.length > 0) {
            const f = near[Math.floor(Math.random() * near.length)];
            this.fixtureBurst.set(f.index, 2.5 + Math.random() * 2);
            this.audio.zap();
            this.fearSpike = Math.min(1, this.fearSpike + 0.12);
          }
        }
      }
    }

    const candidates: { f: (typeof fixtures)[number]; d: number; mult: number }[] = [];
    this.nearestLitSq = Infinity;

    for (const f of fixtures) {
      const dSq = f.pos.distanceToSquared(playerPos);
      if (f.state !== "off" && dSq < this.nearestLitSq) this.nearestLitSq = dSq;
      if (dSq > 676) continue; // beyond fog (26m) — irrelevant this frame

      let mult: number;
      switch (f.state) {
        case "off":
          mult = 0.006;
          break;
        case "flicker": {
          const n = Math.sin(t * 13 + f.phase * 7) + Math.sin(t * 31 + f.phase);
          mult = n > 0.4 ? 1 : n > -0.6 ? 0.45 : 0.05;
          break;
        }
        default:
          mult = 0.97 + Math.sin(t * 40 + f.phase) * 0.03;
      }

      // Flare events: a dead panel arcs back to life, stuttering.
      const flare = this.fixtureFlare.get(f.index);
      if (flare !== undefined) {
        if (flare <= 0) this.fixtureFlare.delete(f.index);
        else {
          this.fixtureFlare.set(f.index, flare - dt);
          // bangs on like a real tube, stutters, then sputters out
          const n = Math.sin(t * 19 + f.phase) + Math.sin(t * 47 + f.phase * 3);
          const dieOff = Math.min(1, flare * 1.2);
          mult = Math.max(mult, (n > -0.3 ? 0.9 : 0.12) * dieOff);
        }
      }

      // Burst events override.
      const burst = this.fixtureBurst.get(f.index);
      if (burst !== undefined) {
        if (burst <= 0) this.fixtureBurst.delete(f.index);
        else {
          this.fixtureBurst.set(f.index, burst - dt);
          mult *= Math.random() < 0.45 ? 0.08 : 0.7;
        }
      }

      // The entity smothers light around it.
      if (entityActive) {
        const dEntSq = f.pos.distanceToSquared(this.entity.pos);
        if (dEntSq < 64) {
          const aura = 1 - Math.sqrt(dEntSq) / 8;
          f.aura += (aura - f.aura) * Math.min(1, dt * 6);
        } else {
          f.aura += (0 - f.aura) * Math.min(1, dt * 3);
        }
        if (f.aura > 0.01) {
          const strangle = Math.random() < f.aura * 0.7 ? 0.06 : 1 - f.aura * 0.75;
          mult *= strangle;
        }
      }

      // Update instanced panel color only when it changed noticeably.
      if (Math.abs(mult - this.fixtureMult[f.index]) > 0.025) {
        this.fixtureMult[f.index] = mult;
        this.level.setFixtureColor(
          f.index,
          f.base[0] * mult,
          f.base[1] * mult,
          f.base[2] * mult,
        );
      }

      if (mult > 0.04 && (f.state !== "off" || this.fixtureFlare.has(f.index)))
        candidates.push({ f, d: dSq, mult });
    }

    // Assign the real point lights to the nearest glowing fixtures.
    candidates.sort((a, b) => a.d - b.d);
    for (let i = 0; i < POOL_SIZE; i++) {
      const light = this.lightPool[i];
      const c = candidates[i];
      if (c) {
        light.position.set(c.f.pos.x, c.f.pos.y - 0.18, c.f.pos.z);
        light.intensity = 10.5 * c.mult;
        // light color tracks the panel so anomaly zones wash the room
        light.color.setRGB(c.f.base[0] * 0.53, c.f.base[1] * 0.53, c.f.base[2] * 0.54);
      } else {
        light.intensity = 0;
      }
    }

    // Entity interference with the flashlight.
    if (entityActive) {
      const d = this.entity.pos.distanceTo(playerPos);
      this.player.flashlightInterference = d < 9 ? (1 - d / 9) * 0.85 : 0;
    }
  }

  /* ----------------------------- fear/audio ----------------------------- */

  private get beat(): number {
    return Math.pow(Math.max(0, Math.sin(this.beatPhase)), 6);
  }

  private updateFearAndAudio(dt: number) {
    const playerPos = this.player.pos;

    // Darkness factor — nearest live light, computed in the fixture pass.
    const nearestLit = Math.sqrt(this.nearestLitSq);
    let dark = Math.min(1, Math.max(0, (nearestLit - 5) / 13));
    if (this.player.flashlightOn) dark = Math.min(dark, 0.55);

    // Entity factor.
    const eDist = this.entity.state === "dormant"
      ? Infinity
      : this.entity.pos.distanceTo(playerPos);
    let entityFear = 0;
    switch (this.entity.state) {
      case "roam": entityFear = Math.max(0, 1 - eDist / 40) * 0.3; break;
      case "stalk": entityFear = 0.4 + Math.max(0, 1 - eDist / 30) * 0.3; break;
      case "search": entityFear = 0.45; break;
      case "chase":
        // Single-player: unchanged — chase only ever starts within a few
        // meters (see entity.ts), so this was always effectively "near".
        // Multiplayer: "chase" is shared state (whoever it's hunting), so
        // scale by THIS client's own distance instead of assuming everyone
        // in the room is the one being chased.
        entityFear = this.net ? Math.max(0.35, Math.min(0.95, 1 - eDist / 45)) : 0.95;
        break;
    }
    if (eDist < 8) entityFear = Math.max(entityFear, 0.8);

    this.fearSpike = Math.max(0, this.fearSpike - dt * 0.25);
    const target = Math.min(1, dark * 0.35 + entityFear + this.fearSpike * 0.5);
    const rate = target > this.fear ? 1.6 : 0.13;
    this.fear += (target - this.fear) * Math.min(1, dt * rate);

    this.glitch = Math.max(0, this.glitch - dt * 2.2);
    if (eDist < 10) this.glitch = Math.max(this.glitch, (1 - eDist / 10) * 0.25);

    this.beatPhase += dt * Math.PI * 2 * (0.95 + this.fear * 1.25);

    if (this.audio.ready) {
      const camDir = this.player.camera.getWorldDirection(this.vCamDir);
      const toEntity = this.vA.subVectors(this.entity.pos, playerPos).normalize();
      const right = this.vB.crossVectors(camDir, UP).normalize();
      this.audio.setParams({
        fear: this.fear,
        humProximity: Math.max(0, 1 - nearestLit / 11),
        entityDist: eDist,
        entityPan: isFinite(eDist) ? toEntity.dot(right) : 0,
        // Same per-player reasoning as the entityFear "chase" case above —
        // don't tell this client's audio "it's chasing you" when the actual
        // chase (shared monster state) is happening nowhere near them.
        chasing: this.entity.state === "chase" && (!this.net || eDist < 30),
      });
      this.audio.update(dt);
    }
  }

  /* ------------------------------ minimap ------------------------------ */

  /** Wall/pillar layout for the minimap — computed once, the maze never changes mid-run. */
  private buildMinimapGeometry() {
    const lvl = this.level;
    const S = lvl.size;
    const half = CELL / 2;
    const walls: number[] = [];
    for (let z = 0; z < S; z++) {
      for (let x = 0; x <= S; x++) {
        if (!lvl.hasWallV(x, z)) continue;
        const wx = lvl.worldX(x) - half;
        walls.push(wx, lvl.worldZ(z) - half, wx, lvl.worldZ(z) + half);
      }
    }
    for (let x = 0; x < S; x++) {
      for (let z = 0; z <= S; z++) {
        if (!lvl.hasWallH(x, z)) continue;
        const wz = lvl.worldZ(z) - half;
        walls.push(lvl.worldX(x) - half, wz, lvl.worldX(x) + half, wz);
      }
    }
    this.minimapWalls = new Float32Array(walls);

    const pillars: number[] = [];
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (lvl.cell(x, z) === PILLAR) pillars.push(lvl.worldX(x), lvl.worldZ(z));
      }
    }
    this.minimapPillars = new Float32Array(pillars);
  }

  /* ------------------------------- HUD ------------------------------- */

  private pushHud(force = false) {
    void force;
    const active: string[] = [];
    if (this.cheats.god) active.push(t(this.lang, "cheat.label.god"));
    if (this.cheats.noclip) active.push(t(this.lang, "cheat.label.noclip"));
    if (this.cheats.fullbright) active.push(t(this.lang, "cheat.label.fullbright"));
    if (this.cheats.freeze) active.push(t(this.lang, "cheat.label.freeze"));
    if (this.cheats.map) active.push(t(this.lang, "cheat.label.map"));
    this.callbacks.onHud({
      pages: this.items.collected,
      totalPages: TOTAL_PAGES,
      stamina: this.player.stamina,
      prompt: this.lastPrompt,
      objective: !this.items.allCollected
        ? t(this.lang, "hud.objectiveCollect", { count: this.items.collected, total: TOTAL_PAGES })
        : this.items.exitOpen
          ? t(this.lang, "hud.objectiveGo")
          : t(this.lang, "hud.objectiveFindExit"),
      objectiveKind: !this.items.allCollected ? "collect" : this.items.exitOpen ? "go" : "findExit",
      flashlight: this.player.flashlightOn,
      sneaking: this.player.sneaking,
      cheats: active.length > 0 ? active.join(" · ") : null,
      mapCheat: this.cheats.map,
    });
    this.callbacks.onMinimap({
      halfExtent: (this.level.size / 2) * CELL,
      walls: this.minimapWalls,
      pillars: this.minimapPillars,
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw },
      pages: this.items.pages.map((p) => ({
        x: p.basePos.x,
        z: p.basePos.z,
        collected: p.collected,
      })),
      exit: {
        x: this.level.exit.doorPos.x,
        z: this.level.exit.doorPos.z,
        open: this.items.exitOpen,
      },
      entity: this.entity.state === "dormant"
        ? null
        : { x: this.entity.pos.x, z: this.entity.pos.z },
    });
  }

  /* ----------------------------- teardown ----------------------------- */

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.pendingLock !== null) clearTimeout(this.pendingLock);
    this.netUnsubscribe?.();
    this.remotePlayers.clear();
    this.detachInput?.();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.audio.dispose();
    this.fx.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          for (const key of Object.keys(m)) {
            const v = (m as unknown as Record<string, unknown>)[key];
            if (v instanceof THREE.Texture) v.dispose();
          }
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}
