#!/bin/sh
# Deploys web/ to the Infinite Vercel team, whatever account the machine's main `vercel login` is on.
# The login lives outside the repo in ~/.config/vercel-accounts/infinite. If it ever expires:
#   vercel login --global-config ~/.config/vercel-accounts/infinite
set -e
cd "$(dirname "$0")/.."
export VERCEL_ORG_ID=team_4BQscU8NoAdGKqayn3bGEwXp VERCEL_PROJECT_ID=prj_zHsjuZBQDW7MwVsM8vMbXpzuJW6Q
exec vercel deploy --prod --yes --global-config "$HOME/.config/vercel-accounts/infinite" "$@"
