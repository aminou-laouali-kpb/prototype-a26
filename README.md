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

## Préparer la base Supabase

Les migrations du dossier `supabase/migrations` doivent être appliquées sur le projet Supabase cible avant la démonstration. Vérifier ensuite que la fonction `create_demo_org(text)` est disponible pour le rôle `authenticated`.

Ne jamais mettre une clé `service_role` dans `.env` côté frontend. Seule la clé publique/anon est attendue par Vite.

## Jeu de démonstration

1. Créer un compte administrateur depuis l’écran de connexion.
2. Dans l’écran d’organisation, choisir **Démonstration → PME**.
3. Depuis **Paramètres → Accès**, créer deux invitations : `manager` et `employee`.
4. Créer les comptes de test correspondants dans des sessions navigateur séparées, puis utiliser les codes d’invitation.
5. Pour le compte salarié, rattacher la fiche à l’aide du matricule fourni par le jeu de démonstration.
6. Remettre l’espace à zéro depuis **Paramètres** entre deux prises si nécessaire.

Les comptes de démonstration doivent utiliser des adresses dédiées à la recette, jamais les adresses personnelles d’un prospect.

## Vérifications techniques

```bash
npm run typecheck
npm run lint
npm run build
deno check supabase/functions/send-payslips/index.ts
npm audit --audit-level=high
```

## Supports de prospection

- [Préparation de la démo et recette](./DEMO-VIDEO.md)
- [Plan de test détaillé](./DOCUMENT-TEST.md)

Le montage vidéo doit être réalisé après la recette authentifiée sur le projet Supabase cible, avec des données fictives et des captures de l’environnement de démonstration uniquement.
