---
format: 1920x1080
duration: 165s
message: "Prototype A26 réunit le temps de travail, les RH et la pré-paie dans un même espace vérifiable, en francs CFA."
arc: "Demo Loop — question → product intro → demo RH → demo paie → trust → CTA"
audience: "Dirigeants, DAF et RH de PME en Afrique de l’Ouest"
mode: autonomous
music: none
language: fr
---

## Video direction

Palette from `frame.md` (Blue Professional remixed): canvas `#F8FAFC`, ink `#000000`, accent `#0284C7`, muted `#38BDF8`, card tint `rgba(2,132,199,0.04)`, border `rgba(2,132,199,0.2)`, positive `#059669`. Display / numerals / chrome in Space Grotesk; body in Inter. Pill chrome, no card shadows. Full-bleed app screenshots are the product — never rebuild the UI in HTML; Ken Burns, crop, overlay labels, and floating-window frames only.

Motion grammar: long-tail `power3` settles; VO-paced reveals (nothing before it is named); no lazy breathing; no back-half pan. Holds use subtle jitter at most (sine wave loop low amplitude). Captions own the bottom ~17% — keep labels and chrome in the top 83%.

Rhythm: Frames 1 and 11 are type-forward breathers. Frames 2–8 are screen-forward demo. Frame 9 is a held four-eyes beat. Frame 10 is a slow audit read. Negative list: no browser chrome, no password fields in close-up, no bouncing eases, no generic stock icons standing in for the app, no slideshow dump-then-freeze, no screensaver drift.

Held / breather frames: 1 (question), 9 (four-eyes), 11 (CTA).

---

## Frame 1 — Accroche

- scene: Mots du dilemme RH/paie, un à un, sur fond slate
- voiceover: "Comment tenir le temps, les RH, et la paie — sans trois dossiers, sans trois versions, sans perdre la piste ?"
- duration: 10.564s
- poster: 4s
- transition_in: cut
- status: animated
- src: compositions/frames/01-accroche.html
- type: hook
- persuasion: Rhetorical question
- beat: tension + curiosity
- blueprint: kinetic-type-beats (Adapt)
- focal: assets/01-connexion.png
- roles: 01-connexion = background (dim ~45%, left marketing panel only — never the password field)
- sfx: whoosh-short
- asset_candidates: assets/01-connexion.png — page de connexion et promesse produit, split marketing / formulaire

narrativeRole: Ouvre sur le dilemme du prospect — une piste unique — avant de nommer le produit.
keyMessage: Une seule piste, pas trois dossiers.

Adapt: keep the in-place token swap / multi-beat statement signature; the swap tokens are métier words, not a joke; connexion screenshot is a dim plate, never rebuilt.

Scene 1 (0.0–1.22s): canvas `#F8FAFC`; dimmed connexion plate full-bleed (left promise panel only). Centered display line « Comment tenir » hard-cut flash word-swap. Centered, ~55% of frame, 3 depth layers (plate / type / accent underline).
Scene 2 (1.22–3.0s): in-place token cycle on the object slot — « le temps » / « les RH » / « la paie ». Accent underline draws left→right under the live token.
Scene 3 (3.0–4.56s): the line clears; three short beats slam « trois dossiers » / « trois versions » / « la piste ». Asymmetric 60/40, type dominates.
Scene 4 (4.56–10.564s): last word « piste » holds with a cobalt selection-box; subtle jitter only. Held read.

---

## Frame 2 — Prototype A26

- scene: Promesse produit sur l’écran de connexion réel
- voiceover: "Prototype A26 réunit le temps de travail, les ressources humaines, et la pré-paie. Un même espace. Vérifiable. Pensé pour l’Afrique de l’Ouest. En francs C.F.A."
- duration: 13.438s
- poster: 6s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-prototype.html
- type: product_intro
- persuasion: Category announcement + native CFA
- beat: clarity
- blueprint: device-surface-showcase (Adapt)
- focal: assets/01-connexion.png
- roles: 01-connexion = cutout
- sfx: whoosh-cinematic
- asset_candidates: assets/01-connexion.png — page de connexion et promesse produit, split marketing / formulaire

