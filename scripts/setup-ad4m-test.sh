#!/usr/bin/env bash
# scripts/setup-ad4m-test.sh
#
# Build @coasys/ad4m-test from source (coasys/ad4m repo) and link it
# into this project's node_modules.
#
# This replaces the broken npm package (@coasys/ad4m-test@0.11.1) with
# a working build from the fix branch. The bootstrap seed is included,
# which contains the language-language bundle (ESM) and hashes for
# system languages fetched at runtime from the bootstrap store.
#
# When a fixed version is published to npm, replace this script with
# a normal dependency in package.json.
#
# Usage: bash scripts/setup-ad4m-test.sh

set -euo pipefail

AD4M_BRANCH="${AD4M_BRANCH:-fix/ad4m-test-use-bootstrap-seed}"
AD4M_REPO="https://github.com/coasys/ad4m.git"
CLONE_DIR="/tmp/ad4m-source"
TEST_RUNNER_DIR="$CLONE_DIR/test-runner"

echo "=== Building @coasys/ad4m-test from source ==="
echo "Branch: $AD4M_BRANCH"
echo ""

# Step 1: Sparse clone
echo "Step 1: Clone ad4m repo (sparse)..."
rm -rf "$CLONE_DIR"
git clone --depth 1 --branch "$AD4M_BRANCH" \
  --filter=blob:none --sparse \
  "$AD4M_REPO" "$CLONE_DIR"
cd "$CLONE_DIR"
git sparse-checkout set test-runner tests/js

# Step 2: Install test-runner dependencies
echo ""
echo "Step 2: Install test-runner dependencies..."
cd "$TEST_RUNNER_DIR"

# Replace workspace wildcard with the published version
sed -i 's/"@coasys\/ad4m": "\*"/"@coasys\/ad4m": "^0.11.1"/' package.json

# Remove any pnpm/npm files at the repo root that interfere with npm install
# (npm walks up the directory tree and finds the monorepo root package.json)
rm -f "$CLONE_DIR/pnpm-workspace.yaml" "$CLONE_DIR/pnpm-lock.yaml" \
      "$CLONE_DIR/.npmrc" "$CLONE_DIR/package.json"

# Use npm (not pnpm) to avoid workspace resolution issues
npm install --ignore-scripts 2>&1 | tail -5

# Install missing deps not listed in package.json (hoisted from monorepo root)
npm install get-port --ignore-scripts 2>&1 | tail -3

# Step 3: Build
echo ""
echo "Step 3: Build TypeScript..."
npx tsc --noImplicitAny false

# Step 4: Copy bootstrap seed with storage paths
echo ""
echo "Step 4: Setup bootstrap seed..."
SEED_SRC="$CLONE_DIR/tests/js/bootstrapSeed.json"
SEED_DST="$TEST_RUNNER_DIR/bootstrapSeed.json"
PUBLISHED_LANGS="$TEST_RUNNER_DIR/build/publishedLanguages"
PUBLISHED_NEIGHBOURHOODS="$TEST_RUNNER_DIR/build/publishedNeighbourhood"

mkdir -p "$PUBLISHED_LANGS" "$PUBLISHED_NEIGHBOURHOODS"
cp "$SEED_SRC" "$SEED_DST"

# Inject storage paths into the seed
node -e "
const fs = require('fs');
const seed = JSON.parse(fs.readFileSync('$SEED_DST', 'utf-8'));
seed.languageLanguageSettings = { storagePath: '$PUBLISHED_LANGS' };
seed.neighbourhoodLanguageSettings = { storagePath: '$PUBLISHED_NEIGHBOURHOODS' };
fs.writeFileSync('$SEED_DST', JSON.stringify(seed));
"

echo "Bootstrap seed ready at $SEED_DST"

# Step 5: Link into consumer project
echo ""
echo "Step 5: Symlink into node_modules..."
cd "$OLDPWD"

# Find the ad4m-test location(s) in node_modules
LINKED=0
for dir in \
  "node_modules/@coasys/ad4m-test" \
  node_modules/.pnpm/@coasys+ad4m-test*/node_modules/@coasys/ad4m-test; do
  if [ -d "$dir" ] || [ -L "$dir" ]; then
    rm -rf "$dir"
    ln -s "$TEST_RUNNER_DIR" "$dir"
    echo "  Linked: $dir -> $TEST_RUNNER_DIR"
    LINKED=$((LINKED + 1))
  fi
done

# If no existing install found, create the symlink directly
if [ "$LINKED" -eq 0 ]; then
  mkdir -p node_modules/@coasys
  ln -s "$TEST_RUNNER_DIR" node_modules/@coasys/ad4m-test
  echo "  Created: node_modules/@coasys/ad4m-test -> $TEST_RUNNER_DIR"
fi

echo ""
echo "=== Done! @coasys/ad4m-test built from source and linked ==="
