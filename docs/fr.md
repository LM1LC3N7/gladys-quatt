# Quatt

Votre pompe à chaleur hybride **Quatt** dans Gladys, lue par l'API JSON
locale de son **CiC** (le boîtier de commande Quatt, « Commissioning and
Control ») sur votre réseau, sans cloud, **en lecture seule** :

- **l'installation** : **état** (veille, chauffage par la pompe à chaleur,
  avec la chaudière, protection antigel…), **code d'état**, **défaut** (oui /
  non et en texte), **pompe à chaleur en chauffe**, **chaudière en chauffe**,
  **débit** (l/h), **température de départ** (débitmètre), **température
  extérieure**, **puissance électrique** et **puissance thermique** des
  pompes à chaleur, **COP** ;
- **chaque pompe à chaleur** (deux pour une Quatt Duo) : températures de
  **départ** et de **retour**, **température extérieure**, **puissance
  électrique**, **puissance thermique**, **COP**, **dégivrage**, **mode
  silencieux**, **limitée par le COP**, **mode de fonctionnement** (code) ;
- **la chaudière** (installation hybride) : **chauffage actif**, **eau
  chaude active**, **flamme allumée** (chaudière OpenTherm), **chauffage
  demandé par le CiC**, **allumée par le CiC**, températures de **départ** et
  de **retour**, **pression de l'eau**, **puissance thermique (estimation)** ;
- **le thermostat** : **température de la pièce**, **consigne de la pièce**
  (lecture), **consigne d'eau demandée**, demandes de **chauffage**, d'**eau
  chaude** et de **rafraîchissement**.

> **Cette intégration n'a jamais été testée avec un vrai CiC.** Cette
> première version a été écrite à partir de l'intégration Home Assistant
> home-assistant-quatt et testée seulement contre un faux CiC. Dites sur le
> forum de Gladys ce qui marche et ce qui ne marche pas.

> **L'API locale du CiC n'est pas documentée par Quatt.** Son adresse
> (`/beta/feed/data.json`) et le nom de ses valeurs viennent de la communauté
> (home-assistant-quatt). Une mise à jour du CiC peut la changer ou la
> retirer sans prévenir : l'intégration le dit alors dans son état de
> connexion.

Intégration non officielle, sans lien avec Quatt.

## Configuration

- **Adresse du CiC** : son adresse IP sur votre réseau (`192.168.1.30`, voir
  la liste des appareils de votre box) ; le port 8080 est utilisé par défaut,
  un autre peut suivre (`192.168.1.30:8081`). Préférez l'adresse IP : un nom
  en `.local` (mDNS) ne se résout pas dans le conteneur de l'intégration.
  Donnez-lui une adresse fixe dans votre box. L'API locale ne parle qu'en http
  simple : une adresse `https://` est refusée avec un message clair. Aucun
  identifiant n'est demandé : l'API locale n'en a pas.
- **Langue des appareils** : français (par défaut) ou anglais, pour les noms
  des appareils et les textes d'état et de défaut.

Ouvrez ensuite l'onglet **Découverte** et créez les appareils à suivre. Le
bouton **Tester la connexion** lit le CiC tout de suite et liste ce qu'il
signale.

## Lecture seule

- Gladys ne fait que **lire** le CiC : rien ne change la consigne, le mode, la
  pompe à chaleur ni la chaudière. Une commande envoyée depuis une scène ou
  l'API de Gladys est refusée avec un message, et rien ne part vers le CiC.
- Aucune fonctionnalité n'est un interrupteur : « éteins tout » et les
  assistants vocaux ne peuvent pas agir sur l'installation.
- La consigne de la pièce est publiée comme une **température** (lecture),
  pas comme un thermostat réglable : elle ne s'affiche donc pas comme une
  commande.

## Ce que valent les valeurs

- **Températures de l'eau, température extérieure et les deux consignes**
  (consigne de la pièce et consigne d'eau demandée) : ce sont des sondes ;
  Gladys ne les compte pas dans la température de la pièce où l'appareil est
  rangé. Seule la **température de la pièce** du thermostat y compte.
- **COP** : la puissance thermique divisée par la puissance électrique, telles
  que les pompes à chaleur les donnent (le « Quatt COP » de Home Assistant).
  Il n'est publié que quand la pompe à chaleur chauffe, ou qu'elle consomme
  plus de 100 W : en veille (quelques watts), ce rapport ne veut rien dire.
  Il ne l'est pas non plus pendant un dégivrage (il serait négatif).
- **Puissance thermique de la chaudière** : une **estimation** (différence
  entre la température du débitmètre et la sortie de la pompe à chaleur ×
  débit × capacité de l'eau), comme dans Home Assistant ; 0 quand la chaudière
  ne chauffe pas.
- **Débit** : en litres par heure (l/h) ; Gladys n'a pas cette unité, elle
  est donc dans le nom de la fonctionnalité.
- **Défauts** : l'API locale ne donne que l'état « Défaut - pompe de
  circulation en marche » (99) et « Configuration invalide » (400). Les codes
  d'erreur détaillés de la pompe à chaleur ou de la chaudière n'y figurent
  pas : voyez l'application Quatt.
- **Énergie** : l'API locale n'a pas de compteur d'énergie. L'intégration ne
  publie donc aucun index ni consommation, seulement des puissances
  instantanées (elle n'invente jamais un cumul).
- Une valeur absente ou incohérente de la réponse du CiC n'est pas publiée :
  Gladys garde la dernière valeur connue (jamais un 0 à sa place).

## Rafraîchissement et limites

- Le CiC est lu toutes les **30 secondes** (une seule requête). Seules les
  valeurs qui changent sont envoyées à Gladys (et chacune au moins toutes les
  30 minutes).
- Les appareils sont reconnus par l'**identifiant du CiC** (`CIC-…`), pas par
  son adresse IP : un changement d'adresse garde les appareils, leur
  historique et leurs scènes.
- Un appareil que le CiC ne signale plus (une chaudière retirée, une seconde
  pompe à chaleur) apparaît injoignable ; ses fonctionnalités restent.
- Une installation tout électrique (batterie thermique) est lue aussi, mais
  ses valeurs propres (batterie thermique, chargeur) ne sont pas encore
  publiées.

## Problèmes de connexion

- **CiC injoignable** : tous les appareils apparaissent injoignables ;
  nouvel essai après 30 s, puis de plus en plus rarement jusqu'à toutes les
  10 min (jamais plus vite que la lecture normale).
- **HTTP 404** ou **réponse inattendue** : l'adresse répond, mais pas comme
  l'API locale d'un CiC (mauvaise adresse, mauvais port, ou API changée par
  une mise à jour du CiC).
- **CiC surchargé** (HTTP 429) : toutes les requêtes s'arrêtent de 1 minute à
  6 heures, même après un redémarrage de l'intégration (la fin de la pause est
  gardée dans `/data`) ; enregistrer la configuration ou appuyer sur
  **Tester la connexion** lève la pause.
- Les journaux ne contiennent pas le texte des réponses du CiC, seulement des
  codes (HTTP 500, pas de connexion…).

## Limites

- Un seul CiC par intégration.
- Lecture seule : aucune commande, ni consigne, ni mode.
- Ni prix de l'énergie, ni tarif, ni valeurs de l'API mobile (cloud) de Quatt.
- Jamais testée avec un vrai CiC.
