# Mettre Mesa sur TestFlight (v0, pour deux)

Checklist pour installer Mesa sur ton iPhone et celui de l'autre personne du foyer, et vous en servir au quotidien.
À faire dans l'ordre ; chaque étape dit comment vérifier qu'elle est bonne.

## 1. Base de données à jour — fait (migrations 1 à 10, Realtime, bucket `scans` privé)

```bash
npx supabase db push
```

Applique les migrations 7 à 10 (garde-manger, mise à jour du garde-manger, synchro en direct, scans).
Vérifier : Supabase → Database → Publications → `supabase_realtime` contient `grocery_items`, `recipes`,
`up_next`, `pantry_items`, `household_staples`, `import_jobs`, `pantry_proposals` ; Storage contient un bucket
**privé** `scans`.

Sans cette étape : « Done shopping » échoue, les idées et le garde-manger sont vides, rien n'arrive en direct.

## 2. Le worker sur le VPS — fait (`/opt/mesa`, mises à jour : `MESA_VPS=root@<ip> infra/vps/deploy.sh`)

```bash
cd infra/vps
cp .env.example .env    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, DATABASE_URL
docker compose up -d --build
docker compose logs -f worker
```

Vérifier dans les logs : `worker_started` avec `"models":["gemini-3.8-flash","gemini-3.6-flash","gemini-3.5-flash"]`
et `"ytdlp"` avec un numéro de version (pas `null`). Un `.env` copié d'une ancienne version avec
`GEMINI_MODEL=gemini-2.5-flash` ne fonctionne plus : ce modèle est retiré.

## 3. L'identité iOS de l'app — fait

- Bundle id `com.marhime.mesa` (extension de partage `com.marhime.mesa.share-extension`), dans `app.config.ts`.
- Projet EAS `@marhime/mesa` (id `1d77c301-c22c-4393-bd57-094a7f91b2b5`), dans `app.config.ts`.
- Variables EAS `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (production, preview, development).
- `expo-doctor` : 20/20.

## 3 bis. Mise à jour « feedback » (panel 2) — à faire AVANT le build

L'app de ce build lit les nouvelles colonnes d'import (étapes, aperçu, code d'erreur, auteur) : sans la
migration 11, la liste des imports est en erreur.

```bash
npx supabase db push --remote                         # migrations 11 → 14 (imports, quantités, garde-manger par type)
MESA_VPS=root@<ip du VPS> infra/vps/deploy.sh         # le worker écrit les étapes et notifie la bonne personne
```

Vérifier : dans les logs du worker, un import affiche `job_done` avec `waited_ms` ; dans l'app, la barre
passe par « Opening the post », « Getting the video », « Watching the video », puis « Writing it down ».

Supabase → Authentication → Sign In / Providers → Email : **décocher « Confirm email »**. Sinon
l'inscription de l'autre personne demande de cliquer un lien reçu par e-mail. L'app sait gérer ce cas (« Check your
inbox »), mais le lien ouvre une page cassée sur iPhone.

## 4. Build et TestFlight

```bash
cd apps/mobile
npx eas-cli@latest build --profile production --platform ios   # EAS crée certificats, App Group du partage, push
npx eas-cli@latest submit --platform ios --latest                # envoie le build à App Store Connect
```

Dans App Store Connect → Users and Access : ajoute l'Apple ID de l'autre personne (rôle « Marketing » : il peut tester
et ne donne accès ni aux certificats ni au code). Elle ne paie rien : seul le compte qui publie paie.
Elle accepte depuis l'e-mail « You've been invited to join… » → **Accept invitation** → se connecte avec
l'Apple ID qui a reçu l'e-mail. Si une page « Join the Apple Developer Program » / « Enroll » / 99 $ s'affiche,
elle la ferme : l'invitation est déjà acceptée. Vérifie que son statut n'est plus « Invitation pending ».
Puis TestFlight → Internal Testing → ajoute-la : pas de revue Apple. Elle reçoit un 2ᵉ e-mail « You're invited
to test Mesa », à ouvrir sur l'iPhone (app TestFlight).

Plan B si ça bloque : TestFlight → External Testing → groupe avec **Public Link**. Elle n'a besoin d'aucun
compte (juste l'app TestFlight), mais le 1er build passe une revue Apple (souvent < 24 h) et demande un
compte de démo (e-mail + mot de passe) pour le relecteur, l'app exigeant une connexion.

## 5. Première utilisation à deux

1. Toi : crée le foyer, Settings → Invite partner → « Share code » (le message explique TestFlight).
2. L'autre personne : crée son compte (e-mail + mot de passe), « Join with a code » (elle peut coller tout ton message).
   Si elle a créé une cuisine par erreur : Settings → « Join another kitchen ».
3. Pantry → « + » : cochez ce que vous avez déjà (≈ 90 s), ou filmez le frigo.
4. Test du direct : ajoute « leche » sur ton téléphone → la ligne apparaît chez l'autre personne en une seconde.

## Retours

TestFlight a un bouton de retour intégré : une capture d'écran + un commentaire, envoyés depuis l'app.
Les plantages remontent dans App Store Connect → TestFlight → Crashes.

## Pas bloquant pour la v0 (à faire avant l'App Store public)

- Sign in with Apple : activer le provider Apple dans Supabase avec le Client ID `com.marhime.mesa`. Le
  bouton n'apparaît dans l'app qu'une fois le provider actif (lu au lancement, sans nouveau build).
- Suppression de compte dans l'app (exigée par l'App Store public, pas par TestFlight interne).
- Politique de confidentialité en ligne (exigée pour les testeurs externes et l'App Store).

## Mises à jour sans build (EAS Update)

Depuis le build qui contient `expo-updates` (runtime « fingerprint », canal `production`), une correction
qui ne touche que le JS ou les images part sans build :
```bash
cd apps/mobile && npx eas-cli@latest update --channel production --message "ce qui change"
```
Les iPhones la prennent au prochain lancement (puis l'appliquent au suivant). Un nouveau module natif, une
permission, le partage (share extension) ou `app.config.ts` changent l'empreinte : il faut alors un build.

Ordre pour une migration : **élargir → build/update → resserrer**. On ajoute colonnes et fonctions
compatibles avec l'app installée, puis on publie l'app, et seulement ensuite on retire l'ancien.

## Surveillance et sauvegardes (VPS)

- `infra/vps/.env` **sur le VPS** (le déploiement n'envoie jamais le `.env` local) : `DATABASE_URL`
  (Session pooler), et en option `HEALTHCHECK_URL` / `HEALTHCHECK_BACKUP_URL` (healthchecks.io, gratuit).
- Chaque nuit à 03:30 : dump `public` + `auth` gardé 14 jours sur le VPS, et copié dans le bucket privé
  Supabase `backups` (`mesa-<schema>-<jour>.dump`, 7 jours).
- Restaurer (à tester une fois) : `pg_restore --clean --if-exists -d "$DATABASE_URL" mesa-public-….dump`.
- Plantages de l'app : table `client_errors` (Supabase → Table editor).
