import * as THREE from "three";

/**
 * Visual-only stand-in for another player in the room. Driven purely by
 * network samples (no local physics/input) — interpolates toward the last
 * received transform. Kept deliberately simple (procedural capsule body,
 * matching the game's "everything is code-generated" look) rather than
 * reusing the full first-person `Player` class, which is built around a
 * single local camera/input rig.
 */
export class RemotePlayer {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private torchLight: THREE.PointLight;
  private headMesh: THREE.Mesh;

  private targetPos = new THREE.Vector3();
  private targetYaw = 0;
  /** public — read by Engine to resolve which player the monster AI should target */
  alive = true;
  flashlightOn = true;
  sneaking = false;

  constructor(name: string) {
    void name; // reserved for a future floating nameplate

    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a875, roughness: 0.7 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.9 });

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 6, 12), jacket);
    this.body.position.y = 0.98;
    this.body.castShadow = true;
    this.root.add(this.body);

    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin);
    this.headMesh.position.y = 1.72;
    this.headMesh.castShadow = true;
    this.root.add(this.headMesh);

    this.torchLight = new THREE.PointLight(0xfff3d6, 0, 9, 1.8);
    this.torchLight.position.set(0, 1.6, 0.3);
    this.root.add(this.torchLight);
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

    // Fallen pose when dead; low crouch when sneaking.
    const targetScaleY = this.alive ? (this.sneaking ? 0.86 : 1) : 0.35;
    this.root.scale.y += (targetScaleY - this.root.scale.y) * Math.min(1, dt * 6);
    this.root.rotation.z += ((this.alive ? 0 : Math.PI / 2.2) - this.root.rotation.z) * Math.min(1, dt * 4);

    this.torchLight.intensity += ((this.alive && this.flashlightOn ? 4.5 : 0) - this.torchLight.intensity) * Math.min(1, dt * 8);
  }

  dispose() {
    this.body.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    this.headMesh.geometry.dispose();
    (this.headMesh.material as THREE.Material).dispose();
  }
}
