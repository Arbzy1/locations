export type SecurityHeaderOpts = {
  /** Production HTTPS responses get HSTS. */
  isProductionHttps: boolean;
  /** Authenticated API responses must not be shared-cached. */
  noStore: boolean;
  /** Enforce CSP instead of Report-Only. */
  enforceCsp?: boolean;
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.maptiler.com https://*.mapbox.com",
  "connect-src 'self' https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.maptiler.com https://*.mapbox.com https://router.project-osrm.org https://nominatim.openstreetmap.org",
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
  if (opts.enforceCsp) {
    headers.set("Content-Security-Policy", CSP);
  } else {
    headers.set("Content-Security-Policy-Report-Only", CSP);
  }

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