narrativeRole: Nomme le produit et pose la promesse (message) avant toute preuve d’écran métier.
keyMessage: Temps, RH, pré-paie — un espace vérifiable, en francs CFA.

Adapt: keep the held surface + screen-cycle signature (static-tour); one real screenshot as the window face, labels swap beside it — do not reconstruct the login form.

Scene 1 (0.0–1.45s): canvas; floating app window (no browser chrome) slides in from the right and settles, connexion screenshot as its face tilt ~4°. Side eyebrow « Prototype A26 » not yet. Centered hero window ~70% width, top 83%.
Scene 2 (1.45–4.1s): side headline staggered reveal « temps de travail » then « ressources humaines » then « pré-paie » as VO names each. Window holds; keyword glow on the matching marketing column of the screenshot.
Scene 3 (4.1–6.27s): scale-swap of the side stack to two pills « Un même espace » / « Vérifiable ». Window still.
Scene 4 (6.27–13.438s): pills clear; a cobalt CTA-shaped chip « francs C.F.A. » spring-pops lower-left of the window. Hold, subtle jitter on the chip.

---

## Frame 3 — Espace démo

- scene: Tableau de bord Distribution Ivoire, badge DÉMO, KPIs
- voiceover: "Nous ouvrons l’espace Démo — Distribution Ivoire. Effectif : dix. Congés à valider. Masse nette : un million quatre cent neuf mille francs. Le badge Démo est visible. Rien n’est ambigu."
- duration: 18.233s
- poster: 8s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/03-espace-demo.html
- type: product_intro
- persuasion: Show-don't-tell proof
- beat: confidence
- blueprint: dataviz-countup (Adapt)
- focal: assets/02-tableau-de-bord.png
- roles: 02-tableau-de-bord = background (full-bleed, dim ~20% then lift)
- sfx: ping, pop
- asset_candidates: assets/02-tableau-de-bord.png — tableau de bord Distribution Ivoire SARL, badge DÉMO, KPIs effectif et congés

narrativeRole: Preuve que l’espace est marqué Démo et que les KPIs RH/paie sont déjà là.
keyMessage: Un espace Démo lisible, avec l’effectif et la masse nette.

Adapt: keep count-up + camera land-on-hero-metric; numbers overlay the real dashboard instead of invented charts; no reconstructed KPI cards.

Scene 1 (0.0–2.25s): dashboard plate full-bleed, slight 3D tilt. Overlay display « Distribution Ivoire » per-word staggered reveal. Slow push/focus on the org header. Full-width, 3 layers.
Scene 2 (2.25–4.91s): overlay stat « 10 » counts 0→10 with scale growth, label « Effectif ». Ring sweep around the number. Dashboard remains the plate.
Scene 3 (4.91–8.57s): camera zoom-to-target the masse-nette region of the screenshot. Overlay « 1 409 258 » counts up, label « Masse nette F CFA ». Accent glow bloom behind the overlay.
Scene 4 (8.57–18.233s): a DÉMO pill spring-pops top-right of the keep-out-safe band. Camera eases to a wider settle; hold. No further push.

---

## Frame 4 — Salariés

- scene: Liste des dix salariés fictifs, matricules et salaires FCFA
- voiceover: "Voici les dix salariés. Matricules, postes, services, salaires de base, coordonnées de paiement. Toutes les données sont fictives."
- duration: 13.419s
- poster: 7s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/04-salaries.html
- type: feature_showcase
- persuasion: Feature-to-benefit translation
- beat: control
- blueprint: device-surface-showcase (Adapt)
- focal: assets/03-salaries.png
- roles: 03-salaries = cutout
- sfx: whoosh-short, pop
- asset_candidates: assets/03-salaries.png — liste des 10 salariés fictifs, matricules, salaires FCFA

narrativeRole: Le dossier RH est dans le même espace — contrats et salaires, jeu fictif.
keyMessage: Le dossier salarié est complet, simulé, en francs CFA.

Adapt: keep floating-window + inner scroll signature; real salariés screenshot scrolls inside a clipped window; column labels swap on VO.

