/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Pin the workspace root to this app dir so Next doesn't infer it from a
  // stray parent lockfile (silences the multi-lockfile root warning).
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
