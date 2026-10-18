// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys. The connection status and the button answer
// are { en, fr }; errors thrown to Gladys are English (one language per
// message, like the core's); the device texts (names, status, fault) follow
// the language chosen in the configuration.
// -----------------------------------------------------------------------------

import { COMMISSIONING, MODES } from './constants.js';
import { CODES } from './quatt/errors.js';

const minutes = (ms) => Math.max(1, Math.round(ms / 60_000));

/** Why the CiC failed, in a few words (codes and statuses only). */
export function reasonOf(err) {
  switch (err?.code) {
    case CODES.UNREACHABLE:
      return { en: 'no connection', fr: 'pas de connexion' };
    case CODES.TIMEOUT:
      return { en: 'no answer in time', fr: 'pas de réponse à temps' };
    case CODES.HTTP:
      return { en: `HTTP error ${err.status}`, fr: `erreur HTTP ${err.status}` };
    case CODES.BAD_ANSWER:
      return { en: 'unexpected answer', fr: 'réponse inattendue' };
    case CODES.TOO_LARGE:
      return { en: 'answer too large', fr: 'réponse trop grande' };
    case CODES.CLOSED:
      return { en: 'configuration changed', fr: 'configuration changée' };
    default:
      return { en: 'error', fr: 'erreur' };
  }
}

const RETRY = (delay) => ({
  en: `Retried in ${minutes(delay)} min.`,
  fr: `Nouvel essai dans ${minutes(delay)} min.`,
});

const join = (...parts) => ({
  en: parts
    .map((p) => p.en)
    .filter(Boolean)
    .join(' '),
  fr: parts
    .map((p) => p.fr)
    .filter(Boolean)
    .join(' '),
});

/** "1 heat pump", "2 heat pumps", with or without a boiler and a thermostat. */
function summary({ heatpumps, boiler, thermostat }) {
  const en = [`${heatpumps} ${heatpumps === 1 ? 'heat pump' : 'heat pumps'}`];
  const fr = [`${heatpumps} ${heatpumps === 1 ? 'pompe à chaleur' : 'pompes à chaleur'}`];
  if (boiler) {
    en.push('a boiler');
    fr.push('une chaudière');
  }
  if (thermostat) {
    en.push('a thermostat');
    fr.push('un thermostat');
  }
  const list = (items, and) =>
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;
  return { en: list(en, 'and'), fr: list(fr, 'et') };
}

export const T = {
  status: {
    ok: (seen) => {
      const s = summary(seen);
      return { en: `The CiC answers: ${s.en}.`, fr: `Le CiC répond : ${s.fr}.` };
    },
    hostEmpty: {
      en: 'Type the address of the Quatt CiC (e.g. 192.168.1.30).',
      fr: 'Saisissez l’adresse du CiC Quatt (ex. 192.168.1.30).',
    },
    hostInvalid: {
      en: 'The address of the CiC is not valid: type its IP address or host name (e.g. 192.168.1.30), without a path.',
      fr: 'L’adresse du CiC n’est pas valide : saisissez son adresse IP ou son nom (ex. 192.168.1.30), sans chemin.',
    },
    hostHttps: {
      en: 'The local API of the CiC only speaks plain http: type its address without https://.',
      fr: 'L’API locale du CiC ne parle qu’en http simple : saisissez son adresse sans https://.',
    },
    notFound: (delay) =>
      join(
        {
          en: 'This address answers, but not the local API of a Quatt CiC (HTTP 404): check the address and the port (8080 by default).',
          fr: 'Cette adresse répond, mais pas l’API locale d’un CiC Quatt (HTTP 404) : vérifiez l’adresse et le port (8080 par défaut).',
        },
        RETRY(delay),
      ),
    notCic: (delay) =>
      join(
        {
          en: 'This address does not answer like a Quatt CiC: check the address and the port (8080 by default).',
          fr: 'Cette adresse ne répond pas comme un CiC Quatt : vérifiez l’adresse et le port (8080 par défaut).',
        },
        RETRY(delay),
      ),
    busy: (delay) =>
      join(
        {
          en: 'The CiC asks Gladys to slow down (HTTP 429): every request is paused.',
          fr: 'Le CiC demande à Gladys de ralentir (HTTP 429) : toutes les requêtes sont suspendues.',
        },
        RETRY(delay),
      ),
    unreachable: (err, delay) =>
      join(
        { en: 'The CiC does not answer:', fr: 'Le CiC ne répond pas :' },
        reasonOf(err),
        { en: '—', fr: '—' },
        RETRY(delay),
      ),
  },
  test: {
    ok: (seen) => {
      const s = summary(seen);
      return { en: `Connected: ${s.en}.`, fr: `Connecté : ${s.fr}.` };
    },
  },
  errors: {
    readOnly:
      'This integration only reads the Quatt installation: nothing can be changed from Gladys',
    notConnected: 'The CiC is not connected: see the configuration of the integration',
    testTooLong:
      'The CiC has not answered yet: see the connection status in a moment (nothing else to do)',
  },
};

