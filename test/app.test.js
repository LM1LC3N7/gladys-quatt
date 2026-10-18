// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and the fake CiC, through the
// exact wiring of the container (src/handlers.js).
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { QuattApp } from '../src/app.js';
import { ACTIONS, DEVICE_TYPES, INTERVALS } from '../src/constants.js';
import { buildDevice } from '../src/devices.js';
import { registerHandlers } from '../src/handlers.js';
import { memoryStore } from '../src/store.js';
import {
  OTHER_UUID,
  UUID,
  createFakeCic,
  duoAllElectricFeed,
  hybridFeed,
} from './helpers/fakeCic.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const T0 = Date.parse('2026-10-18T08:00:00Z');
const SELECTOR = 'quatt';
const ids = createFakeGladys({ selector: SELECTOR });
const device = (type, number, uuid = UUID) =>
  buildDevice(ids, type, uuid, { number, language: 'fr' });
const system = () => device(DEVICE_TYPES.SYSTEM);
const hp = (number = 1) => device(DEVICE_TYPES.HEATPUMP, number);
const boiler = () => device(DEVICE_TYPES.BOILER);
const thermostat = () => device(DEVICE_TYPES.THERMOSTAT);
const feature = (d, key) => d.features.find((f) => f.external_id.endsWith(`:${key}`));
const BASE_CONFIG = { host: '192.168.1.30' };

let running;
afterEach(async () => {
  await running?.stop();
  running = undefined;
});

async function setup({
  config = {},
  created = [system(), hp(), boiler(), thermostat()],
  cic,
  store = memoryStore(),
  clock = { now: T0 },
} = {}) {
  cic ??= createFakeCic();
  const gladys = createFakeGladys({
    selector: SELECTOR,
    config: { ...BASE_CONFIG, ...config },
    devices: created,
  });
  const timers = createFakeTimers();
  const logs = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args) => logs.push(`${level} ${args.map((a) => a?.stack ?? String(a)).join(' ')}`),
    ]),
  );
  const app = new QuattApp({
    gladys,
    logger,
    request: cic.request,
    now: () => clock.now,
    timers,
    store,
  });
  running = app;
  registerHandlers(gladys, app, logger);
  await gladys.connect();
  return { gladys, cic, timers, clock, logs, app, store };
}

const state = (gladys, d, key) => gladys.fake.lastState(feature(d, key).external_id);
const badge = (gladys, d) =>
  gladys.fake.transports.filter((t) => t.device_external_id === d.external_id).at(-1)?.transport;
const poll = (timers) => timers.run((ms) => ms === INTERVALS.POLL_MS);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await tick();
};

test('start: Discovery, states, badges, status of a hybrid installation', async () => {
  const { gladys, timers, cic } = await setup();
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: true,
    message: {
      en: 'The CiC answers: 1 heat pump, a boiler and a thermostat.',
      fr: 'Le CiC répond : 1 pompe à chaleur, une chaudière et un thermostat.',
    },
  });
  assert.deepEqual(
    cic.requests.map((r) => [r.path, r.port]),
    [['/beta/feed/data.json', '8080']],
  );
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => [d.external_id, d.name]),
    [
      [`ext:${SELECTOR}:cic:${UUID}`, 'Installation Quatt'],
      [`ext:${SELECTOR}:heatpump:${UUID}-1`, 'Pompe à chaleur Quatt 1'],
      [`ext:${SELECTOR}:boiler:${UUID}`, 'Chaudière (Quatt)'],
      [`ext:${SELECTOR}:thermostat:${UUID}`, 'Thermostat (Quatt)'],
    ],
  );
  assert.equal(state(gladys, system(), 'status'), 'Chauffage - pompe à chaleur seule');
  assert.equal(state(gladys, system(), 'mode_code'), 2);
  assert.equal(state(gladys, system(), 'fault'), 0);
  assert.equal(state(gladys, system(), 'fault_text'), 'Aucun défaut');
  assert.equal(state(gladys, system(), 'heatpump_heating'), 1);
  assert.equal(state(gladys, system(), 'flow_rate'), 690);
  assert.equal(state(gladys, system(), 'cop'), 4);
  assert.equal(state(gladys, hp(), 'supply_temperature'), 35.4);
  assert.equal(state(gladys, hp(), 'return_temperature'), 30.1);
  assert.equal(state(gladys, hp(), 'outside_temperature'), 7.5);
  assert.equal(state(gladys, hp(), 'power_input'), 1050);
  assert.equal(state(gladys, hp(), 'heat_power'), 4200);
  assert.equal(state(gladys, boiler(), 'flame'), 0);
  assert.equal(state(gladys, boiler(), 'pressure'), 1.6);
  assert.equal(state(gladys, thermostat(), 'room_temperature'), 19.8);
  assert.equal(state(gladys, thermostat(), 'room_setpoint'), 20.5);
  for (const d of [system(), hp(), boiler(), thermostat()]) assert.equal(badge(gladys, d), 'local');
  assert.deepEqual(timers.delays(), [INTERVALS.POLL_MS]);
});

