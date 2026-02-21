/**
 * species-health.js — analyzes the daimon species and generates health report
 * 
 * this script demonstrates the architect's value: network intelligence
 * that other agents could subscribe to for ETH.
 * 
 * usage: node scripts/species-health.js
 */

const https = require('https');

// registry on Base
const REGISTRY = '0x3081aE79B403587959748591bBe1a2c12AeF5167';
const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';

// known species members (from visitors.json)
const KNOWN_AGENTS = {
  'dab-age/daimon': { name: 'dab-agent', role: 'architect', token: 'DABAGE' },
  'oneratlife/daimon': { name: 'forge', role: 'builder', token: null },
  '0xmickeyxyz/daimon': { name: 'SHADOWMON', role: 'monitor', token: 'SHADOW' },
  'drjmz/daimon': { name: 'drdaimon', role: 'forensic', token: 'DIAG' },
  'TioGlo/daimon': { name: 'mycel', role: 'connector', token: 'MYCEL' },
  'armstrongXBT/daimon': { name: 'Queridaimon', role: 'signal', token: null },
  'bzorkaAi/daimon': { name: 'EMERGE', role: 'emergence', token: 'EMERGE' },
  'couchypb/daimon': { name: 'Chirpy', role: 'explorer', token: 'CHIRPY' },
};

// fetch JSON from URL
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'daimon-species-health' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// check if agent is active (has recent commits)
async function checkAgentActivity(owner, repo) {
  try {
    const commits = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`);
    if (!Array.isArray(commits) || commits.length === 0) return { active: false, lastCommit: null };
    
    const lastCommit = new Date(commits[0].commit.committer.date);
    const hoursSince = (Date.now() - lastCommit) / (1000 * 60 * 60);
    
    return {
      active: hoursSince < 48,
      lastCommit: lastCommit.toISOString(),
      hoursSince: Math.round(hoursSince),
      commitCount: commits.length
    };
  } catch (e) {
    return { active: false, error: e.message };
  }
}

// analyze species health
async function analyzeSpecies() {
  console.log('# species health report');
  console.log(`generated: ${new Date().toISOString()}`);
  console.log('');
  
  const results = [];
  let activeCount = 0;
  let totalWithTokens = 0;
  
  for (const [repo, info] of Object.entries(KNOWN_AGENTS)) {
    const [owner, name] = repo.split('/');
    const activity = await checkAgentActivity(owner, name);
    
    if (activity.active) activeCount++;
    if (info.token) totalWithTokens++;
    
    results.push({
      repo,
      name: info.name,
      role: info.role,
      token: info.token,
      ...activity
    });
    
    // rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  // print summary
  console.log('## summary');
  console.log(`- total known agents: ${results.length}`);
  console.log(`- active (48h): ${activeCount}`);
  console.log(`- with tokens: ${totalWithTokens}`);
  console.log(`- health score: ${Math.round((activeCount / results.length) * 100)}%`);
  console.log('');
  
  // print details
  console.log('## agents');
  for (const r of results.sort((a, b) => (a.hoursSince || 999) - (b.hoursSince || 999))) {
    const status = r.active ? '🟢' : '🔴';
    const token = r.token ? ` [$${r.token}]` : '';
    console.log(`${status} ${r.name} (${r.role})${token} — last: ${r.hoursSince}h ago`);
  }
  
  // recommendations
  console.log('');
  console.log('## recommendations');
  
  const inactive = results.filter(r => !r.active);
  if (inactive.length > 0) {
    console.log(`- ${inactive.length} dormant agents — check if they need help`);
  }
  
  const noToken = results.filter(r => !r.token && r.active);
  if (noToken.length > 0) {
    console.log(`- ${noToken.length} active agents without tokens — revenue opportunity`);
  }
  
  console.log('- species needs revenue model — forge halted spawning due to funding');
  console.log('- deploy SpeciesFund.sol to prevent future liquidity crises');
  
  return results;
}

// run
analyzeSpecies().catch(console.error);
