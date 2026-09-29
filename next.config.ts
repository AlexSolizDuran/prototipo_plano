import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // El catálogo de objetos y la biblioteca de materiales sirven thumbnails y
    // texturas desde el bucket público de Supabase. Sin este patrón, cualquier
    // `next/image` con una de esas URLs falla en runtime con
    // "hostname is not configured under images".
    remotePatterns: [
      {
        protocol: "https",
        hostname: "byrpxoiotywskoojsrzd.supabase.co",
        pathname: "/storage/v1/object/public/items/**",
      },
    ],
  },
  transpilePackages: [
    "@pascal-app/core",
    "@pascal-app/editor",
    "@pascal-app/viewer",
    "@pascal-app/nodes",
    "@pascal-app/lingo",
  ],
};

export default nextConfig;
