import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bcryptjs", "@github/copilot-sdk", "@github/copilot"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
