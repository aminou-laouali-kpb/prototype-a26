# Démo vidéo commerciale — Prototype A26

## Objectif

Produire une vidéo de prise en main en français, destinée à la prospection B2B. La démonstration montre un cycle complet : organisation, salariés, temps, congés, feuilles de temps, pré-paie, bulletin et audit.

Format recommandé : paysage 16:9, 4 à 5 minutes, données fictives, voix off française et sous-titres.

## Préparation avant enregistrement

- [ ] Migrations appliquées sur le projet Supabase de démonstration.
- [ ] `.env` local pointe vers ce projet et ne contient aucune clé secrète.
- [ ] Compte `admin_rh` créé.
- [ ] Espace **PME** créé depuis l’onglet Démonstration (Distribution Sahel SARL, pack Niger).
- [ ] 12 salariés, 3 projets et le cycle de paie du **mois précédent** sont visibles.
- [ ] Comptes `manager` et `employee` créés sur des adresses de recette dédiées.
- [ ] Les invitations ont été utilisées et la fiche salarié de démonstration est rattachée.
- [ ] Une demande de congé, des heures de projet et des variables de paie sont disponibles.
- [ ] Le cycle du mois précédent a été calculé une fois en répétition : brut = salaire de base pour tous, sauf une journée sans solde (magasinier payé en espèces).
- [ ] Un bulletin est visible et téléchargeable.
- [ ] Une prise de secours a été faite après remise à zéro de l’espace démo.

## Comptes à préparer

Ne pas mettre les mots de passe dans ce fichier ou dans la vidéo.

| Session | Rôle | Utilisation dans la vidéo |
|---|---|---|
| A | `admin_rh` | Création, configuration, paie et audit |
| B | `manager` | Validation des feuilles et congés |
| C | `employee` | Pointage, chronomètre, demande de congé, bulletins personnels |
| D | `approveur_paie` | Validation « 4 yeux » par un acteur distinct du préparateur |

Utiliser des profils navigateur distincts pour éviter les sessions croisées. Plusieurs fenêtres privées d'un même navigateur peuvent partager la même session.

## Parcours enregistré

### 1. Accroche — 0:00 à 0:20

Message : « Prototype A26 réunit le temps de travail, les ressources humaines et la pré-paie dans un même espace vérifiable. »

À l’écran : page de connexion, promesse produit, accès par rôle.

### 2. Création de l’espace — 0:20 à 0:45

Compte A → **Démonstration → PME**.

À montrer : espace clairement marqué `DÉMO`, salariés, projets et paramètres préchargés.

### 3. Vue RH — 0:45 à 1:20

Compte A → **Tableau de bord**, puis **Salariés**.

À montrer : effectif (12), masse salariale nette du dernier cycle, répartition par service, fiches avec matricule, contrat et paiement Mobile Money (Airtel, Moov, Zamani).

### 4. Temps et projets — 1:20 à 2:00

Compte C → **Mon espace** → démarrer le chronomètre sur le projet A, basculer sur B, arrêter.

À montrer : temps en direct, ventilation par projet, conservation après rechargement et feuille brouillon.

### 5. Congés et validation — 2:00 à 2:35

Compte C → créer une demande de congé. Compte B → **Congés** → approuver ou refuser.

À montrer : séparation salarié/manager et traçabilité du changement de statut.

### 6. Feuilles de temps — 2:35 à 3:05

Compte C → soumettre ses heures. Compte B → **Feuilles de temps** → contrôler puis approuver.

À montrer : circuit de validation et export.

### 7. Pré-paie — 3:05 à 3:55

Compte A → **Pré-paie** → cycle du mois précédent → saisir une variable → **Lancer le calcul**.

À montrer : brut, CNSS salarié, IUTS, net à payer, charges employeur (CNSS, ANPE, FAFPA), détail explicable du bulletin et la ligne « Absence non payée (1 j) » du magasinier.

### 8. Contrôle à quatre yeux — 3:55 à 4:20

Compte A calcule le cycle. Compte D, approbateur distinct, clique **Valider (4 yeux)**. Compte A **verrouille** ensuite (le verrouillage est réservé à l’administrateur RH). Le rôle `manager` seul ne permet pas d'approuver la paie.

À montrer : le préparateur ne peut pas valider sa propre paie et une période verrouillée n’est plus modifiable.

### 9. Bulletin et audit — 4:20 à 4:45

Compte C → **Mes bulletins**. Compte A → **Journal d’audit**.

À montrer : accès limité aux bulletins personnels, téléchargement, et dans le journal les colonnes **Qui / Action / Détails** (calcul par l’admin, validation par l’approbateur).

### 10. Conclusion — 4:45 à 5:00

Message : « A26 donne aux équipes RH, managers et salariés une même source de vérité, du pointage au bulletin. »

Appel à l’action : proposer une démonstration personnalisée avec les règles et rôles du prospect.

## Critères de réussite de la prise

- Aucun écran vide ou spinner permanent.
- Aucun message d’erreur Supabase dans la console.
- Chaque changement de rôle montre uniquement les menus et données autorisés.
- Les montants affichés dans le bulletin s’équilibrent.
- Le chronomètre conserve les secondes et ne perd pas la session après rechargement.
- Les transitions entre les trois sessions sont coupées au montage pour rester fluides.
- Les adresses, matricules, coordonnées bancaires et données salariales visibles sont fictifs.

## Ordre de recette avant tournage

Suivre les sections 1 à 8 de `DOCUMENT-TEST.md`, puis refaire le parcours enregistré ci-dessus sans modifier la base. En cas d’échec, utiliser **Paramètres → Accès et invitations → Réinitialiser les données de démonstration** (les comptes restent rattachés à leur fiche) et rejouer la recette.

## Points d’attention au tournage

- Une fenêtre salarié inactive est déconnectée au bout d’environ 30 minutes : relancer la session avant chaque prise.
- Filmer un jour ouvré : le compteur « Présents aujourd’hui » reste à 0 le week-end.
- Les captures de `videos/prototype-a26/capture/assets/` datent d’avant les packs pays (Côte d’Ivoire, sans Primes / Paiements / Abonnement) : les refaire, puis mettre à jour `SCRIPT.md` et `STORYBOARD.md` (nom de l’organisation, montants, IUTS au lieu d’ITS).
