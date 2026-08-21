# Secrets setup (generic)

This repository contains **no secrets** and must never contain any.

## Rules

1. Never commit a secret — API key, token, signing secret, password, private
   key, connection string, or customer PII — to this repository.
2. Client-side (`VITE_*`) variables are compiled into the browser bundle.
   Only put public values there (project URL, publishable/anon key).
   Copy `.env.example` to `.env` locally; `.env` is git-ignored.
3. Server-side secrets are supplied at runtime by your own backend/edge
   function secret store. They are never read from a committed file.
4. Each deployment (local, staging, production) owns its own credentials.
   Do not share one set of credentials across environments.

## Adding a secret

- Create the credential in the third-party provider's own dashboard, under an
  account you control.
- Store it in your backend's secret store under a name of your choosing, then
  read it from server code via the runtime environment.
- Rotate immediately if a value is ever pasted into source, chat, a ticket, or
  a log.

## What this repo intentionally does not include

There is no list of production secret names or values, and no onboarding
script that prompts for them. Any integration you want to enable, you wire up
yourself with your own credentials.
