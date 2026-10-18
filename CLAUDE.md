# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads a Quatt hybrid heat pump through the
local JSON API of its CiC (plain HTTP, port 8080, not documented by Quatt),
read only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "429"     # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only (src/handlers.js registers the handlers)
src/handlers.js                   every SDK handler, wired to the app (shared with the tests)
src/app.js                        QuattApp: lifecycle, reading loop, states, badges
src/quatt/client.js               GET /beta/feed/data.json of the CiC
src/quatt/http.js                 the only network access (node:http)
src/quatt/parse.js                the feed -> plain objects (ported from home-assistant-quatt)
src/quatt/errors.js               CicError and its codes
src/budget.js                     the states-per-minute window (300/min limit of Gladys)
src/store.js                      the end of a 429 pause, in /data
src/devices.js                    the Gladys devices and their external ids (pure)
src/config.js                     DEFAULTS (mirror the manifest defaults) + normalization
src/constants.js, src/i18n.js     keys, limits, timings; runtime and device texts (en/fr)
gladys-assistant-integration.json manifest: name, config_schema, actions...
docs/en.md, docs/fr.md            user documentation, re-hosted by Gladys (mandatory)
test/                             node --test: SDK fake Gladys, fake CiC, loopback servers
scripts/cover.mjs                 generates cover.png (plain Node)
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

Rules of this integration (TODO.md, "Decisions"): read only, every feature
`read_only`, never a switch nor a thermostat, `onSetValue` refuses; the
answer of the CiC is untrusted (size and time bounded, own properties only,
values range-checked, unknown values never published); never an energy
index; a device published again keeps every feature it has in Gladys; never
a retry faster than the 30 s reading; logs carry codes, never the text of an
answer.

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device, never a label. Here: the uuid of the CiC
  (`system.hostName` = `CIC-<uuid>`, lower case): `cic:<uuid>`,
  `heatpump:<uuid>-<1|2>`, `boiler:<uuid>`, `thermostat:<uuid>`. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates
  a new device and orphans the old one. The same goes for every key users
  store: manifest `config_schema`, `actions`, feature keys
  (`test/manifest.test.js` freezes them).
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume (`quatt-state.json`: the end of a 429 pause).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language.
  `test/manifest.test.js` ties the manifest to the code (defaults, action
  handlers): change both sides together.
- **Units.** Only those the core lists for the category
  (`DEVICE_FEATURE_UNITS_BY_CATEGORY` of `server/utils/constants.js`); units
  and types are fixed when the device is created.
- **User-facing text** is bilingual (English and French): action messages,
  manifest texts, and `docs/en.md` / `docs/fr.md`, kept in sync. Files are
  UTF-8 without BOM (`test/encoding.test.js`).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
