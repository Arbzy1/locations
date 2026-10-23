import { describe, expect, it } from "vitest";
import { isProbePath } from "@locations/api/probe-paths";

describe("isProbePath", () => {
  it("flags common exploit probes", () => {
    for (const path of [
      "/wp-login.php",
      "/xmlrpc.php",
      "/index.php",
      "/wp-admin/setup-config.php",
      "/wordpress/wp-includes/wlwmanifest.xml",
      "/.env",
      "/.env.production",
      "/.git/config",
      "/.aws/credentials",
      "/phpmyadmin/",
      "/cgi-bin/luci",
      "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
      "/backup.sql",
      "/admin/config.php",
      "/%2Eenv",
    ]) {
      expect(isProbePath(path), path).toBe(true);
    }
  });

  it("leaves every real page and static file alone", () => {
    for (const path of [
      "/",
      "/hotspots",
      "/day/2026-01-19",
      "/places/c%3A51.500%2C-0.100",
      "/places/g%3AChIJ9VPsNNQCbkgRDmeGZdsGNBQ",
      "/places/51.5%C2%B0N%200.5%C2%B0W",
      "/areas/St.%20Ives",
      "/trips/2022-04-13/2022-04-15",
      "/journey-cost/vehicles",
      "/review/2025",
      "/index.html",
      "/favicon.svg",
      "/icons.svg",
      "/manifest.webmanifest",
      "/.well-known/security.txt",
    ]) {
      expect(isProbePath(path), path).toBe(false);
    }
  });
});
