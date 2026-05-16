#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bumpType = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: bump-version.js [patch|minor|major]');
  process.exit(1);
}

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const pkgPath = path.join(root, 'package.json');
const appJsonPath = path.join(root, 'app.json');

if (!fs.existsSync(pkgPath) || !fs.existsSync(appJsonPath)) {
  console.error(`Missing package.json or app.json in ${root}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const pkgVersion = pkg.version;
const expoVersion = appJson && appJson.expo && appJson.expo.version;

if (pkgVersion !== expoVersion) {
  console.error(`Version mismatch — package.json=${pkgVersion}, app.json=${expoVersion}. Fix manually before bumping.`);
  process.exit(1);
}

const parts = pkgVersion.split('.').map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error(`Invalid semver: ${pkgVersion}`);
  process.exit(1);
}

let [major, minor, patch] = parts;
if (bumpType === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bumpType === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const newVersion = `${major}.${minor}.${patch}`;
pkg.version = newVersion;
appJson.expo.version = newVersion;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

process.stdout.write(newVersion);
