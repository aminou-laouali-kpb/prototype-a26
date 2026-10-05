# Prototype A26 — environnement de démo

Prototype RH, temps, congés et pré-paie pour une démonstration commerciale.

## Démarrage local

Prérequis : Node.js 22.12+ et un projet Supabase configuré.

```bash
cp .env.example .env
# renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev -- --host 127.0.0.1
```

L’application est ensuite disponible sur <http://localhost:5173/>.

## Packs pays (Niger / Côte d’Ivoire)

La migration `011_country_packs_payments_billing` ajoute :

- `orgs.country_code` (`NE` | `CI`) et RPC `apply_country_pack`
- Lots de paiement Mobile Money / espèces (`payment_batches`)
- File WhatsApp (`notification_outbox`)
- Essai / abonnement XOF (`org_subscriptions`)
- Rôle `cabinet` (multi-clients)

Les nouvelles organisations et les espaces démo sont créés en pack **Niger**. La migration `012_official_2026_rates` fige les taux 2026 (recoupement du 23/09/2026, valeurs conservées) :

- Niger : CNSS 5,25 % / 9,75 % / 4,90 % / 1,75 % (décret 2023-449), ANPE 1 % (décret 03/11/2023), plafond 500 000 F, SMIG 42 000 F (décret 2025-607), IUTS CGI art. 150 / LF 2026 (1–35 %), FAFPA TAP 3 % nationaux. AMO/RAMU = 0 (pas de prélèvement paie privée confirmé).
- Côte d’Ivoire : CNPS CLEISS 2025 6,3 / 7,7 / 5 / 0,75 / 2 %, plafonds 3 375 000 F (retraite) et 70 000 F (PF/AT), CMU 500 F forfait, FDFP 1,2 % + 0,4 %, ITS CGI art. 119 bis sur le brut, SMIG 75 000 F.

Appliquer les migrations `011`, `012`, `013` (primes), `014` (correctifs d’audit), `015`, `016` (jeu de démo Niger), `017` (barèmes au 01/01/2026, congés payés et prorata au mois réel), `018` (performance et récompenses), `019` (câblage des notifications) puis `020` (appuis du worker WhatsApp) sur Railway/Postgres avant d’utiliser ces écrans.

La migration `013_annual_employee_bonuses` ajoute le menu **Primes** : attribution (RH / manager / cabinet), validation RH, rattachement à un cycle ouvert, inclusion au brut à la pré-paie, passage en « versée » au verrouillage. Les variables mensuelles (`payroll_variables.bonuses`) restent inchangées.

La migration `016_niger_demo_dataset` rend le jeu de démonstration tournable : salariés nigériens (+227, Airtel / Moov / Zamani), 3 projets par espace, cycle de paie sur le **mois précédent** entièrement pointé (brut = salaire de base, une seule retenue d’absence explicable), feuilles de temps plafonnées à 8 h / jour. La remise à zéro conserve le rattachement des comptes manager / salarié à leur fiche (par matricule).

## Performance et récompenses

La migration `018_performance_rewards` ajoute le menu **Performance** (`/performance`), conçu pour s’ajouter aux **Primes**, sans les remplacer :

- **Objectifs** : le manager ou le RH fixe des objectifs chiffrés par cycle (mois, trimestre, semestre, année) ; le salarié déclare son résultat ; le responsable le valide. Un objectif non validé est « non évalué », jamais un zéro caché.
- **Indicateurs automatiques** lus dans l’application : ponctualité, assiduité (congés approuvés et jours fériés retirés), heures projet approuvées, délai de soumission de la feuille mensuelle (`timesheet_entries.submitted_at`, écrit par le serveur), corrections de pointage (celles d’un responsable ne pénalisent pas le salarié).
- **Score** de 0 à 100, calculé côté serveur (`compute_performance_scores`), avec une ligne de détail par objectif et par indicateur : la somme des points est le score final. Niveaux `à suivre` < 60 ≤ `conforme` < 75 ≤ `bon` < 85 ≤ `excellent`, ce dernier exigeant aussi d’être dans le haut du service (au moins la première personne, puis le premier dixième arrondi au supérieur). Poids et seuils se règlent par organisation (onglet « Cycles et réglages »).
- **Récompenses**, jamais versées automatiquement : badges (proposés par le calcul puis confirmés, message `recognition_awarded` placé dans `notification_outbox`), prime de performance proposée **en brouillon** et validée dans le menu Primes (circuit `013`, aucun nouveau circuit de paie), jours de congé bonus (type payé `BON`) et budget formation, validés par l’administrateur RH.
- **Droits** : écritures par fonctions `SECURITY DEFINER` uniquement, une ligne `audit_log` par action. Le salarié ne lit que ses lignes, l’auditeur et le cabinet sont en lecture seule, un cycle clos ne se recalcule qu’après réouverture motivée.

