/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  // 子域部署时留空；老的 /create 路径部署可以显式设成 '/create'
  basePath: process.env.NEXT_PUBLIC_STUDIO_BASE_PATH || '',
  output: process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' ? 'standalone' : undefined,
  async rewrites() {
    // Local validation only. Production routes these paths directly to Go.
    if (process.env.NEXT_PUBLIC_STUDIO_MODE !== 'fyt' || process.env.FYT_LOCAL_API !== 'true') return [];
    return { beforeFiles: [
      ...['/api/status', '/api/user/self', '/api/user/self/groups', '/api/user/models', '/api/pricing', '/pg/chat/completions', '/pg/images/generations', '/api/user/auth/refresh', '/api/user/auth/logout',
        '/api/user/login', '/api/user/login/encryption-key', '/api/user/login/2fa'].map(source => ({
        source, destination: `http://127.0.0.1:13100${source}`, basePath: false,
      })),
      ...['/login', '/console/:path*', '/_fyt/:path*'].map(source => ({
        source, destination: `http://127.0.0.1:8080${source}`, basePath: false,
      })),
    ] };
  },
};

export default nextConfig;
