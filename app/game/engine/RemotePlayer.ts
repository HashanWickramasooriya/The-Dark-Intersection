import * as THREE from "three";

/**
 * Visual-only stand-in for another player in the room. Driven purely by
 * network samples (no local physics/input) — interpolates toward the last
 * received transform, exactly as before. `root`'s position/rotation.y stay
 * the single source of truth other code reads (Engine's monster-targeting
 * distance checks, the spectator camera) — nothing here changes what those
 * mean, only what's drawn.
 *
 * A low/moderate-poly human survivor rig — tapered chest/waist/hips (not a
 * uniform cylinder), a non-spherical hooded head with a separate mask/visor
 * piece, distinct jacket/pants/boot/glove/belt/backpack materials — built
 * from a small SHARED pool of geometries + materials (module scope, reused
 * across every RemotePlayer instance, up to 3 concurrently in a 4-player
 * room) so per-player cost stays cheap Mesh wrapper objects, not new GPU
 * geometry/material allocations. No lights, no shadow casting.
 */

const SEG = 8; // radial segment count for limbs/torso — moderate, not primitive-looking, not expensive

/** Restrained, worn, Backrooms-appropriate jacket palette — cycled per
 * player via a name hash so two players don't look identical. */
const JACKET_COLORS = [
  0x8a7f66, // dirty beige
  0x585c5e, // muted gray
  0x4a4f37, // dark olive
  0x6b4f38, // faded brown
  0x33363a, // charcoal
  0x3f4f3f, // desaturated green
];

interface SharedAssets {
  hoodGeo: THREE.SphereGeometry;
  maskGeo: THREE.BoxGeometry;
  visorGeo: THREE.BoxGeometry;
  neckGeo: THREE.CylinderGeometry;
  chestGeo: THREE.CylinderGeometry;
  waistGeo: THREE.CylinderGeometry;
  hipsGeo: THREE.CylinderGeometry;
  beltGeo: THREE.TorusGeometry;
  shoulderGeo: THREE.SphereGeometry;
  upperArmGeo: THREE.CylinderGeometry;
  forearmGeo: THREE.CylinderGeometry;
  handGeo: THREE.SphereGeometry;
  thighGeo: THREE.CylinderGeometry;
  shinGeo: THREE.CylinderGeometry;
  bootGeo: THREE.BoxGeometry;
  bootCuffGeo: THREE.CylinderGeometry;
  backpackGeo: THREE.BoxGeometry;
  strapGeo: THREE.BoxGeometry;

  hoodMat: THREE.MeshStandardMaterial;
  maskMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
  gloveMat: THREE.MeshStandardMaterial;
  bootMat: THREE.MeshStandardMaterial;
  beltMat: THREE.MeshStandardMaterial;
  backpackMat: THREE.MeshStandardMaterial;
  /** [jacket, pants] per palette entry — pants a darker desaturated variant of the jacket color. */
  suitMats: { jacket: THREE.MeshStandardMaterial; pants: THREE.MeshStandardMaterial }[];
}

let shared: SharedAssets | null = null;

