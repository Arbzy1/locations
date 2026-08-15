export function streetViewUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
}

export function mapillaryUrl(lat: number, lon: number): string {
  return `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17`;
}

export function lookaroundLinksHtml(lat: number, lon: number): string {
  const sv = streetViewUrl(lat, lon);
  const my = mapillaryUrl(lat, lon);
  return `<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border);font-size:12px;">
    <a href="${sv}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Street View</a>
    <span style="color:var(--text-muted)"> · </span>
    <a href="${my}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Mapillary</a>
  </div>`;
}