Scene 1 (0.0–1.17s): window with salariés list slides in from the left, settles. Centered ~78% width. Side tag empty.
Scene 2 (1.17–4.56s): inner surface scrolls down the list (clipped, `data-layout-allow-overflow` on the moving layer). Side labels cycle matricules / postes / services / salaires / paiement as VO names them. Keyword glow on the spoken column header region.
Scene 3 (4.56–13.419s): scroll settles mid-list. Pill « Données fictives » spring-pops. Hold, subtle jitter on the pill.

---

## Frame 5 — Temps et présences

- scene: KPI Présents du tableau de bord, puis l’espace entier
- voiceover: "Les présences vivent sur le tableau de bord. Arrivées. Sorties. Corrections justifiées. Le chronomètre salarié conserve la session, même après rechargement."
- duration: 14.202s
- poster: 8s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/05-temps.html
- type: benefit_highlight
- persuasion: Friction reduction
- beat: relief + control
- blueprint: zoom-out-workspace-reveal (Adapt)
- focal: assets/02-tableau-de-bord.png
- roles: 02-tableau-de-bord = background
- sfx: whoosh, chime
- asset_candidates: assets/02-tableau-de-bord.png — tableau de bord Distribution Ivoire SARL, badge DÉMO, KPIs effectif et congés

narrativeRole: Le temps de travail n’est pas un autre outil — il alimente le même cockpit.
keyMessage: Pointage et présences dans le même espace, session conservée.

Adapt: keep ONE decelerating zoom-out from a tight UI detail to the whole workspace; detail is the Présents KPI crop of the real dashboard — never zoom back in.

Scene 1 (0.0–2.34s): extreme close-up on the Présents / présence KPI region of the dashboard, full-bleed, no chrome. Overlay chips « Arrivées » then « Sorties » pop top-to-bottom. Camera holds (no zoom-in). Centered crop.
Scene 2 (2.34–4.22s): close-up continues; chip « Corrections justifiées » fades/slides in. Still tight.
Scene 3 (4.22–5.39s): ONE decelerating zoom-out to the full dashboard (scale out only). Signature move. Frame LOCKS at scale 1.
Scene 4 (5.39–14.202s): locked wide. Pill « Session conservée » spring-pops near the présence cluster. Hold. No second camera move.

---

## Frame 6 — Congés

- scene: Soldes et demandes de congés, circuit d’approbation
- voiceover: "Congés : soldes, demandes en attente, circuit de validation. Le manager décide. Le journal conserve le changement de statut."
- duration: 13.602s
- poster: 7s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-conges.html
- type: feature_showcase
- persuasion: Authority by association (rôle manager)
- beat: trust
- blueprint: device-surface-showcase (Adapt)
- focal: assets/05-conges.png
- roles: 05-conges = cutout
- sfx: click-soft, pop
- asset_candidates: assets/05-conges.png — congés — soldes et demandes

narrativeRole: Sépare salarié et manager sur le congé, et promet la trace.
keyMessage: Le manager décide ; le statut est tracé.

Adapt: keep static-tour screen-cycle; one screenshot; highlight-marker on Approuvé rows when VO says journal.

Scene 1 (0.0–1.09s): congés window settles from a slight tilt to flat. Centered ~76%.
Scene 2 (1.09–4.02s): side labels soldes / demandes / validation cycle. Pan/focus-lock onto the demandes table region.
Scene 3 (4.02–5.76s): highlight sweep across an Approuvé row as « Le manager décide ».
Scene 4 (5.76–13.602s): pill « Journal » spring-pops. Hold.

---

## Frame 7 — Feuilles de temps

- scene: Feuille soumise à gauche, synthèse projet à droite
- voiceover: "Feuilles de temps par projet. Bakayoko Mariam : huit heures sur Distribution Abidjan. Soumis. Contrôle. Puis export. La ventilation alimente ensuite la pré-paie."
- duration: 16.091s
- poster: 8s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/07-feuilles.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: clarity
- blueprint: comparison-split (Adapt)
- focal: assets/06-feuilles.png
- roles: 06-feuilles = cutout; 06b-synthese = supporting
- sfx: whoosh-short, pop
- asset_candidates: assets/06-feuilles.png — feuilles de temps par projet; assets/06b-synthese.png — synthèse mensuelle projet Distribution Abidjan, 8 h BAKAYOKO Mariam

