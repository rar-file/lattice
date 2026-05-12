/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lattice/sdk"],
  // Tauri WebView serves static files — no Node server in the bundle. The
  // `out/` directory it produces is what `tauri build` packages.
  output: "export",
  images: {
    // The default optimized loader needs a server; in static export mode
    // images come through as-is.
    unoptimized: true,
  },
  // No trailing-slash rewriting; Tauri's asset loader handles bare paths.
  trailingSlash: false,
};

export default nextConfig;