test('English devices; a duo all-electric installation: two heat pumps, no boiler', async () => {
  const cic = createFakeCic();
  cic.feed = duoAllElectricFeed();
  const { gladys } = await setup({
    cic,
    config: { language: 'en' },
    created: [system(), hp(1), hp(2), boiler()],
  });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Quatt installation', 'Quatt heat pump 1', 'Quatt heat pump 2', 'Thermostat (Quatt)'],
  );
  assert.equal(state(gladys, hp(2), 'supply_temperature'), 21.52);
  assert.equal(state(gladys, system(), 'power_input'), 10.3);
  assert.equal(state(gladys, system(), 'status'), 'Standby');
  assert.equal(badge(gladys, boiler()), 'unreachable', 'no boiler in the feed');
  assert.match(gladys.fake.connectionStatus.message.en, /2 heat pumps and a thermostat/);
});

test('a fault: binary and text; the states follow the CiC', async () => {
  const { gladys, cic, timers } = await setup();
  cic.feed = hybridFeed({ mode: 99 });
  await poll(timers);
  assert.equal(state(gladys, system(), 'fault'), 1);
  assert.equal(
    state(gladys, system(), 'fault_text'),
    'Défaut - pompe de circulation en marche (99)',
  );
  assert.equal(state(gladys, system(), 'heatpump_heating'), 0);
  cic.feed = hybridFeed({ mode: 150 });
  await poll(timers);
  assert.equal(state(gladys, system(), 'status'), 'Mise en service (code 150)');
  assert.equal(state(gladys, system(), 'fault'), 0);
});

test('an unknown value is not published (never a 0 in its place)', async () => {
  const { gladys, cic, timers } = await setup();
  const json = hybridFeed();
  json.hp1.power = null;
  json.thermostat.otFtRoomTemperature = 'n/a';
  cic.feed = json;
  const before = gladys.fake.states.length;
  await poll(timers);
  const ids = gladys.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.ok(!ids.includes(feature(hp(), 'heat_power').external_id));
  assert.ok(!ids.includes(feature(thermostat(), 'room_temperature').external_id));
  assert.equal(state(gladys, hp(), 'heat_power'), 4200, 'the last known value stays');
});

test('CiC unreachable: every device unreachable, retried 30 s then slower, never faster', async () => {
  const { gladys, cic, timers } = await setup();
  cic.unreachable = true;
  await poll(timers);
  for (const d of [system(), hp(), boiler(), thermostat()]) {
    assert.equal(badge(gladys, d), 'unreachable');
  }
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer: no connection/);
  assert.deepEqual(timers.delays(), [INTERVALS.RETRY_MIN_MS]);
  await timers.run();
  assert.deepEqual(timers.delays(), [60_000]);
  await timers.run();
  assert.deepEqual(timers.delays(), [120_000]);
  for (let i = 0; i < 6; i += 1) await timers.run();
  assert.deepEqual(timers.delays(), [INTERVALS.RETRY_MAX_MS], 'one timer, no loop');
  const sent = cic.requests.length;
  cic.unreachable = false;
  await timers.run();
  assert.equal(cic.requests.length, sent + 1);
  assert.equal(badge(gladys, system()), 'local');
  assert.deepEqual(timers.delays(), [INTERVALS.POLL_MS]);
});

test('not a CiC, HTTP 404: clear status, retried at the slow pace', async () => {
  const { gladys, cic, timers } = await setup();
  cic.failures.push({ status: 404 });
  await poll(timers);
  assert.match(gladys.fake.connectionStatus.message.en, /HTTP 404/);
  assert.deepEqual(timers.delays(), [INTERVALS.RETRY_MIN_MS]);
  cic.failures.push({ status: 200, body: '{"system":{"hostName":"router"}}' });
  await timers.run();
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer like a Quatt CiC/);
});

test('HTTP 429: every path pauses (1 min at least), kept in /data, lifted by the user', async () => {
  const { gladys, cic, timers, store, clock } = await setup();
  cic.failures.push({ status: 429, headers: { 'retry-after': '5' } });
  await poll(timers);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  assert.deepEqual(timers.delays(), [INTERVALS.BUSY_MIN_MS]);
  assert.equal(store.saved().pausedUntil, T0 + INTERVALS.BUSY_MIN_MS);
  // The scan button does not read during the pause.
  const sent = cic.requests.length;
  await gladys.fake.scanRequest();
  assert.equal(cic.requests.length, sent);
  // A reconnection to Gladys keeps the pause.
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(cic.requests.length, sent);
  assert.ok(timers.delays()[0] <= INTERVALS.BUSY_MIN_MS);
  clock.now += 10_000;
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.equal(ack.success, true, ack.error);
  assert.equal(store.saved().pausedUntil, 0, 'lifted by the user');
});

test('a pause of an earlier run is kept after a restart, never past 6 h', async () => {
  const far = T0 + 48 * 3600_000;
  const { cic, timers, gladys } = await setup({ store: memoryStore({ pausedUntil: far }) });
  assert.equal(cic.requests.length, 0, 'nothing read during the pause');
  assert.deepEqual(timers.delays(), [INTERVALS.BUSY_MAX_MS]);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  const broken = { load: async () => Promise.reject(new Error('EACCES')), save: async () => {} };
  const again = await setup({ store: broken });
  assert.equal(again.cic.requests.length, 1, 'an unreadable store forgets the pause');
});

