import { ImageResponse } from "next/og";

// Same monster-face composition as app/icon.tsx, at the size iOS expects
// for home-screen/bookmark icons. See that file's comment for context.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            width: 88,
            height: 122,
            borderRadius: "48% 48% 40% 40% / 60% 60% 40% 40%",
            backgroundColor: "#9a958a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", gap: 16 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: "#ff2a1e",
                boxShadow: "0 0 20px 8px rgba(255,35,20,0.85)",
              }}
            />
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: "#ff2a1e",
                boxShadow: "0 0 20px 8px rgba(255,35,20,0.85)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
