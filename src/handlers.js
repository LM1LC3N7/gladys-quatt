// -----------------------------------------------------------------------------
// The SDK handlers, wired to the app. Shared by index.js and the tests, so
// the tests run the exact wiring of the container.
// -----------------------------------------------------------------------------

import { ACTIONS } from './constants.js';
import { T } from './i18n.js';

/** How many more times the configuration is asked for after a failed read. */
export const CONFIG_RETRIES = 3;
/** Then it is asked again at this pace, for as long as it fails. */
export const CONFIG_SLOW_RETRY_MS = 10 * 60_000;

export function registerHandlers(gladys, app, logger) {
  // --- Discovery and device lifecycle ------------------------------------------
  gladys.onScanRequest(() => app.publishDiscovery());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onDeviceDeleted((device) => app.deviceDeleted(device));
  // Updated: the SDK forgot its states, and Gladys may have reset its badge.
  gladys.onDeviceUpdated((device) => app.deviceUpdated(device));

  // --- Commands: none (read only); a clear refusal instead of a silent one.
  gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));

  // --- Configuration screen button ---------------------------------------------
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());

  // --- Configuration saved by the user: a 429 pause is lifted.
  gladys.onConfigUpdated((config) => {
    logger?.info('Configuration updated: restarting');
    return app.start(config, { force: true });
  });

  // --- Connection lifecycle: every connection publishes everything again; the
  // same configuration keeps the client and a pause.
  // The configuration that cannot be read is asked again, a bounded number of
  // times (30 s, 60 s, 120 s), on the app's timers (cleared on disconnection).
  // After those, the status says so and it is asked every 10 min: never a
  // silent stop, never a fast loop.
  const startWithConfig = async (attempt = 0) => {
    let config;
    try {
      config = await gladys.getConfig();
    } catch (err) {
      if (attempt >= CONFIG_RETRIES) {
        logger?.error(`Configuration not read: ${err?.message ?? 'error'}`);
        await app.setStatus(false, T.status.configUnreadable(CONFIG_SLOW_RETRY_MS));
        app.schedule(CONFIG_SLOW_RETRY_MS, () => startWithConfig(attempt));
        return;
      }
      logger?.warn(`Configuration not read, asked again: ${err?.message ?? 'error'}`);
      app.schedule(30_000 * 2 ** attempt, () => startWithConfig(attempt + 1));
      return;
    }
    try {
      await app.start(config);
    } catch (err) {
      logger?.error('Start failed', err);
    }
  };
  gladys.on('connected', () => startWithConfig());
  gladys.on('disconnected', () => app.pause());
}
