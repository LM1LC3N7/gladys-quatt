// -----------------------------------------------------------------------------
// The answer of the CiC (GET /beta/feed/data.json) -> a plain object (pure).
// Ported from home-assistant-quatt (MIT, see THIRD_PARTY_NOTICES.md):
//   - the paths of the values (hp1 / hp2, boiler, thermostat, qc, flowMeter,
//     system.hostName as the identity of the CiC);
//   - the computed values of coordinator_local_cic.py: water delta, Quatt COP
//     (heat power / electrical power), defrost, the heat power of the boiler
//     from the flow and the conversion factors of water.
//
// The answer is untrusted: only own properties of plain objects are read
// (never a key of the prototype, nothing merged into another object), every
// number must be finite and within a plausible range, every flag a boolean.
// Anything else is "unknown" (null) and is not published.
// -----------------------------------------------------------------------------

import { CONVERSION_FACTORS, FAULT_MODES, HOSTNAME_PATTERN, MODES, RANGES } from '../constants.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** `node[key]` when it is an own property of a plain object, else undefined. */
export function own(node, key) {
  return isObject(node) && Object.hasOwn(node, key) ? node[key] : undefined;
}

/** A finite number within [min, max], else null. */
export function num(value, [min, max] = [-Infinity, Infinity]) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

/** A boolean (or 0 / 1, as some firmwares may send), else null. */
export function flag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

const temperature = (node, key) => num(own(node, key), RANGES.TEMPERATURE);
const power = (node, key) => num(own(node, key), RANGES.POWER);
const round2 = (value) => Math.round(value * 100) / 100;
const positive = (value) => (value === null ? null : Math.max(0, round2(value)) + 0);

/** The factor of the nearest tabulated temperature (5 to 80 °C). */
export function conversionFactor(celsius) {
  let best = CONVERSION_FACTORS[0];
  for (const entry of CONVERSION_FACTORS) {
    if (Math.abs(entry[0] - celsius) < Math.abs(best[0] - celsius)) best = entry;
  }
  return best[1];
}

/** Below this electrical power, a heat pump that is not heating is idle: no COP. */
export const COP_MIN_INPUT_W = 100;

/** Heat power / electrical power; null when the input is 0 or unknown. */
export function quattCop(heatPower, powerInput) {
  if (heatPower === null || powerInput === null || powerInput === 0) return null;
  const cop = round2(heatPower / powerInput);
  // A negative COP (defrost: heat taken from the water) is not a COP.
  return num(cop + 0, RANGES.COP);
}

/**
 * The COP worth publishing: only while the heat pumps heat (mode 2 or 3) or
 * draw more than 100 W; at standby (a few watts) the ratio means nothing.
 */
export function workingCop(heatPower, powerInput, mode) {
  const heating = [MODES.HEATPUMP_ONLY, MODES.HEATPUMP_PLUS_BOILER].includes(mode);
  if (!heating && !(powerInput > COP_MIN_INPUT_W)) return null;
  return quattCop(heatPower, powerInput);
}

const delta = (out, inlet) => (out === null || inlet === null ? null : round2(out - inlet));

function parseHeatpump(node, number, mode) {
  if (!isObject(node)) return null;
  const supplyTemperature = temperature(node, 'temperatureWaterOut');
  const returnTemperature = temperature(node, 'temperatureWaterIn');
  const powerInput = num(own(node, 'powerInput'), RANGES.POWER_INPUT);
  const heatPower = power(node, 'power');
  const waterDelta = delta(supplyTemperature, returnTemperature);
  // Defrost (coordinator_local_cic.computed_defrost): heating, yet heat is
  // taken from the water.
  const defrost =
    mode === null || heatPower === null || waterDelta === null
      ? null
      : [MODES.HEATPUMP_ONLY, MODES.HEATPUMP_PLUS_BOILER].includes(mode) &&
        heatPower < -1 &&
        waterDelta < -1;
  return {
    number,
    supplyTemperature,
    returnTemperature,
    outsideTemperature: temperature(node, 'temperatureOutside'),
    powerInput,
    heatPower,
    // Per heat pump, its own input decides: in a Duo, one unit may stand
    // still while the installation heats (the mode is the installation's).
    cop:
      powerInput !== null && powerInput > COP_MIN_INPUT_W ? quattCop(heatPower, powerInput) : null,
    defrost,
    silentMode: flag(own(node, 'silentModeStatus')),
    limitedByCop: flag(own(node, 'limitedByCop')),
    workingMode: num(own(node, 'getMainWorkingMode'), RANGES.CODE),
  };
}