/** Labels of `qc.supervisoryControlMode` (home-assistant-quatt, const.py). */
const MODE_LABELS = {
  [MODES.STANDBY]: ['Standby', 'Veille'],
  [MODES.STANDBY_HEATING]: ['Standby - heating', 'Veille - chauffage'],
  [MODES.HEATPUMP_ONLY]: ['Heating - heat pump only', 'Chauffage - pompe à chaleur seule'],
  [MODES.HEATPUMP_PLUS_BOILER]: [
    'Heating - heat pump and boiler',
    'Chauffage - pompe à chaleur et chaudière',
  ],
  [MODES.BOILER_ONLY]: ['Heating - boiler only', 'Chauffage - chaudière seule'],
  [MODES.CHILL_CIRCULATION]: ['Cooling - circulation', 'Rafraîchissement - circulation'],
  [MODES.CHILL_COOLING]: ['Cooling', 'Rafraîchissement'],
  [MODES.STICKY_PUMP_PROTECTION]: [
    'Pump anti-seize protection',
    'Protection anti-blocage de la pompe',
  ],
  [MODES.ANTIFREEZE_BOILER_ON]: [
    'Frost protection - boiler on',
    'Protection antigel - chaudière en marche',
  ],
  [MODES.ANTIFREEZE_BOILER_PREPUMP]: [
    'Frost protection - boiler pre-pump',
    'Protection antigel - pré-circulation de la chaudière',
  ],
  [MODES.ANTIFREEZE_WATER_CIRCULATION]: [
    'Frost protection - water circulation',
    'Protection antigel - circulation d’eau',
  ],
  [MODES.FAULT_CIRCULATION_PUMP]: [
    'Fault - circulation pump on',
    'Défaut - pompe de circulation en marche',
  ],
  [MODES.INVALID_CONFIGURATION]: ['Invalid configuration', 'Configuration invalide'],
};

