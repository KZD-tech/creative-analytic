import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Creative media is source-agnostic by design: Meta's CDN (arbitrary
    // scontent-*.fbcdn.net subdomains), Instagram's, YouTube thumbnails, and
    // whatever host a CSV upload's media_url column happens to point at. All
    // of it is either pulled by our own Meta sync or pasted in by the account
    // owner, so a host allowlist would only ever be chasing new subdomains.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
