# Horloge Météo (téléphone)

Application web (PWA) pour un téléphone posé sur la table de nuit :

- **Horloge** sur une moitié de l'écran, **météo** sur l'autre.
- **Suit l'orientation** : horloge en haut / météo en bas en portrait, côte à côte en paysage.
- **Noir et blanc uniquement** (niveaux de gris), fond noir, **très peu lumineux** (luminosité réglable, 35 % par défaut).
- **Réveils** : autant que voulu, choix des jours (sans jour = sonne une seule fois), son progressif, vibration, répétition 9 min.
- Météo [Open-Meteo](https://open-meteo.com) (gratuit, sans clé) : température, ressenti, min/max, vent, humidité, lever/coucher du soleil, 6 prochaines heures. Actualisée toutes les 15 min, dernières données conservées hors ligne.
- Garde l'écran allumé (API Wake Lock) et fonctionne hors ligne une fois installée.

## Installation sur le téléphone

L'application doit être servie en **HTTPS** (géolocalisation, écran maintenu allumé, installation). Le plus simple : **GitHub Pages**.

1. Sur GitHub : *Settings → Pages → Deploy from a branch*, choisir la branche et le dossier `/ (root)`.
2. Ouvrir `https://<utilisateur>.github.io/<dépôt>/Clock-Weather-Phone-App/` sur le téléphone.
3. Installer :
   - **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil / Installer l'application*.
   - **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.
4. Lancer, toucher l'écran (active le son du réveil et garde l'écran allumé), autoriser la position.

## Utilisation

- Petit bouton en bas à droite : réglages (luminosité, secondes, réveils, lieu de la météo).
- Double-tap sur l'horloge : plein écran.
- Pour un écran encore plus noir, baisser aussi la luminosité du téléphone.

## Limites (important pour le réveil)

Une application web ne peut pas réveiller un téléphone éteint ou verrouillé : **l'application doit rester ouverte au premier plan** pour que le réveil sonne. Laisser le téléphone branché avec l'application affichée (elle garde l'écran allumé, très faiblement). Vérifier aussi que le volume « média » n'est pas coupé.
