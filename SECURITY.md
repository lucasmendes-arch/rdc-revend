# Security & Secrets Management 🔐

## Critical Rules

**NEVER** do these things:

1. ❌ **NEVER commit `.env.local`** — It's in `.gitignore` for a reason
2. ❌ **NEVER hardcode API keys** in source files (JavaScript, TypeScript, SQL, etc.)
3. ❌ **NEVER share credentials** in Slack, GitHub issues, emails, or comments
4. ❌ **NEVER put backend tokens in frontend code** (they'll be exposed to users)
5. ❌ **NEVER use the same key** across environments (dev, staging, prod)

**DO** these things:

1. ✅ **Use `.env.local.example`** as template, copy to `.env.local`, then add real credentials
2. ✅ **Use Supabase Dashboard Secrets** for backend tokens (Edge Functions can access them)
3. ✅ **Rotate credentials** immediately if they're exposed
4. ✅ **Use pre-commit hooks** to prevent accidental commits
5. ✅ **Review .env files** before pushing to avoid exposure

---

## Environment Variables

### Frontend (.env.local) — PUBLIC DATA ONLY
These variables are visible in the browser and frontend source code. Only use non-sensitive data:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co         # PUBLIC: Project URL
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...            # PUBLIC: Anon key (RLS enforces permissions)
VITE_NUVEMSHOP_STORE_ID=1880595765                          # PUBLIC: Store ID
VITE_NUVEMSHOP_USER_AGENT=rdc_fiqon (your-email@...)        # PUBLIC: User agent string
```

**Why it's safe:** Row-level security (RLS) on Supabase restricts what users can access, even with the anon key.

### Backend (Supabase Edge Functions Secrets) — PRIVATE DATA
These are server-side secrets that users cannot access. Set them in Supabase Dashboard:

```
SUPABASE_SERVICE_ROLE_KEY        → Full database access (PRIVATE)
NUVEMSHOP_ACCESS_TOKEN            → Nuvemshop API auth (PRIVATE)
UAZAPI_URL                         → WhatsApp API endpoint (PRIVATE)
UAZAPI_TOKEN                       → WhatsApp API key (PRIVATE)
WHATSAPP_DEST_NUMBER              → WhatsApp destination (can be semi-public)
```

**How to set them:**
1. Go to Supabase Dashboard → Settings → Edge Functions → Manage Secrets
2. Add each secret key and value
3. Edge functions can access via `Deno.env.get('SECRET_NAME')`
4. These are never exposed to the browser

---

## Setup Instructions

### First Time Setup (After Cloning)

```bash
# 1. Copy example to .env.local (git-ignored)
cp .env.local.example .env.local

# 2. Get your Supabase credentials:
#    - Go to: https://app.supabase.com/project/[project-id]/settings/api
#    - Copy "Project URL" → VITE_SUPABASE_URL
#    - Copy "Anon public key" → VITE_SUPABASE_ANON_KEY

# 3. Edit .env.local with your credentials
nano .env.local

# 4. Verify .env.local is ignored by git
git status  # Should NOT show .env.local

# 5. Start development server
npm run dev
```

### Setting Backend Secrets (Supabase Edge Functions)

```bash
# 1. Install Supabase CLI (if not already)
npm install -g supabase

# 2. Login to Supabase
supabase login

# 3. Link to your project (in project root)
supabase link --project-ref kjfsmwtwbreapipifjtu

# 4. Set secrets
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-key"
supabase secrets set NUVEMSHOP_ACCESS_TOKEN="your-token"
supabase secrets set UAZAPI_TOKEN="your-token"

# 5. Verify they're set
supabase secrets list

# 6. Push to remote
supabase push
```

### Deploy to Vercel/Netlify

**Vercel:**
1. Go to: Project Settings → Environment Variables
2. Add:
   ```
   VITE_SUPABASE_URL = https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJ...
   ```

**Netlify:**
1. Go to: Site Settings → Build & Deploy → Environment
2. Add same variables

**GitHub Actions (if used):**
1. Go to: Repo Settings → Secrets and Variables → Actions
2. Add:
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```

---

## Incident Response (If Credentials Are Exposed)

### If You Accidentally Commit `.env.local`:

**Option 1: Before Pushing**
```bash
# Undo the commit (keep changes in working directory)
git reset HEAD~1

# Remove .env.local from git staging
git rm --cached .env.local

# Commit the fix
git commit -m "Remove accidental .env.local exposure"

# No need to revoke keys (they weren't pushed to remote)
```

**Option 2: Already Pushed to Remote**
```bash
# This is more serious - credentials are now in remote history

# 1. Immediately revoke in Supabase Dashboard
#    Settings → API → Revoke exposed key

# 2. Generate new credentials in Supabase

# 3. Clean git history (see CLEANUP section below)

# 4. Notify your team

# 5. Update all environments with new credentials
```

### If Someone Found Your Credentials

1. **IMMEDIATELY go to Supabase Dashboard**
   - Settings → API
   - Find the exposed key
   - Click "Revoke"

2. **Generate new key**
   - Click "Generate new key"
   - Copy the new key

3. **Update everywhere**
   - `.env.local`
   - `.env.local.example` (only the placeholder, mask it)
   - GitHub Secrets
   - Vercel/Netlify environment variables
   - Any other deployments

4. **Clean git history** (see section below)

5. **Notify your team** about the security incident

---

## Cleanup: Remove Secrets from Git History

If secrets were committed to git history, use `git-filter-repo` to remove them completely:

```bash
# 1. Install git-filter-repo (Python tool)
pip install git-filter-repo

# 2. Create list of files to remove
cat > /tmp/remove-files.txt << 'EOF'
.env.local
debug-out.js
create/test/user.js
EOF

# 3. Remove from all history (rewrites git history)
git filter-repo --invert-paths --paths-from-file /tmp/remove-files.txt

# 4. Force push to remote (affects all collaborators)
git push origin --force-with-lease --all
git push origin --force-with-lease --tags

# 5. All team members must re-clone
#    They cannot just "pull" - they must delete local repo and re-clone
```

⚠️ **WARNING:** This rewrites git history and forces all collaborators to re-clone. Only do this if credentials are actually exposed.

---

## Credentials Rotation Schedule

| Event | Action | Frequency |
|---|---|---|
| **Regular rotation** | Revoke old keys, generate new ones | Quarterly (every 3 months) |
| **Accidentally exposed** | Immediately revoke + regenerate | As soon as discovered |
| **Team member departs** | Revoke their access/tokens | Upon departure |
| **Security audit** | Review all stored credentials | Annually |

---

## Secrets Detection Tools

We use pre-commit hooks to prevent accidental secret commits:

```bash
# Install pre-commit framework
pip install pre-commit

# Install hooks in this project
pre-commit install

# Run checks on all files
pre-commit run --all-files
```

The `.pre-commit-config.yaml` file defines these checks:
- ✅ Detect private keys (RSA, DSA, EC, etc.)
- ✅ Detect AWS/API keys patterns
- ✅ Detect common secret patterns (token=, api_key=, etc.)

---

## Common Mistakes & How to Avoid Them

| ❌ Mistake | ✅ Correct Way |
|---|---|
| `VITE_SUPABASE_ANON_KEY=eyJ...` in `.env` file committed | Use `.env.local` (in `.gitignore`) |
| Hardcoded `const key = "eyJ..."` in `functions/index.ts` | Use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` |
| Sharing `.env.local` in Slack | NEVER - use Supabase Dashboard to share credentials (safe sharing via project access) |
| Using same key for dev/staging/prod | Generate unique key for each environment |
| Forgetting to update `.env.local.example` after changing schema | Always update example when adding new variables |

---

## Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/security)
- [OWASP Secrets Management](https://owasp.org/www-community/Sensitive_Data_Exposure)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [git-filter-repo Documentation](https://htmlpreview.github.io/?https://github.com/newren/git-filter-repo/blob/docs/html/git-filter-repo.html)
- [GitGuardian Detection Rules](https://docs.gitguardian.com/)

---

## Questions?

If you're unsure whether something should be a secret:
- **Public data?** (visible in browser, frontend code) → Use `.env.local` VITE_* variable
- **Private data?** (backend API tokens, keys) → Use Supabase Edge Functions Secrets
- **Not sure?** → Treat it as secret (safer to be over-cautious)

---

**Last updated:** 2026-02-22
**Maintained by:** Security team
**Status:** ✅ All preventive measures in place
