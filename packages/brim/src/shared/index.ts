export { isFixtureMode, loadFixture, type FixtureName } from './fixtures/index.js';
export { VCA_VEHICLE_FIXTURES } from './fixtures/vca-vehicles.js';
export {
  FUEL_FINDER_FIXTURES,
  FUEL_FINDER_FIXTURE_NOW,
  FUEL_FINDER_PFS_FIXTURES,
  FUEL_FINDER_PRICE_FIXTURES,
} from './fixtures/fuel-finder.js';
export {
  CARBON_INTENSITY_FIXTURES,
  CARBON_INTENSITY_FIXTURE_NOW,
} from './fixtures/carbon-intensity.js';
export {
  DVLA_FIXTURES,
  DVLA_FIXTURE_BEV,
  DVLA_FIXTURE_FEW,
  DVLA_FIXTURE_NONE,
  DVLA_FIXTURE_NOT_FOUND,
  DVLA_FIXTURE_SINGLE,
  DVLA_VES_FIXTURES,
} from './fixtures/dvla.js';
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
export { MAPS_SHORT_DUMMY, MAPS_SHORT_FIXTURES, MAPS_SHORT_TARGET } from './fixtures/maps-short.js';
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
export {
  CHARGE_JOURNEY_SET,
  journeyHits,
  type ChargeJourneyCase,
  type ChargeJourneyExpected,
} from './fixtures/charge-journeys.js';
