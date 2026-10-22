export const CHARGING_SPEEDS = ["ac", "dc"] as const;
export type ChargingSpeed = (typeof CHARGING_SPEEDS)[number];

export const CHARGING_LOCATIONS = ["home", "public"] as const;
export type ChargingLocation = (typeof CHARGING_LOCATIONS)[number];

export type EvFallbackTariff = {
  pencePerKwh: number;
  source_url: string;
  verified_on: string;
  note: string;
};

export type EvNetworkTariff = {
  id: string;
  network: string;
  speed: ChargingSpeed;
  pencePerKwh: number;
  source_url: string;
  verified_on: string;
};

export type EvNetworkTable = {
  verified_on: string;
  note: string;
  fallbacks: {
    home: EvFallbackTariff;
    public: EvFallbackTariff;
  };
  networks: EvNetworkTariff[];
};

export type ResolvedEvPrice = {
  pence: number;
  source: "user-tariff" | "network-table" | "hardcoded-fallback";
  observedAt: string;
  charging: "acHome" | "dcRapid";
  reason: string;
  warning?: {
    code: string;
    message: string;
    severity: "info" | "warning" | "blocking";
  };
};
