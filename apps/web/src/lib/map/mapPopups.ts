import type { Activity, Connector, RouteLine, Visit } from '../../types';
import { MODE_LABELS } from '../../types';
import { formatTime, formatDistance, formatDuration, type DistanceUnit } from '../../utils/format';
import { continuesPastDate, startedBeforeDate, UNKNOWN_MOVEMENT_HINT } from '../explorer/dayPlayback';
import { escapeHtml } from './escapeHtml';
import { lookaroundLinksHtml } from './mapLinks';

const JOURNEY_PALETTE = [
  '#58a6ff', '#56d4dd', '#3fb950', '#56d364', '#a3d977',
  '#d29922', '#e8a030', '#f47067', '#f778ba', '#bc8cff',
  '#79c0ff', '#a5d6ff',
];

export function getJourneyColor(index: number, total: number): string {
  if (total <= 1) return JOURNEY_PALETTE[0];
  const pos = (index / (total - 1)) * (JOURNEY_PALETTE.length - 1);
  return JOURNEY_PALETTE[Math.round(pos)];
}

export function visitPopupHtml(v: Visit, i: number, visitsLength: number, dayDate?: string): string {
  const stopNum = v.stop_number || i + 1;
  const totalStops = v.total_stops || visitsLength;
  const arrivedBy = v.arrived_by ? MODE_LABELS[v.arrived_by] || v.arrived_by : null;
  const departedBy = v.departed_by ? MODE_LABELS[v.departed_by] || v.departed_by : null;
  const fromYesterday = dayDate ? startedBeforeDate(v.start, dayDate) : false;
  const overnight = dayDate ? continuesPastDate(v.end, dayDate) : false;
  const title = escapeHtml(v.place_name || v.cluster);
  const addr = v.place_short_address ? escapeHtml(v.place_short_address) : '';
  return `<div class="text-sm" style="min-width:200px;max-width:300px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--visit);color:var(--on-accent);font-weight:700;font-size:11px">${stopNum}</span>
      <div>
        <div style="font-weight:600">${title}</div>
        ${addr ? `<div style="color:var(--text-muted);font-size:0.8em">${addr}</div>` : ''}
        <div style="color:var(--text-muted);font-size:0.85em">Stop ${stopNum} of ${totalStops}</div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:6px;margin-top:2px">
      <div>Arrived: <strong>${escapeHtml(formatTime(v.start))}</strong></div>
      <div>Left: <strong>${escapeHtml(formatTime(v.end))}</strong></div>
      <div style="color:var(--visit);font-weight:600;margin-top:2px">Stayed ${escapeHtml(formatDuration(v.duration_minutes))}</div>
      ${fromYesterday || overnight ? `<div style="color:var(--accent);margin-top:4px;font-size:0.85em">${fromYesterday ? '<div>Started yesterday</div>' : ''}${overnight ? '<div>Continues past midnight</div>' : ''}</div>` : ''}
    </div>
    ${arrivedBy || departedBy ? `<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;color:var(--text-muted);font-size:0.85em">${arrivedBy ? `<div>Arrived by ${escapeHtml(arrivedBy)}</div>` : ''}${departedBy ? `<div>Left by ${escapeHtml(departedBy)}</div>` : ''}</div>` : ''}
    ${v.semantic_type !== 'Unknown' ? `<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;color:var(--accent)">${escapeHtml(v.semantic_type)}</div>` : ''}
    <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;color:var(--text-muted);font-size:0.8em">
      <strong>Recorded location</strong>: Google Location History recorded a visit at these coordinates at ${escapeHtml(formatTime(v.start))}.
      ${v.place_name && v.place_name !== v.cluster ? ' Place name resolved via Nominatim/OpenStreetMap.' : ''}
    </div>
    <div style="color:var(--text-muted);font-size:0.75em;margin-top:2px">Coordinates: ${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}</div>
    ${v.fix_count && v.fix_count >= 2 ? `<div style="color:var(--text-muted);font-size:0.75em;margin-top:2px">Position from ${v.fix_count} GPS points${v.moved_m ? `, ${v.moved_m} m from Google's place` : ''}</div>` : ''}
    ${lookaroundLinksHtml(v.lat, v.lon)}
  </div>`;
}

export function activityPopupHtml(
  a: Activity,
  i: number,
  totalJourneys: number,
  color: string,
  unit: DistanceUnit,
): string {
  const roadSummary = a.steps
    ?.filter((s) => s.name && s.distance_meters > 50)
    .slice(0, 5)
    .map((s) => s.name)
    .join(' \u2192 ');
  const hasOsrm = a.has_osrm_route !== false && (a.steps?.length || 0) > 0;
  const mode = MODE_LABELS[a.mode] || a.mode;
  const fixes = a.gps_points ?? 0;
  const fixText = `${fixes} recorded GPS point${fixes === 1 ? '' : 's'}`;
  let routeNote: string;
  if (a.route_source === 'gps-rail') {
    routeNote = `<strong>Rail route</strong>: Follows the railway between your ${fixText}.`;
  } else if (a.route_source === 'gps-road') {
    routeNote = `<strong>GPS route</strong>: Follows your ${fixText}, snapped onto roads.`;
  } else if (a.route_source === 'gps') {
    routeNote = `<strong>GPS trace</strong>: Straight lines between your ${fixText}.`;
  } else if (a.is_rail) {
    routeNote = `<strong>Rail journey</strong>: Google detected you were on a ${escapeHtml(mode.toLowerCase())}. The arc shows the approximate path between stations. Exact rail route not available.`;
  } else if (a.mode === 'flying') {
    routeNote = '<strong>Straight line</strong>: Flight path shown as direct line.';
  } else if (hasOsrm) {
    routeNote = '<strong>Predicted route</strong>: No GPS points for this journey, so this is the fastest road route between start and end. Actual route may differ.';
  } else {
    routeNote = '<strong>Straight line</strong>: Route could not be determined from road data.';
  }
  if (a.mode_detected && a.google_mode) {
    routeNote += ` Google labelled this ${escapeHtml((MODE_LABELS[a.google_mode] || a.google_mode).toLowerCase())}; your GPS points say ${escapeHtml(mode.toLowerCase())}.`;
  }
  const midLat = (a.start_lat + a.end_lat) / 2;
  const midLon = (a.start_lon + a.end_lon) / 2;
  return `<div class="text-sm" style="max-width:300px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:10px">${i + 1}</span>
      <div>
        <div style="font-weight:600">${escapeHtml(mode)}</div>
        <div style="color:var(--text-muted);font-size:0.85em">Journey ${i + 1} of ${totalJourneys}</div>
      </div>
    </div>
    ${a.from_place || a.to_place ? `<div style="margin-bottom:4px">${escapeHtml(a.from_place || 'Start')} &rarr; ${escapeHtml(a.to_place || 'End')}</div>` : ''}
    <div>${escapeHtml(formatTime(a.start))} &rarr; ${escapeHtml(formatTime(a.end))}</div>
    <div style="font-weight:600">${escapeHtml(formatDistance(a.distance_meters, unit))} &middot; ${escapeHtml(formatDuration(a.duration_minutes))}</div>
    ${roadSummary ? `<div style="margin-top:4px;color:var(--text-muted);font-size:0.8em">via ${escapeHtml(roadSummary)}</div>` : ''}
    <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;color:var(--text-muted);font-size:0.8em">${routeNote}</div>
    ${a.via_places?.length ? `<div style="margin-top:4px;font-size:0.8em">Through ${escapeHtml(a.via_places.join(' → '))}</div>` : ''}
    ${a.accuracy ? `<div style="margin-top:4px;color:var(--text-muted);font-size:0.8em"><strong>${escapeHtml(a.accuracy.score)} confidence</strong>: ${a.accuracy.fixes} GPS point${a.accuracy.fixes === 1 ? '' : 's'}, longest gap ${a.accuracy.maxGapMin} min${a.accuracy.meanOffsetM == null ? '' : `, line ${a.accuracy.meanOffsetM} m from them on average`}</div>` : ''}
    ${a.prediction_gap ? `<div style="margin-top:4px;color:var(--text-muted);font-size:0.8em">OSRM prediction: ${a.prediction_gap.within100Pct}% of GPS points within 100 m, worst ${a.prediction_gap.maxM} m off</div>` : ''}
    <div style="color:var(--text-muted);font-size:0.75em;margin-top:4px">From: ${a.start_lat.toFixed(5)}, ${a.start_lon.toFixed(5)} &rarr; To: ${a.end_lat.toFixed(5)}, ${a.end_lon.toFixed(5)}</div>
    ${lookaroundLinksHtml(midLat, midLon)}
  </div>`;
}

export function connectorPopupHtml(c: Connector, unit: DistanceUnit): string {
  const isStraight = !c.is_routed;
  const midLat = (c.from_lat + c.to_lat) / 2;
  const midLon = (c.from_lon + c.to_lon) / 2;
  return `<div class="text-sm" style="max-width:280px">
    <div style="font-weight:600;margin-bottom:4px;color:var(--text-muted)">Unknown movement</div>
    <div style="margin-bottom:4px">${escapeHtml(c.from_label || 'Previous event')} &rarr; ${escapeHtml(c.to_label || 'Next event')}</div>
    <div>${escapeHtml(formatTime(c.from_time))} &rarr; ${escapeHtml(formatTime(c.to_time))}</div>
    <div>${escapeHtml(formatDistance(c.distance_meters, unit))}</div>
    <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;color:var(--text-muted);font-size:0.8em">
      ${isStraight
        ? '<strong>Straight line</strong>: gap under 300m, direct connection between recorded points.'
        : '<strong>Predicted route</strong>: gap over 300m. Path inferred via road mapping.'}
    </div>
    <div style="margin-top:6px;color:var(--text-muted);font-size:0.8em">${escapeHtml(UNKNOWN_MOVEMENT_HINT)}</div>
    ${lookaroundLinksHtml(midLat, midLon)}
  </div>`;
}

/** Period (Routes) view line popup with a new-tab link to that day. */
export function routeLinePopupHtml(l: RouteLine, unit: DistanceUnit): string {
  const mode = MODE_LABELS[l.mode] || l.mode;
  return `<div class="text-sm" style="max-width:240px">
    <div style="font-weight:600">${escapeHtml(mode)} &middot; ${escapeHtml(formatDistance(l.miles * 1609.34, unit))}</div>
    <div style="color:var(--text-muted)">${escapeHtml(l.date)} ${escapeHtml(formatTime(l.start))}</div>
    <div style="color:var(--text-muted);font-size:0.8em;margin-top:4px">${l.recorded ? 'Drawn from recorded GPS points.' : 'No GPS points: straight line between start and end.'}</div>
    <a href="/day/${escapeHtml(l.date)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;color:var(--accent)">Open day in new tab</a>
  </div>`;
}
