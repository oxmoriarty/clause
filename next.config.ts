import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Transformers.js requests onnxruntime-web as an external module. The stable
    // browser build avoids Turbopack's missing-WASM resolution issue on Windows.
    config.resolve.alias["onnxruntime-web$"] = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist/ort.min.js");
    return config;
  },
};

export default nextConfig;