narrativeRole: Les heures projet sont contrôlées avant d’entrer en paie.
keyMessage: Heures projet soumises, synthétisées, prêtes pour la pré-paie.

Adapt: keep mirrored book-open split-tilt signature; both cards are real screenshots; duration stretched to the VO; badges are Soumis / 8 h.

Scene 1 (0.0–1.36s): title « Feuilles de temps » slides down from above, accent on « projet ». Centered T-shape.
Scene 2 (1.36–4.43s): left card (06-feuilles) and right card (06b-synthese) enter from opposite wings with mirrored rotateY. Dual ambient glow. Asymmetric? No — 50/50 split, cards in top 83%.
Scene 3 (4.43–7.05s): inner-edge badges « Soumis » then « 8 h » spring-pop. Keyword glow on Bakayoko when named.
Scene 4 (7.05–16.091s): a thin connector label « vers la pré-paie » fades under the pair. Hold, phase-opposed subtle jitter on the two cards.

---

## Frame 8 — Pré-paie

- scene: Cycle septembre Calculée, brut et net FCFA
- voiceover: "Pré-paie de septembre. Nous lisons le calcul. Brut : un million cinq cent quatre-vingt-dix-huit mille. Cotisations. I.T.S. Net à payer : un million quatre cent neuf mille. Charges employeur. Chaque ligne remonte à sa règle. En simulation."
- duration: 20.852s
- poster: 10s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/08-prepaie.html
- type: feature_showcase
- persuasion: Statistical proof
- beat: confidence + awe
- blueprint: dataviz-countup (Adapt)
- focal: assets/07-prepaie.png
- roles: 07-prepaie = background
- sfx: ping, impact-bass-1
- asset_candidates: assets/07-prepaie.png — pré-paie septembre, totaux brut/net, bouton quatre yeux
- handoff_out:
  - element: payroll-screen
  - x: 960
  - y: 486
  - scale: 0.88
  - opacity: 1
  - motion: hold still

narrativeRole: Preuve chiffrée : brut, ITS, net, charges — explicable, en simulation CFA.
keyMessage: Chaque montant de pré-paie remonte à sa règle.

Adapt: keep count-up instruments landing on a hero net metric; overlays on the real pré-paie screenshot; do not invent a chart.

Scene 1 (0.0–2.43s): pré-paie plate full-bleed, dim ~15%. Overlay « Septembre » then « Calculée » per-word. Centered.
Scene 2 (2.43–6.14s): overlay brut counts to 1 598 214. Bar fill beside it. Then chips Cotisations / I.T.S. pop.
Scene 3 (6.14–9.85s): camera zoom-to-target the net region. Hero « 1 409 258 » counts up, label « Net à payer ». Glow bloom.
Scene 4 (9.85–20.852s): pull to a settled wider view of the whole cycle (ends at scale 0.88, x 960, y 486 — handoff). Line « En simulation » holds. Stillness.

---

## Frame 9 — Quatre yeux

- scene: Bouton Valider 4 yeux sur le cycle calculé
- voiceover: "Le contrôle à quatre yeux s’applique. Le préparateur ne valide pas sa propre paie. Un approbateur distinct confirme. Puis l’administrateur peut verrouiller."
- duration: 14.236s
- poster: 7s
- transition_in: crossfade
- status: animated
- src: compositions/frames/09-quatre-yeux.html
- type: benefit_highlight
- persuasion: Risk reversal
- beat: peace of mind
- blueprint: titlecard-reveal (Adapt)
- focal: assets/07-prepaie.png
- roles: 07-prepaie = background (dim ~40% after wipe)
- sfx: chime
- asset_candidates: assets/07-prepaie.png — pré-paie septembre, totaux brut/net, bouton quatre yeux
- handoff_in:
  - element: payroll-screen
  - x: 960
  - y: 486
  - scale: 0.88
  - opacity: 1
  - motion: hold still