Le jeu de démonstration performance se charge depuis **Performance → Cycles et réglages → Charger le jeu de démonstration** (espace de démonstration, administrateur RH) ; la remise à zéro de la démo le supprime aussi.

## Notifications WhatsApp (file d’attente)

La migration `019_notification_wiring` remplit `notification_outbox` toute seule, par triggers, avec le numéro de la fiche salarié normalisé au format international (`+227…`, `+225…`) :

| Événement | Modèle | Destinataire |
|---|---|---|
| Congé approuvé ou refusé | `leave_approved`, `leave_rejected` | le salarié |
| Cycle de paie calculé | `payroll_approval` | les comptes `approveur_paie` rattachés à une fiche |
| Cycle de paie verrouillé | `payslip_ready` | chaque salarié payé |
| Badge confirmé (018) | `recognition_awarded` | le salarié |

Un même événement ne produit qu'un message par destinataire. Un numéro absent ne crée rien ; un numéro invalide crée une ligne `failed` avec un message clair. **Rien n'est envoyé par la base** : c'est le rôle du worker, la fonction Edge `supabase/functions/send-whatsapp`, qui s'appuie sur `claim_pending_notifications(p_org, p_limit, p_channel)` (réserve un lot sans doublon, 5 essais, réservation libérée après 10 minutes), `finish_notification(...)` et `release_notification(...)` (migration `020`), réservées au rôle `service_role`. Mise en service (compte WhatsApp Business, modèles Meta, secrets, planification) : [Worker WhatsApp](./docs/WHATSAPP-WORKER.md).

## Préparer la base Supabase

Les migrations du dossier `supabase/migrations` doivent être appliquées sur le projet Supabase cible avant la démonstration. Vérifier ensuite que la fonction `create_demo_org(text)` est disponible pour le rôle `authenticated`.

Ne jamais mettre une clé `service_role` dans `.env` côté frontend. Seule la clé publique/anon est attendue par Vite.

## Jeu de démonstration

1. Créer un compte administrateur depuis l’écran de connexion.
2. Dans l’écran d’organisation, choisir **Démonstration → PME** (Distribution Sahel SARL, Niamey — 12 salariés, pack Niger CNSS / IUTS).
3. Depuis **Paramètres → Accès et invitations**, créer les invitations `manager`, `employee` et `approveur_paie` (ou lancer `node scripts/prepare-video-demo.mjs`, qui crée les quatre comptes fictifs et rattache le salarié à PME-004 et le manager à PME-002).
4. Créer les comptes de test correspondants dans des sessions navigateur séparées, puis utiliser les codes d’invitation.
5. Pour le compte salarié, rattacher la fiche à l’aide du matricule fourni par le jeu de démonstration.
6. Remettre l’espace à zéro depuis **Paramètres → Accès et invitations → Réinitialiser les données de démonstration** entre deux prises si nécessaire (les rattachements de comptes sont conservés).

Les comptes de démonstration doivent utiliser des adresses dédiées à la recette, jamais les adresses personnelles d’un prospect.

## Vérifications techniques

```bash
npm run typecheck
npm run lint
npm test
npm run build
deno check supabase/functions/send-payslips/index.ts
deno check supabase/functions/send-whatsapp/index.ts
npm audit --audit-level=high
```

## Supports de prospection

- [Analyse commerciale et roadmap performance](./docs/ANALYSE-COMMERCIALE-ET-ROADMAP-A26.md)
- [Préparation de la démo et recette](./DEMO-VIDEO.md)
- [Plan de test détaillé](./DOCUMENT-TEST.md)

Le montage vidéo doit être réalisé après la recette authentifiée sur le projet Supabase cible, avec des données fictives et des captures de l’environnement de démonstration uniquement.
