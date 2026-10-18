// -----------------------------------------------------------------------------
// The feed of the CiC -> plain objects, and the values computed as
// home-assistant-quatt computes them (coordinator_local_cic.py).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversionFactor, parseFeed, parseJson, quattCop } from '../src/quatt/parse.js';
import { UUID, duoAllElectricFeed, hybridFeed } from './helpers/fakeCic.js';

test('a hybrid installation: heat pump, boiler, thermostat, system', () => {
  const feed = parseFeed(hybridFeed());
  assert.equal(feed.cicId, UUID);
  assert.equal(feed.heatpumps.length, 1);
  assert.deepEqual(feed.heatpumps[0], {
    number: 1,
    supplyTemperature: 35.4,
    returnTemperature: 30.1,
    outsideTemperature: 7.5,
    powerInput: 1050,
    heatPower: 4200,
    cop: 4,
    defrost: false,
    silentMode: false,
    limitedByCop: false,
    workingMode: 1,
  });
  assert.deepEqual(feed.system, {
    mode: 2,
    fault: false,
    heatpumpHeating: true,
    boilerHeating: false,
    flowRate: 690,
    supplyTemperature: 35.1,
    outsideTemperature: 7.5,
    powerInput: 1050,
    heatPower: 4200,
    cop: 4,
  });
  assert.equal(feed.boiler.opentherm, true);
  assert.equal(feed.boiler.heatPower, 0, 'boiler off: no heat');
  assert.equal(feed.boiler.pressure, 1.6);
  assert.equal(feed.boiler.supplyTemperature, 31.2);
  assert.equal(feed.boiler.returnTemperature, 30.5);
  assert.deepEqual(feed.thermostat, {
    roomTemperature: 19.8,
    roomSetpoint: 20.5,
    controlSetpoint: 36,
    heatingDemand: true,
    hotWaterDemand: false,
    coolingDemand: false,
  });
});

test('the heat power of the boiler: (flow meter - heat pump out) × flow × k, never negative', () => {
  const json = hybridFeed({ mode: 3 });
  json.boiler.otTbCH = true;
  json.flowMeter.waterSupplyTemperature = 45;
  const feed = parseFeed(json);
  // (45 - 35.4) × 690 × 1.157859 (the factor at 45 °C)
  assert.equal(feed.boiler.heatPower, 7669.66);
  assert.equal(feed.system.boilerHeating, true);
  assert.equal(feed.system.heatpumpHeating, true);
  json.flowMeter.waterSupplyTemperature = 30;
  assert.equal(parseFeed(json).boiler.heatPower, 0);
  json.qc.flowRateFiltered = null;
  assert.equal(parseFeed(json).boiler.heatPower, null, 'unknown flow: unknown power');
});

test('a boiler without OpenTherm: its on/off from the CiC decides', () => {
  const json = hybridFeed();
  json.boiler = { oTtbTurnOnOffBoilerOn: true, otTbCH: false };
  json.flowMeter.waterSupplyTemperature = 40.4;
  const feed = parseFeed(json);
  assert.equal(feed.boiler.opentherm, false);
  assert.equal(feed.boiler.cicOn, true);
  assert.equal(feed.boiler.heating, null, 'not reported: unknown');
  assert.ok(feed.boiler.heatPower > 0);
});

test('the duo all-electric fixture of home-assistant-quatt', () => {
  const feed = parseFeed(duoAllElectricFeed());
  assert.equal(feed.heatpumps.length, 2);
  assert.equal(feed.boiler, null);
  assert.equal(feed.system.powerInput, 10.3);
  assert.equal(feed.system.heatPower, 0);
  assert.equal(feed.system.cop, 0);
  assert.equal(Object.is(feed.system.cop, -0), false);
  assert.equal(feed.system.fault, false);
  assert.equal(feed.heatpumps[1].supplyTemperature, 21.52);
  assert.equal(feed.thermostat.roomSetpoint, 5);
});

test('faults: mode 99 and 400 only', () => {
  for (const [mode, fault] of [
    [0, false],
    [2, false],
    [95, false],
    [99, true],
    [150, false],
    [400, true],
  ]) {
    assert.equal(parseFeed(hybridFeed({ mode })).system.fault, fault, `mode ${mode}`);
  }
  const json = hybridFeed();
  json.qc.supervisoryControlMode = '2';
  assert.equal(parseFeed(json).system.mode, null, 'a string is not a mode');
  assert.equal(parseFeed(json).system.fault, null);
});

test('defrost: heating, heat taken from the water', () => {
  const json = hybridFeed();
  json.hp1.power = -800;
  json.hp1.temperatureWaterOut = 25;
  json.hp1.temperatureWaterIn = 28;
  const hp = parseFeed(json).heatpumps[0];
  assert.equal(hp.defrost, true);
  assert.equal(hp.cop, null, 'a negative COP is not published');
});

test('COP: none without electrical power; the factors of water', () => {
  assert.equal(quattCop(100, 0), null);
  assert.equal(quattCop(null, 100), null);
  assert.equal(quattCop(450, 100), 4.5);
  assert.equal(conversionFactor(-10), 1.166667);
  assert.equal(conversionFactor(47), 1.157859);
  assert.equal(conversionFactor(200), 1.153528);
});

test('not the feed of a CiC: null', () => {
  assert.equal(parseFeed(null), null);
  assert.equal(parseFeed([]), null);
  assert.equal(parseFeed({}), null);
  const wrongName = hybridFeed();
  wrongName.system.hostName = 'quatt-cic';
  assert.equal(parseFeed(wrongName), null);
  const noHeatpump = hybridFeed();
  noHeatpump.hp1 = null;
  assert.equal(parseFeed(noHeatpump), null);
  assert.equal(parseJson('<html>'), null);
});

test('hostile values: wrong types and out of range are unknown, never published', () => {
  const json = hybridFeed();
  json.hp1.temperatureWaterOut = '35.4';
  json.hp1.temperatureWaterIn = 1e9;
  json.hp1.silentModeStatus = 'yes';
  json.hp1.limitedByCop = 1;
  json.thermostat = [1, 2];
  json.boiler = 'on';
  const feed = parseFeed(json);
  const hp = feed.heatpumps[0];
  assert.equal(hp.supplyTemperature, null);
  assert.equal(hp.returnTemperature, null);
  assert.equal(hp.silentMode, null);
  assert.equal(hp.limitedByCop, true, '0 / 1 are flags');
  assert.equal(feed.thermostat, null);
  assert.equal(feed.boiler, null);
});

test('no prototype key is read, nothing is polluted', () => {
  const text = JSON.stringify(hybridFeed()).replace(
    '"system":',
    '"__proto__":{"polluted":true,"hostName":"x"},"constructor":{"prototype":{"polluted":true}},"system":',
  );
  const feed = parseFeed(parseJson(text));
  assert.equal(feed.cicId, UUID);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  // The identity is never taken from the prototype chain.
  const inherited = parseJson(`{"__proto__":{"system":{"hostName":"CIC-${UUID}"}},"hp1":{}}`);
  assert.equal(parseFeed(inherited), null);
  const hp = parseJson(
    JSON.stringify(hybridFeed()).replace('"hp1":{', '"hp1":{"__proto__":{"power":99},'),
  );
  assert.equal(parseFeed(hp).heatpumps[0].heatPower, 4200);
});
