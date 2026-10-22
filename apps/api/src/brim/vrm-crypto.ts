
function fromB64Url(raw: string): Uint8Array {
  const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
  const b64 = raw.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function aesKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function decodeVrmKey(raw: string): Uint8Array | undefined {
  try {
    const bytes = fromB64Url(raw.trim());
    return bytes.length === 32 ? bytes : undefined;
  } catch {
    return undefined;
  }
}

export async function hashVrm(key: Uint8Array, vrm: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(key), new TextEncoder().encode(vrm));
  return toB64Url(sig);
}

export async function encryptVrm(key: Uint8Array, vrm: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(key),
    new TextEncoder().encode(vrm),
  );
  return `v1:${toB64Url(iv)}:${toB64Url(cipher)}`;
}

export async function decryptVrm(key: Uint8Array, packed: string): Promise<string | undefined> {
  const parts = packed.split(":");
  const version = parts[0];
  const ivPart = parts[1];
  const cipherPart = parts[2];
  if (version !== "v1" || !ivPart || !cipherPart) return undefined;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64Url(ivPart) },
      await aesKey(key),
      fromB64Url(cipherPart),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return undefined;
  }
}
