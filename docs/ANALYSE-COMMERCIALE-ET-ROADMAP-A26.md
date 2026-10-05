---
css: |
  @page { margin: 18mm 16mm; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    font-size: 12.5pt;
    line-height: 1.6;
  }
  h1 {
    font-size: 26pt;
    color: #0f766e;
    border-bottom: 3px solid #0f766e;
    padding-bottom: 8px;
    margin-bottom: 4px;
  }
  h2 {
    font-size: 16pt;
    color: #0f766e;
    margin-top: 28px;
    border-left: 5px solid #0f766e;
    padding-left: 10px;
  }
  h3 { font-size: 13pt; color: #0f172a; margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #f0fdfa; color: #115e59; }
  blockquote {
    background: #f8fafc;
    border-left: 4px solid #94a3b8;
    margin: 14px 0;
    padding: 10px 14px;
    color: #334155;
  }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 11pt; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  ul, ol { padding-left: 22px; }
  li { margin-bottom: 5px; }
  .note { font-size: 10.5pt; color: #64748b; }
---

# Prototype A26 — Analyse commerciale et roadmap

**Ce qui fait signer, et comment relier la performance aux récompenses.**
Éditée par KPB Global LLC · Pour le Niger et l'Afrique de l'Ouest · En français · En FCFA

> **Comment lire ce document ?**
> Les sections 1 à 3 sont pour le commercial, avant et pendant la démo.
> Les sections 4 et 5 disent quoi construire, dans quel ordre.
> La section 6 est pour un directeur technique ou un cabinet qui audite.
> La section 7 dit quels supports mettre à jour. L'annexe rend le texte autonome.
> Chaque constat renvoie à un fichier ou à une table du produit, vérifié dans le dépôt.

<p class="note">Document de travail interne. Il ne modifie pas le logiciel. Les tarifs cités sont ceux déjà codés dans <code>src/lib/billing.ts</code>. L'option « Performance » est une piste, pas un prix annoncé.</p>

---

## 1. Résumé exécutif

1. A26 couvre déjà le mois de travail, du pointage jusqu'au fichier de paiement, en français et en FCFA.
2. La confiance est dans le produit : deux personnes pour valider la paie, journal qu'on ne peut pas modifier, bulletin expliqué ligne par ligne, packs Niger et Côte d'Ivoire.
3. La signature coince sur des promesses que le prospect voit en démo et que le produit ne tient pas encore : WhatsApp, PDF, hors-ligne, mot de passe oublié, étiquette « SIMULATION ».
4. Cinq chantiers font passer de « intéressant » à « il nous le faut ».
5. **WhatsApp.** Le message part quand un congé est décidé, quand la paie est approuvée, et quand le mois est verrouillé.
6. **PDF.** Le bulletin arrive en pièce jointe dans le mail, avec le même détail que l'écran.
7. **Tableau de bord.** Le directeur voit l'absentéisme, les retards et la masse salariale sur douze mois, dès la première minute.
8. **Abonnement.** L'essai se transforme en contrat payé, par Mobile Money ou par virement, au lieu de rester « en attente de paiement ».
9. **Performance.** Les objectifs du responsable et les indicateurs déjà présents dans l'application deviennent une prime, un badge ou un avantage, après validation du responsable RH.
10. En une phrase : A26 ne fait pas que payer vos salariés, il vous dit qui mérite plus, avec des preuves, et le responsable RH transforme ça en récompense dans la paie déjà en place.

---

## 2. Ce qui fait déjà dire « il nous le faut »

Ces arguments sont montrables aujourd'hui. Le commercial s'appuie sur l'écran, puis sur la preuve ci-dessous si le prospect demande « où est-ce dans le produit ? ».

| Argument à dire | Preuve dans le produit | Qui l'entend |
|---|---|---|
| **Deux signatures sur la paie.** La personne qui calcule ne peut pas approuver son propre mois. | Fonction `approve_payroll_period` : le cycle doit être au statut `prepared`, et `prepared_by` doit être un autre utilisateur, rôle `admin_rh` ou `approveur_paie`. Fichier `supabase/migrations/20260917175936_security_hardening_rls_and_atomic_guards.sql`. | DG de PME, DAF, cabinet |
| **Après validation, le mois se ferme.** Seul l'administrateur RH verrouille un cycle déjà approuvé. | `lock_payroll_period` dans `supabase/migrations/20260926120000_013_annual_employee_bonuses.sql`. Le verrouillage passe aussi les primes rattachées en « versée ». | DAF, RH |
| **On ne réécrit pas l'histoire.** Le journal refuse toute modification et toute suppression. | Table `audit_log` (migration `003`) et trigger `a26_guard_audit_log` qui appelle `private.guard_audit_log`. Une mise à jour ou une suppression lève « Le journal d'audit est inaltérable ». L'auteur et l'heure sont imposés par le serveur. | Cabinet, auditeur, bailleur |
| **Chaque ligne du bulletin a une raison.** | Table `payroll_details` : `rule_code`, `rule_version`, `rule_source`. Affiché dans `src/pages/Payroll.tsx`. Le calcul est produit par `src/lib/payroll.ts`. | RH, salarié, cabinet |
| **Les règles du Niger et de la Côte d'Ivoire sont dans le produit, avec leurs sources.** | Migration `012_official_2026_rates` et `src/lib/countryPacks.ts`. Niger : CNSS (décret 2023-449), ANPE 1 %, plafond 500 000 F, SMIG 42 000 F, IUTS. Côte d'Ivoire : CNPS, ITS, CMU 500 F, FDFP, SMIG 75 000 F. Le pays se choisit et s'applique par `apply_country_pack`. | DAF, cabinet |
| **Les fichiers que le comptable et la caisse demandent sortent du même mois.** | `src/lib/exports.ts` : déclaration CNSS ou CNPS (`exportSocialDeclarationCsv`), IUTS ou ITS (`exportTaxDeclarationCsv`), écritures OHADA refusées si le débit et le crédit s'écartent (`exportOhadaCsv`), livre de paie (`printPayrollBook`), fichier Mobile Money (`exportMobileMoneyFile`). | DAF, cabinet |
| **On paie par téléphone ou en espèces, avec une preuve.** | Tables `payment_batches` et `payment_batch_lines` (migration `011`). Canaux `mobile_money`, `cash`, `bank`, `mixed`. Reçu espèces : `printCashReceipt` dans `src/lib/exports.ts`, écran `src/pages/Payments.tsx`. Opérateurs du pack Niger : Airtel Money, Moov Money, Zamani. | DG, RH, ONG |
| **Sept rôles, et un cabinet peut suivre plusieurs clients.** | Rôles dans `src/lib/types.ts` : administrateur RH, responsable d'équipe, préparateur, approbateur paie, salarié, auditeur, cabinet. Le menu change de société dans `src/components/Layout.tsx` dès qu'un compte a plusieurs organisations. Droits des pages : `src/lib/access.ts`. | Cabinet, groupe |
| **On reprend le fichier Excel des salariés.** | Modèle et lecture CSV dans `src/lib/employeeImport.ts`, bouton dans `src/pages/Employees.tsx`. Matricule, contrat, salaire, Mobile Money. | RH |
| **Le temps par projet sert à justifier un bailleur.** | Chronomètre `project_timers` (migration `008`), bascule de projet, arrêt vers la feuille de temps. Écran salarié `src/pages/EmployeeHome.tsx`. | ONG, bailleur |
| **Le prix est simple : un tarif par salarié, en FCFA, avec un plancher.** | `src/lib/billing.ts` et le guide, section 12. Essai 30 jours / 25 sièges. PME 2 500 F, plancher 75 000 F, 50 sièges. Groupe 2 000 F, plancher 200 000 F. Cabinet 1 800 F, plancher 350 000 F. L'annuel compte 10 mois. La demande d'offre passe par `request_subscription_plan`. | DG, DAF |
| **Une prime annuelle a déjà un circuit.** | Table `employee_bonuses`, statuts `draft` → `approved` → `scheduled` → `paid`. Types `performance`, `13e_mois`, `autre`. Le responsable propose, l'administrateur RH valide, le préparateur rattache au mois ouvert. Le montant entre dans le brut. Migration `013`, écran `src/pages/Bonuses.tsx`. | RH, manager |

> **Phrase de démo, si le temps est court.**
> « De l'heure travaillée jusqu'au salaire, deux personnes signent, chaque ligne se justifie, et le fichier pour la caisse sort du même endroit. »

<p class="note">Le guide, section 7, montre encore un exemple chiffré avec d'anciens pourcentages de démonstration (CNSS 1,6 %, AMO 1 %, etc.). Le moteur, lui, utilise les barèmes sourcés de la migration 012. En démo, ouvrir un bulletin du jeu Niger, pas la page 7 du guide, pour les montants.</p>

---

## 3. Ce qui fait hésiter aujourd'hui

Ces phrases arrivent pendant la démo. Chacune correspond à un endroit précis du code. Mieux vaut les dire avant le prospect, et montrer le contournement honnête, que de les découvrir à l'écran.

| Ce que le prospect dit | Ce que le produit fait aujourd'hui |
|---|---|
| « Vous dites WhatsApp, mais rien ne part. » | Le guide, section 9, promet « votre congé est approuvé » et « votre bulletin est prêt ». L'écran Paramètres dit : « Branchez l'API WhatsApp Business pour l'envoi réel ; en attendant, marquez envoyé après envoi manuel » (`src/pages/Settings.tsx`). La table `notification_outbox` existe (migration `011`). La fonction `enqueue_notification` existe. Aucune fonction ne l'appelle quand un congé est décidé (`decide_leave_request`), quand la paie est approuvée, ou quand le mois est verrouillé. La seule fonction Edge du dépôt est `supabase/functions/send-payslips`. Il n'y a pas de worker qui lit la file. |
| « Où est le PDF ? » | Le bulletin « téléchargeable » ouvre une fenêtre du navigateur et appelle l'impression (`src/lib/documents.ts`, `window.print`). L'e-mail (`send-payslips`) envoie un résumé HTML : brut, retenues, net. Le corps du message dit « téléchargez le détail complet en PDF », et la requête vers Resend n'a pas de pièce jointe. |
| « Ça marche hors ligne ? » | Le guide, section 9, le dit pour le pointage. Le service worker `public/sw.js` met en cache `/`, `/index.html`, le manifeste et le favicon. Il met aussi en cache les fichiers `.css`, `.svg`, `.png`, `.woff2`. Il ne met pas en cache les fichiers JavaScript de l'application. Sans réseau, la page d'accueil peut s'afficher, l'application ne s'exécute pas. La file locale (`src/lib/offlineQueue.ts`) connaît quatre types d'actions, et le rejeu (`flushOfflineQueue`) n'envoie que `clock_in`. |
| « Et si j'oublie mon mot de passe ? » | L'écran `src/components/AuthScreen.tsx` propose la création de compte et la connexion. Il n'y a pas de lien « mot de passe oublié », ni d'appel à une réinitialisation. |
| « Les taux sont des simulations ? » | Oui, à l'écran. Le bandeau `SIMULATION` est dans `src/components/ui.tsx` (`SimulationNotice`), affiché sur le tableau de bord, la pré-paie, les paramètres et les bulletins. Le même mot est dans l'e-mail de bulletin et dans le pied du guide. Pourtant la migration `012` a remplacé les anciennes simulations par des barèmes sourcés, et `countryPacks.ts` affiche déjà la source (décret, article du CGI). Le prospect lit le bandeau, pas la migration. |
| « Vous déduisez les jours fériés ? » | Non. L'en-tête de la migration `017` le dit : « Les jours fériés ne sont pas encore déduits des jours ouvrés. » Un mois avec le 1er mai ou la fête de l'indépendance peut donc rogner un salaire de présent. |
| « Je paie l'abonnement comment ? » | Le guide dit « Mobile Money ou virement ». `request_subscription_plan` (migration `014`) enregistre la demande et le montant, puis met le statut à `past_due` (« En attente de paiement » dans `src/lib/billing.ts`), sauf si un essai est encore en cours ou si le contrat est déjà actif. Aucun encaissement n'active le plan. |
| « Le fichier Mobile Money part chez Airtel ? » | Il se télécharge. Le statut payé ou échec se coche à la main dans `src/pages/Payments.tsx`. Il n'y a pas d'appel à une API opérateur. |
| « Je vois l'évolution ? » | Le tableau de bord (`src/pages/Dashboard.tsx`) montre quatre chiffres du jour : effectif, présents, congés en attente, masse nette du dernier cycle, plus la répartition par service. Il n'y a pas de courbe, pas d'absentéisme dans le temps, pas de comparaison N / N−1. Aucune librairie de graphiques n'est dans `package.json`. |
| « Vous mesurez la performance ? » | Le mot existe sur la prime (`employee_bonuses.kind = 'performance'`). Rien ne le relie à un objectif, à un score ou à une évaluation. Il n'y a pas d'écran performance, pas de table d'objectifs, pas de badge. |
| « Et si mon DSI regarde le dépôt ? » | Le détail est en section 6. En une phrase : 41 tests de calcul, zéro parcours automatique dans le navigateur, des écritures d'audit lancées par le navigateur, et deux replis dans Paramètres qui contournent les fonctions serveur. |

> **Attitude en rendez-vous.**
> Montrer le quatre yeux, le bulletin ligne par ligne et le fichier CNSS. Si le prospect ouvre Paramètres → WhatsApp, dire tout de suite : « La file est prête, l'envoi automatique est le prochain chantier. » Le bandeau SIMULATION se commente avec la date de recoupement des textes (23/09/2026, migration 012), pas avec un silence.

---

## 4. Améliorations priorisées

**Impact** : est-ce que ça fait signer, ou est-ce que ça évite un abandon en démo.
**Effort** : **S** = correctif localisé, visible sans nouveau métier ; **M** = un parcours ou une intégration, plusieurs fichiers ; **L** = un module, un partenaire ou plusieurs pays.

| Chantier | Impact | Effort | Horizon |
|---|---|---|---|
| WhatsApp réellement envoyé | Très fort | M | H1 |
| PDF du bulletin joint à l'e-mail | Très fort | M | H1 |
| Mot de passe oublié | Fort | S | H1 |
| Application qui se rouvre hors ligne | Moyen | S | H1 |
| Jours fériés Niger et Côte d'Ivoire | Fort | M | H1 |
| Trois tendances sur le tableau de bord | Très fort | M | H1 |
| Étiquette des taux datée, après relecture expert | Fort | S | H1 |
| Module performance et récompenses | Très fort | L | H2 |
| Encaissement de l'abonnement | Très fort | L | H2 |
| Statut Mobile Money des salaires, via l'opérateur | Fort | L | H2 |
| Fichiers au format des portails CNSS / IUTS | Fort | L | H2 |
| Signature du livre de paie | Moyen | M | H2 |
| Export et suppression des données personnelles | Moyen | M | H2 |
| Double authentification par SMS ou WhatsApp | Moyen | M | H2 |
| Packs Burkina, Mali, Sénégal, Togo, Bénin | Fort | L | H3 |
| Portail salarié dans WhatsApp | Fort | L | H3 |
| Lien comptable Sage / Odoo | Fort | L | H3 |
| Place de marché des cabinets | Moyen | L | H3 |
| Tableau de bord bailleur (coût par projet) | Fort | M | H3 |

### H1 — Avant la prochaine démo

Quick wins. Le prospect doit pouvoir refaire le parcours du guide sans tomber sur une promesse vide.

#### WhatsApp réellement envoyé

**Bénéfice.** Le salarié reçoit « congé approuvé » et « bulletin prêt » sur le téléphone qu'il a déjà. Le guide, section 9, devient vrai.

**Fichiers et tables.** Nouvelle fonction Edge, sur le modèle de `supabase/functions/send-payslips`, qui lit `notification_outbox` (statuts `pending`, `sent`, `failed`). Appeler `enqueue_notification` à la fin de `decide_leave_request`, `approve_payroll_period` et `lock_payroll_period` (modèles déjà prévus dans l'écran : `leave_approved`, `payroll_approval`, `payslip_ready`, `clock_reminder`). Retirer le repli qui insère la file à la main dans `src/pages/Settings.tsx`. Destinataire : `employees.phone`.

**Effort.** M.

**Dépendances.** Compte WhatsApp Business, modèle de message validé par Meta, numéros au format international (+227, +225). Tant que le compte n'est pas là, le worker peut journaliser `failed` avec un message clair, et l'écran ne doit plus dire « marquez envoyé à la main » comme mode normal.

#### PDF du bulletin joint à l'e-mail

**Bénéfice.** Le salarié et le comptable archivent un fichier, sans être devant l'écran d'impression.

**Fichiers et tables.** `supabase/functions/send-payslips/index.ts` (aujourd'hui HTML seul, appel Resend sans pièce jointe). Reprendre le détail de `payroll_details` et la mise en page de `src/lib/documents.ts`. Colonnes déjà prévues sur `payroll_lines` : `emailed_at`, `email_error` (migration `009`).

**Effort.** M.

**Dépendances.** Générer le PDF côté serveur. La fenêtre `window.print` du navigateur ne peut pas servir de pièce jointe. Clé `RESEND_API_KEY` déjà exigée par la fonction.

#### Mot de passe oublié

**Bénéfice.** Un essai de 30 jours ne meurt pas au premier oubli. C'est le premier geste d'un DG qui revient le lendemain.

**Fichiers et tables.** `src/components/AuthScreen.tsx`. Authentification Supabase (`resetPasswordForEmail`), aucun changement de tables métier.

**Effort.** S.

**Dépendances.** Expéditeur d'e-mail du projet Supabase, ou le même Resend que les bulletins. Page de nouveau mot de passe à prévoir dans l'écran de connexion.

#### L'application se rouvre hors ligne

**Bénéfice.** La promesse « réseau faible » du guide tient pour ouvrir l'outil, pas seulement pour une file invisible.

**Fichiers et tables.** `public/sw.js` (constante `SHELL`, et le filtre qui ne cache que css / svg / png / woff2). Les scripts produits par Vite sont dans `dist/assets`. `src/lib/offlineQueue.ts` : aujourd'hui seul `clock_in` est rejoué, alors que le type annonce aussi `clock_out`.

**Effort.** S pour mettre en cache les bundles d'une build de production. Le rejeu de la sortie de pointage peut suivre dans le même chantier, toujours en S.

**Dépendances.** Build de production : le service worker ignore déjà `/src/` et le rechargement Vite, à dessein. Le calcul de paie reste en ligne, comme le dit le guide.

#### Jours fériés Niger et Côte d'Ivoire

**Bénéfice.** Le salaire d'un mois de fête cesse d'être le sujet qui fait sortir le prospect de la démo.

**Fichiers et tables.** Nouvelle table `public_holidays` (organisation ou pays, date, libellé). Le calcul des jours ouvrés est dans la migration `017` (`private` / moteur de paie, en-tête : les fériés ne sont pas déduits). `orgs.country_code` choisit le calendrier. Les congés payés sont déjà réintégrés (codes `CAP`, `MAL`, `MAT`, `PAT`, `EXC` ; le sans-solde `SOL` reste retenu).

**Effort.** M.

**Dépendances.** Liste officielle de l'année pour le Niger et la Côte d'Ivoire, relue par l'expert qui valide déjà les taux. Le calendrier sert aussi au score d'assiduité (section 5).

#### Tableau de bord : trois tendances

**Bénéfice.** Le DG voit en trente secondes si la masse salariale dérive, si l'équipe est là, et si les retards s'installent. Aujourd'hui il voit un instantané.

**Fichiers et tables.** `src/pages/Dashboard.tsx`. Données déjà là : `clock_entries`, `leave_requests` approuvées, `payroll_periods` et `payroll_lines` (net, brut, charges). Les barres par service existent déjà en CSS : les réutiliser, sans ajouter de librairie.

**Les trois courbes.**

1. **Absentéisme** : jours sans pointage et sans congé approuvé, sur douze mois, rapportés à l'effectif actif.
2. **Retards** : arrivées après l'heure attendue (voir la mise en garde de la section 5 : `grace_minutes` ne mesure pas le retard aujourd'hui). En H1, une heure d'embauche unique dans les paramètres suffit.
3. **Masse salariale** : net et coût employeur des cycles verrouillés, douze mois glissants. Le mois en cours, s'il n'est pas verrouillé, se montre à part.

**Effort.** M.

**Dépendances.** Heure d'arrivée attendue pour la courbe des retards. Les deux autres courbes n'attendent rien.

#### Assumer les taux, avec une date

**Bénéfice.** Le bandeau jaune cesse de contredire le discours « barèmes 2026 sourcés ».

**Fichiers et tables.** `SimulationNotice` dans `src/components/ui.tsx`. Le même mot dans `send-payslips`, `src/lib/documents.ts`, `src/components/OrgGate.tsx`, et les sections 7, 14 et 15 de `docs/GUIDE-SIMPLE-A26.md`. Les sources sont déjà dans `src/lib/countryPacks.ts` (`simulationNote`) et dans l'en-tête de la migration `012`.

**Effort.** S, le jour où l'expert a signé la revue.

**Dépendances.** Validation écrite de l'expert local. En attendant, remplacer « SIMULATION » par « Taux vérifiés le 23/09/2026 — à confirmer avant dépôt officiel ». On dit la date. On ne prétend pas qu'un dépôt CNSS est automatique.

<p class="note">Ordre utile pour la prochaine démo : mot de passe oublié, libellé des taux, trois tendances, PDF, WhatsApp, jours fériés, cache hors ligne. Les deux premiers se voient dans les cinq premières minutes.</p>

### H2 — Différenciation

Le prospect compare A26 à Excel et à un cabinet. Ici, A26 fait une chose que le tableur ne fait pas, et il encaisse.

#### Module Performance et reconnaissance

**Bénéfice.** « Il nous le faut » pour fidéliser, justifier une prime, et montrer une productivité à un bailleur. Conception complète en section 5.

**Fichiers et tables.** Nouvelles tables et RPC décrites en section 5. Écran `/performance`. Réutilise `employee_bonuses`, `grant_employee_bonus`, `leave_types`, `notification_outbox`, `audit_log`.

**Effort.** L, découpé en quatre lots S/M.

**Dépendances.** H1 pour les jours fériés (assiduité), l'heure d'arrivée (ponctualité) et le worker WhatsApp (message de badge). Le lot A (objectifs) peut démarrer sans ces trois là.

#### Paiement de l'abonnement par Mobile Money

**Bénéfice.** L'essai devient un contrat. Aujourd'hui choisir PME, Groupe ou Cabinet écrit `past_due` et la note « activation après paiement » (`request_subscription_plan`, migration `014`).

**Fichiers et tables.** `org_subscriptions`, `src/pages/Billing.tsx`, `src/lib/billing.ts`. Nouveau passage : demande → lien ou référence de paiement → `active` uniquement quand l'encaissement est confirmé. Journaliser `request_plan` existe déjà.

**Effort.** L.

**Dépendances.** Un agrégateur ou un opérateur (Airtel, Moov, Orange, Wave) capable d'encaisser un abonnement récurrent en XOF. Le virement peut rester un secours : statut `past_due` jusqu'à une confirmation manuelle réservée à un rôle interne KPB, tracée dans `audit_log`.

#### Lots de salaires : statut renvoyé par l'opérateur

**Bénéfice.** Le RH cesse de cocher « payé » de mémoire. Le fichier CSV reste le secours.

**Fichiers et tables.** `payment_batches`, `payment_batch_lines` (statuts `pending`, `paid`, `failed`), `src/pages/Payments.tsx`, `exportMobileMoneyFile`.

**Effort.** L.

**Dépendances.** API de l'opérateur, et le même socle d'authentification que l'abonnement si l'agrégateur est le même. Le reçu espèces (`printCashReceipt`) ne change pas.

#### Fichiers au format des portails CNSS et IUTS

**Bénéfice.** Le DAF dépose, il ne recolle plus les colonnes.

**Fichiers et tables.** `src/lib/exports.ts` (`exportSocialDeclarationCsv`, `exportTaxDeclarationCsv`). Les colonnes actuelles sont un bordereau lisible, pas le gabarit d'un portail.

**Effort.** L.

**Dépendances.** Spécification à jour du portail CNSS (Niger), du portail CNPS (Côte d'Ivoire), et des télé-déclarations IUTS / ITS. Un gabarit par pays, versionné comme les règles de paie (`rule_version`). Relecture expert avant de retirer toute mention de contrôle humain.

#### Signature électronique du livre de paie

**Bénéfice.** Le livre n'est plus seulement « à imprimer et tamponner » (guide, étape 5). L'approbateur signe le verrouillage.

**Fichiers et tables.** `printPayrollBook`, `payroll_periods` (déjà `approved_by`, `approved_at`), `audit_log`. Empreinte de bulletin déjà stockée (`payroll_lines.fingerprint`).

**Effort.** M pour une empreinte du livre entier, horodatée, signée par le compte qui verrouille. L si un prestataire de signature qualifiée est exigé par le prospect.

**Dépendances.** Décision juridique : empreinte interne (suffisante pour beaucoup de PME) ou signature qualifiée (grands groupes, bailleurs).

#### Export et suppression des données d'une personne

**Bénéfice.** Une ONG, un bailleur ou un groupe qui demande « que devient le dossier si la personne part ? » obtient une réponse.

**Fichiers et tables.** Aujourd'hui aucune fonction d'export ou d'effacement de compte. Données personnelles : `employees`, `contracts`, `clock_entries`, `leave_requests`, `timesheet_entries`, `payroll_lines`, `payroll_details`, `employee_bonuses`, `audit_log`. L'export est un dossier lisible (CSV + bulletins). La suppression anonymise le salarié et conserve les bulletins verrouillés et le journal : un bulletin déposé ne se réécrit pas.

**Effort.** M.

**Dépendances.** Règle métier validée avec l'expert : ce qui se conserve pour la paie et le contrôle, ce qui s'efface. Réservé à `admin_rh`, tracé dans `audit_log`.

#### Double authentification par SMS ou WhatsApp

**Bénéfice.** Le cabinet et le DSI acceptent de mettre les salaires dans l'outil.

**Fichiers et tables.** `src/components/AuthScreen.tsx`. Pas de second facteur dans le code actuel (ni TOTP, ni SMS).

**Effort.** M.

**Dépendances.** Le canal d'envoi du H1 (WhatsApp ou SMS). À proposer d'abord aux rôles `admin_rh`, `approveur_paie` et `cabinet`.

### H3 — Verrouiller le marché

#### Packs Burkina Faso, Mali, Sénégal, Togo, Bénin

**Bénéfice.** Le même discours UEMOA, au-delà du Niger et de la Côte d'Ivoire. Le cabinet régional n'a plus une exception par pays.

**Fichiers et tables.** `orgs.country_code` (aujourd'hui `NE` | `CI`), `apply_country_pack`, `private.seed_country_rules`, `src/lib/countryPacks.ts`, `src/lib/payroll.ts`.

**Effort.** L pour le paquet des cinq. Chaque pays est un lot M une fois le premier (le plus demandé par les cabinets déjà en conversation) a servi de modèle.

**Dépendances.** Textes sourcés, comme pour la migration 012. Interdit d'étendre le bandeau « taux vérifiés » à un pays non relu.

#### Portail salarié dans WhatsApp

**Bénéfice.** « Mon solde de congés » et « mon bulletin » sans ouvrir le site. C'est l'usage réel du terrain.

**Fichiers et tables.** Worker du H1, `leave_requests`, `leave_types` (droits `annual_days`), `payroll_lines`, `employees.phone`.

**Effort.** L.

**Dépendances.** WhatsApp réellement envoyé (H1), et une vérification que le numéro appartient au salarié avant d'envoyer un net à payer. Le bulletin complet reste dans l'espace connecté si le canal n'est pas assez sûr pour le PDF.

#### Lien comptable Sage / Odoo

**Bénéfice.** Le cabinet n'exporte plus le CSV OHADA pour le retaper.

**Fichiers et tables.** `exportOhadaCsv` et les comptes de `countryPacks.ts` (`ohadaAccounts`). Écritures déjà équilibrées côté fichier.

**Effort.** L.

**Dépendances.** Un connecteur par logiciel, d'abord en lecture du fichier existant (import), ensuite en envoi. Le CSV équilibré reste le secours.

#### Place de marché des cabinets

**Bénéfice.** Un expert-comptable trouve A26, ouvre ses dossiers clients, et la formule Cabinet (1 800 F, plancher 350 000 F, 500 sièges) a un canal.

**Fichiers et tables.** Rôle `cabinet`, abonnement, multi-organisations déjà dans `Layout.tsx`. Il manque l'annuaire, la demande de mise en relation, et le cadre de partage : le cabinet ne voit un client que s'il est membre.

**Effort.** L.

**Dépendances.** Offre Cabinet encaissable (H2). Règle de confidentialité : pas de mélange des dossiers, déjà promise au guide, section 11.

#### Tableau de bord bailleur pour les ONG

**Bénéfice.** Heures et coût par projet et par financeur, pour le rapport de subvention. Le chronomètre et le champ financeur existent (`projects.funder`).

**Fichiers et tables.** `projects`, `timesheet_entries` (heures `approved`), `payroll_lines` (coût), écran tableau de bord ou export dédié. Le jeu de démo ONG est déjà un `demo_kind`.

**Effort.** M.

**Dépendances.** Une règle de répartition du coût quand une personne est sur plusieurs projets dans le mois (au prorata des heures approuvées). Les salaires restent invisibles pour un invité « bailleur » : prévoir un rôle lecture agrégée, ou un export validé par le RH.

---

## 5. Module « Performance et récompenses »

> **Statut (05/10/2026).** Les lots A à D sont livrés dans la migration `018_performance_rewards`, avec l'écran `/performance`. Restent à brancher : le worker WhatsApp du lot H1 (le message `recognition_awarded` est déjà placé dans `notification_outbox`) et le calendrier de jours fériés par pays (saisi à la main dans les réglages en attendant).

### L'argument

> **A26 ne fait pas que payer vos salariés : il vous dit qui mérite plus, avec des preuves, et transforme ça en prime en deux clics.**

| À qui | Phrase |
|---|---|
| **PME** | Vous gardez les gens qui portent l'équipe. La prime est décidée sur des faits, pas sur la mémoire du gérant, et elle passe dans le bulletin du mois. |
| **ONG** | Le bailleur demande ce qui a été produit. Vous montrez les heures validées par projet et les objectifs tenus, à côté du coût déjà calculé par la paie. |
| **Groupe** | La même règle de score s'applique à chaque filiale. Une prime de performance à Niamey et à Abidjan se compare, parce que le calcul est le même et qu'il est tracé. |

Le module s'ajoute. Il ne remplace pas le menu **Primes**.

### Principes, les mêmes que pour les primes

Les primes actuelles sont le modèle à copier (migration `013`).

1. Chaque action passe par une fonction serveur `SECURITY DEFINER`, avec `search_path` vide.
2. Le droit est vérifié avec `private.has_org_role`. Le navigateur ne fait pas d'`INSERT` direct.
3. Chaque action écrit une ligne dans `audit_log` (création d'objectif, déclaration du salarié, validation, calcul du score, proposition de récompense).
4. Celui qui propose ne valide pas. Le salarié ne valide pas son propre objectif. L'administrateur RH valide la récompense qui a un effet d'argent ou de congé.
5. Le salarié ne lit que ses lignes (`private.employee_owned`, comme sur `employee_bonuses`).
6. Le cabinet et l'auditeur sont en lecture seule sur ce module. Aujourd'hui le cabinet peut attribuer une prime (`grant_employee_bonus` autorise `cabinet`) : ce droit ne s'étend pas aux objectifs ni aux scores.
7. Le score affiché au salarié se décompose ligne par ligne, comme `payroll_details`.

<p class="note">Pour mémoire : <code>approve_payroll_period</code> est en <code>SECURITY INVOKER</code> (le contrôle quatre yeux est quand même dans la fonction, pas dans le navigateur). Les nouvelles fonctions performance suivent le modèle des primes, plus strict, en <code>SECURITY DEFINER</code>.</p>

### Mesure 1 — Les objectifs du responsable

Le responsable fixe des objectifs. Le mot technique est OKR ou KPI : un résultat à atteindre, avec un chiffre, sur une période.

**Table `performance_cycles`**

| Colonne | Rôle |
|---|---|
| `org_id` | Société |
| `label` | Exemple : « T3 2026 » |
| Période | Trimestre, semestre ou année, avec date de début et de fin |
| `status` | `open` → `review` → `closed` |

**Table `employee_objectives`**

| Colonne | Rôle |
|---|---|
| Cycle, salarié | Rattachement |
| Titre, indicateur, cible | Ce qu'on mesure, et le chiffre à atteindre |
| `weight_pct` | Poids dans le score d'objectifs. La somme des objectifs actifs d'une personne sur un cycle vaut 100. |
| Valeur atteinte | Déclarée par le salarié, puis confirmée |
| `status` | `draft` → `active` → `self_reported` → `validated` |

**Fonctions**

| Fonction | Qui | Effet |
|---|---|---|
| `set_objective` | `admin_rh` ou `manager` de l'équipe | Crée ou ajuste un objectif. Passe en `active` quand le cycle est `open`. |
| `report_objective_progress` | Le salarié, sur ses objectifs seulement | Passe en `self_reported` et enregistre la valeur atteinte. |
| `validate_objective` | `manager` ou `admin_rh`, jamais le salarié lui-même | Confirme la valeur. Sans cette validation, l'objectif ne compte pas dans le score. |

Un objectif en brouillon ou seulement déclaré par le salarié compte comme « non évalué », pas comme un zéro caché. L'écran le montre.

### Mesure 2 — Les indicateurs déjà dans l'application

Fonction `compute_employee_kpis(cycle)`. Elle lit. Elle ne demande pas au manager de retaper des présences.

| Indicateur | Calcul, à partir de l'existant | Point d'attention |
|---|---|---|
| **Ponctualité** | Part des jours où `clock_entries.clock_in` est avant l'heure d'arrivée attendue, plus une tolérance en minutes. | `org_settings.grace_minutes` (migration `007`, défaut 5) est le délai pour confirmer « je suis là » pendant la session, avec `reminder_interval_minutes` (défaut 25). Ce n'est pas une tolérance de retard. Il faut une colonne nouvelle, par exemple `expected_start_time` et `late_grace_minutes`, dans `performance_settings`. |
| **Assiduité** | Jours avec un pointage, divisés par les jours ouvrés du cycle, hors congés approuvés (`leave_requests.status = 'approved'`). | Les jours fériés doivent être retirés. Cela dépend du chantier H1. Sans calendrier, le score pénalise les fêtes. |
| **Heures projet validées** | Heures `timesheet_entries.status = 'approved'`, rapportées aux heures attendues du cycle. | Utile surtout pour l'ONG et le chantier. Le poids peut être 0 dans une PME sans projets. |
| **Délai de soumission** | Écart entre la fin du mois et le moment où la feuille mensuelle est soumise. | La table `timesheet_entries` n'a pas d'heure de soumission. Aujourd'hui le navigateur passe le statut à `submitted` et ajoute, à part, une ligne `audit_log` d'action `submit_monthly_sheet` (`src/pages/Timesheets.tsx`). Le calcul doit s'appuyer sur une colonne `submitted_at` écrite par la fonction serveur, pas sur une ligne d'audit que le navigateur pourrait oublier. |
| **Corrections de pointage** | Nombre de lignes avec `edit_reason` renseigné. | `edited_by` dit qui a corrigé. Une correction faite par le responsable ne baisse pas le score du salarié. Elle est montrée, elle n'est pas une faute. |

**Table `performance_settings`** (une ligne par organisation ; éviter d'alourdir `org_settings`, qui règle le temps de travail).

Poids des cinq indicateurs, heure d'arrivée, tolérance de retard, poids des objectifs par rapport aux indicateurs automatiques, seuil « excellent ». Défaut proposé, modifiable par `admin_rh` : 60 % d'objectifs, 40 % d'indicateurs automatiques. Seuil excellent : 85.

### Le score

**Table `performance_scores`**

| Colonne | Rôle |
|---|---|
| Cycle, salarié | Une ligne par personne et par cycle |
| `score_objectifs` | 0 à 100, somme pondérée des objectifs `validated` |
| `score_kpi` | 0 à 100, indicateurs automatiques |
| `score_final` | 0 à 100, combinaison selon les poids |
| Rang dans le service | D'après `employees.department_id` |
| Niveau | `a_suivre`, `conforme`, `bon`, `excellent` |
| `computed_at` | Horodatage du calcul |

**Niveaux, par défaut**

| Niveau | Règle |
|---|---|
| À suivre | Score final inférieur à 60 |
| Conforme | 60 à 74 |
| Bon | 75 à 84 |
| Excellent | 85 ou plus, **et** dans le haut du service |

**Haut du service, pour une PME.** « Top 10 % » sur une équipe de 6 personnes donnerait zéro personne si on arrondit vers le bas, et le module ne récompenserait jamais le client visé. Règle : le seuil de score s'applique toujours ; le rang retient au moins la première personne du service quand le service a moins de 10 salariés, et le premier dixième arrondi au supérieur au-delà. Les deux conditions restent exigées. Un score de 92 dans une équipe où trois personnes sont au-dessus de 95 peut donc rester « bon ».

**Table `performance_score_lines`**, sur le modèle de `payroll_details` : libellé, base, poids, points, source (objectif ou indicateur). C'est cette table que le salarié lit.

Le calcul est une fonction serveur. Le navigateur n'écrit pas le score.

### Les récompenses

Elles se proposent quand le niveau est « excellent ». Rien n'est versé tout seul. L'administrateur RH valide, comme pour une prime.

#### La prime

Appeler `grant_employee_bonus` avec `kind = 'performance'` et un motif du type `Score 92/100 — T3 2026`.

Aujourd'hui, si l'administrateur RH appelle lui-même `grant_employee_bonus`, la prime naît déjà `approved` (migration `013`). Pour la performance, la fonction de proposition force le statut `draft`, même si l'appelant est RH : une autre personne RH, ou le même compte dans un second geste explicite « Valider », passe par l'approbation déjà en place. Le préparateur rattache ensuite la prime à un cycle ouvert (`scheduled`). Au verrouillage, elle passe `paid` et entre dans le brut. Aucun nouveau circuit de paie.

#### La reconnaissance

**Table `employee_recognitions`**

| Colonne | Rôle |
|---|---|
| Salarié, cycle | Rattachement |
| Badge | `salarie_du_mois`, `assiduite_parfaite`, `objectifs_depasses`, `esprit_equipe` |
| Origine | `manager` ou `automatique` |
| Visible | Sur `src/pages/EmployeeHome.tsx` pour la personne, et sur un mur d'équipe du tableau de bord du responsable |

Le badge « esprit d'équipe » est toujours manuel : aucun indicateur actuel ne le mesure. Les trois autres peuvent être proposés par la fonction de calcul, puis confirmés.

Message : ligne `notification_outbox`, modèle `recognition_awarded`. Le worker du H1 l'envoie. Sans le worker, le badge s'affiche quand même dans l'application.

#### Les avantages

**Table `employee_perks`**

| Type | Effet | Statut |
|---|---|---|
| Jours de congé bonus | Crédite un nouveau type `BON` dans `leave_types` (payé, comme `CAP`). Le salarié pose ces jours par le circuit de congés déjà en place. | `proposed` → `approved` → `consumed` |
| Budget formation | Montant en FCFA, rattaché au salarié et au cycle. Le consommé est saisi par le RH (facture, organisme). Pas un second bulletin. | Même chaîne, validation `admin_rh` |

`BON` ne doit pas être traité comme du sans-solde. Le moteur retire `SOL` et les types non payés (migration `017`). Un type payé est déjà réintégré au temps travaillé.

### Les écrans

Nouvelle entrée **Performance** dans `NAV` (`src/components/Layout.tsx`) et nouvelle clé `PAGE_ROLES.performance` (`src/lib/access.ts`), sur le même principe que `primes`.

| Vue | Qui | Ce qu'on y fait |
|---|---|---|
| Équipe | `manager`, `admin_rh` | Objectifs, scores, proposition de récompense |
| Moi | `employee` | Mes objectifs, mes badges, mon score et le détail ligne par ligne |
| Cycles | `admin_rh` | Ouvrir un cycle, régler les poids et le seuil, valider primes et avantages |
| Lecture | `auditeur`, `cabinet` | Tout voir, rien modifier |
| Préparateur, approbateur | Comme aujourd'hui sur les primes | Pas le réglage des objectifs. Ils retrouvent la prime dans le menu **Primes** une fois qu'elle est validée. |

Route proposée : `/performance`, gardée par `RoleRoute` comme les autres pages dans `src/App.tsx`.

### Garde-fous, à écrire tels quels dans le produit et dans le guide

1. Les indicateurs automatiques ne servent jamais, seuls, à sanctionner. Un niveau « à suivre » ouvre un échange avec le responsable. Il ne coupe pas le salaire. L'absence non payée reste la règle de paie déjà en place, séparée du score.
2. Le salarié voit son score et chaque ligne qui le compose. Un chiffre sans le détail n'est pas affiché.
3. Une correction de pointage faite par le responsable est tracée (`edited_by`, `edit_reason`) et ne baisse pas le score de la personne.
4. Le classement nominatif ne sort pas de l'équipe. Le mur montre des badges, pas la liste ordonnée de tout le monde. Le responsable et le RH voient le rang du service. Il n'y a pas de palmarès de toute la société.
5. La prime de performance entre dans le brut, donc dans les cotisations et l'impôt, par le circuit déjà livré (migration `013`). Le droit du travail nigérien ou ivoirien (prime prévue au contrat, usage, ou geste discrétionnaire) se confirme avec l'expert local. L'outil applique le montant validé. Il ne décide pas la nature juridique de la prime.
6. Un cycle `closed` ne se recalcule pas en silence. Une correction passe par une fonction tracée, comme la réouverture d'un cycle de paie.

### Découpage en lots

| Lot | Contenu | Effort | Ordre |
|---|---|---|---|
| **A** | Cycles, objectifs, déclaration du salarié, validation du responsable, score d'objectifs seul, écran manager et écran salarié | M | 1 |
| **B** | `performance_settings`, indicateurs automatiques, `submitted_at`, score composite, niveaux, lignes de détail | M | 2 |
| **C** | Badges, mur d'équipe, modèle `recognition_awarded` | S | 3 |
| **D** | Avantages (`BON`, budget formation) et proposition de prime `draft` reliée au score | M | 4 |

Le lot A suffit pour une démo « le responsable fixe un objectif, le salarié répond, le score s'explique ». Le lot B apporte la preuve automatique, celle qui différencie d'un tableur. Le lot C se montre sans argent. Le lot D touche la paie et les congés : il attend un score stable et le circuit de primes déjà en production.

Le lot C peut s'afficher dans l'application avant le worker WhatsApp. L'envoi du message attend le H1.

---

## 6. Chantiers techniques de crédibilité

À mener en parallèle des démos, surtout si un cabinet ou un DSI demande le dépôt. Aucun de ces chantiers ne se voit dans les cinq premières minutes. Tous se voient dans un audit.

| Chantier | Constat vérifié | Pourquoi c'est gênant |
|---|---|---|
| **Parcours automatique du quatre yeux** | Les tests sont 41 cas `it` dans sept fichiers : `src/lib/billing.test.ts`, `payroll.test.ts`, `bonuses.test.ts`, `employees.test.ts`, `access.test.ts`, `audit.test.ts`, `countryPacks.test.ts`. Outil : Vitest (`package.json`). Aucun test de composant, aucun Playwright, aucun test SQL des politiques RLS. | Un commercial peut jurer que le préparateur ne s'approuve pas. Un script qui se connecte avec deux comptes et qui échoue si `approve_payroll_period` accepte le même utilisateur le prouve à chaque livraison. |
| **`deno check` et `npm audit` dans la CI** | `.github/workflows/ci.yml` lance `typecheck`, `lint`, `test`, `build`. Il ne lance pas `deno check supabase/functions/send-payslips/index.ts` ni `npm audit`. Le `README.md` les cite comme commandes manuelles. | La seule fonction Edge peut casser sans que la CI rougisse. Les failles des dépendances non plus. |
| **Politiques anciennes** | `departments` (migration `001`, réécrite dans `005`), `leave_types` et `projects` (migration `002`, réécrite dans `005`) autorisent encore l'accès avec `public.is_member` et un `EXISTS` direct sur `memberships.role`. Le durcissement de `20260917175936_security_hardening_rls_and_atomic_guards.sql` a ajouté des index sur ces tables. Il n'a pas repris ces politiques vers `private.has_org_role`. | Deux styles de contrôle cohabitent. Le prochain audit demande lequel fait foi. |
| **Replis du navigateur** | Dans `src/pages/Settings.tsx`, si `apply_country_pack` échoue, le code met à jour `orgs.country_code` tout seul. Si `enqueue_notification` échoue, il insère dans `notification_outbox` tout seul. Ailleurs dans le même écran, les règles (`payroll_rules`), les types de congé et les invitations s'écrivent aussi directement. | Un échec de fonction serveur ne doit pas devenir un demi-changement (le pays bouge, les taux non). Le correctif : afficher l'erreur, ne pas compenser. |
| **Journal écrit par le navigateur** | Des `insert` vers `audit_log` sont lancés depuis `src/pages/Employees.tsx`, `Payments.tsx`, `Payroll.tsx`, `Settings.tsx`, `Time.tsx` et `Timesheets.tsx`. Le trigger interdit la modification et force l'auteur réel. La politique `a26_audit_insert_member` (migration `014`) autorise pourtant plusieurs rôles à insérer l'action de leur choix. Le salarié ne peut insérer que `submit_monthly_sheet`. | Le journal est inaltérable après coup. Il n'est pas, pour ces actions-là, une preuve que le serveur a fait l'opération. Les actions sensibles (approuver la paie, attribuer une prime, décider un congé) sont déjà écrites dans les fonctions SQL : étendre ce modèle, et retirer les insertions du navigateur. |
| **Noms de migrations** | Dix fichiers se terminent par `.sql.sql` : `001`, `002`, `003`, `004`, `005`, `005b`, `005c`, `008`, `009`, et le second fichier `006`. À côté, `20260915165538_006_fix_seed_demo_data_value_counts.sql` corrige le nombre de colonnes du jeu de démo. Le fichier `20260915172405_20260915165538_006_fix_seed_demo_data_value_counts.sql.sql` corrige ensuite le format d'heure (`08` → `08:00`) en reprenant le même nom, avec un horodatage doublé. | Les deux s'appliquent l'un après l'autre, le résultat est cohérent, le nom prête à appliquer deux fois la mauvaise version le jour où quelqu'un range le dossier. Renommer sans réécrire l'historique déjà appliqué en production : documenter l'ordre, et ne plus ajouter de double extension. |

<p class="note">Ces chantiers ne sont pas un prérequis pour la prochaine démo commerciale. Ils le deviennent dès qu'un cabinet demande une revue, ou dès que le module performance écrit de l'argent.</p>

---

## 7. Mise à jour des supports

À faire quand le chantier correspondant est visible en démo. Pas avant : le guide ne doit pas prendre une nouvelle avance sur le produit.

### `docs/GUIDE-SIMPLE-A26.md`

1. **Nouvelle section, après la section 11 (confidentialité) et avant le prix.** Titre proposé : « Voir qui mérite une reconnaissance ». Dix à quinze lignes, le même ton que le reste : le responsable fixe un objectif, l'application ajoute la présence et les heures déjà validées, le salarié voit le détail, le RH valide la prime. Renvoyer au menu **Primes** pour l'argent. Reprendre les cinq garde-fous de la section 5, en langage courant.
2. **Section 12, tableau des formules.** Ajouter une ligne « Option Performance » seulement quand le prix est décidé. Piste de travail, à ne pas imprimer dans le guide tant qu'elle n'est pas tranchée : un supplément de l'ordre de 500 F HT par salarié et par mois, pour rester lisible à côté des 2 500 F de la formule PME. Le chiffre n'est pas dans `billing.ts`.
3. **Section 14, questions fréquentes.** Ajouter : « Peut-on lier une prime à un résultat ? » Réponse : oui, à partir du module Performance, après validation RH, dans le même circuit que la prime annuelle déjà décrite.
4. **Section 7 et le pied de page.** Quand l'expert a signé, remplacer « valeurs de simulation » par la date de vérification, comme en H1. L'exemple chiffré d'Ibrahim (CNSS 1,6 %, AMO 1 %) doit être recalculé avec les taux 2026, ou clairement présenté comme un exemple d'école qui n'est plus le moteur.

### `DEMO-VIDEO.md`

Insérer un temps **7 bis**, entre la pré-paie (temps 7, aujourd'hui 3:05–3:55) et le quatre yeux (temps 8).

**7 bis — Score et prime — environ 20 secondes.**

Compte responsable : ouvrir **Performance**, montrer un objectif validé et le score ligne par ligne. Proposer la prime. Compte administrateur RH : la retrouver dans **Primes** au statut brouillon, avec le motif « Score … — période … ». Ne pas la payer dans la vidéo : le geste suivant reste le quatre yeux du temps 8.

Phrase de voix off : « Le score s'explique. La prime attend une deuxième personne, comme la paie. »

Allonger la vidéo d'autant, ou raccourcir le temps 3 (vue RH) qui montre déjà l'effectif.

### `docs/FLOW-TEST-COMPLET-A26.md`

Ajouter un **Flow 15 — Performance et récompenses**, après le Flow 14. Le document s'arrête aujourd'hui au Flow 14 (sécurité rapide).

| # | Action | Résultat attendu |
|---|---|---|
| 15.1 | RH ouvre un cycle « trimestre » | Statut `open` |
| 15.2 | Le responsable crée un objectif pondéré pour le salarié de démo | Statut `active`, poids affiché |
| 15.3 | Le salarié déclare une valeur | Statut `self_reported`, invisible sur les collègues |
| 15.4 | Le salarié tente de valider son objectif | Refus |
| 15.5 | Le responsable valide | Statut `validated`, ligne d'audit |
| 15.6 | Lancer le calcul du cycle | Score, niveau, détail ligne par ligne côté salarié |
| 15.7 | Niveau excellent : proposer une prime | Ligne `employee_bonuses` en `draft`, motif avec le score |
| 15.8 | Le même compte tente d'approuver sa proposition | Refus si l'écran performance l'interdit ; l'approbation reste le geste RH du menu Primes |
| 15.9 | RH approuve, préparateur rattache au cycle ouvert | Statut `scheduled`, montant dans le brut au prochain calcul |
| 15.10 | Badge et, si le worker existe, message `recognition_awarded` | Visible sur l'accueil salarié, pas de classement de toute la société |
| 15.11 | Compte cabinet | Lecture seule |

Mettre à jour l'ordre de recette en fin de document : Flow 15 après le Flow 7b (prime annuelle), parce qu'il réutilise le même circuit.

---

## 8. Annexe — le produit tel qu'il est

Cette annexe suffit à lire le document sans ouvrir le dépôt. Elle décrit l'existant, pas la cible de la section 5.

### Écrans

Définis dans `src/App.tsx` et listés dans `src/components/Layout.tsx`.

| Route | Écran | Fichier | Qui, d'après `src/lib/access.ts` |
|---|---|---|---|
| `/` | Tableau de bord, ou accueil salarié | `src/pages/Dashboard.tsx`, `src/pages/EmployeeHome.tsx` | L'accueil salarié si le rôle est `employee` |
| `/salaries` | Salariés, import CSV | `src/pages/Employees.tsx` | Tous sauf le salarié |
| `/temps` | Pointages, corrections | `src/pages/Time.tsx` | Menu commun |
| `/conges` | Demandes et décisions | `src/pages/Leave.tsx` | Menu commun. La décision passe par `decide_leave_request`. |
| `/feuilles` | Feuilles de temps et feuille du mois | `src/pages/Timesheets.tsx` | RH, responsable, salarié, auditeur, cabinet |
| `/paie` | Cycle, calcul, exports, envoi d'e-mails | `src/pages/Payroll.tsx` | RH, préparateur, approbateur, auditeur, cabinet |
| `/primes` | Primes annuelles | `src/pages/Bonuses.tsx` | Tous les rôles, le salarié en lecture des siennes |
| `/paiements` | Lots et reçus | `src/pages/Payments.tsx` | RH, préparateur, approbateur, auditeur, cabinet |
| `/bulletins` | Bulletins personnels | `src/pages/Payslips.tsx` | Salarié, responsable, RH |
| `/parametres` | Société, pays, règles, invitations, file WhatsApp | `src/pages/Settings.tsx` | RH, préparateur, cabinet (le cabinet ne doit pas écrire les réglages : `canWriteSettings`) |
| `/abonnement` | Formules | `src/pages/Billing.tsx` | RH, cabinet |
| `/audit` | Journal | `src/pages/Audit.tsx` | RH, auditeur, cabinet |
| `/profil` | Fiche de la personne connectée | `src/pages/Profile.tsx` | Session ouverte |
| Connexion | Création de compte et mot de passe | `src/components/AuthScreen.tsx` | Sans session |
| Choix de société | Création, démo PME / ONG / groupe | `src/components/OrgGate.tsx` | Session sans organisation active |

Le chronomètre projet est le composant `src/components/ProjectTimerCard.tsx`, sur l'accueil salarié.

### Rôles

Source : `src/lib/types.ts`.

| Code | Nom à l'écran | En une phrase |
|---|---|---|
| `admin_rh` | Administrateur RH | Règle l'outil, verrouille la paie, valide les primes |
| `manager` | Responsable d'équipe | Valide congés et feuilles de son équipe. Ne voit pas les contrats. |
| `preparateur` | Préparateur de paie | Calcule le mois et rattache les primes |
| `approveur_paie` | Approbateur paie | Approuve le mois calculé par quelqu'un d'autre |
| `employee` | Salarié | Pointe, demande, voit ses bulletins |
| `auditeur` | Auditeur (lecture seule) | Regarde, y compris le journal |
| `cabinet` | Cabinet / expert-comptable | Plusieurs sociétés, lecture large, abonnement |

### Tables

| Table | Rôle | Migration |
|---|---|---|
| `orgs`, `memberships` | Société, pays, rôle de chaque compte | `20260914122914_001_core_orgs_memberships_employees.sql.sql` |
| `departments` | Services | `001` |
| `employees`, `contracts` | Fiches et salaires | `001` |
| `clock_entries` | Pointages. `edit_reason`, `edited_by`. Colonnes de session ajoutées en `007` : `last_active_at`, `active_seconds`, `closed_reason` | `002`, puis `007` |
| `leave_types`, `leave_requests` | Congés. Codes semés : `CAP`, `MAL`, `MAT`, `PAT`, `EXC`, `SOL` | `002`, semence dans `010` et `012` |
| `projects` | Projets, champ financeur | `002` |
| `timesheet_entries` | Heures. Statuts `draft`, `submitted`, `approved`, `rejected` | `002` |
| `payroll_rules` | Taux versionnés, source, date d'effet | `003` |
| `payroll_periods`, `payroll_lines`, `payroll_details` | Cycle, bulletin, lignes expliquées | `003` |
| `audit_log` | Journal. Trigger d'inaltérabilité dans le durcissement du 17/09/2026 | `003`, trigger dans `20260917175936_security_hardening_rls_and_atomic_guards.sql` |
| `payroll_variables`, `org_invites` | Variables du mois, invitations | `005` |
| `org_settings` | Rappel de présence, `grace_minutes`, base de temps `gross` ou `active` | `007` |
| `project_timers` | Chronomètre multi-projets | `008` |
| `payment_batches`, `payment_batch_lines` | Lots de paiement | `011` |
| `notification_outbox` | File WhatsApp, e-mail ou SMS. Statuts `pending`, `sent`, `failed`, `cancelled` | `011` |
| `org_subscriptions` | Essai et formules. Statuts `trialing`, `active`, `past_due`, `cancelled`, `expired` | `011`, fonction de demande dans `014` |
| `employee_bonuses` | Primes. Seul objet « performance » du produit aujourd'hui | `013` |

### Fonctions qui portent déjà la confiance

| Fonction | Où la chercher | Ce qu'elle garantit |
|---|---|---|
| `approve_payroll_period` | Durcissement du 17/09/2026 | Quatre yeux |
| `lock_payroll_period` | Migration `013` (remplace la version du durcissement) | Verrouillage réservé au RH, primes passées en versées |
| `decide_leave_request` | Durcissement | Le responsable ne décide pas son propre congé |
| `set_timesheet_status` | Durcissement | Décision de feuille tracée |
| `grant_employee_bonus` et ses voisines | Migration `013` | Prime proposée, validée, rattachée, annulée |
| `request_subscription_plan` | Migration `014` | Le plan payant n'est pas activé par un clic |
| `enqueue_notification` | Migration `011`, `search_path` vidé en `014` | Met une ligne en file. N'envoie rien. |
| `apply_country_pack` | Migration `011` | Installe les règles du pays |
| `private.guard_audit_log` | Durcissement | Journal inaltérable |
| `private.compute_payslip` | Migrations `012` et `017` | Moteur de bulletin |

### Fichiers cités dans ce document

| Sujet | Fichier |
|---|---|
| Menu et rôles des pages | `src/components/Layout.tsx`, `src/lib/access.ts`, `src/App.tsx` |
| Prix | `src/lib/billing.ts` |
| Packs et libellés de taux | `src/lib/countryPacks.ts` |
| Exports | `src/lib/exports.ts` |
| Impression du bulletin | `src/lib/documents.ts` |
| Bandeau SIMULATION | `src/components/ui.tsx` |
| File hors ligne et service worker | `src/lib/offlineQueue.ts`, `public/sw.js` |
| E-mail de bulletin | `supabase/functions/send-payslips/index.ts` |
| Intégration continue | `.github/workflows/ci.yml` |
| Guide, démo, recette | `docs/GUIDE-SIMPLE-A26.md`, `DEMO-VIDEO.md`, `docs/FLOW-TEST-COMPLET-A26.md` |

---

<p class="note"><strong>Mention.</strong> Prototype A26 prépare et documente la paie. Les barèmes 2026 sont sourcés dans la migration 012 et restent à confirmer par un expert-comptable local avant tout dépôt. Ce document décrit une roadmap. Il n'annonce pas une fonction qui n'est pas encore dans le produit. KPB Global LLC — Prototype A26.</p>
