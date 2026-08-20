import * as THREE from "three";

/**
 * Visual-only stand-in for another player in the room. Driven purely by
 * network samples (no local physics/input) — interpolates toward the last
 * received transform, exactly as before. `root`'s position/rotation.y stay
 * the single source of truth other code reads (Engine's monster-targeting
 * distance checks, the spectator camera) — nothing here changes what those
 * mean, only what's drawn.
 *
 * An articulated low-poly human rig (head/neck/torso/two arms/two legs),
 * built once from a small SHARED pool of geometries + materials (module
 * scope, reused across every RemotePlayer instance — up to 3 concurrently
 * in a 4-player room) so per-player cost stays a handful of cheap Mesh
 * wrapper objects, not new GPU geometry/material allocations. No lights, no
 * shadow casting — matches the existing multiplayer perf constraints.
 */

const SEG = 7; // low-poly radial segment count, matching entity.ts's own convention

/** Muted survivor-suit palette — cycled per player via a name hash so two
 * players don't look identical, without a real customization system. */
const SUIT_COLORS = [0x2c3038, 0x33301e, 0x1f2e2c, 0x35241f];

interface SharedAssets {
  headGeo: THREE.SphereGeometry;
  neckGeo: THREE.CylinderGeometry;
  torsoGeo: THREE.CapsuleGeometry;
  hipsGeo: THREE.CylinderGeometry;
  thighGeo: THREE.CylinderGeometry;
  shinGeo: THREE.CylinderGeometry;
  footGeo: THREE.BoxGeometry;
  upperArmGeo: THREE.CylinderGeometry;
  forearmGeo: THREE.CylinderGeometry;
  handGeo: THREE.SphereGeometry;
  backpackGeo: THREE.BoxGeometry;
  visorGeo: THREE.BoxGeometry;
  hoodMat: THREE.MeshStandardMaterial;
  gloveMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  suitMats: THREE.MeshStandardMaterial[];
}

let shared: SharedAssets | null = null;

