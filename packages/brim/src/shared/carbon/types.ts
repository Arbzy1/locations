export type CarbonIntensityPeriod = {
  region: string;
  intensityGPerKwh: number;
  validFrom: string;
  validTo: string;
  source: "actual" | "forecast";
};

export type CarbonIntensityApiPeriod = {
  from?: string;
  to?: string;
  intensity?: {
    forecast?: number | null;
    actual?: number | null;
    index?: string | null;
  };
};

export type CarbonIntensityApiResponse = {
  data?: CarbonIntensityApiPeriod[];
};
