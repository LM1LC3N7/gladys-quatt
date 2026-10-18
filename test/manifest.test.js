// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here. The device
// tests freeze the external ids and the feature keys (stored by users).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEFAULTS, LANGUAGES } from '../src/config.js';
import { ACTIONS, DEVICE_TYPES } from '../src/constants.js';
import { FEATURE_SPECS, buildDevice, parseExternalId } from '../src/devices.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const handlers = read('src/handlers.js');
const dockerfile = read('Dockerfile');
const UUID = '12345678-1234-5678-1234-567812345678';

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) yield* texts(item, `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) yield* texts(value, `${path}.${key}`);
  }
}

const keys = (list) => (list ?? []).map((item) => item.key);
const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));

test('the store basics; version 0.1.0 set by hand everywhere', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.match(manifest.gladys_version, /^>=5\.1\.0$/);
  assert.equal(pkg.version, '0.1.0');
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-quatt:${manifest.version}`);
  assert.equal(pkg.name, 'gladys-quatt');
  assert.equal(lock.name, 'gladys-quatt');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['climate']);
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
});

test('the docs say: never tested with a real CiC, API not documented by Quatt, unofficial', () => {
  assert.match(fields.intro.description.en, /Unofficial integration, not affiliated with Quatt/);
  assert.match(fields.intro.description.fr, /non officielle, sans lien avec Quatt/);
  assert.match(fields.intro.description.en, /Never tested with a real CiC/);
  assert.match(fields.intro.description.fr, /Jamais testée avec un vrai CiC/);
  assert.match(fields.intro.description.en, /not documented by Quatt/);
  assert.match(fields.intro.description.fr, /pas documentée par Quatt/);
  const en = read('docs/en.md');
  const fr = read('docs/fr.md');
  assert.match(en, /never been tested with a real CiC/i);
  assert.match(fr, /jamais été testée avec un vrai CiC/i);
  assert.match(en, /not documented by Quatt/i);
  assert.match(fr, /pas documentée par Quatt/i);
  assert.match(read('README.md'), /Never tested with a real CiC/i);
});

test('the license and the notices ship in the image; no person named in LICENSE', () => {
  const license = read('LICENSE');
  assert.match(license, /Apache License\s+Version 2\.0/);
  assert.match(license, /Copyright \[yyyy\] \[name of copyright owner\]/, 'the standard text');
  const notices = read('THIRD_PARTY_NOTICES.md');
  assert.match(notices, /home-assistant-quatt[\s\S]*2\.1\.2[\s\S]*MIT License/);
  assert.match(notices, /Copyright \(c\) 2019 - 2023 {2}Marco Boers @marcoboers/);
  assert.match(dockerfile, /COPY[^\n]*LICENSE[^\n]*THIRD_PARTY_NOTICES\.md/);
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code', () => {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  assert.deepEqual(
    fields.language.options.map((o) => o.value),
    LANGUAGES,
  );
  assert.deepEqual(keys(manifest.config_schema), ['intro', 'host', 'language']);
  assert.equal(fields.host.required, true);
  assert.doesNotMatch(JSON.stringify(manifest), /chiffré|encrypted/i);
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined, section.key);
    assert.equal(section.default, undefined, section.key);
  }
});

test('the keys of the manifest are the keys of the code, all registered', () => {
  assert.deepEqual(keys(manifest.actions).sort(), Object.values(ACTIONS).sort());
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(handlers.includes(`onAction(ACTIONS.${name}`), name);
  }
  assert.ok(manifest.actions.every((a) => a.timeout_seconds >= 5 && a.timeout_seconds <= 120));
  assert.equal(manifest.scene_actions, undefined);
  assert.equal(manifest.scene_triggers, undefined);
  assert.equal(manifest.widgets, undefined);
  for (const handler of ['onScanRequest(', 'onSetValue(', 'onConfigUpdated(', 'onDeviceUpdated(']) {
    assert.ok(handlers.includes(handler), handler);
  }
});

// --- Devices ------------------------------------------------------------------