/** Built exactly once, on the first RemotePlayer ever constructed. */
function getSharedAssets(): SharedAssets {
  if (shared) return shared;
  shared = {
    headGeo: new THREE.SphereGeometry(0.135, 10, 8),
    neckGeo: new THREE.CylinderGeometry(0.05, 0.058, 0.1, SEG),
    torsoGeo: new THREE.CapsuleGeometry(0.155, 0.42, 4, SEG),
    hipsGeo: new THREE.CylinderGeometry(0.14, 0.15, 0.2, SEG),
    thighGeo: new THREE.CylinderGeometry(0.075, 0.065, 0.42, SEG),
    shinGeo: new THREE.CylinderGeometry(0.058, 0.05, 0.4, SEG),
    footGeo: new THREE.BoxGeometry(0.1, 0.09, 0.26),
    upperArmGeo: new THREE.CylinderGeometry(0.055, 0.05, 0.32, SEG),
    forearmGeo: new THREE.CylinderGeometry(0.046, 0.042, 0.3, SEG),
    handGeo: new THREE.SphereGeometry(0.05, 7, 6),
    backpackGeo: new THREE.BoxGeometry(0.22, 0.32, 0.13),
    visorGeo: new THREE.BoxGeometry(0.15, 0.07, 0.06),
    hoodMat: new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.95 }),
    gloveMat: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.85 }),
    visorMat: new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.4, metalness: 0.2 }),
    accentMat: new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.9 }),
    suitMats: SUIT_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 })),
  };
  return shared;
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export class RemotePlayer {
  readonly root = new THREE.Group();
  /** Everything visual lives here, not directly on `root` — lets crouch/
   * death posing move the model without touching the authoritative network
   * transform other systems (monster targeting, spectator camera) read off `root`. */
  private visual = new THREE.Group();

  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private kneeL!: THREE.Group;
  private kneeR!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private headGroup!: THREE.Group;

  private targetPos = new THREE.Vector3();
  private targetYaw = 0;
  /** public — read by Engine to resolve which player the monster AI should target */
  alive = true;
  flashlightOn = true;
  sneaking = false;

  private prevPos = new THREE.Vector3();
  private hasPrevPos = false;
  private walkPhase = 0;
  private idleT = Math.random() * 10;

  constructor(name: string) {
    const a = getSharedAssets();
    const suitMat = a.suitMats[hashName(name) % a.suitMats.length];
    const hasBackpack = hashName(name + "b") % 2 === 0;
    const hasVisor = hashName(name + "v") % 2 === 0;

    this.root.add(this.visual);

    const HIP_Y = 0.86;
    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    this.visual.add(hips);

    const hipsMesh = new THREE.Mesh(a.hipsGeo, suitMat);
    hips.add(hipsMesh);

    const torso = new THREE.Mesh(a.torsoGeo, suitMat);
    torso.position.y = 0.36;
    hips.add(torso);

    if (hasBackpack) {
      const pack = new THREE.Mesh(a.backpackGeo, a.accentMat);
      pack.position.set(0, 0.34, -0.16);
      hips.add(pack);
    }

    const neck = new THREE.Mesh(a.neckGeo, a.hoodMat);
    neck.position.y = 0.64;
    hips.add(neck);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.76;
    const head = new THREE.Mesh(a.headGeo, a.hoodMat);
    this.headGroup.add(head);
    if (hasVisor) {
      const visor = new THREE.Mesh(a.visorGeo, a.visorMat);
      visor.position.set(0, -0.01, 0.11);
      this.headGroup.add(visor);
    }
    hips.add(this.headGroup);

    const makeLeg = (side: 1 | -1) => {
      const leg = new THREE.Group();
      leg.position.set(0.09 * side, 0, 0);
      const thigh = new THREE.Mesh(a.thighGeo, suitMat);
      thigh.position.y = -0.21;
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      const shin = new THREE.Mesh(a.shinGeo, suitMat);
      shin.position.y = -0.2;
      const foot = new THREE.Mesh(a.footGeo, a.gloveMat);
      foot.position.set(0, -0.42, 0.05);
      knee.add(shin, foot);
      leg.add(thigh, knee);
      hips.add(leg);
      return { leg, knee };
    };
    ({ leg: this.legL, knee: this.kneeL } = makeLeg(-1));
    ({ leg: this.legR, knee: this.kneeR } = makeLeg(1));

    const makeArm = (side: 1 | -1) => {
      const arm = new THREE.Group();
      arm.position.set(0.2 * side, 0.58, 0);
      const upper = new THREE.Mesh(a.upperArmGeo, suitMat);
      upper.position.y = -0.16;
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      const fore = new THREE.Mesh(a.forearmGeo, suitMat);
      fore.position.y = -0.15;
      const hand = new THREE.Mesh(a.handGeo, a.gloveMat);
      hand.position.y = -0.32;
      hand.scale.set(0.85, 1.1, 0.75);
      elbow.add(fore, hand);
      arm.add(upper, elbow);
      hips.add(arm);
      return arm;
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.root);
  }
  removeFrom(scene: THREE.Scene) {
    scene.remove(this.root);
  }

  setTarget(
    pos: { x: number; y: number; z: number },
    yaw: number,
    alive: boolean,
    flashlightOn: boolean,
    sneaking: boolean,
  ) {
    this.targetPos.set(pos.x, pos.y, pos.z);
    this.targetYaw = yaw;
    this.alive = alive;
    this.flashlightOn = flashlightOn;
    this.sneaking = sneaking;
  }

  update(dt: number) {
    const k = Math.min(1, dt * 10);
    this.root.position.lerp(this.targetPos, k);

    let diff = this.targetYaw - this.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y += diff * k;

    // Movement speed derived purely from the already-interpolated root's
    // own displacement this frame — a local visual cue only, doesn't touch
    // the network transform or the interpolation algorithm above.
    if (!this.hasPrevPos) {
      this.prevPos.copy(this.root.position);
      this.hasPrevPos = true;
    }
    const dx = this.root.position.x - this.prevPos.x;
    const dz = this.root.position.z - this.prevPos.z;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    this.prevPos.copy(this.root.position);

    this.animate(dt, speed);
  }

  private animate(dt: number, speed: number) {
    // Crouch dip / death tilt live on `visual`, never on `root`.
    const targetCrouchY = this.alive && this.sneaking ? -0.12 : 0;
    this.visual.position.y += (targetCrouchY - this.visual.position.y) * Math.min(1, dt * 6);
    const targetTilt = this.alive ? 0 : Math.PI * 0.42;
    this.visual.rotation.x += (targetTilt - this.visual.rotation.x) * Math.min(1, dt * 5);

    const moving = this.alive && speed > 0.15;
    if (moving) {
      this.walkPhase += dt * (2.3 + Math.min(speed, 6) * 1.7);
    }
    const amp = moving ? Math.min(0.85, 0.18 + speed * 0.18) : 0;
    const k = Math.min(1, dt * 8);
    const legSwing = Math.sin(this.walkPhase) * amp;
    this.legL.rotation.x += (legSwing - this.legL.rotation.x) * k;
    this.legR.rotation.x += (-legSwing - this.legR.rotation.x) * k;
    this.kneeL.rotation.x += (Math.max(0, -Math.cos(this.walkPhase)) * amp * 0.9 - this.kneeL.rotation.x) * k;
    this.kneeR.rotation.x += (Math.max(0, Math.cos(this.walkPhase)) * amp * 0.9 - this.kneeR.rotation.x) * k;
    this.armL.rotation.x += (-legSwing * 0.6 - this.armL.rotation.x) * k;
    this.armR.rotation.x += (legSwing * 0.6 - this.armR.rotation.x) * k;

    // Subtle idle head sway when standing still, so alive-but-idle players
    // don't read as frozen statues.
    this.idleT += dt;
    if (!moving && this.alive) {
      this.headGroup.rotation.y = Math.sin(this.idleT * 0.5) * 0.12;
    }
  }

  /**
   * All geometry/material here is SHARED across every RemotePlayer instance
   * (see getSharedAssets) — nothing owned per-instance to dispose. Removing
   * this player's group from the scene (removeFrom) is the actual cleanup;
   * disposing the shared pool here would break every other remote player
   * still using it.
   */
  dispose() {
    // intentionally a no-op — see doc comment above
  }
}