const TEXTS = {
  en: {
    devices: {
      system: 'Quatt installation',
      heatpump: (number) => `Quatt heat pump ${number}`,
      boiler: 'Boiler (Quatt)',
      thermostat: 'Thermostat (Quatt)',
    },
    features: {
      system: {
        status: 'Status',
        mode_code: 'Status code',
        fault: 'Fault',
        fault_text: 'Fault (text)',
        heatpump_heating: 'Heat pump heating',
        boiler_heating: 'Boiler heating',
        flow_rate: 'Flow rate (l/h)',
        supply_temperature: 'Supply temperature (flow meter)',
        outside_temperature: 'Outside temperature',
        power_input: 'Electrical power of the heat pumps',
        heat_power: 'Heat power of the heat pumps',
        cop: 'COP',
      },
      heatpump: {
        supply_temperature: 'Supply temperature',
        return_temperature: 'Return temperature',
        outside_temperature: 'Outside temperature',
        power_input: 'Electrical power',
        heat_power: 'Heat power',
        cop: 'COP',
        defrost: 'Defrost',
        silent_mode: 'Silent mode',
        limited_by_cop: 'Limited by COP',
        working_mode: 'Working mode (code)',
      },
      boiler: {
        heating: 'Central heating active',
        hot_water: 'Hot water active',
        flame: 'Flame on',
        cic_heating: 'Heating asked by the CiC',
        cic_on: 'Turned on by the CiC',
        supply_temperature: 'Supply temperature',
        return_temperature: 'Return temperature',
        pressure: 'Water pressure',
        heat_power: 'Heat power (estimate)',
      },
      thermostat: {
        room_temperature: 'Room temperature',
        room_setpoint: 'Room setpoint (read only)',
        control_setpoint: 'Water setpoint asked',
        heating_demand: 'Heating demand',
        hot_water_demand: 'Hot water demand',
        cooling_demand: 'Cooling demand',
      },
    },
    unknownMode: (code) => `Unknown state (code ${code})`,
    commissioning: (code) => `Commissioning (code ${code})`,
    noFault: 'No fault',
  },
  fr: {
    devices: {
      system: 'Installation Quatt',
      heatpump: (number) => `Pompe à chaleur Quatt ${number}`,
      boiler: 'Chaudière (Quatt)',
      thermostat: 'Thermostat (Quatt)',
    },
    features: {
      system: {
        status: 'État',
        mode_code: 'Code d’état',
        fault: 'Défaut',
        fault_text: 'Défaut (texte)',
        heatpump_heating: 'Pompe à chaleur en chauffe',
        boiler_heating: 'Chaudière en chauffe',
        flow_rate: 'Débit (l/h)',
        supply_temperature: 'Température de départ (débitmètre)',
        outside_temperature: 'Température extérieure',
        power_input: 'Puissance électrique des pompes à chaleur',
        heat_power: 'Puissance thermique des pompes à chaleur',
        cop: 'COP',
      },
      heatpump: {
        supply_temperature: 'Température de départ',
        return_temperature: 'Température de retour',
        outside_temperature: 'Température extérieure',
        power_input: 'Puissance électrique',
        heat_power: 'Puissance thermique',
        cop: 'COP',
        defrost: 'Dégivrage',
        silent_mode: 'Mode silencieux',
        limited_by_cop: 'Limitée par le COP',
        working_mode: 'Mode de fonctionnement (code)',
      },
      boiler: {
        heating: 'Chauffage actif',
        hot_water: 'Eau chaude active',
        flame: 'Flamme allumée',
        cic_heating: 'Chauffage demandé par le CiC',
        cic_on: 'Allumée par le CiC',
        supply_temperature: 'Température de départ',
        return_temperature: 'Température de retour',
        pressure: 'Pression de l’eau',
        heat_power: 'Puissance thermique (estimation)',
      },
      thermostat: {
        room_temperature: 'Température de la pièce',
        room_setpoint: 'Consigne de la pièce (lecture)',
        control_setpoint: 'Consigne d’eau demandée',
        heating_demand: 'Demande de chauffage',
        hot_water_demand: 'Demande d’eau chaude',
        cooling_demand: 'Demande de rafraîchissement',
      },
    },
    unknownMode: (code) => `État inconnu (code ${code})`,
    commissioning: (code) => `Mise en service (code ${code})`,
    noFault: 'Aucun défaut',
  },
};

export const texts = (language) => TEXTS[language] ?? TEXTS.en;
const index = (language) => (language === 'fr' ? 1 : 0);

/** The supervisory control mode, in words; null when unknown. */
export function modeText(mode, language) {
  if (mode === null) return null;
  const t = texts(language);
  const label = Object.hasOwn(MODE_LABELS, mode) ? MODE_LABELS[mode][index(language)] : null;
  if (label) return label;
  if (mode >= COMMISSIONING.MIN && mode <= COMMISSIONING.MAX) return t.commissioning(mode);
  return t.unknownMode(mode);
}

/** The fault in words: the fault mode, or "No fault"; null when unknown. */
export function faultText(system, language) {
  if (system.fault === null) return null;
  if (!system.fault) return texts(language).noFault;
  return `${modeText(system.mode, language)} (${system.mode})`;
}
