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

# Prototype A26 — Le guide tout simple

**Une plateforme pour gérer le temps de travail, le personnel et les salaires.**
Éditée par KPB Global LLC · Pour le Niger et l'Afrique de l'Ouest · En français · En FCFA

> **Comment lire ce guide ?**
> Ce document est écrit pour être compris par tout le monde, même si vous n'avez
> jamais utilisé de logiciel de gestion. Chaque mot compliqué est expliqué juste
> après. Vous pouvez lire les parties dans l'ordre.

---

## 1. De quoi parle-t-on ?

Imaginez une entreprise de 20 personnes à Niamey.

Chaque mois, il faut savoir :

- qui est venu travailler, et combien d'heures ;
- qui était en congé ou absent ;
- combien on doit payer à chaque personne ;
- combien on doit verser à l'État et à la caisse de sécurité sociale ;
- et enfin : envoyer l'argent à chacun.

Aujourd'hui, la plupart des entreprises font tout cela avec un cahier, des
fichiers Excel et des messages WhatsApp. Ça marche… jusqu'au jour où il y a une
erreur, une dispute avec un employé, ou un contrôle.

**Prototype A26 est un outil qui fait tout ça au même endroit, dans l'ordre, et
qui garde la trace de chaque étape.**

---

## 2. Un exemple en une phrase

> De l'heure travaillée jusqu'au salaire payé, tout est enregistré, calculé et
> vérifiable.

C'est exactement ce que fait la plateforme.

---

## 3. Les mots à connaître

Voici les seuls mots un peu techniques du guide. Ils sont simples.

