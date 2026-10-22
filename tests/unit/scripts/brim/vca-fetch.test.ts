import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  applySetCookie,
  cookieHeader,
  downloadHrefs,
  extractZipCsvs,
  isDownloadAsset,
  looksLikeHtml,
  looksLikeZip,
} from '../../../../scripts/brim/vca-fetch.mjs';

describe('downloadHrefs', () => {
  it('finds zip and download.aspx links, skips labels and archive', () => {
    const html = `
      <a href="/downloads/download.aspx?rg=latest">latest</a>
      <a href="/downloads/download.aspx?rg=2025">2025</a>
      <a href="/downloads/download.aspx?rg=labels">labels</a>
      <a href="/downloads/archive.aspx">archive</a>
      <a href="/additional/2025/data%20for%20guide%202025.zip">zip</a>
      <a href="create_latest_data_csv.asp?id=6">csv asp</a>
      <a href="mailto:fuel@vca.gov.uk">mail</a>
    `;
    const base =
      'https://carfueldata.vehicle-certification-agency.gov.uk/downloads/download.aspx?rg=latest';
    const hrefs = downloadHrefs(html, base);
    assert.ok(hrefs.some((h) => h.includes('rg=latest')));
    assert.ok(hrefs.some((h) => h.includes('rg=2025')));
    assert.ok(hrefs.some((h) => h.includes('guide%202025.zip') || h.includes('guide 2025.zip')));
    assert.ok(hrefs.some((h) => h.includes('create_latest_data_csv.asp')));
    assert.equal(
      hrefs.some((h) => h.includes('rg=labels') || h.includes('archive.aspx')),
      false,
    );
  });
});

describe('isDownloadAsset', () => {
  it('rejects the homepage-style downloads redirect target', () => {
    assert.equal(
      isDownloadAsset(new URL('https://carfueldata.vehicle-certification-agency.gov.uk/')),
      false,
    );
  });
});

describe('looksLikeHtml / looksLikeZip', () => {
  it('distinguishes the VCA index from a zip magic', () => {
    assert.equal(looksLikeHtml('<?xml version="1.0"?><html>'), true);
    assert.equal(looksLikeZip(Buffer.from('PK\u0003\u0004abcd')), true);
    assert.equal(looksLikeZip(Buffer.from('<html>')), false);
  });
});

describe('cookies', () => {
  it('keeps the last value for a cookie name', () => {
    const jar = new Map();
    applySetCookie(jar, {
      getSetCookie: () => ['ASP.NET_SessionId=aaa; path=/', 'ASP.NET_SessionId=bbb; path=/'],
    });
    assert.equal(cookieHeader(jar), 'ASP.NET_SessionId=bbb');
  });
});

describe('extractZipCsvs', () => {
  it('reads a stored csv and ignores other entries', () => {
    const csv = 'Manufacturer,Model\nFord,Focus\n';
    const buf = zipStore([
      { name: 'ignore.txt', body: 'nope' },
      { name: 'folder/Euro_6_latest.csv', body: csv },
    ]);
    const files = extractZipCsvs(buf);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.name, 'Euro_6_latest.csv');
    assert.equal(files[0]?.text, csv);
  });

  it('uses the central directory when local sizes are zero', () => {
    const csv = 'Manufacturer,Model\nVW,Golf\n';
    const files = extractZipCsvs(zipDataDescriptor('Euro_6_latest.csv', csv));
    assert.equal(files.length, 1);
    assert.equal(files[0]?.text, csv);
  });
});

function zipStore(entries) {
  const parts = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.body);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    parts.push(header, name, data);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  parts.push(eocd);
  return Buffer.concat(parts);
}

function zipDataDescriptor(name, body) {
  const nameBuf = Buffer.from(name);
  const data = Buffer.from(body);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x8, 6);
  local.writeUInt16LE(nameBuf.length, 26);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(data.length, 8);
  descriptor.writeUInt32LE(data.length, 12);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x8, 8);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  const cdOffset = local.length + nameBuf.length + data.length + descriptor.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, descriptor, cd, nameBuf, eocd]);
}
