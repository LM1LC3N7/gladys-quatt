# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version, never tested with a real CiC: the Quatt hybrid heat pump,
  read only through the local JSON API of its CiC
  (`http://<cic>:8080/beta/feed/data.json`, not documented by Quatt), plain
  HTTP, no credentials.
- The installation: status and status code, fault (binary and text), heat
  pump and boiler heating, flow rate, supply and outside temperatures,
  electrical and heat power of the heat pumps, COP.
- Each heat pump (one or two): supply, return and outside temperatures,
  electrical and heat power, COP, defrost, silent mode, limited by COP,
  working mode.
- The boiler of a hybrid installation: central heating, hot water, flame,
  heating asked and on/off by the CiC, supply and return temperatures,
  pressure, heat power (estimate).
- The thermostat: room temperature, room setpoint (read only), water setpoint
  asked, heating, hot water and cooling demands.
- Reading every 30 s; the CiC unreachable: every device unreachable, retried
  30 s to 10 min; HTTP 429: pause of 1 min to 6 h, kept across a restart.
- Button "Test the connection". Device texts in French or English.
- The COP is published only while the heat pumps heat or draw more than
  100 W (no meaningless ratio at standby); the COP of each heat pump depends
  on its own input only (one unit of a Duo may stand still).
- A reconnection to Gladys during an HTTP 429 pause shows the time left.
- Computed powers (boiler estimate, totals of a Duo) are range-checked like
  the reported ones; the electrical power is never negative.
- Configuration not given by Gladys: a status says so and it is asked again
  every 10 min.
- Retry delays under a minute are shown in seconds.
- A device created or updated while the CiC fails shows unreachable at once.

[Unreleased]: https://github.com/LM1LC3N7/gladys-quatt/commits/main
