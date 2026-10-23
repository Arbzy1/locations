export { isFixtureMode, loadFixture, type FixtureName } from './fixtures/index.js';
export * from './fuel-finder/index.js';
export * from './carbon/index.js';
export * from './tariffs/index.js';
export { arrivalCopy, type ArrivalCopyInput } from './copy/arrival.js';
export {
  FIXTURE_FORECAST_TEMP_C,
  OPEN_METEO_ORIGIN,
  openMeteoForecastUrl,
  pickHourlyTemperature,
} from './weather/open-meteo.js';
export * from './dvla/index.js';
export * from './vca/types.js';
export { parseCsv, parseCsvRows, normHeader } from './vca/csv.js';
export {
  assertVcaHeaders,
  catalogueId,
  mapFuel,
  normaliseVcaCsv,
  normaliseVcaRecords,
  normaliseVcaRow,
  parseNumber,
  vcaToCatalogue,
} from './vca/normalise.js';
export {
  CATALOGUE_LIMIT,
  CATALOGUE_TRIM_LIMIT,
  MIN_QUERY,
  UK_COMMON_MAKES,
  getVcaById,
  listVcaMakes,
  listVcaModels,
  listVcaTrims,
  searchVcaCatalogue,
  searchVcaGrouped,
  sortVcaMakes,
  type CatalogueFacet,
  type CatalogueGroup,
} from './vca/search.js';
export * from './units.js';
export * from './constants/emissions.2025.js';
export * from './constants/corrections.js';
export * from './types.js';
export { parseMapsUrl, isMapsShortUrl, type MapsParseResult } from './maps-url.js';
export { hmrcAmapPence, ukTaxYearStartUtc, HMRC_AMAP_THRESHOLD_MILES } from './hmrc.js';
export {
  searchPlaces,
  findPlaceByLabel,
  findPlaceById,
  nearestPlace,
  distanceMeters,
  reverseGazetteer,
  fixturePlaceId,
  UK_PLACES,
  type PlaceHit,
} from './places.js';
export {
  encodePolyline,
  decodePolyline,
  simplifyRdp,
  parseLatLngString,
  type LatLng,
} from './polyline.js';
export {
  closestPointOnSegment,
  observationsNearPolyline,
  perpendicularMetersToPolyline,
} from './geo/polyline-distance.js';
export * from './zones/index.js';