function parseBoiler(node, { heatpumpOut, flowRate, flowTemperature }) {
  if (!isObject(node)) return null;
  // An OpenTherm boiler reports its own state; otherwise only what the CiC asks.
  const opentherm = flag(own(node, 'otFbChModeActive')) !== null;
  const active = flag(own(node, opentherm ? 'otTbCH' : 'oTtbTurnOnOffBoilerOn'));
  // computed_boiler_heat_power: the heat added between the heat pump and
  // the flow meter, when the boiler runs.
  let heatPower = null;
  if (active === false) heatPower = 0;
  else if (
    active === true &&
    heatpumpOut !== null &&
    flowRate !== null &&
    flowTemperature !== null
  ) {
    // Bounded like a reported power: absurd inputs give "unknown", not a value.
    heatPower = num(
      positive((flowTemperature - heatpumpOut) * flowRate * conversionFactor(flowTemperature)),
      RANGES.POWER,
    );
  }
  return {
    opentherm,
    heating: flag(own(node, 'otFbChModeActive')),
    hotWater: flag(own(node, 'otFbDhwActive')),
    flame: flag(own(node, 'otFbFlameOn')),
    cicHeating: flag(own(node, 'otTbCH')),
    cicOn: flag(own(node, 'oTtbTurnOnOffBoilerOn')),
    supplyTemperature: temperature(node, 'otFbSupplyOutletTemperature'),
    returnTemperature: temperature(node, 'otFbSupplyInletTemperature'),
    pressure: num(own(node, 'otFbWaterPressure'), RANGES.PRESSURE),
    heatPower,
  };
}

function parseThermostat(node) {
  if (!isObject(node)) return null;
  return {
    roomTemperature: temperature(node, 'otFtRoomTemperature'),
    roomSetpoint: temperature(node, 'otFtRoomSetpoint'),
    controlSetpoint: temperature(node, 'otFtControlSetpoint'),
    heatingDemand: flag(own(node, 'otFtChEnabled')),
    hotWaterDemand: flag(own(node, 'otFtDhwEnabled')),
    coolingDemand: flag(own(node, 'otFtCoolingEnabled')),
  };
}

const sum = (values) =>
  values.some((v) => v === null) ? null : round2(values.reduce((a, b) => a + b, 0));

/**
 * data.json -> { cicId, heatpumps, boiler, thermostat, system }; null when
 * the answer is not the feed of a CiC (no `system.hostName` of the form
 * `CIC-<uuid>`, or no heat pump 1).
 */
export function parseFeed(json) {
  if (!isObject(json)) return null;
  const hostName = own(own(json, 'system'), 'hostName');
  const match = typeof hostName === 'string' ? HOSTNAME_PATTERN.exec(hostName.trim()) : null;
  if (!match) return null;
  const qc = own(json, 'qc');
  const rawMode = own(qc, 'supervisoryControlMode');
  const mode = Number.isInteger(rawMode) ? num(rawMode, RANGES.CODE) : null;
  const heatpumps = [];
  for (const [number, key] of [
    [1, 'hp1'],
    [2, 'hp2'],
  ]) {
    const hp = parseHeatpump(own(json, key), number, mode);
    if (hp) heatpumps.push(hp);
  }
  if (!heatpumps.some((hp) => hp.number === 1)) return null;
  const last = heatpumps.at(-1);
  const flowRate = num(own(qc, 'flowRateFiltered'), RANGES.FLOW);
  const flowTemperature = temperature(own(json, 'flowMeter'), 'waterSupplyTemperature');
  // The totals are bounded too: two plausible values may add up to an absurd one.
  const powerInput = num(sum(heatpumps.map((hp) => hp.powerInput)), RANGES.POWER_INPUT);
  const heatPower = num(sum(heatpumps.map((hp) => hp.heatPower)), RANGES.POWER);
  return {
    cicId: match[1].toLowerCase(),
    heatpumps,
    boiler: parseBoiler(own(json, 'boiler'), {
      heatpumpOut: last.supplyTemperature,
      flowRate,
      flowTemperature,
    }),
    thermostat: parseThermostat(own(json, 'thermostat')),
    system: {
      mode,
      fault: mode === null ? null : FAULT_MODES.includes(mode),
      heatpumpHeating:
        mode === null ? null : [MODES.HEATPUMP_ONLY, MODES.HEATPUMP_PLUS_BOILER].includes(mode),
      boilerHeating:
        mode === null ? null : [MODES.HEATPUMP_PLUS_BOILER, MODES.BOILER_ONLY].includes(mode),
      flowRate,
      supplyTemperature: flowTemperature,
      outsideTemperature: heatpumps[0].outsideTemperature,
      powerInput,
      heatPower,
      cop: workingCop(heatPower, powerInput, mode),
    },
  };
}

/** The text of an answer as JSON; null when not JSON. */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
