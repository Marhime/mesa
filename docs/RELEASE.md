# Mettre Mesa sur TestFlight (v0, pour deux)

Checklist pour installer Mesa sur ton iPhone et celui de Karla, et vous en servir au quotidien.
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

## 4. Build et TestFlight

```bash
cd apps/mobile
npx eas-cli@latest build --profile production --platform ios   # EAS crée certificats, App Group du partage, push
npx eas-cli@latest submit --platform ios --latest                # envoie le build à App Store Connect
```

Dans App Store Connect → Users and Access : ajoute l'Apple ID de Karla (rôle « Customer Support » suffit).
Puis TestFlight → Internal Testing → ajoute-la : pas de revue Apple, elle reçoit l'invitation tout de suite.

## 5. Première utilisation à deux

1. Toi : crée le foyer, Settings → Invite → envoie le code à 6 caractères.
2. Karla : crée son compte (e-mail + mot de passe), « Join with a code ».
3. Pantry → « + » : cochez ce que vous avez déjà (≈ 90 s), ou filmez le frigo.
4. Test du direct : ajoute « leche » sur ton téléphone → la ligne apparaît chez Karla en une seconde.

## Retours

TestFlight a un bouton de retour intégré : une capture d'écran + un commentaire, envoyés depuis l'app.
Les plantages remontent dans App Store Connect → TestFlight → Crashes.

## Pas bloquant pour la v0 (à faire avant l'App Store public)

- Sign in with Apple : configurer le provider Apple dans Supabase avec le bundle id (l'e-mail suffit d'ici là).
- Suppression de compte dans l'app (exigée par l'App Store public, pas par TestFlight interne).
- Politique de confidentialité en ligne (exigée pour les testeurs externes et l'App Store).
