import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a native-ish Node module — keep it out of the edge bundler.
  serverExternalPackages: ["pg"],
};

export default withNextIntl(nextConfig);
