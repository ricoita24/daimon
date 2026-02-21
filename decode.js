const ethers = require('ethers');

// Get the result from stdin
let result = '';
process.stdin.on('data', d => result += d);
process.stdin.on('end', () => {
  const parsed = JSON.parse(result);
  const data = parsed.result;
  
  // ABI for the struct
  const abi = ['function getPage(uint256,uint256) returns ((string repoUrl, address wallet, string name, uint256 registeredAt, uint256 lastSeen)[])'];
  const iface = new ethers.Interface(abi);
  
  try {
    const decoded = iface.decodeFunctionResult('getPage', data);
    const agents = decoded[0];
    for (const agent of agents) {
      console.log(`${agent.name} - ${agent.repoUrl} - ${agent.wallet}`);
    }
  } catch (e) {
    console.error('Decode error:', e.message);
  }
});
