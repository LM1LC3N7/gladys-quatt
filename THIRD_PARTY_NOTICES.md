# Third-party notices

This integration ports to JavaScript the logic of the project below for
reading the local API of the Quatt CiC. Nothing of it is installed at
runtime: it is Python, this integration is JavaScript.

## home-assistant-quatt

<https://github.com/marcoboers/home-assistant-quatt> (read at tag `2.1.2`,
commit `fb406da`, 2026-09-18), licensed under the MIT License.

Ported in `src/quatt/client.js`, `src/quatt/parse.js`, `src/constants.js` and
`src/i18n.js`: the local endpoint of the CiC (`http://<cic>:8080/beta/feed/data.json`,
`api_local_cic.py`), the paths of the values in the feed (`hp1` / `hp2`,
`boiler`, `thermostat`, `qc`, `flowMeter`, `system.hostName` as the identity of
the CiC), the computed values of `coordinator_local_cic.py` (water delta,
Quatt COP, defrost, heat power of the boiler from the flow and the
conversion factors of water), the supervisory control modes and their labels
(`const.py`). The test data of `test/helpers/fakeCic.js`
(`duoAllElectricFeed`) is its fixture `local_cic_duo_all_electric.json`.

```
MIT License

Copyright (c) 2019 - 2023  Marco Boers @marcoboers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

(The copyright line is the one of the project's own LICENSE file, reproduced
as it is.)

## LM1LC3N7/gladys-incomfort

The structure of the app, the handler wiring, the HTTP transport, the retry
and pause policy follow this integration of the same author (a boiler read
on the local network), under the Apache License 2.0 of this repository.
