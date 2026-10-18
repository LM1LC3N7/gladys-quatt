// -----------------------------------------------------------------------------
// Gladys devices (pure).
//
//   cic          `ext:<selector>:cic:<uuid>`          the installation: status,
//                fault, flow, supply and outside temperatures, total powers, COP
//   heatpump     `ext:<selector>:heatpump:<uuid>-<n>` one per outdoor unit (1, 2)
//   boiler       `ext:<selector>:boiler:<uuid>`       hybrid installations only
//   thermostat   `ext:<selector>:thermostat:<uuid>`   the OpenTherm thermostat
//
// The uuid is that of the CiC (`system.hostName` = `CIC-<uuid>`), stable for
// an installation whatever its IP address.
//
// Read only, every feature: never a `switch` (the core hands every switch to
// the voice assistants, MCP and the "turn everything off" scene actions), and
// the room setpoint is a temperature reading, not a thermostat command.
// Never an energy index: the local API has no counter (TODO.md, "Decisions").
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import {
  BOILER_FEATURES as BF,
  DEVICE_TYPES,
  HEATPUMP_FEATURES as HF,
  LIMITS,
  RANGES,
  SYSTEM_FEATURES as SF,
  THERMOSTAT_FEATURES as TF,
  UUID_PATTERN,
} from './constants.js';
import { texts } from './i18n.js';

const readOnly = (extra) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});
const binary = () => readOnly({ category: C.UNKNOWN, type: T.SENSOR.BINARY, min: 0, max: 1 });
/**
 * A water or outdoor temperature is a `probe` (not the air around the
 * device): the core keeps it out of the temperature of the room the device
 * is in. Only the room temperature of the thermostat is `decimal`.
 */
const temperature = (type = T.TEMPERATURE_SENSOR.PROBE) =>
  readOnly({
    category: C.TEMPERATURE_SENSOR,
    type,
    unit: U.CELSIUS,
    min: RANGES.TEMPERATURE[0],
    max: RANGES.TEMPERATURE[1],
  });
const power = ([min, max] = RANGES.POWER) =>
  readOnly({
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    min,
    max,
  });
/** No unit the core lists fits a COP or a flow in l/h: a plain decimal. */
const decimal = ([min, max]) => readOnly({ category: C.UNKNOWN, type: T.SENSOR.DECIMAL, min, max });
const integer = ([min, max]) => readOnly({ category: C.UNKNOWN, type: T.SENSOR.INTEGER, min, max });
const words = () =>
  readOnly({ category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, keep_history: false });

/** The features of each device type, in display order. */
export const FEATURE_SPECS = Object.freeze({
  [DEVICE_TYPES.SYSTEM]: [
    [SF.STATUS, words()],
    [SF.MODE_CODE, integer(RANGES.CODE)],
    [SF.FAULT, binary()],
    [SF.FAULT_TEXT, words()],
    [SF.HEATPUMP_HEATING, binary()],
    [SF.BOILER_HEATING, binary()],
    [SF.FLOW_RATE, decimal(RANGES.FLOW)],
    [SF.SUPPLY_TEMPERATURE, temperature()],
    [SF.OUTSIDE_TEMPERATURE, temperature()],
    [SF.POWER_INPUT, power(RANGES.POWER_INPUT)],
    [SF.HEAT_POWER, power()],
    [SF.COP, decimal(RANGES.COP)],
  ],
  [DEVICE_TYPES.HEATPUMP]: [
    [HF.SUPPLY_TEMPERATURE, temperature()],
    [HF.RETURN_TEMPERATURE, temperature()],
    [HF.OUTSIDE_TEMPERATURE, temperature()],
    [HF.POWER_INPUT, power(RANGES.POWER_INPUT)],
    [HF.HEAT_POWER, power()],
    [HF.COP, decimal(RANGES.COP)],
    [HF.DEFROST, binary()],
    [HF.SILENT_MODE, binary()],
    [HF.LIMITED_BY_COP, binary()],
    [HF.WORKING_MODE, integer(RANGES.CODE)],
  ],
  [DEVICE_TYPES.BOILER]: [
    [BF.HEATING, binary()],
    [BF.HOT_WATER, binary()],
    [BF.FLAME, binary()],
    [BF.CIC_HEATING, binary()],
    [BF.CIC_ON, binary()],
    [BF.SUPPLY_TEMPERATURE, temperature()],
    [BF.RETURN_TEMPERATURE, temperature()],
    [
      BF.PRESSURE,
      readOnly({
        category: C.PRESSURE_SENSOR,
        type: T.SENSOR.DECIMAL,
        unit: U.BAR,
        min: RANGES.PRESSURE[0],
        max: RANGES.PRESSURE[1],
      }),
    ],
    [BF.HEAT_POWER, power()],
  ],
  [DEVICE_TYPES.THERMOSTAT]: [
    [TF.ROOM_TEMPERATURE, temperature(T.SENSOR.DECIMAL)],
    [TF.ROOM_SETPOINT, temperature()],
    [TF.CONTROL_SETPOINT, temperature()],
    [TF.HEATING_DEMAND, binary()],
    [TF.HOT_WATER_DEMAND, binary()],
    [TF.COOLING_DEMAND, binary()],
  ],
});

