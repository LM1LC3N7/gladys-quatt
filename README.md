# gladys-quatt

[Gladys Assistant](https://gladysassistant.com) external integration for the
**Quatt** hybrid heat pump, read only through the local JSON API of its
**CiC** (Commissioning and Control): the installation (status, faults, flow,
supply and outside temperatures, powers, COP), each heat pump (supply and
return temperatures, power, COP, defrost), the boiler of a hybrid
installation and the OpenTherm thermostat (room temperature, setpoint).
Local HTTP, no cloud, nothing is ever sent to the CiC but the reading.
**Unofficial integration, not affiliated with Quatt. The local API is not
documented by Quatt. Never tested with a real CiC yet.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (QuattApp)
                 ├─ src/quatt/client.js   GET http://<cic>:8080/beta/feed/data.json
                 ├─ src/quatt/http.js     the only network access (node:http, plain HTTP)
                 ├─ src/quatt/parse.js    the feed -> plain objects, computed values
                 ├─ src/quatt/errors.js   error codes
                 ├─ src/budget.js         states per minute
                 ├─ src/store.js          the end of a 429 pause, in /data
                 └─ src/devices.js        installation, heat pumps, boiler, thermostat (pure)
```

- **CiC**: one `GET /beta/feed/data.json` every 30 s (port 8080, no
  authentication). External ids are built on the id of the CiC
  (`system.hostName` = `CIC-<uuid>`): `cic:<uuid>`, `heatpump:<uuid>-<1|2>`,
  `boiler:<uuid>`, `thermostat:<uuid>`.
- **Untrusted answer**: 128 kB at most, 10 s at most, only own properties of
  plain objects are read (no prototype key, nothing merged), numbers must be
  finite and plausible, flags booleans; anything else is unknown and not
  published.
- **Failures**: the CiC unreachable marks every device unreachable and
  retries 30 s to 10 min (never faster than the reading, one timer); HTTP 429
  pauses every path (1 min to 6 h), kept in `/data` across a restart, lifted
  by a user action. Errors are logged as codes, never with the text of the
  answer.
- **Reconnection to Gladys**: status, Discovery, states and badges are
  published again; the client and a 429 pause stay, and the reading loop does
  not run sooner than planned.
- **Devices published again** keep every feature of the device created in
  Gladys (`gladys.devices`), so no feature is ever removed.
- **Read only**: every feature is `read_only`, none is a switch or a
  thermostat; `onSetValue` refuses. No energy index (the API has no counter).

## Development

```bash
npm install
npm test                                        # node --test, no network (loopback only)
npm run lint && npm run format:check
npm run audit                                   # production dependencies
npm run cover                                   # regenerate cover.png
npx github:GladysAssistant/integration-store .  # store admission checks
```

The tests run against the SDK's fake Gladys and a fake CiC
(`test/helpers/fakeCic.js`, in memory and on loopback). No test touches a
real CiC or the Internet. The parsing is checked against the fixture of
home-assistant-quatt.

## Credits

- [home-assistant-quatt](https://github.com/marcoboers/home-assistant-quatt)
  (MIT): the local API of the CiC and the computed values, ported to
  JavaScript (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
- [gladys-incomfort](https://github.com/LM1LC3N7/gladys-incomfort): the
  structure of the app and the retry policy.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0.
