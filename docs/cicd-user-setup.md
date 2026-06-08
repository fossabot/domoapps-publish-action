# CICD Service Account Setup

This document covers creating a dedicated Domo service account for CI/CD and configuring GitHub to use it with the publish action.

---

## Why a dedicated service account?

Using a personal account token ties CI/CD to a specific person — if they leave, all pipelines break. A service account gives you:

- A stable, shared identity for all automated deployments
- Auditable publish history (all deploys show as the CICD user)
- The ability to revoke or rotate the token without disrupting anyone's personal access

---

## Step 1 — Create the service account in Domo

1. In your Domo instance, go to **Admin → Governance → People**
2. Click **Invite People**
3. Use an email address you control (e.g. `cicd@yourcompany.com` or a shared inbox)
4. Set the display name to something obvious: `CI/CD Deploy Bot` or `GitHub Actions`
5. Assign the **Participant** role at minimum (see required permissions below)
6. Complete the email invitation and sign in once to activate the account

> If your organization uses SSO, you may need to create the service account through your identity provider and provision it into Domo. Contact your Domo admin.

---

## Step 2 — Required permissions

Create a Domo Role with the minimum required authorities. The service account needs the following Domo permissions to operate:

![Role Example](../images/deployment-role.png)

| Permission          | Why it's needed                       |
| ------------------- | ------------------------------------- |
| **View DomoApps**   | List and View existing DomoApps       |
| **Create DomoApps** | Create new DomoApps on initial upload |
| **Manage DomoApps** | View and manage all custom apps       |
| **Create DDX Apps** | Create and edit DDX apps              |

---

## Step 3 — Generate a developer token

The action authenticates using a Domo developer token (`X-Domo-Developer-Token`), not OAuth.

1. Go to **Admin → Security → Access Tokens**  
   _(or navigate directly to `https://your-instance.domo.com/admin/security/access-tokens`)_
1. Click **Generate Access Token**
   - Assign the CICD we created in the previous steps
   - Give it a descriptive name: `github-actions-publish`
   - Choose expiration TTL that complies with your rotation schedule
1. Copy the token immediately — it is only shown once

![example image](../images/access-token.png)

> Tokens do not have configurable scopes in Domo's developer token model. The token inherits the permissions of the account it belongs to.

---

## Step 4 — Add secrets to GitHub

In your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Add the following in repository secrets:

| Name            | Value                                                        | Type     |
| --------------- | ------------------------------------------------------------ | -------- |
| `DOMO_TOKEN`    | The developer token from Step 3                              | Secret   |
| `DOMO_INSTANCE` | Your Domo instance URL, e.g. `https://your-company.domo.com` | Variable |

---

## Step 5 — Reference them in your workflow

```yaml
permissions:
  contents: write # required for auto-committing the design id

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Domo
        uses: domoinc/domoapps-publish-action@v3
        with:
          domo-token: ${{ secrets.DOMO_TOKEN }}
          domo-instance: ${{ vars.DOMO_INSTANCE }}
          github-token: ${{ secrets.GITHUB_TOKEN }} # enables auto-commit on first deploy
          build-command: npm run build # optional
          working-directory: . # optional
          publish-dir: dist # optional
```

> `github-token` is optional. Without it, the action still publishes successfully and surfaces the design id in the Job Summary — you'll just need to add it to `manifest.json` manually.

---

## First deploy — what happens automatically

On the first push, `manifest.json` has no `id`. The action will:

1. Publish the app — Domo creates a new design and returns its id
2. Write the `id` into your source `manifest.json`
3. Commit and push that change back to your branch as `github-actions[bot]`
4. Set a `design-id` action output for any downstream steps

All future deployments update the same design. No manual step required.
