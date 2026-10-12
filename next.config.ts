import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WASM Opus decoder (voice-note transcoding) — load from node_modules at
  // runtime instead of bundling its inline wasm + worker shims.
  serverExternalPackages: ["ogg-opus-decoder"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
