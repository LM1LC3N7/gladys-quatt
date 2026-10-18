// -----------------------------------------------------------------------------
// QuattApp: the integration. One Quatt CiC, read only.
//
//   start(config)  (re)connects: the CiC read, Discovery published, the
//                  reading loop started. The same configuration again (Gladys
//                  reconnected) only publishes everything again (status,
//                  Discovery, states, badges): the client and an HTTP 429
//                  pause stay, and the next reading keeps its planned time.
//   reading loop   every 30 s: GET /beta/feed/data.json. The CiC unreachable:
//                  every device unreachable, the next try 30 s to 10 min later
//                  (never faster than the reading); HTTP 429: a pause of 1 min
//                  to 6 h, kept in /data across a restart.
//   setValue       always refused: nothing is ever sent to the CiC but the
//                  reading.
//
// Each loop is one chain of timers: halt() bumps an epoch, and a run of an
// older epoch never schedules itself again.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { Budget } from './budget.js';
import { normalizeConfig } from './config.js';
import {
  BOILER_FEATURES as BF,
  DEVICE_TYPES,
  HEATPUMP_FEATURES as HF,
  INTERVALS,
  LIMITS,
  STATE_FILE,
  SYSTEM_FEATURES as SF,
  THERMOSTAT_FEATURES as TF,
} from './constants.js';
import { buildDevice, createdDevices, idsOf, parseExternalId } from './devices.js';
import { T, faultText, modeText } from './i18n.js';
import { CicClient } from './quatt/client.js';
import { CODES } from './quatt/errors.js';
import { httpRequest } from './quatt/http.js';
import { fileStore } from './store.js';

/** The "Test the connection" button waits 30 s: answer before. */
const TEST_BUDGET_MS = 25_000;
/** Entries per publishTransports call (the SDK refuses more). */
const TRANSPORTS_PER_CALL = 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const bit = (value) => (value === null ? null : value ? 1 : 0);

