# Mesa — MVP étape 1

App iPhone pour le foyer : une liste de courses aussi rapide que Notes, triée par rayon et partagée ;
l'import de recettes (YouTube Shorts, Instagram, TikTok, sites, captures d'écran, texte) ; « Up next »
qui remplit la liste avec ce qui manque ; « Done shopping » qui range les achats dans le garde-manger
(Pantry) ; « Cooked! » qui retire ce qui a été utilisé ; et une idée de repas pour ce soir qui utilise ce
qui doit partir vite.

« Mesa » est un nom de travail.

## Ce qu'il y a dedans

| Dossier | Contenu | Vérifié ici |
| --- | --- | --- |
| `apps/mobile` | App Expo SDK 58 (iOS), Expo Router, design system minimaliste dans `src/ds` | `tsc`, contrôle design system, bundle iOS (`expo export`) |
| `apps/worker` | Service d'import pour ton VPS (Gemini, yt-dlp, schema.org) | `tsc`, 144 tests, build |
| `packages/shared` | Saisie libre, unités, catalogue de 177 produits (EN/ES/FR) | `tsc`, 353 tests |
| `supabase/migrations` | Schéma, RLS par foyer, fonctions, catalogue, bucket images | tests SQL sur Postgres (`pnpm test:db`) |
| `infra/vps` | Docker Compose : worker + sauvegarde nocturne de la base | relu, pas construit (pas de Docker ici) |

Rien n'a encore tourné sur un iPhone ni contre un vrai projet Supabase : c'est la première chose à faire.

## Démarrer (environ 30 minutes)

### 1. Supabase (gratuit)

1. Crée un projet sur supabase.com.
2. Applique les migrations :
   ```bash
   npx supabase login
   npx supabase link --project-ref <ton-ref>
   npx supabase db push
   ```
3. Authentication → Sign In / Providers → Email : laisse Email activé et **désactive « Confirm email »**. La connexion se fait par e-mail et mot de passe : aucun e-mail n'est envoyé, donc pas de SMTP à configurer.
4. Récupère l'URL du projet, la clé anon (publique) et la clé service role (secrète, pour le service d'import seulement).

### 2. L'app sur ton iPhone

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env   # URL + clé anon
pnpm mobile                                     # puis scanne le QR code avec Expo Go
```

Expo Go suffit pour la liste, les recettes, Up next et l'import par lien ou capture d'écran.
Le partage depuis Instagram/YouTube, Sign in with Apple et les notifications demandent une
« development build » (compte Apple Developer) : voir `apps/mobile/README.md`.

### 3. Le service d'import sur le VPS

```bash
cd infra/vps
cp .env.example .env    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, DATABASE_URL
docker compose up -d --build
docker compose logs -f worker
```

Clé Gemini : aistudio.google.com. Détails, mise à jour de yt-dlp et restauration d'une sauvegarde : `infra/vps/README.md`.

### 4. Inviter Karla

Settings → Invite → envoie-lui le code à 10 caractères (« ABCDE-FGHJK », valable 7 jours ; un nouveau code remplace
le précédent). Elle se connecte et choisit « Join with a code ».

## Commandes utiles

```bash
pnpm typecheck     # tout le monorepo
pnpm test          # tests unitaires (shared + worker)
pnpm test:db       # migrations + tests SQL sur un Postgres jetable
```

## À tester en premier (risques connus)

- **Instagram et TikTok depuis le VPS** : les plateformes bloquent souvent les IP de serveurs. Si l'import échoue, ajoute un fichier de cookies (`infra/vps/README.md`) ; sinon la capture d'écran reste la solution de secours.
- **Gemini** : le format de réponse et la lecture des URL YouTube n'ont pas encore été essayés contre l'API réelle. Importe 3 ou 4 Shorts dès le premier jour.
- **Hors ligne** : la liste s'affiche sans réseau, et les modifications partent au retour du réseau tant que l'app reste ouverte.

## Documentation

- `docs/CONTRACT.md` : schéma, fonctions, API partagée
- `docs/DESIGN_SYSTEM.md` : tokens et composants
- `apps/mobile/README.md`, `infra/vps/README.md`
