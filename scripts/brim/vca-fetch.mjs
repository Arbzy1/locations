/**
 * VCA carfueldata is an ASP.NET app: /downloads/default.aspx 302s to / unless
 * the request carries a session cookie from the homepage. File links are
 * download.aspx?rg=… and .zip, not bare .csv hrefs.
 */
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

export const VCA_ORIGIN = 'https://carfueldata.vehicle-certification-agency.gov.uk';
export const VCA_UA =
  'Mozilla/5.0 (compatible; BrimVcaSync/0.1; +https://github.com; bulk dataset download)';

const LOCAL_SIG = 0x04034b50;

export function applySetCookie(jar, headers) {
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}

export function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export function allHrefs(html) {
  const found = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let match = re.exec(html);
  while (match) {
    if (match[1]) found.push(match[1]);
    match = re.exec(html);
  }
  return found;
}

export function isDownloadAsset(url) {
  const pathName = url.pathname.toLowerCase();
  const search = url.search.toLowerCase();
  if (pathName.includes('archive.aspx')) return false;
  if (search.includes('rg=labels')) return false;
  if (pathName.endsWith('.csv') || pathName.endsWith('.zip')) return true;
  if (pathName.endsWith('download.aspx') && search.includes('rg=')) return true;
  if (pathName.includes('create_latest_data_csv.asp')) return true;
  return false;
}

export function isHtmlListing(url) {
  const pathName = url.pathname.toLowerCase();
  const search = url.search.toLowerCase();
  if (pathName.includes('archive.aspx') || search.includes('rg=labels')) return false;
  return pathName.endsWith('download.aspx') && search.includes('rg=');
}

export function downloadHrefs(html, baseUrl) {
  const found = new Set();
  for (const href of allHrefs(html)) {
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('mailto:')) continue;
    let url;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (url.origin !== new URL(baseUrl).origin && !url.pathname.toLowerCase().endsWith('.zip')) {
      continue;
    }
    if (isDownloadAsset(url)) found.add(url.href);
  }
  return [...found];
}

export function looksLikeZip(buf) {
  return (
    buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  );
}

export function looksLikeHtml(text) {
  const first = text
    .replace(/^\uFEFF/, '')
    .trimStart()
    .slice(0, 64)
    .toLowerCase();
  return first.startsWith('<!doctype') || first.startsWith('<html') || first.startsWith('<?xml');
}

const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

function inflateEntry(name, method, data) {
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip ${name}: compression ${method} unsupported`);
}

function readCsvFromLocal(buffer, localOffset, compSize, nameHint) {
  if (localOffset + 30 > buffer.length)
    throw new Error(`zip ${nameHint} local header is truncated`);
  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) {
    throw new Error(`zip ${nameHint} local header signature missing`);
  }
  const method = buffer.readUInt16LE(localOffset + 8);
  const nameLen = buffer.readUInt16LE(localOffset + 26);
  const extraLen = buffer.readUInt16LE(localOffset + 28);
  const nameStart = localOffset + 30;
  const dataStart = nameStart + nameLen + extraLen;
  if (dataStart + compSize > buffer.length) throw new Error(`zip ${nameHint} payload is truncated`);
  const name = buffer.toString('utf8', nameStart, nameStart + nameLen).replaceAll('\\', '/');
  return { name, method, data: buffer.subarray(dataStart, dataStart + compSize) };
}

function findEocd(buffer) {
  const min = 22;
  const start = Math.max(0, buffer.length - min - 65535);
  for (let i = buffer.length - min; i >= start; i--) {
    if (buffer.readUInt32LE(i) !== EOCD_SIG) continue;
    const commentLen = buffer.readUInt16LE(i + 20);
    if (i + 22 + commentLen === buffer.length) return i;
  }
  return -1;
}

function entriesFromCentralDirectory(buffer) {
  const eocd = findEocd(buffer);
  if (eocd < 0) return [];
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('zip64 is unsupported');
  }
  const entries = [];
  let offset = cdOffset;
  const end = cdOffset + cdSize;
  while (offset + 46 <= end) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIG) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen).replaceAll('\\', '/');
    entries.push({ name, method, compSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractFromLocalHeaders(buffer) {
  const files = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== LOCAL_SIG) break;
    const flag = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    const dataStart = nameEnd + extraLen;
    const name = buffer.toString('utf8', nameStart, nameEnd).replaceAll('\\', '/');
    if (flag & 0x8) {
      throw new Error(`zip ${name} uses a data descriptor and has no central directory`);
    }
    if (nameEnd > buffer.length || dataStart + compSize > buffer.length) {
      throw new Error('zip local header is truncated');
    }
    const data = buffer.subarray(dataStart, dataStart + compSize);
    offset = dataStart + compSize;
    if (name.endsWith('/')) continue;
    const base = path.posix.basename(name);
    if (!base.toLowerCase().endsWith('.csv')) continue;
    files.push({ name: base, text: inflateEntry(name, method, data).toString('utf8') });
  }
  return files;
}

export function extractZipCsvs(buffer) {
  const central = entriesFromCentralDirectory(buffer);
  if (central.length > 0) {
    const files = [];
    for (const entry of central) {
      if (entry.name.endsWith('/')) continue;
      const base = path.posix.basename(entry.name);
      if (!base.toLowerCase().endsWith('.csv')) continue;
      if (entry.compSize === 0xffffffff) throw new Error(`zip ${entry.name} is zip64`);
      const local = readCsvFromLocal(buffer, entry.localOffset, entry.compSize, entry.name);
      files.push({
        name: base,
        text: inflateEntry(local.name, local.method, local.data).toString('utf8'),
      });
    }
    return files;
  }
  return extractFromLocalHeaders(buffer);
}

export async function request(url, jar, { referer } = {}) {
  let current = url;
  let from = referer;
  for (let hop = 0; hop < 10; hop++) {
    const headers = { 'user-agent': VCA_UA, accept: '*/*' };
    const cookie = cookieHeader(jar);
    if (cookie) headers.cookie = cookie;
    if (from) headers.referer = from;
    const res = await fetch(current, { method: 'GET', headers, redirect: 'manual' });
    applySetCookie(jar, res.headers);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`${current} redirect without Location`);
      from = current;
      current = new URL(loc, current).href;
      await res.arrayBuffer();
      continue;
    }
    if (!res.ok) throw new Error(`${current} → HTTP ${res.status}`);
    return { url: current, res };
  }
  throw new Error(`too many redirects from ${url}`);
}

export async function openVcaSession() {
  const jar = new Map();
  await request(`${VCA_ORIGIN}/`, jar);
  return jar;
}
