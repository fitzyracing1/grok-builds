#!/usr/bin/env node
// Refresh data/snapshot.json (fallback when the live API is rate-limited or offline).
// usage: node scripts/snapshot.mjs [user]   (GITHUB_TOKEN optional, raises the rate limit)
import { writeFileSync } from 'node:fs';
import { fetchAllRepos } from '../src/garage-core.js';
const user = process.argv[2] || 'fitzyracing1';
const repos = await fetchAllRepos(user, fetch, { token: process.env.GITHUB_TOKEN });
writeFileSync(new URL('../data/snapshot.json', import.meta.url), JSON.stringify({ user, taken_at: new Date().toISOString(), repos }, null, 1));
console.log(`snapshot: ${repos.length} public repos of ${user}`);