| Mot | Ce que ça veut dire |
|---|---|
| **Pointer** | Dire « j'arrive » et « je pars », comme signer un cahier de présence, mais sur un téléphone ou un ordinateur. |
| **Salaire brut** | Le salaire avant qu'on enlève quoi que ce soit. |
| **Salaire net** | Ce que l'employé reçoit vraiment dans sa main ou sur son téléphone. |
| **Retenue** | Une somme enlevée du salaire brut (par exemple l'impôt). |
| **Charge patronale** | Une somme payée **en plus** par l'entreprise, en dehors du salaire. |
| **CNSS** | La Caisse Nationale de Sécurité Sociale du Niger. On lui verse des cotisations (retraite, accidents du travail…). |
| **IUTS** | L'impôt sur les salaires au Niger. Il augmente par tranches : plus le salaire est élevé, plus le pourcentage monte. |
| **AMO** | La cotisation pour la couverture santé. |
| **Bulletin de paie** | La feuille qui montre le calcul du salaire d'une personne pour un mois. |
| **Mobile Money** | Payer par téléphone (Airtel Money, Moov Money, Orange Money…). |
| **Cycle de paie** | Le « dossier » d'un mois de salaires. Il passe par 4 étapes, on va les voir. |
| **Journal d'audit** | Un cahier automatique qui note qui a fait quoi, et quand. On ne peut pas l'effacer. |

---

## 4. Qui utilise la plateforme ?

Tout le monde n'a pas les mêmes droits. C'est important : un employé ne doit pas
voir le salaire de ses collègues.

| Rôle | Ce qu'il peut faire |
|---|---|
| **Administrateur RH** | Le chef de l'outil : crée les employés, règle les paramètres, voit tout. |
| **Responsable d'équipe** | Valide les congés et les heures de son équipe. |
| **Préparateur de paie** | Calcule les salaires du mois. |
| **Approbateur paie** | Vérifie et approuve le calcul. Ce n'est **pas** la même personne que le préparateur. |
| **Salarié** | Pointe, demande ses congés, voit **uniquement** ses propres bulletins. |
| **Auditeur** | Peut seulement regarder, jamais modifier. Utile pour un contrôle. |
| **Cabinet comptable** | Peut suivre plusieurs entreprises clientes depuis un seul compte. |

---

## 5. Comment ça se passe, du début à la fin

Voici le parcours complet d'un mois de travail. Six étapes.

### Étape 1 — L'employé pointe

Le matin, l'employé ouvre la plateforme sur son téléphone et pointe.
S'il travaille sur plusieurs projets dans la journée, il peut lancer un
chronomètre sur le projet A, puis basculer sur le projet B. Le temps de chaque
projet est gardé séparément.

**Pourquoi c'est utile :** une ONG ou un chantier doit souvent prouver combien
d'heures ont été passées sur quel projet, pour justifier un budget.

### Étape 2 — Le responsable valide

Le responsable d'équipe regarde les congés demandés et les heures déclarées.
Il approuve ou refuse. Rien n'est validé tout seul.

### Étape 3 — On prépare la paie

Le préparateur ouvre le mois, ajoute ce qui change :

- les heures supplémentaires,
- les primes,
- les absences non payées.

Puis il appuie sur **Lancer le calcul**. La plateforme calcule tous les
bulletins d'un coup.

### Étape 4 — Une deuxième personne approuve

C'est le point le plus important pour la confiance.

> **La personne qui a calculé la paie ne peut pas l'approuver elle-même.**

Une deuxième personne doit vérifier et valider. Comme deux signatures sur un
chèque. Si le préparateur essaie d'approuver son propre travail, la plateforme
refuse.

### Étape 5 — On verrouille et on sort les documents

Une fois approuvé, le mois est **verrouillé** : plus personne ne peut modifier
les chiffres en cachette. On peut alors générer :

- les bulletins de paie de chaque employé ;
- la déclaration pour la CNSS ;
- la déclaration de l'impôt (IUTS) ;
- les écritures pour le comptable ;
- le livre de paie en PDF, à imprimer et tamponner.

### Étape 6 — On paie les salaires

On crée un **lot de paiement**. Par exemple : « 14 personnes en Airtel Money ».
La plateforme prépare un fichier avec les numéros de téléphone et les montants.

Ensuite, pour chaque personne, on marque :

- **Payé** si l'argent est bien parti ;
- **Échec** si le paiement n'a pas marché (mauvais numéro, compte bloqué…).

Pour ceux qui sont payés en espèces, la plateforme imprime un **reçu** à signer.
Comme ça, il y a une preuve.

---

## 6. Les quatre états d'un mois de paie

C'est très simple : un mois de paie avance comme un dossier administratif.

| État | Ce que ça veut dire | Qui agit |
|---|---|---|
| **Ouvert** | Le mois est créé, rien n'est calculé | Préparateur |
| **Calculé** | Les bulletins existent, mais ne sont pas validés | Préparateur |
| **Approuvé** | Une deuxième personne a vérifié et accepté | Approbateur |
| **Verrouillé** | Plus aucune modification possible | Administrateur RH |

---

## 7. Un vrai exemple de calcul (Niger)

Prenons **Ibrahim**, qui gagne **200 000 FCFA** de salaire brut ce mois-ci, sans
heures supplémentaires ni absence.

### Ce qu'on enlève de son salaire

| Ligne | Calcul | Montant |
|---|---|---|
| Cotisation retraite CNSS (1,6 %) | 200 000 × 1,6 % | 3 200 FCFA |
| Couverture santé AMO (1 %) | 200 000 × 1 % | 2 000 FCFA |
| **Salaire avant impôt** | 200 000 − 3 200 − 2 000 | **194 800 FCFA** |

### L'impôt IUTS, calculé par tranches

L'impôt ne s'applique pas d'un coup sur tout le salaire. Il monte par paliers,
comme des marches d'escalier.

| Tranche | Taux | Part du salaire concernée | Impôt |
|---|---|---|---|
| de 0 à 25 000 | 0 % | 25 000 | 0 FCFA |
| de 25 000 à 50 000 | 2 % | 25 000 | 500 FCFA |
| de 50 000 à 100 000 | 8 % | 50 000 | 4 000 FCFA |
| de 100 000 à 194 800 | 15 % | 94 800 | 14 220 FCFA |
| **Total impôt** | | | **18 720 FCFA** |

### Ce qu'Ibrahim reçoit

| | Montant |
|---|---|
| Salaire avant impôt | 194 800 FCFA |
| Moins l'impôt IUTS | − 18 720 FCFA |
| **Salaire net à payer** | **176 080 FCFA** |

### Ce que l'entreprise paie en plus

L'entreprise ne paie pas seulement le salaire. Elle verse aussi des cotisations.

| Ligne | Taux | Montant |
|---|---|---|
| Retraite CNSS (part entreprise) | 4 % | 8 000 FCFA |
| Prestations familiales | 5,5 % | 11 000 FCFA |
| Accidents du travail | 2 % | 4 000 FCFA |
| Risques professionnels | 1 % | 2 000 FCFA |
| Couverture santé AMO | 3 % | 6 000 FCFA |
| Formation professionnelle | 1,2 % + 0,3 % | 3 000 FCFA |
| **Total charges entreprise** | | **34 000 FCFA** |

### Le coût réel pour l'entreprise

| | Montant |
|---|---|
| Salaire brut | 200 000 FCFA |
| Charges de l'entreprise | + 34 000 FCFA |
| **Coût total du salarié** | **234 000 FCFA** |

**Ce qui est important :** dans la plateforme, chaque ligne ci-dessus est
affichée avec son calcul et son pourcentage. On peut toujours répondre à la
question : « pourquoi ce montant ? »

<p class="note">Les pourcentages utilisés ici sont des valeurs de simulation,
modifiables dans les paramètres. Ils doivent être confirmés avec votre
comptable ou votre expert-comptable avant une déclaration officielle.</p>

---

## 8. Deux pays, deux jeux de règles

Les pays d'Afrique de l'Ouest n'ont pas les mêmes caisses ni les mêmes impôts.
La plateforme contient donc des **packs pays**. On choisit son pays, et les
bonnes règles se mettent en place automatiquement.

| | **Niger** | **Côte d'Ivoire** |
|---|---|---|
| Caisse sociale | CNSS | CNPS |
| Impôt sur salaires | IUTS (5 tranches) | ITS (4 tranches) |
| Santé | AMO | CMU |
| Formation | Contribution formation | FDFP |
| Monnaie | FCFA | FCFA |

Si vous changez de pays dans les paramètres, les anciennes règles sont mises de
côté (elles ne sont pas effacées, pour garder l'historique) et les nouvelles
sont installées.

---

## 9. Pensé pour le terrain

C'est bien d'avoir un outil moderne. Mais il doit fonctionner **ici**, avec un
réseau qui coupe et des équipes qui ne sont pas au bureau.

- **Ça marche sur téléphone.** On peut l'installer comme une application.
- **Ça résiste au réseau faible.** Si la connexion coupe pendant un pointage,
  l'information est gardée dans le téléphone et envoyée dès que le réseau
  revient.
- **WhatsApp.** La plateforme prépare des messages à envoyer : « votre bulletin
  est prêt », « votre congé est approuvé », « n'oubliez pas de pointer »,
  « une paie attend votre validation ».
- **Tout est en français**, tous les montants sont en FCFA.

---

## 10. Reprendre ce que vous avez déjà

Vous avez déjà un fichier Excel avec vos employés ? Pas besoin de tout retaper.

1. Vous téléchargez un **modèle de fichier** depuis la plateforme.
2. Vous recopiez vos employés dedans (nom, prénom, matricule, salaire, numéro
   Mobile Money…).
3. Vous importez le fichier.
4. Les fiches et les contrats sont créés automatiquement.

---

## 11. Et la confidentialité ?

Trois protections simples :

1. **Chaque rôle voit seulement ce qui le concerne.** Un employé ne voit que ses
   propres bulletins.
2. **Chaque entreprise est séparée.** Si un cabinet gère 5 clients, les données
   ne se mélangent pas.
3. **Le journal d'audit note tout.** Qui a calculé la paie, qui l'a approuvée,
   qui a modifié une règle, et à quelle heure. Ce journal peut être imprimé en
   PDF pour un contrôle.

---

## 12. Combien ça coûte ?

| Formule | Prix par mois | Nombre de salariés |
|---|---|---|
| **Essai** | Gratuit, 30 jours | jusqu'à 25 |
| **PME** | 45 000 FCFA | jusqu'à 50 |
| **Groupe** | 120 000 FCFA | jusqu'à 200 |
| **Cabinet** | 180 000 FCFA | jusqu'à 500, plusieurs entreprises |

- Paiement par Mobile Money ou virement.
- Facturation en FCFA.
- Le premier mois de paie est accompagné : on le fait avec vous.

---

## 13. Comment démarrer

1. **Créer un compte** et choisir son pays (Niger ou Côte d'Ivoire).
2. **Ajouter les employés**, à la main ou en important un fichier Excel.
3. **Inviter l'équipe** : responsable, préparateur, approbateur, salariés.
   Chacun reçoit un code d'invitation.
4. **Laisser tourner un mois** : pointages, congés, feuilles de temps.
5. **Lancer un cycle de paie**, le faire approuver, puis le verrouiller.
6. **Payer** par Mobile Money, virement ou espèces, et sortir les documents.

Comptez un premier cycle accompagné pour prendre la main. Ensuite, la routine
mensuelle est rapide.

---

## 14. Les questions qu'on pose souvent

**Est-ce que ça remplace mon comptable ?**
Non. La plateforme prépare, calcule et documente. Votre comptable garde son rôle
de conseil et de validation officielle. L'outil lui fait gagner du temps en lui
donnant des fichiers propres.

**Est-ce que les taux sont garantis conformes ?**
Les taux fournis sont des valeurs de départ, modifiables. Ils doivent être
validés avec un expert local. C'est un choix d'honnêteté : les règles changent,
et l'outil est fait pour être ajusté.

**Et si je n'ai pas Internet au bureau ?**
Le pointage fonctionne même avec un réseau faible. Les données partent quand la
connexion revient. Le calcul de paie, lui, se fait quand vous êtes connecté.

**Mes employés n'ont pas tous un smartphone.**
Le responsable peut saisir ou corriger les pointages. Le paiement en espèces est
prévu, avec un reçu à signer.

**Est-ce que je peux essayer sans payer ?**
Oui, 30 jours, jusqu'à 25 salariés.

---

## 15. À retenir en cinq lignes

1. Un seul outil pour le temps, les employés, la paie et le paiement.
2. Chaque montant est expliqué, ligne par ligne.
3. Deux personnes différentes pour calculer et approuver la paie.
4. Les règles du Niger (CNSS, IUTS, AMO) sont intégrées et modifiables.
5. Tout ce qui est fait est tracé, et peut être imprimé en cas de contrôle.

---

<p class="note"><strong>Mention importante.</strong> Prototype A26 prépare et
documente la paie. Les taux de cotisation et les barèmes d'impôt fournis sont
des valeurs de simulation paramétrables, qui doivent être confirmées par un
expert-comptable local avant tout dépôt officiel auprès de la CNSS ou de
l'administration fiscale. KPB Global LLC — Prototype A26.</p>
