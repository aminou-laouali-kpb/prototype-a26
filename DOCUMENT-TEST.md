# Plan de test complet — Application RH / Paie (pack Niger)

Document de recette destiné à être suivi étape par étape, avec enregistrement des résultats.
Cochez chaque case après vérification et notez les anomalies dans la section « Anomalies constatées » en fin de document.

**Date du test :** ________  **Testeur :** ________  **Environnement :** ________ (URL de l'app)

---

## 0. Comptes et préparation

### 0.1 Comptes nécessaires

Créez (ou identifiez) au moins 3 comptes avec des rôles différents :

| Compte | E-mail | Rôle attendu | Créé ? |
|---|---|---|---|
| Compte A | ________ | Administrateur RH (admin_rh) | ☐ |
| Compte B | ________ | Responsable d'équipe (manager) | ☐ |
| Compte C | ________ | Salarié (employee) | ☐ |

> Les rôles s'attribuent par invitation : en admin_rh, **Paramètres → Accès et invitations** → créer un code par rôle (`manager`, `employee`, `approveur_paie`). Le nouveau compte saisit ce code à sa première connexion, puis se rattache à sa fiche salarié (écran de rattachement proposé à la connexion). Le script `scripts/prepare-video-demo.mjs` automatise ces étapes pour la démo.

### 0.2 Données de base

En tant que Compte A (Administrateur RH) :

- [ ] La liste des **projets** contient au moins 3 projets actifs (créés par le jeu de démo ; sinon bouton « Nouveau projet » dans Feuilles de temps).
- [ ] La liste des **salariés** contient au moins 3 personnes avec : e-mail renseigné, salaire de base renseigné, un projet d'affectation.
- [ ] Au moins un salarié (Compte C) est rattaché à un compte utilisateur (bouton de rattachement / colonne statut de compte).

---

## 1. Authentification et accès

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 1.1 | Ouvrir l'app sans être connecté | L'écran de connexion s'affiche | ☐ |
| 1.2 | Se connecter avec un mauvais mot de passe | Message d'erreur clair, pas de connexion | ☐ |
| 1.3 | Se connecter avec Compte A (admin_rh) | Accueil = Tableau de bord (pas la vue salarié) | ☐ |
| 1.4 | Se connecter avec Compte C (salarié) | Accueil = vue « Mon espace » (EmployeeHome) avec pointage et chronomètre | ☐ |
| 1.5 | Se déconnecter puis se reconnecter avec Compte B (manager) | Rôle affiché : Responsable d'équipe | ☐ |
| 1.6 | Vérifier le menu latéral selon le rôle | Le salarié ne voit PAS « Pré-paie », « Salariés », « Journal d’audit » | ☐ |

---

## 2. Suivi du temps multi-projets (chronomètre dynamique)

> Se connecter avec **Compte C (salarié)**. La carte chronomètre se trouve sur l'accueil salarié.

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 2.1 | Démarrer le chronomètre sur le projet A | L'horloge se met à tourner (HH:MM:SS), le projet actif est surligné | ☐ |
| 2.2 | Attendre ~1 minute puis **basculer** sur le projet B | Le temps du projet A est conservé et affiché à côté du projet A ; le chronomètre continue sur B | ☐ |
| 2.3 | Basculer à nouveau vers le projet C | Cumuls corrects : A ≠ 0, B ≠ 0, C en cours | ☐ |
| 2.4 | Vérifier « Total aujourd'hui » | La somme des heures des 3 projets correspond au temps écoulé depuis le démarrage | ☐ |
| 2.5 | Arrêter le chronomètre | Le temps en cours est enregistré dans la feuille de temps du jour (statut brouillon), le chronomètre revient à zéro | ☐ |
| 2.6 | Recharger la page | Les cumuls du jour sont conservés (rien n'est perdu) | ☐ |
| 2.7 | Démarrer, quitter l'app puis revenir 5 min plus tard | Le chronomètre reprend le temps réel écoulé (pas remis à zéro) | ☐ |
| 2.8 | Menu « Temps » : vue journalière | Les entrées créées par le chronomètre apparaissent par projet | ☐ |

---

## 3. Feuilles de temps et validation managériale

### 3.1 Côté salarié (Compte C)

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 3.1a | Onglet « Feuilles de temps » (menu Feuilles) → vue « Mes feuilles » | Les heures du jour (issues du chronomètre) apparaissent en brouillon, ventilées par projet | ☐ |
| 3.1b | Exporter le CSV de sa feuille | Fichier téléchargé avec heures par projet | ☐ |

### 3.2 Côté manager (Compte B) — feuille mensuelle & circuit de signature

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 3.2a | Menu Feuilles → onglet « Feuille mensuelle », choisir le salarié C + le mois en cours | Tableau des heures par projet avec total | ☐ |
| 3.2b | Cliquer « Soumettre le mois » | Les entrées brouillon passent en « soumis » ; plus modifiables par le salarié | ☐ |
| 3.2c | Cliquer « Valider le mois » | Statut passe en « approuvé » ; les boutons de validation disparaissent | ☐ |
| 3.2d | Exporter le **PDF** de la feuille mensuelle | Document imprimable avec : en-tête organisation, détail par projet, total, blocs de signature (émargement responsable) | ☐ |
| 3.2e | (Test du rejet) Reprendre un mois « soumis » et cliquer « Rejeter » | Les entrées repassent en rejeté ; le salarié peut les corriger puis resoumettre | ☐ |

### 3.3 Synthèse

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 3.3a | Onglet « Synthèse » (manager ou RH) | Tableau croisé salarié × projet avec totaux par ligne et par colonne | ☐ |
| 3.3b | Exporter la synthèse en CSV | Fichier lisible, chiffres cohérents avec la feuille mensuelle | ☐ |

---

## 4. Moteur de paie & salaire net

> Se connecter avec **Compte A (admin_rh)**. Menu « Pré-paie ».

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 4.1 | Sélectionner le cycle du mois précédent (statut : ouvert) | La période s'affiche avec la liste des salariés | ☐ |
| 4.2 | Saisir des variables (heures sup, primes, absences non payées) pour 2 salariés | Variables enregistrées et visibles dans le tableau | ☐ |
| 4.3 | Lancer le calcul | Bulletins générés : brut, retenue CNSS salarié (plafond 500 000 F), **IUTS par barème progressif**, net à payer, charges patronales (CNSS, ANPE, FAFPA) | ☐ |
| 4.4 | Vérifier à la main pour 1 salarié | Brut − (CNSS + IUTS) = Net affiché (tolérance d'arrondi 1 F CFA) | ☐ |
| 4.5 | Cliquer « Détail » sur un bulletin | Ventilation complète : base, taux, chaque cotisation, tranches IUTS, net | ☐ |
| 4.6 | Cliquer « Lancer le calcul » (Compte A = préparateur) | Statut passe à « Calculée » ; bouton « Valider (4 yeux) » visible | ☐ |
| 4.7 | Tenter d'« Approuver » avec le MÊME compte qui a préparé | **Refusé** (contrôle des 4 yeux : le préparateur ne peut pas approuver) | ☐ |
| 4.8 | Se connecter avec un compte **approuveur_paie** (ou admin différent) et cliquer « Valider (4 yeux) » | Statut passe à « Approuvé » ; côté admin, boutons « Verrouiller » et « Envoyer les bulletins par e-mail » disponibles | ☐ |
| 4.9 | Export « Paie (CSV) » | Fichier avec toutes les colonnes de paie, cohérent avec l'écran | ☐ |
| 4.10 | Exports « Fichier de paiement », « Masse Mobile Money », « Écritures OHADA », « Déclaration CNSS », « Déclaration IUTS » | Fichiers générés sans erreur | ☐ |
| 4.11 | Compte A : cliquer « Verrouiller » (réservé à l’admin RH) | Période verrouillée : plus aucune modification possible | ☐ |

---

## 5. Bulletins de paie (PDF + e-mail)

> Période approuvée ou verrouillée (issue de la section 4).

### 5.1 Côté RH

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 5.1a | Menu « Pré-paie » → œil d’une ligne → PDF, ou « Livre de paie PDF » | Document imprimable : identité salarié, période, organisation (NIF), brut, cotisations, IUTS, net, mentions légales | ☐ |
| 5.1b | Menu Paie → bloc « Distribution des bulletins par e-mail » | Compteur « 0 / N bulletin(s) déjà envoyé(s) » affiché | ☐ |
| 5.1c | Cliquer « Envoyer les bulletins par e-mail » | Message de résultat : « X bulletin(s) envoyé(s) · Y sans e-mail · Z en échec » ; compteur mis à jour | ☐ |
| 5.1d | Vérifier la boîte mail d'un salarié test | Bulletin reçu, expéditeur = adresse configurée, contenu HTML propre | ☐ |
| 5.1e | (Si un salarié n'a pas d'e-mail) Relancer l'envoi | Ce bulletin est compté en « sans e-mail », pas d'erreur bloquante | ☐ |

### 5.2 Côté salarié

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 5.2a | Se connecter avec Compte C → menu « Mes bulletins » | Seulement SES bulletins (jamais ceux des autres) | ☐ |
| 5.2b | Télécharger le bulletin du mois en PDF | PDF correct et identique aux chiffres RH | ☐ |

---

## 6. Récapitulatif annuel fiscal

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 6.1 | Menu « Pré-paie » → bouton « Récapitulatif annuel » | Fenêtre avec sélecteur d'année | ☐ |
| 6.2 | Choisir l'année avec des périodes calculées | Une ligne par salarié : brut, CNSS salarié, AMO salarié (0), IUTS, net, charges employeur + total général | ☐ |
| 6.3 | Exporter le PDF | Document conforme à un état annuel (en-tête organisation, année, tableau, totaux) | ☐ |
| 6.4 | Exporter le CSV | Fichier lisible, chiffres identiques à l'écran | ☐ |

---

## 7. Congés, sessions et autres modules (régression)

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 7.1 | Salarié : démarrer/terminer une **session de travail** (pointage) | Session enregistrée, durée calculée | ☐ |
| 7.2 | Salarié : demander un **congé** | Demande créée, visible côté manager pour validation | ☐ |
| 7.3 | Manager : valider/refuser la demande de congé | Statut mis à jour des deux côtés | ☐ |
| 7.4 | Admin : page « Journal d’audit » | Les actions récentes (calcul paie, validation 4 yeux, feuille mensuelle, envoi e-mails) sont listées avec **qui**, l’action en clair et des détails lisibles | ☐ |
| 7.5 | Page « Paramètres » | Paramètres de l'organisation accessibles et modifiables (admin uniquement) | ☐ |
| 7.6 | Page « Profil » | Les informations du compte connecté s'affichent | ☐ |

---

## 8. Sécurité (vérifications rapides)

| # | Étape | Résultat attendu | OK ? |
|---|---|---|---|
| 8.1 | Salarié (Compte C) : tenter d'accéder à /paie et /salaries par l'URL | Accès refusé ou page vide, aucune donnée de paie d'autrui | ☐ |
| 8.2 | Salarié : la vue « Mes bulletins » ne montre que ses propres bulletins | ✔ | ☐ |
| 8.3 | Déconnecté : recharger l'app sur /paie | Retour à l'écran de connexion | ☐ |

---

## 9. Anomalies constatées

| # | Section | Description | Gravité (bloquant / majeur / mineur) | Captures / notes |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## 10. Conclusion du test

- Nombre de tests réussis : ____ / ____
- Tests bloquants en échec : ____
- App validée pour mise en production : ☐ Oui ☐ Non
- Commentaires : ______________________________________________