/** Built exactly once, on the first RemotePlayer ever constructed. */
function getSharedAssets(): SharedAssets {
  if (shared) return shared;

  const suitMats = JACKET_COLORS.map((hex) => {
    const jacketColor = new THREE.Color(hex);
    const pantsColor = jacketColor.clone().multiplyScalar(0.62);
    return {
      jacket: new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.93 }),
      pants: new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.95 }),
    };
  });

  shared = {
    // Hood: a non-uniform-scaled sphere reads as a rounded head/hood
    // silhouette rather than a ball — flattened front-to-back, slightly
    // taller than wide, like fabric drawn over a skull.
    hoodGeo: new THREE.SphereGeometry(0.135, 12, 9).scale(0.94, 1.12, 0.86),
    maskGeo: new THREE.BoxGeometry(0.15, 0.1, 0.08),
    visorGeo: new THREE.BoxGeometry(0.16, 0.035, 0.05),
    neckGeo: new THREE.CylinderGeometry(0.052, 0.062, 0.12, SEG),
    // Tapered torso in three stacked pieces (chest wide -> waist narrow ->
    // hips flare slightly) instead of one uniform capsule — this is what
    // actually produces a human silhouette instead of a cylinder.
    chestGeo: new THREE.CylinderGeometry(0.155, 0.185, 0.3, SEG),
    waistGeo: new THREE.CylinderGeometry(0.135, 0.155, 0.19, SEG),
    hipsGeo: new THREE.CylinderGeometry(0.15, 0.145, 0.14, SEG),
    beltGeo: new THREE.TorusGeometry(0.148, 0.018, 5, 14),
    shoulderGeo: new THREE.SphereGeometry(0.07, 8, 6),
    upperArmGeo: new THREE.CylinderGeometry(0.052, 0.06, 0.29, SEG),
    forearmGeo: new THREE.CylinderGeometry(0.042, 0.05, 0.27, SEG),
    handGeo: new THREE.SphereGeometry(0.052, 7, 6),
    thighGeo: new THREE.CylinderGeometry(0.088, 0.105, 0.44, SEG),
    shinGeo: new THREE.CylinderGeometry(0.062, 0.08, 0.37, SEG),
    bootGeo: new THREE.BoxGeometry(0.105, 0.11, 0.27),
    bootCuffGeo: new THREE.CylinderGeometry(0.075, 0.068, 0.06, SEG),
    backpackGeo: new THREE.BoxGeometry(0.23, 0.32, 0.14),
    strapGeo: new THREE.BoxGeometry(0.035, 0.32, 0.02),

    hoodMat: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.92 }),
    maskMat: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.4, metalness: 0.15 }),
    visorMat: new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.25, metalness: 0.3 }),
    gloveMat: new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.8 }),
    bootMat: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.6 }),
    beltMat: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.85 }),
    backpackMat: new THREE.MeshStandardMaterial({ color: 0x22261f, roughness: 0.88 }),
    suitMats,
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
  private shoulderL!: THREE.Group;
  private shoulderR!: THREE.Group;
  private elbowL!: THREE.Group;
  private elbowR!: THREE.Group;
  private headGroup!: THREE.Group;
  private chest!: THREE.Mesh;
  private hips!: THREE.Group;

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
    const h = hashName(name);
    const suit = a.suitMats[h % a.suitMats.length];
    const hasBackpack = hashName(name + "b") % 2 === 0;

    this.root.add(this.visual);

    const HIP_Y = 0.9;
    this.hips = new THREE.Group();
    this.hips.position.y = HIP_Y;
    this.visual.add(this.hips);

    const hipsMesh = new THREE.Mesh(a.hipsGeo, suit.pants);
    hipsMesh.position.y = 0.07;
    this.hips.add(hipsMesh);

    const belt = new THREE.Mesh(a.beltGeo, a.beltMat);
    belt.position.y = 0.13;
    belt.rotation.x = Math.PI / 2;
    this.hips.add(belt);

    const waist = new THREE.Mesh(a.waistGeo, suit.jacket);
    waist.position.y = 0.235;
    this.hips.add(waist);

    this.chest = new THREE.Mesh(a.chestGeo, suit.jacket);
    this.chest.position.y = 0.48;
    this.hips.add(this.chest);

    if (hasBackpack) {
      const pack = new THREE.Mesh(a.backpackGeo, a.backpackMat);
      pack.position.set(0, 0.5, -0.19);
      this.hips.add(pack);
      for (const side of [-1, 1] as const) {
        const strap = new THREE.Mesh(a.strapGeo, a.beltMat);
        strap.position.set(0.08 * side, 0.58, 0.02);
        strap.rotation.x = 0.15;
        this.hips.add(strap);
      }
    }

    const neck = new THREE.Mesh(a.neckGeo, a.hoodMat);
    neck.position.y = 0.68;
    this.hips.add(neck);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.82;
    const hood = new THREE.Mesh(a.hoodGeo, a.hoodMat);
    this.headGroup.add(hood);
    const mask = new THREE.Mesh(a.maskGeo, a.maskMat);
    mask.position.set(0, -0.03, 0.1);
    this.headGroup.add(mask);
    const visor = new THREE.Mesh(a.visorGeo, a.visorMat);
    visor.position.set(0, 0.04, 0.135);
    this.headGroup.add(visor);
    this.hips.add(this.headGroup);

    const SHOULDER_Y = 0.6;
    const makeArm = (side: 1 | -1) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.19 * side, SHOULDER_Y, 0);
      const cap = new THREE.Mesh(a.shoulderGeo, suit.jacket);
      shoulder.add(cap);

      const upper = new THREE.Mesh(a.upperArmGeo, suit.jacket);
      upper.position.y = -0.145;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      const fore = new THREE.Mesh(a.forearmGeo, suit.jacket);
      fore.position.y = -0.135;
      const hand = new THREE.Mesh(a.handGeo, a.gloveMat);
      hand.position.y = -0.29;
      hand.scale.set(0.85, 1.05, 0.75);
      elbow.add(fore, hand);
      shoulder.add(elbow);

      this.hips.add(shoulder);
      return { shoulder, elbow };
    };
    ({ shoulder: this.shoulderL, elbow: this.elbowL } = makeArm(-1));
    ({ shoulder: this.shoulderR, elbow: this.elbowR } = makeArm(1));

    const makeLeg = (side: 1 | -1) => {
      const leg = new THREE.Group();
      leg.position.set(0.1 * side, 0, 0);
      const thigh = new THREE.Mesh(a.thighGeo, suit.pants);
      thigh.position.y = -0.22;
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      const shin = new THREE.Mesh(a.shinGeo, suit.pants);
      shin.position.y = -0.185;
      const cuff = new THREE.Mesh(a.bootCuffGeo, a.bootMat);
      cuff.position.y = -0.36;
      const boot = new THREE.Mesh(a.bootGeo, a.bootMat);
      boot.position.set(0, -0.41, 0.045);
      knee.add(shin, cuff, boot);
      leg.add(thigh, knee);
      this.hips.add(leg);
      return { leg, knee };
    };
    ({ leg: this.legL, knee: this.kneeL } = makeLeg(-1));
    ({ leg: this.legR, knee: this.kneeR } = makeLeg(1));
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
    this.idleT += dt;

    // Crouch dip / death tilt live on `visual`, never on `root`.
    const targetCrouchY = this.alive && this.sneaking ? -0.14 : 0;
    this.visual.position.y += (targetCrouchY - this.visual.position.y) * Math.min(1, dt * 6);
    const targetTilt = this.alive ? 0 : Math.PI * 0.42;
    this.visual.rotation.x += (targetTilt - this.visual.rotation.x) * Math.min(1, dt * 5);
    if (!this.alive) return; // no walk/idle motion once down

    const sneaking = this.sneaking;
    const running = speed > 3.6;
    const moving = speed > 0.15;
    const k = Math.min(1, dt * 8);

    if (moving) {
      const cadence = sneaking ? 1.7 : running ? 3.1 : 2.3;
      this.walkPhase += dt * (cadence + Math.min(speed, 6) * (running ? 1.9 : 1.5));
    }
    const baseAmp = sneaking ? 0.32 : running ? 0.95 : 0.62;
    const amp = moving ? Math.min(baseAmp, 0.12 + speed * (running ? 0.22 : 0.16)) : 0;
    const legSwing = Math.sin(this.walkPhase) * amp;

    this.legL.rotation.x += (legSwing - this.legL.rotation.x) * k;
    this.legR.rotation.x += (-legSwing - this.legR.rotation.x) * k;
    this.kneeL.rotation.x += (Math.max(0, -Math.cos(this.walkPhase)) * amp * (sneaking ? 1.1 : 0.85) - this.kneeL.rotation.x) * k;
    this.kneeR.rotation.x += (Math.max(0, Math.cos(this.walkPhase)) * amp * (sneaking ? 1.1 : 0.85) - this.kneeR.rotation.x) * k;

    const armRatio = running ? 0.85 : 0.55; // arms swing opposite the legs, at a fraction of leg amplitude
    const armForward = sneaking ? -0.35 : 0; // arms held slightly forward while sneaking
    this.shoulderL.rotation.x += (-legSwing * armRatio + armForward - this.shoulderL.rotation.x) * k;
    this.shoulderR.rotation.x += (legSwing * armRatio + armForward - this.shoulderR.rotation.x) * k;
    const elbowBend = 0.25 + (running ? 0.25 : 0);
    this.elbowL.rotation.x += (elbowBend - this.elbowL.rotation.x) * k;
    this.elbowR.rotation.x += (elbowBend - this.elbowR.rotation.x) * k;

    // Torso counter-twist + vertical bob during movement; forward lean when running.
    const twist = -legSwing * 0.18;
    this.chest.rotation.y += (twist - this.chest.rotation.y) * k;
    const lean = running ? 0.16 : sneaking ? 0.1 : 0;
    this.chest.rotation.x += (lean - this.chest.rotation.x) * k;
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * (running ? 0.045 : 0.02) : 0;
    this.hips.position.y = 0.9 + bob;

    // Idle breathing + subtle shoulder/head motion when standing still.
    if (!moving) {
      const breathe = Math.sin(this.idleT * 1.3) * 0.012;
      this.chest.scale.y = 1 + breathe;
      this.chest.scale.x = 1 + breathe * 0.4;
      this.shoulderL.rotation.z = Math.sin(this.idleT * 0.9) * 0.03 - 0.03;
      this.shoulderR.rotation.z = Math.sin(this.idleT * 0.9 + Math.PI) * 0.03 + 0.03;
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