const NAME_GROUP = {
  [DEVICE_TYPES.SYSTEM]: 'system',
  [DEVICE_TYPES.HEATPUMP]: 'heatpump',
  [DEVICE_TYPES.BOILER]: 'boiler',
  [DEVICE_TYPES.THERMOSTAT]: 'thermostat',
};

const MODELS = {
  [DEVICE_TYPES.SYSTEM]: 'Quatt CiC',
  [DEVICE_TYPES.HEATPUMP]: 'Quatt heat pump',
  [DEVICE_TYPES.BOILER]: 'Boiler (through the Quatt CiC)',
  [DEVICE_TYPES.THERMOSTAT]: 'OpenTherm thermostat (through the Quatt CiC)',
};

/** The platform id of a device: the CiC uuid, `-<n>` for a heat pump. */
export const platformIdOf = (type, cicId, number) =>
  type === DEVICE_TYPES.HEATPUMP ? `${cicId}-${number}` : cicId;

export const idsOf = (gladys, type, cicId, number) =>
  gladys.externalIds(type, platformIdOf(type, cicId, number));

/** The fields of a feature Gladys needs for Discovery (a created one has more). */
const FEATURE_FIELDS = [
  'name',
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'read_only',
  'has_feedback',
  'keep_history',
];
const pickFeature = (feature) =>
  Object.fromEntries(
    FEATURE_FIELDS.filter((key) => Object.hasOwn(feature, key) && feature[key] !== undefined).map(
      (key) => [key, feature[key]],
    ),
  );

/**
 * A device of `type` (number: the heat pump). `created`: the same device as
 * Gladys holds it, if the user created it: every feature it has that this
 * version does not build is kept, so publishing it again never removes a
 * feature (the core would mark the device "structure changed", and updating
 * it would drop the history).
 */
export function buildDevice(gladys, type, cicId, { number, language, created } = {}) {
  const ids = idsOf(gladys, type, cicId, number);
  const t = texts(language);
  const group = NAME_GROUP[type];
  const features = FEATURE_SPECS[type].map(([key, spec]) => ({
    name: t.features[group][key],
    external_id: ids.feature(key),
    ...spec,
  }));
  const known = new Set(features.map((f) => f.external_id));
  for (const feature of created?.features ?? []) {
    if (typeof feature?.external_id !== 'string' || known.has(feature.external_id)) continue;
    known.add(feature.external_id);
    features.push(pickFeature(feature));
  }
  const name = type === DEVICE_TYPES.HEATPUMP ? t.devices.heatpump(number) : t.devices[group];
  return {
    name,
    external_id: ids.device,
    model: MODELS[type],
    should_poll: false,
    features,
  };
}

/**
 * What a device or feature external id of this integration designates:
 * { type, cicId, number, feature } (number: heat pumps only) | null.
 */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') return null;
  for (const type of Object.values(DEVICE_TYPES)) {
    const prefix = gladys.externalId(`${type}:`);
    if (!externalId.startsWith(prefix)) continue;
    const [platformId, feature, ...rest] = externalId.slice(prefix.length).split(':');
    if (rest.length > 0 || feature === '') return null;
    if (type === DEVICE_TYPES.HEATPUMP) {
      const match = /^(.+)-(\d)$/.exec(platformId ?? '');
      if (!match || !UUID_PATTERN.test(match[1])) return null;
      const number = Number(match[2]);
      if (!LIMITS.HEATPUMPS.includes(number)) return null;
      return { type, cicId: match[1], number, feature: feature ?? null };
    }
    if (!UUID_PATTERN.test(platformId ?? '')) return null;
    return { type, cicId: platformId, number: null, feature: feature ?? null };
  }
  return null;
}

/** The created devices of this integration: [{ type, cicId, number, externalId, device }]. */
export function createdDevices(gladys, devices = gladys.devices) {
  const list = [];
  for (const device of devices ?? []) {
    const parsed = parseExternalId(gladys, device?.external_id);
    if (!parsed || parsed.feature !== null) continue;
    list.push({ ...parsed, externalId: device.external_id, device });
  }
  return list;
}
