# Flow de test complet — Prototype A26

**Produit :** Prototype A26 (KPB Global LLC) — RH, temps, congés, pré-paie Afrique de l’Ouest  
**Packs :** Niger (CNSS / IUTS / AMO) · Côte d’Ivoire (CNPS / ITS / CMU)  
**Version cible :** branche `cursor/roadmap-niger-ao-351b` + migration `011`  
**Date du test :** ____________ **Testeur :** ____________ **URL :** ____________

Cochez chaque case. Notez les anomalies en fin de document.

---

## Prérequis (à faire une fois)

| # | Préparation | OK |
|---|---|---|
| P1 | Migrations `001` → `012` appliquées sur Postgres Railway (sans wipe `pgdata`) | ☐ |
| P2 | `.env` local : `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (jamais de `service_role`) | ☐ |
| P3 | `npm install` puis `npm run dev -- --host 127.0.0.1` → http://127.0.0.1:5173 | ☐ |
| P4 | Navigateur : 3 sessions distinctes (profils ou fenêtres privées séparées) | ☐ |

### Comptes à créer

| Session | Rôle | E-mail recette | Mot de passe | Créé |
|---|---|---|---|---|
| A | `admin_rh` | ________________ | (hors doc) | ☐ |
| B | `manager` | ________________ | (hors doc) | ☐ |
| C | `employee` | ________________ | (hors doc) | ☐ |
| D | `approveur_paie` | ________________ | (hors doc) | ☐ |

> Ne pas écrire les mots de passe dans ce PDF ni dans Git.

---

## Flow 1 — Connexion et organisation Niger

**Acteur :** Session A

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 1.1 | Ouvrir l’URL sans session | Écran de connexion A26 | ☐ |
| 1.2 | Mauvais mot de passe | Erreur claire, pas de session | ☐ |
| 1.3 | Créer le compte A (inscription) | Compte créé, écran OrgGate | ☐ |
| 1.4 | Onglet **Créer** : nom org, pays **Niger**, valider | Org créée, admin RH, pack NE | ☐ |
| 1.5 | Menu latéral visible | Tableau de bord, Salariés, Temps, Congés, Feuilles, Pré-paie, Paiements, Paramètres, Abonnement, Audit | ☐ |
| 1.6 | **Paramètres → Organisation** | Pack pays = Niger (CNSS, AMO, IUTS) | ☐ |
| 1.7 | **Paramètres → Règles de paie** | Libellés CNSS / IUTS / AMO (pas CNPS/ITS seuls) | ☐ |
| 1.8 | **Abonnement** | Essai 30 jours démarrable / visible | ☐ |

*Variante démo rapide :* OrgGate → **Démonstration → PME** (données CI démo). Noter pack CI si utilisé.

---

## Flow 2 — Invitations et multi-rôles

**Acteur :** Session A puis B / C / D

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 2.1 | Paramètres → Accès → créer codes `manager`, `employee`, `approveur_paie` | Codes actifs affichés | ☐ |
| 2.2 | (Option) Créer aussi un code `cabinet` | Rôle « Cabinet / expert-comptable » | ☐ |
| 2.3 | Session B : inscription + code manager | Rejoint l’org, rôle manager | ☐ |
| 2.4 | Session C : inscription + code employee | Rejoint l’org | ☐ |
| 2.5 | Session D : inscription + code approveur_paie | Rejoint l’org | ☐ |
| 2.6 | Session A : Salariés → créer/éditer fiches, rattacher C via matricule | Compte C voit « Mon espace » | ☐ |
| 2.7 | Vérifier menus par rôle | Salarié : pas Pré-paie / Salariés / Audit ; Manager : pas Paie admin | ☐ |

---

## Flow 3 — Import salariés (CSV Excel)

**Acteur :** Session A

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 3.1 | Salariés → **Modèle Excel/CSV** | Fichier téléchargé (séparateur `;`) | ☐ |
| 3.2 | Remplir 2–3 lignes (matricule, nom, prénom, salaire, Mobile Money Airtel) | Fichier valide | ☐ |
| 3.3 | **Importer CSV** | Salariés créés / mis à jour + contrats si salaire fourni | ☐ |
| 3.4 | Ouvrir une fiche | Moyen de paiement / opérateur / compte visibles | ☐ |

---

## Flow 4 — Temps, pointage, chronomètre projets

**Acteur :** Session C (salarié)

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 4.1 | Accueil salarié → démarrer présence / pointage | Session ouverte | ☐ |
| 4.2 | Chronomètre projet A → ~30 s → basculer projet B | Cumul A conservé, B actif | ☐ |
| 4.3 | Arrêter le chronomètre | Lignes feuille de temps en brouillon | ☐ |
| 4.4 | Recharger la page | Cumuls du jour conservés | ☐ |
| 4.5 | Menu Temps | Entrées du jour visibles | ☐ |

---

## Flow 5 — Congés

| # | Action | Acteur | Résultat attendu | OK |
|---|---|---|---|---|
| 5.1 | Demander un congé (CAP ou SOL) | C | Demande `pending` | ☐ |
| 5.2 | Approuver le congé | B ou A | Statut `approved` | ☐ |
| 5.3 | (Option) Paramètres → WhatsApp : enfiler notif « Congé approuvé » | A | Ligne `pending` dans la file | ☐ |

---

## Flow 6 — Feuilles de temps

| # | Action | Acteur | Résultat attendu | OK |
|---|---|---|---|---|
| 6.1 | Feuilles → mes heures du mois | C | Heures projets en brouillon | ☐ |
| 6.2 | Soumettre le mois (ou validation manager) | B/A | Statut soumis / approuvé | ☐ |
| 6.3 | Export PDF feuille mensuelle | B/A | PDF avec signatures | ☐ |

---

## Flow 7 — Pré-paie (cycle complet 4 yeux)

**Acteurs :** A (préparateur / admin) puis D (approbateur ≠ préparateur)

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 7.1 | Pré-paie → Nouveau cycle (mois en cours) | Cycle `open` | ☐ |
| 7.2 | Variables : heures supp / primes sur ≥1 salarié | Variables enregistrées | ☐ |
| 7.3 | **Lancer le calcul** | Lignes calculées, cycle `prepared`, libellés CNSS/IUTS (si pack NE) | ☐ |
| 7.4 | Ouvrir le détail d’une ligne | Gains, retenues, charges, empreinte | ☐ |
| 7.5 | Session A tente d’approuver son propre cycle | Refus « quatre yeux » | ☐ |
| 7.6 | Session D approuve | Cycle `approved` | ☐ |
| 7.7 | Session A verrouille | Cycle `locked` | ☐ |

### Exports conformité (après calcul)

| # | Export | Contenu attendu | OK |
|---|---|---|---|
| 7.8 | Export paie CSV | Colonnes pack pays (CNSS/AMO/IUTS ou CNPS/CMU/ITS) | ☐ |
| 7.9 | Masse Mobile Money | Téléphones / montants nets XOF | ☐ |
| 7.10 | Déclaration CNSS (ou CNPS) | Totaux salarié + employeur | ☐ |
| 7.11 | Déclaration IUTS (ou ITS) | Impôt par salarié | ☐ |
| 7.12 | Écritures OHADA | Débit = crédit | ☐ |
| 7.13 | Livre de paie PDF | Tableau + zones tampon / signatures | ☐ |

---

## Flow 8 — Paiements salaires

**Acteur :** A ou préparateur

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 8.1 | Menu **Paiements** → choisir le cycle | Cycles prepared/approved/locked listés | ☐ |
| 8.2 | Créer **Lot Mobile Money** | Lot + lignes pending | ☐ |
| 8.3 | Marquer une ligne **Payé** | Statut `paid`, lot `partial` ou `paid` | ☐ |
| 8.4 | Marquer une autre ligne **Échec** | Statut `failed` + motif | ☐ |
| 8.5 | Créer **Lot espèces** pour un salarié cash | Lot cash | ☐ |
| 8.6 | **Reçu PDF** sur une ligne cash | Document signature salarié / caissier | ☐ |

---

## Flow 9 — Bulletins

| # | Action | Acteur | Résultat attendu | OK |
|---|---|---|---|---|
| 9.1 | Mes bulletins → ouvrir / imprimer | C | Bulletin avec net + détail | ☐ |
| 9.2 | (Option) Envoi e-mail depuis Pré-paie | A | Compteur envoyés / échecs | ☐ |

---

## Flow 10 — Audit et preuves

**Acteur :** A ou auditeur

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 10.1 | Journal d’audit | Actions create_org, compute, approve, import, payment… | ☐ |
| 10.2 | **Export PDF tamponnable** | Impression avec acteurs / dates / détails | ☐ |

---

## Flow 11 — Pack pays & paramètres

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 11.1 | Paramètres → Organisation → passer CI → Appliquer pack | Confirmation ; règles CNPS/ITS actives | ☐ |
| 11.2 | Recalculer un nouveau cycle | Libellés CI sur le bulletin | ☐ |
| 11.3 | Repasser Niger → Appliquer pack | Règles CNSS/IUTS de nouveau | ☐ |
| 11.4 | Types de congés | CAP / MAL / MAT / PAT / EXC / SOL présents | ☐ |

---

## Flow 12 — Abonnement & cabinet

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 12.1 | Abonnement → démarrer essai si absent | `trialing`, date de fin ~+30 j | ☐ |
| 12.2 | Choisir plan PME / Groupe / Cabinet | Plan courant mis à jour (XOF) | ☐ |
| 12.3 | Inviter rôle cabinet, se connecter | Accès multi-org / paie lecture + abonnement | ☐ |

---

## Flow 13 — PWA / hors-ligne (smoke)

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 13.1 | DevTools → Application → Manifest | `Prototype A26`, start_url `/` | ☐ |
| 13.2 | Service worker enregistré | `sw.js` actif | ☐ |
| 13.3 | (Option) Mode offline + tentative pointage | Action mise en file locale / message hors-ligne | ☐ |

---

## Flow 14 — Sécurité rapide

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 14.1 | Compte C ouvre `/paie` directement | Accès refusé / redirection | ☐ |
| 14.2 | Inspecter le réseau : pas de `service_role` | Uniquement anon + JWT user | ☐ |
| 14.3 | Kong `/mcp` public | 403 (volontaire) | ☐ |

---

## Ordre recommandé d’une session de recette (≈ 45–60 min)

1. Prérequis P1–P4  
2. Flow 1 (org Niger)  
3. Flow 2 (invitations)  
4. Flow 3 (import CSV)  
5. Flow 4 → 5 → 6 (temps / congés / feuilles)  
6. Flow 7 (pré-paie + exports)  
7. Flow 8 (paiements)  
8. Flow 9 → 10 (bulletins + audit)  
9. Flow 11 → 12 (pack + abo)  
10. Flow 13 → 14 (PWA + sécu)

---

## Anomalies constatées

| Ref | Sévérité (B/M/C) | Description | Capturé le |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |

---

## Verdict

| | |
|---|---|
| **Statut global** | ☐ GO ☐ GO avec réserves ☐ NO-GO |
| **Commentaire** | |
| **Signature testeur** | |
| **Date** | |

---

*Document généré pour la recette Prototype A26 — packs Niger / Côte d’Ivoire. Les taux de paie sont des SIMULATIONS à faire valider par un expert local avant tout usage déclaratif officiel.*
