# Worker WhatsApp : mise en service

La fonction Edge `send-whatsapp` vide la file `notification_outbox` (canal `whatsapp`) vers l'API **WhatsApp Business Cloud**. Les migrations `019` et `020` remplissent la file ; ce worker l'envoie. Sans lui, les messages restent `pending` et s'affichent dans **Paramètres → Notifications**.

## Ce qui part, et quand

| Message en file | Quand | Destinataire | Modèle Meta |
|---|---|---|---|
| `leave_approved` | congé approuvé | le salarié | `a26_leave_approved` |
| `leave_rejected` | congé refusé | le salarié | `a26_leave_rejected` |
| `payroll_approval` | cycle de paie calculé | les approbateurs paie | `a26_payroll_approval` |
| `payslip_ready` | cycle verrouillé | chaque salarié payé | `a26_payslip_ready` |
| `recognition_awarded` | badge confirmé | le salarié | `a26_recognition_awarded` |
| `clock_reminder` | mise en file manuelle (Paramètres) | le numéro saisi | `a26_clock_reminder` |

## 1. Côté Meta

1. Un compte **WhatsApp Business** (Meta Business Manager) avec un numéro vérifié, et une application Meta avec le produit WhatsApp.
2. Un **jeton d'accès permanent** (utilisateur système) avec la permission `whatsapp_business_messaging`, et l'identifiant du numéro (`Phone number ID`).
3. Six **modèles de message**, catégorie *Utilitaire*, langue *Français (fr)*, à soumettre pour validation. Les variables suivent l'ordre exact ci-dessous. Meta refuse un corps qui commence ou finit par une variable.

| Nom | Corps | Exemple de valeurs |
|---|---|---|
| `a26_leave_approved` | Bonjour, votre demande de {{1}} du {{2}} au {{3}} ({{4}} jour(s)) a été approuvée chez {{5}}. Bon congé ! | Congé annuel payé · 12/10/2026 · 14/10/2026 · 3 · Distribution Sahel SARL |
| `a26_leave_rejected` | Bonjour, votre demande de {{1}} du {{2}} au {{3}} n'a pas été acceptée chez {{4}}. Motif : {{5}}. Merci d'en parler avec votre responsable. | Congé annuel payé · 12/10/2026 · 14/10/2026 · Distribution Sahel SARL · Période chargée |
| `a26_payroll_approval` | Bonjour, la paie de {{1}} chez {{2}} est calculée et attend votre approbation. Connectez-vous à Prototype A26 pour la valider. | septembre 2026 · Distribution Sahel SARL |
| `a26_payslip_ready` | Bonjour, votre bulletin de paie de {{1}} chez {{2}} est disponible dans Prototype A26. | septembre 2026 · Distribution Sahel SARL |
| `a26_recognition_awarded` | Félicitations ! Le badge « {{1}} » vous a été attribué chez {{2}}. Merci pour votre engagement. | Assiduité parfaite · Distribution Sahel SARL |
| `a26_clock_reminder` | Bonjour, {{1}} vous rappelle de pointer votre arrivée et votre sortie dans Prototype A26. | Distribution Sahel SARL |

Les corps ci-dessus sont des propositions : si Meta demande une reformulation, gardez le nombre et l'ordre des variables, ou adaptez `TEMPLATE_SPECS` dans `supabase/functions/send-whatsapp/messages.ts`.

## 2. Variables d'environnement (secrets de la fonction)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `WHATSAPP_WORKER_SECRET` | oui | Secret partagé (16 caractères minimum) que le planificateur envoie dans l'en-tête `x-worker-secret` |
| `WHATSAPP_ACCESS_TOKEN` | pour envoyer | Jeton permanent Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | pour envoyer | Identifiant du numéro d'envoi |
| `WHATSAPP_API_VERSION` | non | Version de l'API Graph, `v21.0` par défaut |
| `WHATSAPP_API_BASE` | non | Base de l'API, `https://graph.facebook.com` par défaut (tests, proxy) |
| `WHATSAPP_TEMPLATE_PREFIX` | non | Préfixe des modèles, `a26_` par défaut |
| `WHATSAPP_TEMPLATE_LANGUAGE` | non | Langue des modèles, `fr` par défaut |
| `WHATSAPP_BATCH_SIZE` | non | Taille de lot par défaut, 20 (100 au plus) |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par la plateforme. La clé `service_role` reste dans la fonction : elle n'apparaît jamais côté navigateur.

