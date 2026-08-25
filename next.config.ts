import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: [
    "@pascal-app/core",
    "@pascal-app/editor",
    "@pascal-app/viewer",
    "@pascal-app/nodes",
    "@pascal-app/lingo",
  ],
};

export default nextConfig;
