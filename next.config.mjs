/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // For Capacitor / APK we need static export
  ...(process.env.BUILD_TARGET === "capacitor" && {
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true,
  }),
  // For Vercel/SSR we leave default
  experimental: {
    optimizePackageImports: ["firebase", "firebase/auth", "firebase/firestore"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
