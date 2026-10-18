// -----------------------------------------------------------------------------
// A fake Quatt CiC (in memory, or on loopback through listen()): the local
// JSON API the integration reads. The shapes come from home-assistant-quatt
// (MIT): its fixture `local_cic_duo_all_electric.json` and the keys its
// sensors read. Never checked against a real CiC (TODO.md).
// -----------------------------------------------------------------------------

import http from 'node:http';
import { CODES, CicError } from '../../src/quatt/errors.js';

export const UUID = '12345678-1234-5678-1234-567812345678';
export const OTHER_UUID = 'abcdef01-2345-6789-abcd-ef0123456789';

/** A hybrid installation: one heat pump, an OpenTherm boiler, a thermostat. */
export function hybridFeed({ uuid = UUID, mode = 2 } = {}) {
  return {
    boiler: {
      otFbChModeActive: false,
      otFbDhwActive: false,
      otFbFlameOn: false,
      otFbSupplyInletTemperature: 30.5,
      otFbSupplyOutletTemperature: 31.2,
      otFbWaterPressure: 1.6,
      otTbCH: false,
      oTtbTurnOnOffBoilerOn: false,
    },
    chill: null,
    externalMeters: null,
    flowMeter: { waterSupplyTemperature: 35.1 },
    hp1: {
      getMainWorkingMode: 1,
      limitedByCop: false,
      modbusSlaveId: 1,
      power: 4200,
      powerInput: 1050,
      silentModeStatus: false,
      temperatureOutside: 7.5,
      temperatureWaterIn: 30.1,
      temperatureWaterOut: 35.4,
    },
    hp2: null,
    qc: {
      electricityPriceUsed: 0.3,
      flowRateFiltered: 690,
      gasPriceUsed: 1.55,
      stickyPumpProtectionEnabled: false,
      supervisoryControlMode: mode,
    },
    system: {
      chMaxWaterTemperature: 55,
      electricityTariffType: 0,
      gasTariffType: 0,
      hostName: `CIC-${uuid}`,
    },
    thermostat: {
      otFtChEnabled: true,
      otFtControlSetpoint: 36,
      otFtCoolingEnabled: false,
      otFtDhwEnabled: false,
      otFtRoomSetpoint: 20.5,
      otFtRoomTemperature: 19.8,
    },
    thread: null,
    time: { ts: 1787315230408, tsHuman: '2026-08-21T12:27:10Z' },
  };
}

/** home-assistant-quatt, tests/components/quatt/fixtures/local_cic_duo_all_electric.json */
export function duoAllElectricFeed() {
  return {
    boiler: null,
    chill: null,
    externalMeters: null,
    flowMeter: { waterSupplyTemperature: 24.69 },
    hb: {
      bottomTemperature: 57.13,
      middleTemperature: 57.64,
      showerMinutes: 32,
      topTemperature: 56.36,
    },
    hc: {
      chHeatExchangerInletTemperature: 26.6,
      distributionSystemSupplyTemperature: 27,
      electricalPower: 0,
      heatingSystemPressure: 1.2,
    },
    hp1: {
      getMainWorkingMode: 0,
      limitedByCop: false,
      modbusSlaveId: 1,
      power: 0,
      powerInput: 5.15,
      silentModeStatus: false,
      temperatureOutside: 19.52,
      temperatureWaterIn: 18.39,
      temperatureWaterOut: 21.41,
    },
    hp2: {
      getMainWorkingMode: 0,
      limitedByCop: false,
      modbusSlaveId: 2,
      power: 0,
      powerInput: 5.15,
      silentModeStatus: false,
      temperatureOutside: 19.62,
      temperatureWaterIn: 18.09,
      temperatureWaterOut: 21.52,
    },
    qc: {
      electricityPriceUsed: 0.3,
      flowRateFiltered: 0,
      gasPriceUsed: 1.55,
      stickyPumpProtectionEnabled: false,
      supervisoryControlMode: 0,
    },
    qcAllE: { allESupervisoryControlMode: 0, isAntilegionellaActive: false },
    qcChill: null,
    system: {
      chMaxWaterTemperature: 40,
      electricityTariffType: 2,
      gasTariffType: 2,
      hostName: 'CIC-12345678-1234-5678-1234-567812345678',
    },
    thermostat: {
      otFtChEnabled: false,
      otFtControlSetpoint: 0,
      otFtCoolingEnabled: false,
      otFtDhwEnabled: false,
      otFtRoomSetpoint: 5,
      otFtRoomTemperature: 21.76,
    },
    thread: null,
    time: { ts: 1787315230408, tsHuman: '2026-08-21T12:27:10Z' },
  };
}

export function createFakeCic() {
  const fake = {
    requests: [],
    feed: hybridFeed(),
    /** { status, headers, body } answered once, in order. */
    failures: [],
    unreachable: false,
  };

  const json = (status, value, headers = {}) => ({
    status,
    headers: { 'content-type': 'application/json', ...headers },
    body: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  });

  function answer(url) {
    if (fake.failures.length > 0) {
      const f = fake.failures.shift();
      return json(f.status, f.body ?? '<html>remote text</html>', f.headers ?? {});
    }
    if (url.pathname === '/beta/feed/data.json') return json(200, fake.feed);
    return json(404, 'Not found');
  }

  /** The transport of src/quatt/http.js, in memory. */
  fake.request = async (rawUrl) => {
    const url = new URL(rawUrl);
    fake.requests.push({ url: rawUrl, path: url.pathname, port: url.port });
    if (fake.unreachable) throw new CicError(CODES.UNREACHABLE, 'ECONNREFUSED');
    return answer(url);
  };

  /** The same interface on a loopback HTTP server: { origin, close }. */
  fake.listen = async () => {
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const url = new URL(req.url, 'http://127.0.0.1');
        fake.requests.push({ url: req.url, path: url.pathname, method: req.method });
        const result = answer(url);
        res.writeHead(result.status, result.headers);
        res.end(result.body);
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
      origin: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise((resolve) => {
          server.closeAllConnections?.();
          server.close(resolve);
        }),
    };
  };

  return fake;
}
