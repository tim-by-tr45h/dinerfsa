# Dîners : réservation et pointage

Site statique (aucune compilation) + Supabase. Le design est isolé dans `css/theme.css`, le logo se dépose dans `assets/logo.png`.

## Mise en route
1. **Supabase** : créez un projet, collez `supabase/schema.sql` dans SQL Editor et exécutez.
2. **Auth > Sign In / Providers > Email** : désactivez **« Allow new users to sign up »** (invitation uniquement).
3. **Auth > URL Configuration** : mettez l'adresse de votre site (ex. `https://pseudo.github.io/diners/`) dans *Site URL*.
4. **Premier compte** : Authentication > Users > *Invite user*, acceptez le mail, puis exécutez la dernière ligne (commentée) de `schema.sql` pour devenir créateur.
5. **Fonction d'invitation** : `npm i -g supabase`, puis `supabase functions deploy invite-user --project-ref VOTRE_REF`.
6. **Config** : renseignez l'URL et la clé *anon* dans `js/config.js`.
7. **GitHub** : poussez le dossier, puis Settings > Pages > déployer depuis la branche `main`.

## Confidentialité
- La clé *anon* est publique par conception : les données sont protégées par les règles RLS et la connexion obligatoire.
- La clé **service_role** ne va jamais dans le dépôt (elle vit dans Supabase, côté fonction).
- GitHub Pages gratuit exige un dépôt public. Pour un code privé : dépôt privé relié à **Cloudflare Pages**, **Netlify** ou **Vercel** (gratuits).
- Pour des photos : mettez-les dans `assets/` (publiques) ou dans un bucket privé Supabase Storage.
