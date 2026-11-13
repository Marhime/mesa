# Mettre Mesa en ligne

La procédure au quotidien : base, worker, app. L'installation de départ (TestFlight, testeurs) est dans
`docs/RELEASE.md`, et le serveur dans `infra/vps/README.md`.

> **Ne lance pas `pnpm worker` avec `apps/worker/.env`** : ce fichier contient les clés de production. Un
> worker local prendrait les vrais imports à la place du VPS.

Pour un lot, l'ordre est : base → worker → app. Pour une migration, on élargit, puis on publie l'app, et
seulement ensuite on resserre : l'app installée doit continuer de marcher entre les deux.

## 1. La base (Supabase)

Il n'y a pas de CLI `supabase` installée : on passe par `npx`, avec la version épinglée.

```bash
npx -y supabase@3.0.0 migration list --linked   # ce qui manque en production
npx -y supabase@3.0.0 db push --remote          # l'applique (pas besoin du mot de passe de la base)
```

Les tests SQL ne passent pas par l'API. Après une migration qui touche des clés étrangères, vérifie donc
l'API elle-même (aucune donnée lue, `[]` attendu) :

```bash
set -a; source apps/mobile/.env; set +a
curl "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/import_jobs?select=id,recipe:recipes(title)&limit=0" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

`PGRST201` veut dire que deux clés étrangères relient deux tables que l'app joint. L'API refuse alors toute
la requête : c'est ce qui a cassé les imports du 7 au 9 novembre 2026, et la migration 30 l'a corrigé.
`db-tests/test_api_links.sql` le vérifie maintenant pour chaque jointure de l'app.

## 2. Le worker (VPS)

```bash
MESA_VPS=root@<ip du VPS> infra/vps/deploy.sh   # rsync + rebuild ; le .env du serveur est gardé
ssh root@<ip du VPS> 'cd /opt/mesa/infra/vps && docker compose logs --tail 50 worker'
```

Logs, yt-dlp, sauvegardes et restauration : `infra/vps/README.md`.

## 3. L'app sans build (mise à jour à distance)

Avec `eas` installé globalement (`npm i -g eas-cli`) :

```bash
cd apps/mobile
eas fingerprint:generate --platform ios --non-interactive --json   # même empreinte que le build installé ?
eas update --channel production --environment production --message "ce qui change"
```

- La mise à jour ne vaut que pour les builds de **même empreinte native**. Pour le build 4, c'est
  `58738a6447f8…` ; `eas fingerprint:compare <empreinte>` détaille les différences.
- Ne te fie pas à `npx expo-updates fingerprint:generate` : depuis novembre 2026, il donne une autre valeur
  sur un projet inchangé.
- Sur les téléphones, il faut fermer puis rouvrir Mesa **deux fois** : la mise à jour est téléchargée au
  premier lancement et appliquée au suivant.

## 4. Un nouveau build

Un nouveau module natif, une permission, la share extension ou `app.config.ts` changent l'empreinte : il
faut alors un build.

```bash
eas build --profile production --platform ios
eas submit --platform ios --latest
```

Le plan Expo est gratuit : regroupe les changements natifs pour faire un seul build.

## À surveiller

- **Gemini en offre gratuite** : 5 requêtes par minute et par modèle, et des 503 fréquents sur
  `gemini-3.8-flash`. Le worker étale ses appels et passe aux modèles suivants. Avant d'ouvrir à d'autres
  foyers, il faut passer en facturation, avec une alerte de budget.
- **Instagram et TikTok** bloquent souvent les IP de serveurs. Un fichier de cookies aide
  (`infra/vps/README.md`), et la capture d'écran reste le plan B.
- **Avant d'autres foyers** :
  - suppression de compte ;
  - politique de confidentialité, avec Gemini comme sous-traitant ;
  - pare-feu sortant du VPS pour yt-dlp.

  Le détail est dans la section « Socle » de `docs/ROADMAP.md`.
