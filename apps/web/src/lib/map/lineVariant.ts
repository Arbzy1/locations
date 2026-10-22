import type { Activity, LineVariant } from '../../types';

/** The line Day View draws for a journey under the chosen variant. */
export function withLineVariant(a: Activity, variant: LineVariant): Activity {
  if (variant === 'recorded' && a.recorded_geometry?.length) {
    return { ...a, route_geometry: a.recorded_geometry, steps: [], route_source: 'gps' };
  }
  if (variant === 'predicted' && a.predicted_geometry?.length) {
    return {
      ...a,
      route_geometry: a.predicted_geometry,
      steps: [],
      route_source: a.is_rail ? 'rail-arc' : 'road-estimate',
    };
  }
  return a;
}
