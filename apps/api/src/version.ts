import rootPkg from "../../../package.json" with { type: "json" };

/** Root package.json version, bundled at Worker build time. */
export const APP_VERSION = String(rootPkg.version).replace(/^v/i, "");

export const APP_VERSION_LABEL = `v${APP_VERSION}`;
