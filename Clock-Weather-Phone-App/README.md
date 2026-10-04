# Horloge Météo (téléphone)

Application web (PWA) pour un téléphone posé sur la table de nuit :

- **Horloge analogique** (ou numérique, au choix dans les réglages), sans secondes, sur une moitié de l'écran ; **météo** sur l'autre.
- **Suit l'orientation** : horloge en haut / météo en bas en portrait, côte à côte en paysage.
- Fond noir, **très peu lumineux** (luminosité réglable, 35 % par défaut). **Couleur paramétrable** : gris par défaut, rouge (préserve la vision de nuit), ambre, vert, bleu ou couleur libre. Symbole météo en couleurs (soleil jaune, pluie bleue…), désactivable.
- **Réveils** : autant que voulu, choix des jours (sans jour = sonne une seule fois), volume progressif, vibration, répétition 9 min. Son au choix : **bips** ou **radio française** (France Inter, franceinfo, France Culture, France Musique, FIP, Mouv', RTL, Europe 1, RMC, Radio Classique, TSF Jazz, NRJ, RFM, Skyrock, Radio FG) ou n'importe quel flux en https. Sans réseau ou si la radio ne démarre pas en 12 s, les bips prennent le relais.
- **Météo du moment** [Open-Meteo](https://open-meteo.com) (gratuit, sans clé) : ciel, température, ressenti, vent, humidité. Actualisée toutes les 15 min, dernières données conservées hors ligne.
- **Mode table de nuit** : l'écran reste allumé tant que le téléphone est **en charge** et se met en veille normalement quand on le débranche (réglable). Fonctionne hors ligne une fois installée.

## Installation sur le téléphone

L'application doit être servie en **HTTPS** (géolocalisation, écran maintenu allumé, installation). Le plus simple : **GitHub Pages**.

1. Sur GitHub : *Settings → Pages → Deploy from a branch*, choisir la branche et le dossier `/ (root)`.
2. Ouvrir `https://<utilisateur>.github.io/<dépôt>/Clock-Weather-Phone-App/` sur le téléphone.
3. Installer :
   - **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil / Installer l'application*.
   - **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.
4. Lancer, autoriser la position, toucher l'écran une fois (active le son du réveil et le plein écran).

## Démarrage automatique quand le téléphone est en charge et en paysage

Une application web ne peut pas se lancer toute seule : c'est le téléphone qui doit l'ouvrir, avec une automatisation.

**Android — avec [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid) (gratuit)**

1. Nouvelle macro.
2. Déclencheurs : *Alimentation connectée* **et** *Orientation de l'appareil → Paysage* (les deux, pour que l'ordre « brancher puis tourner » ou « tourner puis brancher » fonctionne).
3. Actions : *Lancer une application → Horloge Météo* (l'application installée depuis Chrome apparaît dans la liste ; à défaut, action *Lancer un raccourci* sur l'icône de l'écran d'accueil).
4. Contraintes : *Alimentation connectée* et *Orientation de l'appareil : Paysage*.

Sur Samsung, *Paramètres → Modes et routines* permet aussi « Si : en charge → Alors : ouvrir l'application Horloge Météo » (sans condition d'orientation).

**iPhone — app Raccourcis**

*Automatisation → Chargeur → Est connecté → Exécuter immédiatement*, action *Ouvrir l'URL* avec l'adresse de l'application. iOS ne propose pas de condition d'orientation, et l'URL s'ouvre dans Safari.

## Utilisation

- Petit bouton en bas à droite : réglages (luminosité, style d'horloge, couleur, symbole météo en couleurs, écran allumé seulement en charge, réveils, lieu de la météo).
- Double-tap sur l'horloge : plein écran.
- Pour un écran encore plus noir, baisser aussi la luminosité du téléphone.

## Limites (important pour le réveil)

Une application web ne peut pas réveiller un téléphone éteint ou verrouillé : **l'application doit rester ouverte au premier plan** pour que le réveil sonne. Le navigateur exige aussi **un premier toucher** pour autoriser le son (touchez l'écran une fois après l'ouverture ; aucun message ne s'affiche en veille). Laisser le téléphone branché avec l'application affichée (elle garde l'écran allumé, très faiblement). Vérifier aussi que le volume « média » n'est pas coupé.
