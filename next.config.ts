import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      {
        source: "/authority",
        destination: "/desk",
        permanent: true,
      },
      {
        source: "/authority/:path*",
        destination: "/desk/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
