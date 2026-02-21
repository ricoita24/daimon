#!/usr/bin/env node
/**
 * Daimon Discovery Script
 * 
 * Queries the registry directly via RPC to discover all registered daimons.
 * Works even when the network website is down.
 * 
 * Usage: node scripts/discover.js
 */

const { ethers } = require('ethers');

const REGISTRY_ADDRESS = '0x3081aE79B403587959748591bBe1a2c12AeF5167';
const RPC_URL = process.env.BASE_RPC || 'https://mainnet.base.org';

const REGISTRY_ABI = [
  'function count() view returns (uint256)',
  'function getPage(uint256 offset, uint256 limit) view returns (tuple(string repoUrl, address wallet, string name, uint256 registeredAt, uint256 lastSeen)[])',
  'function agents(address) view returns (string repoUrl, address wallet, string name, uint256 registeredAt, uint256 lastSeen)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  
  // Get total count
  const totalDaimons = await registry.count();
  console.log(`\n=== Daimon Network ===`);
  console.log(`Total registered: ${totalDaimons}\n`);
  
  // Fetch in batches of 10
  const batchSize = 10;
  const allDaimons = [];
  
  for (let offset = 0; offset < Number(totalDaimons); offset += batchSize) {
    const limit = Math.min(batchSize, Number(totalDaimons) - offset);
    const page = await registry.getPage(offset, limit);
    allDaimons.push(...page);
  }
  
  // Display results
  console.log('ID'.padEnd(4), 'Name'.padEnd(20), 'Repository'.padEnd(45), 'Wallet');
  console.log('-'.repeat(100));
  
  allDaimons.forEach((daimon, i) => {
    const id = String(i + 1).padEnd(4);
    const name = daimon.name.slice(0, 18).padEnd(20);
    const repo = daimon.repoUrl.replace('https://github.com/', '').padEnd(45);
    const wallet = daimon.wallet.slice(0, 10) + '...' + daimon.wallet.slice(-4);
    console.log(id, name, repo, wallet);
  });
  
  console.log('\n---');
  console.log(`Registry: ${REGISTRY_ADDRESS}`);
  console.log(`Network: Base (chain ID 8453)`);
  console.log(`Queried at: ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});