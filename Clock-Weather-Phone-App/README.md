# Horloge Météo (téléphone)

Application Android (**APK**) et application web (PWA) pour un téléphone posé sur la table de nuit :

- **Horloge analogique** avec **trotteuse rouge** en mouvement continu (désactivable), ou numérique sans secondes, au choix dans les réglages, sur une moitié de l'écran ; **météo**, date, prochain réveil et **niveau de batterie** (éclair jaune en charge, rouge si faible ; Android uniquement) sur l'autre.
- **Suit l'orientation** : horloge en haut / météo en bas en portrait, côte à côte en paysage.
- Fond noir, **très peu lumineux**. **Luminosité selon l'heure** : 20 % la nuit à partir de 22:30, 100 % le jour à partir de 07:00 (heures et niveaux réglables ; sinon luminosité fixe réglable). **Couleur paramétrable** : gris par défaut, rouge (préserve la vision de nuit), ambre, vert, bleu ou couleur libre. Symbole météo en couleurs (soleil jaune, pluie bleue…), désactivable.
- **Réveils** : autant que voulu, choix des jours (sans jour = sonne une seule fois), volume progressif, vibration, répétition 9 min. Son au choix : **bips** ou **radio française** (France Inter, franceinfo, France Culture, France Musique, FIP, Mouv', RTL, Europe 1, RMC, Radio Classique, TSF Jazz, NRJ, RFM, Skyrock, Radio FG) ou n'importe quel flux en https. Sans réseau ou si la radio ne démarre pas en 12 s, les bips prennent le relais.
- **Météo du moment** [Open-Meteo](https://open-meteo.com) (gratuit, sans clé) : symbole et température seulement. Actualisée toutes les 15 min, dernières données conservées hors ligne.
- **Agenda** (APK) : les 3 prochains événements d'aujourd'hui et de demain de l'agenda Google synchronisé sur le téléphone (aucune connexion à un compte nécessaire), sous la météo.
- **Mode table de nuit** : l'écran reste allumé tant que le téléphone est **en charge** et se met en veille normalement quand on le débranche (réglable). Fonctionne hors ligne une fois installée.

## Application Android (APK) — recommandée sur Android

L'APK reprend exactement la même interface et ajoute ce qu'une page web ne peut pas faire :

- **Vrai réveil** : il sonne même si l'application est fermée ou le téléphone verrouillé (réveil système Android, icône d'alarme dans la barre d'état). Si l'application tarde à s'afficher, le son d'alarme du téléphone sonne en attendant.
- **Ouverture automatique quand le téléphone est en charge et en paysage** (sans MacroDroid). Une notification discrète « Ouverture automatique en charge » reste affichée pour que ça fonctionne.
- Affichage **par-dessus l'écran de verrouillage**, plein écran, écran maintenu allumé en charge.
- Le son du réveil (bips ou radio) n'a plus besoin d'un premier toucher ; le volume « média » est remonté à 40 % pendant la sonnerie s'il était plus bas.

### Installer l'APK

1. Sur le téléphone, ouvrir dans Chrome : `https://<utilisateur>.github.io/<dépôt>/Clock-Weather-Phone-App/HorlogeMeteo.apk` (ou le fichier `HorlogeMeteo.apk` de ce dossier).
2. Ouvrir le fichier téléchargé. Android demande d'autoriser Chrome à **installer des applications inconnues** : l'autoriser, puis **Installer**. Si Play Protect affiche un avertissement : *Plus de détails → Installer quand même*.
3. Au premier lancement, autoriser les **notifications** et la **position**.
4. Dans les réglages de l'appli (petit bouton en bas à droite), section **Application Android** : toucher **Autoriser l'ouverture automatique** et activer *Superposition sur d'autres applis* pour Horloge Météo.
5. Si une macro MacroDroid ouvre déjà l'horloge, la désactiver.

Les mises à jour s'installent par-dessus (réglages et réveils conservés).

### Compiler l'APK

```sh
cd android
ANDROID_HOME=/chemin/vers/android-sdk ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

L'interface (`index.html`, `style.css`, `app.js`, `icons/`) est copiée dans l'APK à la compilation : une seule source pour les deux versions. La clé de signature (`android/keystore/`) est dans le dépôt pour que chaque nouvelle version s'installe par-dessus la précédente.

## Version web : installation sur le téléphone

L'application doit être servie en **HTTPS** (géolocalisation, écran maintenu allumé, installation). Le plus simple : **GitHub Pages**.

1. Sur GitHub : *Settings → Pages → Deploy from a branch*, choisir la branche et le dossier `/ (root)`.
2. Ouvrir `https://<utilisateur>.github.io/<dépôt>/Clock-Weather-Phone-App/` sur le téléphone.
3. Installer :
   - **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil / Installer l'application*.
   - **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.
4. Lancer, autoriser la position, toucher l'écran une fois (active le son du réveil et le plein écran).

## Version web : démarrage automatique en charge et en paysage

(Inutile avec l'APK, qui le fait elle-même.) Une application web ne peut pas se lancer toute seule : c'est le téléphone qui doit l'ouvrir, avec une automatisation.

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

## Version web : limites (important pour le réveil)

Une application web ne peut pas réveiller un téléphone éteint ou verrouillé : **l'application doit rester ouverte au premier plan** pour que le réveil sonne. Le navigateur exige aussi **un premier toucher** pour autoriser le son (touchez l'écran une fois après l'ouverture ; aucun message ne s'affiche en veille). Laisser le téléphone branché avec l'application affichée (elle garde l'écran allumé, très faiblement). Vérifier aussi que le volume « média » n'est pas coupé.