const gladys = createFakeGladys({ selector: 'quatt' });
const all = () => [
  buildDevice(gladys, DEVICE_TYPES.SYSTEM, UUID, { language: 'fr' }),
  buildDevice(gladys, DEVICE_TYPES.HEATPUMP, UUID, { number: 1, language: 'fr' }),
  buildDevice(gladys, DEVICE_TYPES.HEATPUMP, UUID, { number: 2, language: 'en' }),
  buildDevice(gladys, DEVICE_TYPES.BOILER, UUID, { language: 'fr' }),
  buildDevice(gladys, DEVICE_TYPES.THERMOSTAT, UUID, { language: 'en' }),
];

test('external ids and feature keys are frozen (stored in user devices and scenes)', () => {
  assert.deepEqual(
    all().map((d) => d.external_id),
    [
      `ext:quatt:cic:${UUID}`,
      `ext:quatt:heatpump:${UUID}-1`,
      `ext:quatt:heatpump:${UUID}-2`,
      `ext:quatt:boiler:${UUID}`,
      `ext:quatt:thermostat:${UUID}`,
    ],
  );
  const featureKeys = Object.fromEntries(
    Object.entries(FEATURE_SPECS).map(([type, specs]) => [type, specs.map(([key]) => key)]),
  );
  assert.deepEqual(featureKeys, {
    cic: [
      'status',
      'mode_code',
      'fault',
      'fault_text',
      'heatpump_heating',
      'boiler_heating',
      'flow_rate',
      'supply_temperature',
      'outside_temperature',
      'power_input',
      'heat_power',
      'cop',
    ],
    heatpump: [
      'supply_temperature',
      'return_temperature',
      'outside_temperature',
      'power_input',
      'heat_power',
      'cop',
      'defrost',
      'silent_mode',
      'limited_by_cop',
      'working_mode',
    ],
    boiler: [
      'heating',
      'hot_water',
      'flame',
      'cic_heating',
      'cic_on',
      'supply_temperature',
      'return_temperature',
      'pressure',
      'heat_power',
    ],
    thermostat: [
      'room_temperature',
      'room_setpoint',
      'control_setpoint',
      'heating_demand',
      'hot_water_demand',
      'cooling_demand',
    ],
  });
  for (const d of all()) {
    assert.deepEqual(parseExternalId(gladys, d.external_id)?.feature, null);
    for (const f of d.features) {
      assert.ok(parseExternalId(gladys, f.external_id)?.feature, f.external_id);
      assert.ok(f.name, f.external_id);
    }
  }
  assert.equal(parseExternalId(gladys, `ext:quatt:heatpump:${UUID}-3`), null);
  assert.equal(parseExternalId(gladys, 'ext:quatt:cic:not-a-uuid'), null);
  assert.equal(parseExternalId(gladys, `ext:other:cic:${UUID}`), null);
});

test('read only, every feature; never a switch; never an energy index', () => {
  for (const f of all().flatMap((d) => d.features)) {
    assert.equal(f.read_only, true, f.external_id);
    assert.notEqual(f.category, C.SWITCH, f.external_id);
    assert.notEqual(f.category, C.THERMOSTAT, f.external_id);
    assert.notEqual(f.category, C.WATER_HEATER, f.external_id);
    if (f.category === C.ENERGY_SENSOR) assert.equal(f.type, 'power', f.external_id);
  }
});

test('units: only those the core lists for the category (server/utils/constants.js)', () => {
  // DEVICE_FEATURE_UNITS_BY_CATEGORY of the core, for the categories used here.
  const allowed = {
    'temperature-sensor': ['celsius', 'fahrenheit', 'kelvin'],
    'pressure-sensor': ['pascal', 'hPa', 'kPa', 'bar', 'psi', 'milli-bar'],
    'energy-sensor': ['milli-ampere', 'ampere', 'milli-volt', 'volt', 'watt', 'kilowatt'],
  };
  for (const f of all().flatMap((d) => d.features)) {
    if (f.unit === undefined) {
      assert.ok(['unknown', 'text'].includes(f.category), `${f.external_id} needs a unit`);
      continue;
    }
    assert.ok(Object.values(DEVICE_FEATURE_UNITS).includes(f.unit));
    assert.ok(allowed[f.category]?.includes(f.unit), `${f.external_id}: ${f.unit}`);
  }
});
