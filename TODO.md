# TODO — Quatt (local CiC) v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`
  (Node 22 and 24), `npm audit --omit=dev`,
  `npx github:GladysAssistant/integration-store .`, then update README,
  `docs/en.md`, `docs/fr.md`, `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only. No forum topic of its own: the claim is in /t/10385 (post #275, lot 8).

## Status

- [x] **Milestone 1 — core** (2026-10-18): read-only client of the local JSON
      API of the CiC (`GET :8080/beta/feed/data.json`), ported from
      home-assistant-quatt 2.1.2; four device types keyed by the uuid of the
      CiC (installation, heat pumps 1-2, boiler, thermostat); computed values
      (Quatt COP, defrost, boiler heat power estimate); reading every 30 s,
      the CiC unreachable retried 30 s to 10 min; 429 pause kept in `/data`;
      reconnection publishes everything again; no feature lost on
      republication; untrusted answer bounded and range-checked; "Test the
      connection"; docs en/fr. Tested with unit tests against the SDK's fake
      Gladys and a fake CiC (in memory and on loopback), the parsing against
      the fixture of home-assistant-quatt. **Never tested with a real CiC.**
      No Docker on this PC: no e2e test in a container.
- [ ] **Milestone 2 — real CiC** (a tester with a Quatt): record a real
      `data.json` (hybrid single, hybrid duo, all-electric) as fixtures and
      fix what differs. To check first:
  - the units of `hp*.power` and `hp*.powerInput` (W assumed, as in Home
    Assistant; the fixture's `powerInput` 5.15 at standby is odd);
  - whether a non-OpenTherm boiler reports `otFbChModeActive` at all (decides
    the boiler's own flags vs the CiC's on/off);
  - the meaning of `getMainWorkingMode` (published as a code only);
  - other fault states (the local API seems to carry only modes 99 and 400);
  - how a CiC behaves under a 30 s reading (Home Assistant reads every 10 s).
- [ ] **Later**: the all-electric values (heat battery `hb.*`: shower
      minutes, temperatures; heat charger `hc.*`: power, pressure), the
      anti-legionella flag, the chill (`qcChill`) values.

## Decisions

- **Version**: 0.1.0 set by hand in `package.json`, `package-lock.json`, the
  manifest and the `docker_image` tag; the first Release (patch) gives 0.1.1.
- **License**: Apache-2.0, the standard text (no person named), shipped in the
  image with `THIRD_PARTY_NOTICES.md` (full MIT notice of home-assistant-quatt,
  copyright line as in its LICENSE).
- **Read only**: the brief. Every feature `read_only`; `onSetValue` is
  registered only to refuse with a clear message; nothing is sent to the CiC
  but the GET of the feed. No remote (mobile, cloud) API, no credentials.
- **Room setpoint as a temperature** (`temperature-sensor`/`probe`), not a
  `thermostat`/`target-temperature`: a read-only thermostat would still be
  offered as a control to the voice assistants and the Thermostat service of
  the core. `probe` keeps it out of the room temperature. The water setpoint
  asked (`otFtControlSetpoint`) likewise.
- **Temperatures**: every water temperature and the outside temperature are
  `probe`; only the thermostat's room temperature is `decimal` (counted in
  the room).
- **Powers**: `energy-sensor`/`power` in W (listed by the core for the
  category), electrical and heat power alike (the core sums no power). The
  boiler's heat power is the estimate of Home Assistant
  (`(flow meter − heat pump out) × flow × k`), 0 when the boiler does not
  heat, never negative.
- **Never an energy index**: the local API has no counter; no index, no daily
  consumption, no `publishEnergyConsumption` (an integral of the power would
  be a made-up total and the core counts every index increase).
- **COP**: the "Quatt COP" (heat power / electrical power of the heat pumps),
  `unknown`/`decimal` without unit (none fits), 0 to 20; not published when
  the input is 0 or the result negative (defrost). Home Assistant's other COP
  needs an external power meter: not ported.
- **Flow rate**: `unknown`/`decimal` in l/h, the unit in the feature name:
  the core lists m³/h only for `water-valve`, a valve category that would be
  shown as a valve.
- **Faults**: binary `fault` = mode 99 (fault, circulation pump on) or 400
  (invalid configuration), the only fault states of the local API; `fault_text`
  is the label and the code, or "No fault". The status text covers every mode
  (commissioning 100-399 as "Commissioning (code N)").
- **Heat pump / boiler heating** (installation): from the supervisory mode
  (2-3 heat pump, 3-4 boiler), like the status, not from a power threshold.
- **External ids**: the uuid of `system.hostName` (`CIC-<uuid>`, lower case),
  as Home Assistant's unique id: stable across IP changes. A feed without a
  valid `CIC-<uuid>` or without `hp1` is "not a CiC". Another CiC at the same
  address gets its own devices; the old ones show unreachable.
- **Devices present**: installation always; heat pump 1 always, 2 when `hp2`
  is an object; boiler when `boiler` is an object; thermostat when
  `thermostat` is an object. A created device that disappears from the feed
  shows unreachable and keeps its features.
- **No feature lost**: Discovery starts from the features this version builds
  and adds every other feature of the created device read from
  `gladys.devices` (kept up to date by the SDK), with the Discovery fields
  only.
- **Untrusted answer**: 128 kB cap, 10 s timeout, no redirect, no keep-alive;
  `JSON.parse` then only own properties of plain objects (`Object.hasOwn`),
  nothing spread or merged; numbers finite and in range (temperatures -50 to
  150 °C, powers -50 to 100 kW, flow 0 to 20 000 l/h, pressure 0 to 10 bar,
  codes 0 to 1000), flags booleans (or 0 / 1). Out of range or wrong type:
  unknown, not published (the last value stays in Gladys, never a 0).
- **Retries**: the CiC unreachable (or 404, bad answer, 5xx) is retried 30 s,
  then doubling up to 10 min, one timer; never faster than the 30 s reading.
  Home Assistant's quick retries (3 × on a disconnect) are not ported.
- **HTTP 429** (unlikely on a LAN device): 1 min to 6 h (Retry-After in
  seconds if given) for every path (the scan button included); the end is
  saved in `/data/quatt-state.json` and read back at start, capped at 6 h
  from now; lifted by a saved configuration or "Test the connection".
- **Reconnection to Gladys** (`connected` with the same configuration): the
  client and the pause stay; the cached status, Discovery key, states and
  badges are cleared and published again; the next reading keeps its planned
  time. `disconnected` only stops the timers.
- **Configuration**: the address only (port 8080 by default, `https://`
  refused with a message, no path) and the language of the devices (French by
  default). No interval option: 30 s keeps a round well under the 300
  states/min of Gladys.
- **Logs**: codes and HTTP statuses only, never the body of an answer.

## Ideas (not planned)

- The mobile (cloud) API of Quatt: more values, but an account and tokens.
- Commands (silent mode, setpoint): only through the cloud API, out of scope.
