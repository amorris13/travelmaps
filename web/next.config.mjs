import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Resolve @lib alias
    config.resolve.alias = {
      ...config.resolve.alias,
      "@lib": path.resolve(__dirname, "../lib"),
    };

    // Allow webpack to resolve node_modules from the web/ directory
    // when processing files in ../lib/
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
      ...(config.resolve.modules || []),
    ];

    return config;
  },
};

export default nextConfig;
