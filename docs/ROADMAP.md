# Mesa — roadmap « l'appli qui pense pour vous »

But : Mesa enlève la charge mentale de la cuisine à la maison. Elle sait ce qu'il y a chez vous, trouve
de vraies bonnes recettes, propose quoi cuisiner, remplit la liste, et apprend vos goûts.

## Principes (non négociables)

1. **De vraies recettes de vraies personnes.** L'IA trouve, lit, trie, adapte, explique. Elle n'invente
   jamais une recette et cite toujours sa source.
2. **L'IA propose, vous décidez.** Tout changement sur le garde-manger ou la liste passe par une
   proposition qu'on valide (comme les scans). Rien de silencieux.
3. **Honnête.** On montre la progression, on dit « pourquoi » chaque suggestion, on ne fait pas semblant
   d'être sûr.
4. **Calme.** Une notification proactive par semaine au plus, jamais de fil infini.
5. **Pour tout le monde.** Rien qui ne marche que dans un pays (langue, monnaie, magasins).

## Déjà là

Import depuis Instagram, TikTok, YouTube, sites et captures (jusqu'à 4), avec étapes et minutage vidéo ·
rangement automatique des produits inconnus · Kitchen Sweep et tickets de caisse · « Ideas for … » ·
traduction des étapes · vos créateurs (More from…, Follow, nouveautés quotidiennes) · Tonight's idea ·
favoris qui comptent (Cook again) · tâches IA en arrière-plan avec notification · mises à jour à distance.

## Maintenant (2–4 semaines) — « L'IA qui remplit la bibliothèque »

| # | Quoi | Ce que vous voyez | Taille | Build ? |
|---|---|---|---|---|
| 1 | **Pour vous cette semaine** ✅ | 5 vraies vidéos-recettes par semaine en haut de Recipes, choisies d'après ce que vous cuisinez vraiment et vos créateurs, avec le « pourquoi ». Save / Not for us. | M | non |
| 2 | **Ask Mesa, l'assistant unique** ✅ | La barre Mesa sur chaque onglet (et « Ask about this recipe ») ouvre Ask Mesa en plein écran : questions sur votre cuisine, substitutions et portions d'une recette, liste de courses, « plan my week », et des vraies vidéos cherchées dans la conversation. La réponse s'écrit en direct, ne passe jamais derrière un import, et la conversation reste sur le téléphone. | M | non |
| 3 | **Coller une liste de liens** | 10 liens collés = 10 recettes (corrige le bug « premier lien seulement »), mode carnet (1 photo = 1 recette). File d'attente équitable, 2 imports à la fois. | M | non |
| 4 | **Quantités habituelles** | « lait » → chips « 1 L · 2 L » d'après vos achats passés ; la liste devine les quantités. | S | non |

## Ensuite (1–2 mois) — « La semaine qui se planifie »

| # | Quoi | Ce que vous voyez | Taille | Build ? |
|---|---|---|---|---|
| 5 | **Plan my week** ✅ | L'IA propose 4–5 dîners pour la semaine parmi vos recettes : ce qui finit au frigo d'abord, du temps quand il y en a, variété, favoris. Vous ajustez, un tap remplit la liste. | L | non |
| 6 | **Le dîner décidé à deux** | « Cook tonight » fixe le repas sur les deux téléphones ; « Ask Karla » lui envoie 2 idées. | M | non |
| 7 | ~~Adapter une recette~~ | Abandonné : c'est une question à Ask Mesa sur la recette (« pas de crème ? », « pour 2 ? »). | — | — |
| 8 | **Mode cuisine** | Étape par étape en grand, minuteurs détectés dans le texte (« laisser mijoter 20 min »), écran qui reste allumé, saut à la vidéo. Minuteur sur l'écran verrouillé. | M | oui (Live Activity) |
| 9 | **Restes** | « Il en reste ? » après Cooked! → une portion dans Use soon, proposée en premier. | S | non |
| 10 | **Le garde-manger qui prévoit** | « Vous rachetez du lait tous les 5 jours » → « Bientôt fini ? » avant qu'il manque ; suggestion sur la liste à valider. | M | non |

## Plus tard (3+ mois) — « L'assistant »

| # | Quoi | Ce que vous voyez | Taille | Build ? |
|---|---|---|---|---|
| 11 | **Ask Mesa, plus loin** | Lui parler (micro avec texte en direct, réponses lues à voix haute, mode mains libres en cuisinant ; voix d'iOS d'abord, Gemini Live ensuite si besoin), mémoire au-delà d'une conversation, actions plus riches (déplacer un dîner, marquer « fini »). | M | oui (voix) |
| 12 | **Goût de chacun** | Mesa apprend ce que chacun aime (cuisiné, refait, écarté) et propose ce qui plaît aux deux. | M | non |
| 13 | **Prix et budget** | Les tickets donnent l'évolution des prix et une estimation de la liste avant d'y aller. | M | non |
| 14 | **International** | App dans la langue du téléphone, noms de produits traduits, monnaie du foyer, unités locales. Prérequis pour d'autres foyers. | L | oui |
| 15 | **Le dimanche** | Une seule notification : « 4 dîners maison cette semaine · on planifie la suivante ? » | S | non |
| 16 | **Raccourcis iPhone** | Widget « Tonight », « Ajoute du lait » via Siri, partage depuis la galerie. | M | oui |

## Socle (en continu)

- **Qualité de l'IA** : un jeu de 30 imports réels (vidéos, sites, captures) rejoué à chaque changement de
  prompt ou de modèle, avec un score. Sans ça, on ne sait pas si on améliore ou si on casse.
- **Coûts** : plafond quotidien d'IA côté worker (fait : appels et tokens par jour, `AI_DAILY_*`), quota de 60
  tâches par foyer qui ne redescend jamais (fait), rangement par lots (fait). Reste : alerte de budget côté
  Google (console Google Cloud / AI Studio).
- **Sécurité** (fait, migrations 27–28) : l'app n'écrit que l'entrée d'une tâche ; codes d'invitation de 10
  caractères avec limite d'essais ; photos et tickets dans un espace privé, effacés après usage ; le worker ne
  peut plus être envoyé vers le réseau interne (SSRF). Reste : pare-feu sortant sur le VPS pour yt-dlp.
- **Fiabilité** : healthchecks.io branché, restauration de sauvegarde testée une fois.
- **Avant d'ouvrir à d'autres foyers** : suppression de compte, déclaration de confidentialité
  (Gemini comme sous-traitant).

Règle : une seule façon de faire chaque chose. Avant d'ajouter une fonction, vérifier qu'elle ne double pas
Ask Mesa ou une autre ; sinon, la faire passer par Ask Mesa.

## Comment on avance

- Un lot à la fois, choisi ensemble ; chaque lot : panel si besoin → contrat (migration + types) →
  worker et app en parallèle → tests → mise en ligne serveur → mise à jour à distance de l'app.
- Les fonctions qui demandent un build natif (8, 14, 16) sont regroupées dans un même build.
