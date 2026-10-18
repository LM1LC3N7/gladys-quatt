# Quatt

Your **Quatt** hybrid heat pump in Gladys, read through the local JSON API
of its **CiC** (the Quatt control box, "Commissioning and Control") on your
network, without any cloud, **read only**:

- **the installation**: **status** (standby, heating by the heat pump, with
  the boiler, frost protection…), **status code**, **fault** (yes / no and in
  words), **heat pump heating**, **boiler heating**, **flow rate** (l/h),
  **supply temperature** (flow meter), **outside temperature**, **electrical
  power** and **heat power** of the heat pumps, **COP**;
- **each heat pump** (two on a Quatt Duo): **supply** and **return**
  temperatures, **outside temperature**, **electrical power**, **heat
  power**, **COP**, **defrost**, **silent mode**, **limited by COP**,
  **working mode** (code);
- **the boiler** (hybrid installation): **central heating active**, **hot
  water active**, **flame on** (OpenTherm boiler), **heating asked by the
  CiC**, **turned on by the CiC**, **supply** and **return** temperatures,
  **water pressure**, **heat power (estimate)**;
- **the thermostat**: **room temperature**, **room setpoint** (read only),
  **water setpoint asked**, **heating**, **hot water** and **cooling**
  demands.

> **This integration has never been tested with a real CiC.** This first
> version was written from the home-assistant-quatt integration of Home
> Assistant and tested only against a fake CiC. Tell the Gladys forum what
> works and what does not.

> **The local API of the CiC is not documented by Quatt.** Its address
> (`/beta/feed/data.json`) and the names of its values come from the
> community (home-assistant-quatt). An update of the CiC may change or remove
> it without notice: the integration then says so in its connection status.

Unofficial integration, not affiliated with Quatt.

## Configuration

- **CiC address**: its IP address on your network (`192.168.1.30`, see the
  device list of your router); port 8080 is used by default, another may
  follow (`192.168.1.30:8081`). Prefer the IP address: a `.local` name (mDNS)
  does not resolve inside the container of the integration. Give it a fixed
  address in your router. The local API speaks plain http only: an
  `https://` address is refused with a clear message. No credentials are
  asked: the local API has none.
- **Language of the devices**: French (default) or English, for the names of
  the devices and the status and fault texts.

Then open the **Discovery** tab and create the devices to follow. The **Test
the connection** button reads the CiC right away and lists what it reports.

## Read only

- Gladys only **reads** the CiC: nothing changes the setpoint, the mode, the
  heat pump or the boiler. A command sent from a scene or the Gladys API is
  refused with a message, and nothing goes to the CiC.
- No feature is a switch: "turn everything off" and the voice assistants
  cannot act on the installation.
- The room setpoint is published as a **temperature** (reading), not as an
  adjustable thermostat: it is not shown as a control.

## What the values mean

- **Water temperatures and outside temperature** are probes: Gladys keeps
  them out of the temperature of the room the device is in. Only the **room
  temperature** of the thermostat counts there.
- **COP**: the heat power divided by the electrical power, as the heat pumps
  report them (the "Quatt COP" of Home Assistant). It is not published when
  the electrical power is zero, nor during a defrost (it would be negative).
- **Heat power of the boiler**: an **estimate** (flow meter temperature minus
  the heat pump outlet × flow × heat capacity of water), as in Home
  Assistant; 0 when the boiler does not heat.
- **Flow rate**: in litres per hour (l/h); Gladys has no such unit, so it is
  in the name of the feature.
- **Faults**: the local API only gives the states "Fault - circulation pump
  on" (99) and "Invalid configuration" (400). The detailed error codes of the
  heat pump or the boiler are not in it: see the Quatt app.
- **Energy**: the local API has no energy counter. The integration therefore
  publishes no index nor consumption, only instantaneous powers (it never
  makes up a total).
- A value missing or inconsistent in the answer of the CiC is not published:
  Gladys keeps the last known value (never a 0 in its place).

## Refresh and limits

- The CiC is read every **30 seconds** (one request). Only the values that
  change are sent to Gladys (and each at least every 30 minutes).
- The devices are known by the **id of the CiC** (`CIC-…`), not by its IP
  address: a new address keeps the devices, their history and their scenes.
- A device the CiC no longer reports (a boiler removed, a second heat pump)
  shows as unreachable; its features stay.
- An all-electric installation (heat battery) is read too, but its own values
  (heat battery, heat charger) are not published yet.

## Connection problems

- **CiC unreachable**: every device shows as unreachable; tried again after
  30 s, then less and less often, up to every 10 min (never faster than the
  normal reading).
- **HTTP 404** or **unexpected answer**: the address answers, but not like
  the local API of a CiC (wrong address, wrong port, or the API changed with
  an update of the CiC).
- **CiC overloaded** (HTTP 429): every request stops for 1 minute to 6
  hours, even after a restart of the integration (the end of the pause is
  kept in `/data`); saving the configuration or pressing **Test the
  connection** lifts the pause.
- The logs never hold the text of the answers of the CiC, only codes (HTTP
  500, no connection…).

## Limits

- One CiC per integration.
- Read only: no command, no setpoint, no mode.
- No energy prices, no tariff, no values of the Quatt mobile (cloud) API.
- Never tested with a real CiC.
