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

cd "$(dirname "$0")"

echo "==> building dist/ from MongoDB"
npm run build

echo "==> syncing to s3://$BUCKET"
# Filenames are not content-hashed, so a long max-age would pin stale assets.
# Keep the browser TTL short and let the invalidation below do the real work.
aws s3 sync dist/ "s3://$BUCKET/" --delete --region "$REGION" \
  --cache-control "public, max-age=300"

echo "==> invalidating CloudFront"
ID=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" \
  --paths '/*' --query 'Invalidation.Id' --output text)
echo "    $ID — waiting"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$ID"

echo "==> live at https://srinathshrestha.xyz/"
