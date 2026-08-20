import { ImageResponse } from "next/og";

// Browser-tab favicon: a small, simple composition of the game's own
// monster (see app/game/engine/entity.ts — pale gaunt head, red emissive
// eyes) rather than a generic Backrooms icon. Generated at build time via
// Next's built-in icon convention (next/og, no external asset/dependency),
// matching the project's "everything is code-generated" approach — the
// actual 3D monster model/AI is untouched, this is a standalone 2D favicon.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0906",
        }}
      >
        <div
          style={{
            width: 32,
            height: 44,
            borderRadius: "48% 48% 40% 40% / 60% 60% 40% 40%",
            backgroundColor: "#9a958a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: "#ff2a1e",
                boxShadow: "0 0 7px 3px rgba(255,35,20,0.85)",
              }}
            />
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: "#ff2a1e",
                boxShadow: "0 0 7px 3px rgba(255,35,20,0.85)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
