/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/shared ships raw TS (zero-dependency, platform-agnostic) —
  // Next transpiles it rather than consuming a prebuilt bundle.
  transpilePackages: ["@ecopower/shared"],
};

export default nextConfig;
