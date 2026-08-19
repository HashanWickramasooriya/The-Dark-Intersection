import * as THREE from "three";
import type { Entity, EntityState } from "./entity";

/**
 * Drives an existing `Entity`'s visual transform from network samples only
 * (position/heading/state) — it never calls `Entity.update()`, so the real
 * AI/pathing/kill logic in entity.ts is untouched and never runs twice.
 * Used by non-host multiplayer clients: the host runs the one real `Entity`
 * simulation and broadcasts its transform; everyone else just interpolates.
 */
export class RemoteMonster {
  private targetPos = new THREE.Vector3();
  private targetYaw = 0;
  private seenOnce = false;

  constructor(private entity: Entity) {}

  setTarget(pos: { x: number; y: number; z: number }, yaw: number, state: string) {
    this.targetPos.set(pos.x, pos.y, pos.z);
    this.targetYaw = yaw;

    const prevState = this.entity.state;
    this.entity.state = state as EntityState;
    // Mirror entity.ts's setState() scream side-effect on entering chase,
    // since we're setting `.state` directly and skipping that method.
    if (state === "chase" && prevState !== "chase") this.entity.onScreech?.();

    if (!this.seenOnce) {
      this.seenOnce = true;
      this.entity.pos.copy(this.targetPos);
      this.entity.root.position.copy(this.targetPos);
      this.entity.root.visible = true;
    }
  }

  update(dt: number) {
    if (!this.seenOnce) return;
    this.entity.pos.lerp(this.targetPos, Math.min(1, dt * 10));
    this.entity.root.position.copy(this.entity.pos);
    let diff = this.targetYaw - this.entity.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.entity.root.rotation.y += diff * Math.min(1, dt * 8);
  }
}
