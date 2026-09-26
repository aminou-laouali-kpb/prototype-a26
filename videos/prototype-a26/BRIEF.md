---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Prototype A26 réunit le temps de travail, les RH et la pré-paie dans un même espace vérifiable, en francs CFA."
destination: youtube
aspect: 1920x1080
language: fr
audience: "Dirigeants, DAF et RH de PME en Afrique de l’Ouest"
length: 165s
angle: demo-loop
narration: yes
voice: sW2GXm6gxkDcOrJSCPxv
style_preset: blue-professional
VO_MODE: restructured
---

## Intent

Vidéo commerciale A–Z, show-it-as-is, pour montrer Prototype A26 à des prospects B2B. Parcours complet : promesse et connexion, espace Démo PME, tableau de bord, salariés, temps, congés et validation, feuilles de temps, calcul de pré-paie en FCFA, contrôle à quatre yeux, journal d’audit, appel à une démo personnalisée. Ton mesuré, francophone, sans hype. Voix clonée Aminou (ElevenLabs). Les écrans réels de l’application sont les visuels — ne pas reconstruire l’UI en HTML.

## Assets

- App locale `http://127.0.0.1:5173/` — page de connexion / promesse produit.
- Captures authentifiées admin RH (Distribution Sahel SARL, Niamey — jeu fictif Niger) à déposer dans `capture/assets/` après Step 1.

## Customizations

- Feature captured screens as the video’s assets (show-it-as-is).
- Captions FR, voix Aminou `sW2GXm6gxkDcOrJSCPxv`, provider ElevenLabs.
- `music: none` — pas de lit musical (HeyGen non connecté ; MusicGen indisponible). La voix porte le film.
- Cover every DEMO-VIDEO.md beat in one arc, compressed to ~2 min 45 s.

## Notes

- Données fictives Niger (pack CNSS / IUTS). Ne jamais afficher de mot de passe.
- HeyGen unsigned-in ; TTS local ElevenLabs ready. Autonomous run.
- Ne pas redéployer postgres. Ne pas committer `.env` ni clés.
