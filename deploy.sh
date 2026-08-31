#!/usr/bin/env bash
# Build the static site from MongoDB and publish it to S3 + CloudFront.
#
# Run this after writing a post in the admin TUI, or after changing templates
# or CSS. The site is a static snapshot: nothing re-reads MongoDB until this
# runs, so a post is not live until you deploy.
set -euo pipefail

BUCKET=myblogs-static-975050135234
DISTRIBUTION=E1YG8LZ8DK4XYU
REGION=ap-south-1
SITE_URL=https://srinathshrestha.xyz

cd "$(dirname "$0")"

# SITE_URL is exported here rather than read from .env on purpose. .env holds
# the dev value (localhost:3000) so `npm run dev` links to the local server,
# and dotenv does not override a variable already set in the environment. Left
# to .env, every canonical link and every RSS entry on the live site points at
# localhost — which is exactly what happened before this line existed.
echo "==> building dist/ from MongoDB (site url: $SITE_URL)"
SITE_URL="$SITE_URL" npm run build

echo "==> syncing to s3://$BUCKET"
# Filenames are not content-hashed, so a long max-age would pin stale assets.
# Keep the browser TTL short and let the invalidation below do the real work.
#
# Retried because one dropped connection used to abort the whole deploy
# mid-sync, skipping the invalidation below and leaving CloudFront serving the
# old version with nothing to indicate it had failed. sync is idempotent, so a
# retry re-sends only what is still missing or changed.
attempt=1
until aws s3 sync dist/ "s3://$BUCKET/" --delete --region "$REGION" \
        --cache-control "public, max-age=300" --only-show-errors; do
  if [ "$attempt" -ge 5 ]; then
    echo "    sync failed 5 times — refusing to invalidate a partial deploy" >&2
    exit 1
  fi
  echo "    sync attempt $attempt failed; retrying in $((attempt * 5))s"
  sleep $((attempt * 5))
  attempt=$((attempt + 1))
done

echo "==> invalidating CloudFront"
# A successful sync with no invalidation is the worst outcome: the new site is
# in S3 but nobody sees it, and the deploy looks like it worked.
attempt=1
until ID=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" \
             --paths '/*' --query 'Invalidation.Id' --output text); do
  if [ "$attempt" -ge 5 ]; then
    echo "    could not create invalidation; S3 is updated but CloudFront still serves the old copy" >&2
    exit 1
  fi
  echo "    invalidation attempt $attempt failed; retrying in $((attempt * 5))s"
  sleep $((attempt * 5))
  attempt=$((attempt + 1))
done
echo "    $ID — waiting"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$ID"

echo "==> live at https://srinathshrestha.xyz/"
