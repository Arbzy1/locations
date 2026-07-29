export type SecurityHeaderOpts = {
  /** Production HTTPS responses get HSTS. */
  isProductionHttps: boolean;
  /** Authenticated API responses must not be shared-cached. */
  noStore: boolean;
};

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://server.arcgisonline.com",
  "connect-src 'self'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

/** Apply baseline security headers onto a Headers object (API or assets). */
export function applySecurityHeaders(headers: Headers, opts: SecurityHeaderOpts): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);

  if (opts.isProductionHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (opts.noStore) {
    headers.set("Cache-Control", "no-store, private");
  }
}

export function isProductionHttps(authUrl: string, requestUrl: string): boolean {
  return authUrl.startsWith("https://") && requestUrl.startsWith("https://");
}
