import { NextResponse } from 'next/server';
import { getLocaleFromPathname } from './lib/locales';

function addSecurityHeaders(response) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly.
    response.headers.set(
        'Content-Security-Policy',
        process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt'
            ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.muapi.ai https://d3adwkbyhxyrtq.cloudfront.net; media-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:;"
            : "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai; font-src 'self' data:;"
    );
    return response;
}

export function middleware(request) {
    const url = request.nextUrl;

    // nextUrl.pathname is basePath-normalized. Block every original API handler,
    // including the double-/api and upload catchalls, before any rewrite runs.
    if (process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' &&
        (url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
        return addSecurityHeaders(NextResponse.json({ success: false, message: 'MuAPI routes are disabled in fyt mode' }, { status: 404 }));
    }
    // Legacy agent pages also make server-side MuAPI calls from readable cookies.
    // Keep them unreachable in fyt mode, even when someone enters the URL directly.
    if (process.env.NEXT_PUBLIC_STUDIO_MODE === 'fyt' &&
        /^\/(?:agents|workflow|assistant|zh\/assistant)(?:\/|$)/.test(url.pathname)) {
        return addSecurityHeaders(new NextResponse('Not available in fyt mode', { status: 404 }));
    }

    // Catch requests to /api/workflow, /api/app, and /api/v1
    const isMuApi = url.pathname.startsWith('/api/workflow') ||
                    url.pathname.startsWith('/api/app') ||
                    url.pathname.startsWith('/api/v1');

    if (isMuApi) {
        // Exclude paths that have their own dedicated route handlers with custom logic
        const isHandledByRoute = url.pathname.startsWith('/api/v1/creative-agent') ||
                                url.pathname.startsWith('/api/v1/get_upload_url') ||
                                url.pathname.startsWith('/api/v1/upload-binary');

        if (url.pathname.startsWith('/api/v1') && !isHandledByRoute) {
            const targetUrl = new URL(url.pathname + url.search, 'https://api.muapi.ai');
            const rewriteResponse = NextResponse.rewrite(targetUrl);
            return addSecurityHeaders(rewriteResponse);
        }
    }

    // Plain response header carrying the locale derived from the URL path
    // (same "set in middleware, read via headers() in the root layout"
    // trick the main muapi client uses — see docs/localization.md).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-locale', getLocaleFromPathname(url.pathname));
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('x-locale', getLocaleFromPathname(url.pathname));
    return addSecurityHeaders(response);
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};