export class QuattApp {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {object} [options.logger]
   * @param {Function} [options.request] the HTTP transport (tests inject a fake CiC)
   * @param {() => number} [options.now]
   * @param {{ setTimeout: Function, clearTimeout: Function }} [options.timers]
   * @param {{ load: Function, save: Function }} [options.store] where the 429 pause is kept
   */
  constructor({
    gladys,
    logger = createLogger({ name: 'quatt' }),
    request = httpRequest,
    now = Date.now,
    timers = globalThis,
    store = fileStore(STATE_FILE),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.request = request;
    this.now = now;
    this.timers = timers;
    this.store = store;
    this.budget = new Budget({ perMinute: LIMITS.STATES_PER_MINUTE, now });
    this.budgetCursor = 0;
    this.rawConfig = {};
    this.config = normalizeConfig();
    this.configKey = null;
    this.client = null;
    this.generation = 0;
    this.epoch = 0;
    this.handles = new Set();
    this.queue = Promise.resolve();
    this.lastStatus = null;
    this.pausedUntil = 0;
    this.storeLoaded = false;
    this.reset();
  }

  reset() {
    this.online = false;
    this.retryDelay = INTERVALS.RETRY_MIN_MS;
    /** No reading starts before this time (the interval, or the retry delay). */
    this.nextReadAt = 0;
    /** The last feed read (src/quatt/parse.js), kept while the CiC fails (devices unreachable). */
    this.feed = null;
    this.discoveredKey = null;
    this.transports = new Map();
  }

  // --- Lifecycle -------------------------------------------------------------

  /** Run `task` after every start already queued. */
  enqueue(task) {
    const run = this.queue.then(task);
    this.queue = run.catch(() => {});
    return run;
  }

  /**
   * (Re)start with a configuration. Calls are serialized. `force`: the user
   * asked (button, saved configuration): an HTTP 429 pause is lifted.
   */
  start(rawConfig, { force = false } = {}) {
    return this.enqueue(() => this.run(rawConfig, { force }));
  }

  async stop() {
    this.generation += 1;
    this.halt();
    this.dropClient();
  }

  /** Gladys went away: the loop stops, everything else (client, pause) stays. */
  pause() {
    this.halt();
  }

  /** Clear every timer; the runs still in flight will not schedule again. */
  halt() {
    this.epoch += 1;
    for (const handle of this.handles) this.timers.clearTimeout(handle);
    this.handles.clear();
  }

  dropClient() {
    this.client?.close();
    this.client = null;
  }

  /** The pause of an earlier run of the container, once (bounded: never past 6 h from now). */
  async loadStore() {
    if (this.storeLoaded) return;
    this.storeLoaded = true;
    const saved = await this.store.load().catch(() => ({}));
    const until = Number(saved?.pausedUntil);
    if (Number.isFinite(until) && until > this.now()) {
      this.pausedUntil = Math.max(
        this.pausedUntil,
        Math.min(until, this.now() + INTERVALS.BUSY_MAX_MS),
      );
    }
  }

  async savePause() {
    try {
      await this.store.save({ pausedUntil: this.pausedUntil });
    } catch (err) {
      this.logger.warn(`Pause not saved: ${err?.code ?? 'error'}`);
    }
  }

  async run(rawConfig, { force = false } = {}) {
    await this.loadStore();
    const config = normalizeConfig(rawConfig);
    const key = JSON.stringify(config);
    if (!force && this.client && key === this.configKey) {
      await this.resume();
      return;
    }
    this.halt();
    this.dropClient();
    const generation = ++this.generation;
    this.rawConfig = rawConfig ?? {};
    this.config = config;
    this.configKey = key;
    this.reset();
    this.lastStatus = null;
    this.gladys.forgetPublishedStates?.();

    if (config.hostError) {
      await this.setStatus(
        false,
        { empty: T.status.hostEmpty, https: T.status.hostHttps }[config.hostError] ??
          T.status.hostInvalid,
      );
      return;
    }
    if (force && this.pausedUntil > 0) {
      this.pausedUntil = 0;
      await this.savePause();
    }
    this.client = new CicClient({ origin: config.cic.origin, request: this.request });
    this.logger.info(`Using the CiC at ${config.cic.origin}`);
    if (this.paused()) {
      const delay = this.pausedUntil - this.now();
      this.nextReadAt = this.pausedUntil;
      await this.setStatus(false, T.status.busy(delay));
      this.scheduleRead(delay, generation);
      return;
    }
    await this.read(generation, this.epoch, { publish: true });
  }

  /**
   * Gladys reconnected with the same configuration: everything is published
   * again (Gladys keeps the status and Discovery in memory only), the
   * reading loop goes on where it was.
   */
  async resume() {
    this.halt();
    const generation = this.generation;
    const status = this.lastStatus ? JSON.parse(this.lastStatus) : null;
    this.lastStatus = null;
    this.transports.clear();
    this.discoveredKey = null;
    this.gladys.forgetPublishedStates?.();
    // A pause in progress: the time left is recomputed (the saved status
    // would still say the delay of the moment the pause began).
    if (this.client && this.paused()) {
      await this.setStatus(false, T.status.busy(this.pausedUntil - this.now()));
    } else if (status) await this.setStatus(status[0], status[1]);
    if (this.feed) await this.publishDiscovered();
    if (this.online) await this.publishStates();
    await this.publishTransports();
    if (this.client) {
      const wait = Math.max(this.nextReadAt, this.pausedUntil) - this.now();
      this.scheduleRead(Math.max(0, wait), generation);
    }
  }

  schedule(delay, task) {
    const handle = this.timers.setTimeout(async () => {
      this.handles.delete(handle);
      try {
        await task();
      } catch (err) {
        this.logger.error('Loop failed', err);
      }
    }, delay);
    this.handles.add(handle);
    return handle;
  }

  scheduleRead(delay, generation) {
    const epoch = this.epoch;
    this.schedule(delay, () => this.read(generation, epoch, { publish: false }));
  }

  /** May a loop of this generation and epoch go on? */
  current(generation, epoch) {
    return generation === this.generation && epoch === this.epoch;
  }

  paused() {
    return this.now() < this.pausedUntil;
  }

  /** One round of the reading loop. Never throws. */
  async read(generation, epoch, { publish }) {
    if (!this.client || !this.current(generation, epoch)) return;
    if (this.paused()) {
      // Another path (the scan button) met a 429 meanwhile.
      this.nextReadAt = this.pausedUntil;
      this.scheduleRead(this.pausedUntil - this.now(), generation);
      return;
    }
    this.nextReadAt = this.now() + INTERVALS.POLL_MS;
    try {
      await this.refresh({ publish });
    } catch (err) {
      // A round halted meanwhile (Gladys away, new configuration) schedules
      // nothing: the next start or resume reads again.
      if (this.current(generation, epoch)) await this.failed(err, generation);
      else this.online = false;
      return;
    }
    if (this.current(generation, epoch)) this.scheduleRead(INTERVALS.POLL_MS, generation);
  }

  /** A reading failed: a retry with a growing delay, or the 429 pause. */
  async failed(err, generation) {
    const wasOnline = this.online;
    this.online = false;
    this.halt();
    await this.publishTransports();
    let delay;
    if (err?.status === 429) {
      delay = clamp(
        err.retryAfterMs ?? INTERVALS.BUSY_MIN_MS,
        INTERVALS.BUSY_MIN_MS,
        INTERVALS.BUSY_MAX_MS,
      );
      this.pausedUntil = this.now() + delay;
      await this.savePause();
    } else {
      delay = this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, INTERVALS.RETRY_MAX_MS);
    }
    this.nextReadAt = this.now() + delay;
    if (wasOnline || delay === INTERVALS.RETRY_MIN_MS) {
      // Our own message: a code or an HTTP status, never the text of the answer.
      this.logger.warn(`The CiC fails: ${err?.code ?? 'error'} ${err?.message ?? ''}`.trim());
    }
    await this.setStatus(false, this.errorMessage(err, delay));
    if (generation === this.generation) this.scheduleRead(delay, generation);
  }

