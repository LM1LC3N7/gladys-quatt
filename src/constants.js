// -----------------------------------------------------------------------------
// Keys, limits and timings. The manifest keys and the external id shapes are
// stored in user devices and scenes: never rename them (test/manifest.test.js
// ties them to the manifest, test/devices.test.js to the feature keys).
// -----------------------------------------------------------------------------

export const ACTIONS = Object.freeze({
  TEST: 'test_connection',
});

/**
 * Device types of the external ids (`ext:<selector>:<type>:<platformId>`).
 * The platform id is the UUID of the CiC (its `system.hostName` without the
 * `CIC-` prefix, lower case): stable for an installation, whatever its IP.
 */
export const DEVICE_TYPES = Object.freeze({
  /** The installation as seen by the CiC: status, faults, flow, totals. */
  SYSTEM: 'cic',
  /** One per outdoor unit: `heatpump:<uuid>-<1|2>`. */
  HEATPUMP: 'heatpump',
  /** The boiler of a hybrid installation (absent on an all-electric one). */
  BOILER: 'boiler',
  /** The OpenTherm room thermostat wired to the CiC. */
  THERMOSTAT: 'thermostat',
});

export const SYSTEM_FEATURES = Object.freeze({
  STATUS: 'status',
  MODE_CODE: 'mode_code',
  FAULT: 'fault',
  FAULT_TEXT: 'fault_text',
  HEATPUMP_HEATING: 'heatpump_heating',
  BOILER_HEATING: 'boiler_heating',
  FLOW_RATE: 'flow_rate',
  SUPPLY_TEMPERATURE: 'supply_temperature',
  OUTSIDE_TEMPERATURE: 'outside_temperature',
  POWER_INPUT: 'power_input',
  HEAT_POWER: 'heat_power',
  COP: 'cop',
});

export const HEATPUMP_FEATURES = Object.freeze({
  SUPPLY_TEMPERATURE: 'supply_temperature',
  RETURN_TEMPERATURE: 'return_temperature',
  OUTSIDE_TEMPERATURE: 'outside_temperature',
  POWER_INPUT: 'power_input',
  HEAT_POWER: 'heat_power',
  COP: 'cop',
  DEFROST: 'defrost',
  SILENT_MODE: 'silent_mode',
  LIMITED_BY_COP: 'limited_by_cop',
  WORKING_MODE: 'working_mode',
});

export const BOILER_FEATURES = Object.freeze({
  HEATING: 'heating',
  HOT_WATER: 'hot_water',
  FLAME: 'flame',
  CIC_HEATING: 'cic_heating',
  CIC_ON: 'cic_on',
  SUPPLY_TEMPERATURE: 'supply_temperature',
  RETURN_TEMPERATURE: 'return_temperature',
  PRESSURE: 'pressure',
  HEAT_POWER: 'heat_power',
});

export const THERMOSTAT_FEATURES = Object.freeze({
  ROOM_TEMPERATURE: 'room_temperature',
  ROOM_SETPOINT: 'room_setpoint',
  CONTROL_SETPOINT: 'control_setpoint',
  HEATING_DEMAND: 'heating_demand',
  HOT_WATER_DEMAND: 'hot_water_demand',
  COOLING_DEMAND: 'cooling_demand',
});

/** `CIC-<uuid>` as the CiC names itself (system.hostName). */
export const HOSTNAME_PATTERN =
  /^CIC-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The local API of the CiC (home-assistant-quatt, api_local_cic.py). */
export const API = Object.freeze({
  PORT: 8080,
  PATH: '/beta/feed/data.json',
});

export const LIMITS = Object.freeze({
  /** POST /state admits 300 states per minute per integration: we keep under. */
  STATES_PER_MINUTE: 250,
  /** Up to two outdoor units (Quatt Duo). */
  HEATPUMPS: [1, 2],
});

/**
 * `qc.supervisoryControlMode` (home-assistant-quatt, const.py). 99 and 400
 * are the only fault states the local API gives.
 */
export const MODES = Object.freeze({
  STANDBY: 0,
  STANDBY_HEATING: 1,
  HEATPUMP_ONLY: 2,
  HEATPUMP_PLUS_BOILER: 3,
  BOILER_ONLY: 4,
  CHILL_CIRCULATION: 5,
  CHILL_COOLING: 6,
  STICKY_PUMP_PROTECTION: 95,
  ANTIFREEZE_BOILER_ON: 96,
  ANTIFREEZE_BOILER_PREPUMP: 97,
  ANTIFREEZE_WATER_CIRCULATION: 98,
  FAULT_CIRCULATION_PUMP: 99,
  INVALID_CONFIGURATION: 400,
});
export const FAULT_MODES = Object.freeze([
  MODES.FAULT_CIRCULATION_PUMP,
  MODES.INVALID_CONFIGURATION,
]);
/** Codes 100 to 399: commissioning (home-assistant-quatt). */
export const COMMISSIONING = Object.freeze({ MIN: 100, MAX: 399 });

/**
 * Conversion factors (Wh per litre and kelvin) of water at 2 bar, by 5 °C
 * steps: heat power = ΔT × flow (l/h) × k (home-assistant-quatt, const.py,
 * from the NIST Chemistry WebBook).
 */
export const CONVERSION_FACTORS = Object.freeze([
  [5, 1.166667],
  [10, 1.164444],
  [15, 1.162889],
  [20, 1.161111],
  [25, 1.157438],
  [30, 1.157753],
  [35, 1.157931],
  [40, 1.157964],
  [45, 1.157859],
  [50, 1.157617],
  [55, 1.157243],
  [60, 1.156742],
  [65, 1.156117],
  [70, 1.155369],
  [75, 1.154503],
  [80, 1.153528],
]);

/**
 * What a value must look like to be published (anything else is "unknown":
 * nothing published). Also the min / max of the features.
 */
export const RANGES = Object.freeze({
  TEMPERATURE: [-50, 150],
  /** Heat power: negative during a defrost (heat taken from the water). */
  POWER: [-50_000, 100_000],
  /** Electrical power drawn: never negative. */
  POWER_INPUT: [0, 100_000],
  COP: [0, 20],
  FLOW: [0, 20_000],
  PRESSURE: [0, 10],
  CODE: [0, 1000],
});

export const TIMEOUTS = Object.freeze({
  /** One request to the CiC (the reference library waits 20 s). */
  REQUEST: 10_000,
});

/** Size cap of an answer of the CiC (about 2 kB in practice). */
export const MAX_BYTES = 128 * 1024;

export const INTERVALS = Object.freeze({
  /** One reading of the CiC. */
  POLL_MS: 30_000,
  /** CiC unreachable: first retry (never faster than the reading). */
  RETRY_MIN_MS: 30_000,
  RETRY_MAX_MS: 10 * 60_000,
  /** HTTP 429: pause of every request, within these bounds (Retry-After if given). */
  BUSY_MIN_MS: 60_000,
  BUSY_MAX_MS: 6 * 3600_000,
  /** A stable value is published again after this long (dated recently in Gladys). */
  HEARTBEAT_MS: 30 * 60_000,
});

/** Where the 429 pause outlives a restart (the only writable volume). */
export const STATE_FILE = '/data/quatt-state.json';