```bash
supabase secrets set WHATSAPP_WORKER_SECRET="$(openssl rand -hex 24)" \
  WHATSAPP_ACCESS_TOKEN="…" WHATSAPP_PHONE_NUMBER_ID="…"
supabase functions deploy send-whatsapp
```

`supabase/config.toml` déclare `verify_jwt = false` pour cette fonction : elle est appelée par un planificateur, pas par un utilisateur, et protégée par le secret partagé.

## 3. Planification

Le worker traite un lot par appel. Appelez-le toutes les minutes, par exemple avec `pg_cron` et `pg_net` (extensions à activer dans Supabase) :

```sql
select cron.schedule(
  'a26-whatsapp-worker',
  '* * * * *',
  $$ select net.http_post(
       url     := 'https://<ref-projet>.supabase.co/functions/v1/send-whatsapp',
       headers := jsonb_build_object('x-worker-secret', '<WHATSAPP_WORKER_SECRET>', 'Content-Type', 'application/json'),
       body    := '{}'::jsonb
     ) $$
);
```

Tout cron HTTP convient aussi (GitHub Actions, Railway cron…). Deux appels qui se chevauchent ne se gênent pas : la réservation se fait avec `FOR UPDATE SKIP LOCKED`.

## 4. Vérifier avant d'envoyer

```bash
curl -X POST "$URL/send-whatsapp" -H "x-worker-secret: $SECRET" -d '{"dry_run": true}'
```

`dry_run` liste ce qui partirait (modèle, variables, numéro masqué `+227••••2030`) sans rien réserver ni envoyer, et indique si les identifiants sont configurés. Autres paramètres du corps : `limit` (1 à 100) et `org_id` pour ne traiter qu'une organisation.

## 5. Comportement en cas d'échec

| Situation | Effet sur la ligne |
|---|---|
| Message accepté par Meta | `sent`, `sent_at`, `provider_message_id` (identifiant `wamid…`) |
| Quota ou débit (HTTP 429, codes 4, 17, 32, 613, 80007, 130429, 131056), panne 5xx, réseau, délai de 15 s | reste `pending`, le motif est conservé dans `error` ; nouvel essai au passage suivant, **5 essais au plus**, puis `failed` |
| Numéro sans WhatsApp, modèle absent ou refusé, paramètre invalide | `failed` tout de suite, avec le code et le détail Meta |
| Numéro invalide, modèle inconnu du worker | `failed` tout de suite, sans appel à Meta |
| Jeton expiré, permission manquante, compte bloqué (HTTP 401/403, codes 190, 200, 10, 131031) | le lot s'arrête (HTTP 502), les lignes sont rendues **sans consommer d'essai** (`release_notification`) : corrigez le jeton, tout repart |
| Identifiants absents | HTTP 503, rien n'est réservé |
| Worker tombé en plein envoi | la réservation se libère après 10 minutes ; au 5ᵉ essai sans réponse, la ligne passe en `failed` |

Les `failed` se relisent dans **Paramètres → Notifications** (colonne Statut, motif visible). Les lignes e-mail et SMS ne sont jamais réservées par ce worker.

## 6. Limites connues

- **Doublon possible** : si Meta accepte un message et que l'écriture du statut échoue trois fois de suite, la ligne est renvoyée après 10 minutes. C'est rare ; l'inverse (message perdu) est exclu.
- **Modèles uniquement** : tout message est envoyé par un modèle approuvé, ce qui évite la fenêtre de 24 heures de WhatsApp mais impose la validation Meta de chaque texte.
- **Débit** : 5 envois en parallèle, 100 messages par lot au plus. Au-delà, plusieurs passages.
- **Coût** : Meta facture les conversations de catégorie *Utilitaire* selon son tarif en vigueur ; non chiffré ici.
- **Le format des numéros** est vérifié en base (migration 019) : `+227…` ou `+225…`.