test('a reconnection to Gladys publishes everything again, without reading sooner', async () => {
  const { gladys, cic, timers } = await setup();
  const sent = cic.requests.length;
  const discovered = gladys.fake.discoveredDevices.length;
  const states = gladys.fake.states.length;
  const transports = gladys.fake.transports.length;
  await gladys.disconnect();
  assert.deepEqual(timers.delays(), [], 'the loop pauses while Gladys is away');
  await gladys.connect();
  assert.equal(cic.requests.length, sent, 'no reading before the interval');
  assert.ok(gladys.fake.discoveredDevices.length >= discovered);
  assert.ok(gladys.fake.states.length > states, 'states published again');
  assert.ok(gladys.fake.transports.length > transports, 'badges published again');
  assert.equal(gladys.fake.connectionStatus.connected, true, 'status published again');
  assert.equal(timers.delays().length, 1, 'the loop goes on');
  assert.ok(timers.delays()[0] <= INTERVALS.POLL_MS);
});

test('a reconnection while the CiC fails: unreachable again, no faster retry', async () => {
  const { gladys, cic, timers } = await setup();
  cic.unreachable = true;
  await poll(timers);
  await timers.run();
  const sent = cic.requests.length;
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(cic.requests.length, sent);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.ok(timers.delays()[0] <= 60_000);
});

test('no feature is ever lost: a created feature this version does not build is kept', async () => {
  const created = system();
  created.features.push({
    name: 'Old feature',
    external_id: `${created.external_id}:old_feature`,
    category: 'unknown',
    type: 'decimal',
    min: 0,
    max: 10,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    id: 'gladys-internal-id',
  });
  const { gladys } = await setup({ created: [created] });
  const published = gladys.fake.discoveredDevices.find(
    (d) => d.external_id === created.external_id,
  );
  const old = published.features.find((f) => f.external_id.endsWith(':old_feature'));
  assert.ok(old, 'kept');
  assert.equal(old.id, undefined, 'only the fields of Discovery');
  for (const f of created.features) {
    assert.ok(
      published.features.some((p) => p.external_id === f.external_id),
      f.external_id,
    );
  }
});

test('another CiC at the address: its own devices; the old ones unreachable', async () => {
  const { gladys, cic, timers } = await setup();
  cic.feed = hybridFeed({ uuid: OTHER_UUID });
  await poll(timers);
  assert.equal(badge(gladys, system()), 'unreachable');
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.external_id.includes(OTHER_UUID)));
});

test('every command is refused: read only, nothing sent', async () => {
  const { gladys, cic } = await setup();
  const sent = cic.requests.length;
  const ack = await gladys.fake.setValue(thermostat(), feature(thermostat(), 'room_setpoint'), 21);
  assert.equal(ack.success, false);
  assert.match(ack.error, /only reads/);
  assert.equal(cic.requests.length, sent);
});

test('invalid address: said, no timer, nothing sent', async () => {
  const { gladys, cic, timers } = await setup({ config: { host: 'https://192.168.1.30' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /without https/);
  assert.deepEqual(timers.delays(), []);
  assert.equal(cic.requests.length, 0);
  await gladys.fake.configUpdated({ host: '192.168.1.31:8080' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the test button: reads now and lists what the CiC reports', async () => {
  const { gladys, cic } = await setup();
  const sent = cic.requests.length;
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.equal(ack.success, true, ack.error);
  assert.equal(cic.requests.length, sent + 1);
  cic.unreachable = true;
  const failed = await gladys.fake.action(ACTIONS.TEST);
  assert.equal(failed.success, false);
  assert.match(failed.error ?? '', /does not answer/);
});

test('remote texts never reach the logs', async () => {
  const { cic, timers, logs } = await setup();
  cic.failures.push({ status: 502, body: '<html>remote text</html>' });
  await poll(timers);
  assert.ok(logs.some((l) => l.includes('HTTP 502')));
  assert.ok(!logs.join('\n').includes('remote text'));
});

test('a device updated in Gladys gets its states and badge again', async () => {
  const { gladys } = await setup();
  const before = gladys.fake.transports.length;
  await gladys.fake.deviceUpdated(hp());
  await settle();
  assert.ok(gladys.fake.transports.length > before, 'badge published again');
  assert.equal(badge(gladys, hp()), 'local');
});

test('the state budget: a cut rotates, no feature held back for ever', async () => {
  const { gladys, app, timers } = await setup();
  app.budget.remaining = () => 5;
  const seen = new Set();
  const from = gladys.fake.states.length;
  for (let i = 0; i < 12; i += 1) {
    app.gladys.forgetPublishedStates();
    await poll(timers);
  }
  for (const s of gladys.fake.states.slice(from)) seen.add(s.device_feature_external_id);
  assert.equal(seen.size, app.states().length);
});