  errorMessage(err, delay) {
    if (err?.status === 429) return T.status.busy(delay);
    if (err?.status === 404) return T.status.notFound(delay);
    if (err?.code === CODES.BAD_ANSWER || err?.code === CODES.TOO_LARGE) {
      return T.status.notCic(delay);
    }
    return T.status.unreachable(err, delay);
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message]);
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    await this.gladys.setConnectionStatus(connected, message).catch((err) => {
      this.lastStatus = null;
      this.logger.warn(`Connection status not sent: ${err.message}`);
    });
  }

  // --- Reading -------------------------------------------------------------------

  /** Read the CiC and publish. Throws when the reading fails. */
  async refresh({ publish }) {
    const client = this.client;
    if (!client) return;
    const feed = await client.feed();
    if (client !== this.client) return;
    if (this.feed && this.feed.cicId !== feed.cicId) {
      this.logger.warn('Another CiC answers at this address: its devices are new ones');
    }
    this.feed = feed;
    this.online = true;
    this.retryDelay = INTERVALS.RETRY_MIN_MS;
    const discoveredKey = JSON.stringify([
      feed.cicId,
      this.present().map((d) => [d.type, d.number]),
    ]);
    if (publish || discoveredKey !== this.discoveredKey) await this.publishDiscovered();
    this.discoveredKey = discoveredKey;
    await this.publishStates();
    await this.publishTransports();
    await this.setStatus(true, T.status.ok(this.seen()));
  }

  /** The devices the last feed has: [{ type, number }]. */
  present(feed = this.feed) {
    if (!feed) return [];
    const list = [{ type: DEVICE_TYPES.SYSTEM, number: null }];
    for (const hp of feed.heatpumps) list.push({ type: DEVICE_TYPES.HEATPUMP, number: hp.number });
    if (feed.boiler) list.push({ type: DEVICE_TYPES.BOILER, number: null });
    if (feed.thermostat) list.push({ type: DEVICE_TYPES.THERMOSTAT, number: null });
    return list;
  }

  seen() {
    return {
      heatpumps: this.feed?.heatpumps.length ?? 0,
      boiler: Boolean(this.feed?.boiler),
      thermostat: Boolean(this.feed?.thermostat),
    };
  }

  /** The created device of this type, as Gladys holds it (its features are kept). */
  createdOf(type, cicId, number) {
    const external = idsOf(this.gladys, type, cicId, number).device;
    return (this.gladys.devices ?? []).find((d) => d?.external_id === external);
  }

  /** Never throws: a refusal of Gladys is not a failure of the CiC. */
  async publishDiscovered() {
    if (!this.feed) return;
    const { cicId } = this.feed;
    const language = this.config.language;
    const devices = this.present().map(({ type, number }) =>
      buildDevice(this.gladys, type, cicId, {
        number,
        language,
        created: this.createdOf(type, cicId, number),
      }),
    );
    await this.gladys.publishDiscoveredDevices(devices).catch((err) => {
      this.logger.warn(`Discovery not published: ${err.message}`);
    });
  }

  /** Discovery (scan button): read again when connected, else what is known. */
  async publishDiscovery() {
    if (this.online && this.client && !this.paused()) {
      const generation = this.generation;
      const done = await this.refresh({ publish: true }).then(
        () => true,
        async (err) => {
          if (err?.status === 429) await this.failed(err, generation);
          return false;
        },
      );
      if (done) return;
    }
    await this.publishDiscovered();
  }

  /** The values of one created device from the feed: [[featureKey, value]], or null. */
  values(entry, feed) {
    const language = this.config.language;
    switch (entry.type) {
      case DEVICE_TYPES.SYSTEM: {
        const s = feed.system;
        return [
          [SF.STATUS, modeText(s.mode, language)],
          [SF.MODE_CODE, s.mode],
          [SF.FAULT, bit(s.fault)],
          [SF.FAULT_TEXT, faultText(s, language)],
          [SF.HEATPUMP_HEATING, bit(s.heatpumpHeating)],
          [SF.BOILER_HEATING, bit(s.boilerHeating)],
          [SF.FLOW_RATE, s.flowRate],
          [SF.SUPPLY_TEMPERATURE, s.supplyTemperature],
          [SF.OUTSIDE_TEMPERATURE, s.outsideTemperature],
          [SF.POWER_INPUT, s.powerInput],
          [SF.HEAT_POWER, s.heatPower],
          [SF.COP, s.cop],
        ];
      }
      case DEVICE_TYPES.HEATPUMP: {
        const hp = feed.heatpumps.find((h) => h.number === entry.number);
        if (!hp) return null;
        return [
          [HF.SUPPLY_TEMPERATURE, hp.supplyTemperature],
          [HF.RETURN_TEMPERATURE, hp.returnTemperature],
          [HF.OUTSIDE_TEMPERATURE, hp.outsideTemperature],
          [HF.POWER_INPUT, hp.powerInput],
          [HF.HEAT_POWER, hp.heatPower],
          [HF.COP, hp.cop],
          [HF.DEFROST, bit(hp.defrost)],
          [HF.SILENT_MODE, bit(hp.silentMode)],
          [HF.LIMITED_BY_COP, bit(hp.limitedByCop)],
          [HF.WORKING_MODE, hp.workingMode],
        ];
      }
      case DEVICE_TYPES.BOILER: {
        const b = feed.boiler;
        if (!b) return null;
        return [
          [BF.HEATING, bit(b.heating)],
          [BF.HOT_WATER, bit(b.hotWater)],
          [BF.FLAME, bit(b.flame)],
          [BF.CIC_HEATING, bit(b.cicHeating)],
          [BF.CIC_ON, bit(b.cicOn)],
          [BF.SUPPLY_TEMPERATURE, b.supplyTemperature],
          [BF.RETURN_TEMPERATURE, b.returnTemperature],
          [BF.PRESSURE, b.pressure],
          [BF.HEAT_POWER, b.heatPower],
        ];
      }
      case DEVICE_TYPES.THERMOSTAT: {
        const th = feed.thermostat;
        if (!th) return null;
        return [
          [TF.ROOM_TEMPERATURE, th.roomTemperature],
          [TF.ROOM_SETPOINT, th.roomSetpoint],
          [TF.CONTROL_SETPOINT, th.controlSetpoint],
          [TF.HEATING_DEMAND, bit(th.heatingDemand)],
          [TF.HOT_WATER_DEMAND, bit(th.hotWaterDemand)],
          [TF.COOLING_DEMAND, bit(th.coolingDemand)],
        ];
      }
      default:
        return null;
    }
  }

  /** The states of the created devices of the CiC that answers; unknown values are left out. */
  states() {
    const feed = this.feed;
    if (!this.online || !feed) return [];
    const states = [];
    for (const entry of createdDevices(this.gladys)) {
      if (entry.cicId !== feed.cicId) continue;
      const values = this.values(entry, feed);
      if (!values) continue;
      const ids = idsOf(this.gladys, entry.type, entry.cicId, entry.number);
      for (const [key, value] of values) {
        if (value === null || value === undefined) continue;
        const id = ids.feature(key);
        states.push(
          typeof value === 'string'
            ? { device_feature_external_id: id, text: value }
            : { device_feature_external_id: id, state: value },
        );
      }
    }
    return states;
  }

  /** Publish what changed, within the per-minute budget. Never throws. */
  async publishStates() {
    let list = this.states();
    if (list.length === 0) return;
    const remaining = this.budget.remaining();
    if (list.length > remaining) {
      // In turn: the next cut starts where this one stopped, so no feature
      // is held back for ever (the SDK skips the unchanged ones anyway).
      this.logger.debug(`${list.length - remaining} state(s) held back (state budget)`);
      const start = this.budgetCursor % list.length;
      list = [...list.slice(start), ...list.slice(0, start)].slice(0, remaining);
      this.budgetCursor = start + remaining;
    }
    if (list.length === 0) return;
    try {
      const result = await this.gladys.publishChangedStates(list, {
        heartbeat: INTERVALS.HEARTBEAT_MS,
      });
      this.budget.record(result?.count ?? list.length);
    } catch (err) {
      this.logger.warn(`States not published: ${err.message}`);
    }
  }

  /** Reachable: the CiC answers, it is this device's CiC, and the device is in its feed. */
  async publishTransports() {
    const present = new Set(this.present().map((d) => `${d.type}:${d.number}`));
    const entries = createdDevices(this.gladys).map((entry) => {
      const reachable =
        this.online &&
        entry.cicId === this.feed?.cicId &&
        present.has(`${entry.type}:${entry.number}`);
      return { external_id: entry.externalId, transport: reachable ? 'local' : 'unreachable' };
    });
    const changed = entries.filter((e) => this.transports.get(e.external_id) !== e.transport);
    for (let start = 0; start < changed.length; start += TRANSPORTS_PER_CALL) {
      const batch = changed.slice(start, start + TRANSPORTS_PER_CALL);
      for (const entry of batch) this.transports.set(entry.external_id, entry.transport);
      await this.gladys.publishTransports(batch).catch((err) => {
        for (const entry of batch) this.transports.delete(entry.external_id);
        this.logger.debug(`Transports not published: ${err.message}`);
      });
    }
  }

  // --- Commands: none --------------------------------------------------------

  /** Every feature is read only: a command (scene, API) is refused, nothing is sent. */
  async setValue() {
    throw new Error(T.errors.readOnly);
  }

  // --- Devices created / updated / deleted in Gladys -------------------------

  async deviceCreated(device) {
    if (!parseExternalId(this.gladys, device?.external_id)) return;
    // Offline too: a device created or updated while the CiC fails must show
    // "unreachable" at once. Only the states need a reading.
    if (this.online) await this.publishStates();
    await this.publishTransports();
  }

  async deviceUpdated(device) {
    this.transports.delete(device?.external_id);
    await this.deviceCreated(device);
  }

  deviceDeleted(device) {
    this.transports.delete(device?.external_id);
  }

  // --- Configuration button --------------------------------------------------

  /** Resolves `promise`, or rejects with `message` after `ms`. */
  within(promise, ms, message) {
    let handle;
    const limit = new Promise((_, reject) => {
      handle = this.timers.setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, limit]).finally(() => this.timers.clearTimeout(handle));
  }

  /** Reconnects (a 429 pause lifted: the user asked), then reports, within 25 s. */
  async testConnection() {
    await this.within(
      this.start(this.rawConfig, { force: true }),
      TEST_BUDGET_MS,
      T.errors.testTooLong,
    );
    if (!this.online) {
      const message = this.lastStatus ? JSON.parse(this.lastStatus)[1] : null;
      throw new Error(message?.en ?? T.errors.notConnected);
    }
    return T.test.ok(this.seen());
  }
}
