/**
 * Shared color constants for the "yellow Backrooms survivor" look — used by
 * both the local player's own third-person body (player.ts, visible when
 * looking down) and the multiplayer RemotePlayer rig, so the local player
 * and what other players see of them read as the same character design.
 * Plain hex numbers, not shared THREE.Material instances: Player only ever
 * builds one body per game (instance-sharing wouldn't help there), while
 * RemotePlayer needs its own module-level shared material cache to stay
 * cheap across multiple concurrent remote players — see RemotePlayer.ts.
 */
export const SURVIVOR_COLORS = {
  /** dirty/muted mustard yellow — the hood + jacket */
  jacket: 0xc9a227,
  /** slightly darker, worn yellow — the pants */
  pants: 0xa8871f,
  /** full black — mask, belt, gloves, boots */
  mask: 0x0b0b0d,
  belt: 0x0c0c0d,
  glove: 0x101012,
  boot: 0x0d0d0e,
} as const;