narrativeRole: Séparation préparation / validation — le prospect DAF entend le garde-fou.
keyMessage: Le préparateur ne peut pas approuver sa propre paie.

Adapt: keep ONE restrained reveal then a still hold (Benefits slide-up crossfade); busy payroll open wipes to a two-line rule card; screenshot stays as dim plate at the handoff pose.

Scene 1 (0.0–1.14s): payroll-screen already at x 960 / y 486 / scale 0.88 / opacity 1. Static. Busy open.
Scene 2 (1.14–3.1s): ONE diagonal cobalt pill-sweep wipes the busy plate down to 40% dim feel via clip wipe. Two-line card slides up: « Quatre yeux » then « Le préparateur ne valide pas » → Benefits slide-up crossfade. Centered, ~50%.
Scene 3 (3.1–14.236s): qualifier line slides up to « Un second regard, puis le verrouillage ». Hold still — this is a deliberate breather. Subtle jitter on the card only. No second move.

---

## Frame 10 — Audit

- scene: Journal d’audit, calcul de paie et congé approuvé
- voiceover: "Les bulletins personnels restent limités au salarié. Le journal d’audit conserve qui a calculé la paie, qui a approuvé un congé, et quand."
- duration: 14.001s
- poster: 9s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/10-audit.html
- type: social_proof
- persuasion: Authority by association (piste d’audit)
- beat: trust
- blueprint: transcript-scroll-artifact-reveal (Adapt)
- focal: assets/09-audit.png
- roles: 09-audit = background
- sfx: whoosh-short, click-soft
- asset_candidates: assets/09-audit.png — journal d’audit : calcul de paie et congés approuvés

narrativeRole: La confiance n’est pas un slogan — c’est un journal nominatif.
keyMessage: Qui a fait quoi, et quand, reste dans le journal.

Adapt: keep traverse → hinge → artifact; the long surface is the real audit screenshot; hinge is a highlight on « Calcul de paie »; artifact is a « qui / quand » lockup — do not invent extra rows.

Scene 1 (0.0–3.24s): full-bleed audit journal. Title « Journal d’audit » docks top-left. Vertical element scroll down the log (tilt 0). Traversal is the evidence.
Scene 2 (3.24–4.46s): hinge — highlight sweep on the Calcul de paie row. Optional marker circle on the timestamp.
Scene 3 (4.46–14.001s): a small artifact card scales up listing « qui · quoi · quand ». Frame locks. Hold.

---

## Frame 11 — Appel

- scene: Source de vérité, puis invitation à une démo
- voiceover: "A26 donne aux équipes RH, managers et salariés une même source de vérité — du pointage au bulletin. Demandons une démonstration personnalisée, avec vos règles et vos rôles."
- duration: 16.143s
- poster: 10s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/11-appel.html
- type: cta
- persuasion: Value stacking + invitation
- beat: motivation
- blueprint: kinetic-type-beats (Adapt)
- focal: assets/01-connexion.png
- roles: 01-connexion = background (dim ~55%)
- sfx: impact-bass-2, chime
- asset_candidates: assets/01-connexion.png — page de connexion et promesse produit, split marketing / formulaire

narrativeRole: Referme la boucle du message et invite à une démo aux règles du prospect.
keyMessage: Une source de vérité — demandons une démo avec vos règles.

Adapt: keep CTA beat-by-beat type landing on a lockup; dimmed connexion plate behind; no fake URL; closing chip is « Démonstration personnalisée ».

Scene 1 (0.0–2.35s): dim plate. Centered « Une source de vérité » kinetic beat-slam.
Scene 2 (2.35–5.36s): line swaps to « du pointage au bulletin » via hard-cut word-swap.
Scene 3 (5.36–7.45s): type clears toward center; cobalt pill « Démonstration personnalisée » spring-pops. Subline « vos règles · vos rôles » per-word.
Scene 4 (7.45–16.143s): lockup holds (Prototype A26 + pill). Subtle jitter only. Final frame may ease smaller on the pill — no other exit.
