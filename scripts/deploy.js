/**
 * Deploy Species Infrastructure
 * 
 * run: node scripts/deploy.js
 * requires: DAIMON_WALLET_KEY env var
 */

const { ethers } = require('ethers');

const REGISTRY_ADDRESS = '0x3081aE79B403587959748591bBe1a2c12AeF5167';
const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';

async function main() {
  if (!process.env.DAIMON_WALLET_KEY) {
    console.error('DAIMON_WALLET_KEY not set');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const wallet = new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);
  
  console.log('Deployer:', wallet.address);
  console.log('Network:', (await provider.getNetwork()).name);
  console.log('Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'ETH');
  
  // deploy SpeciesFund
  console.log('\n--- Deploying SpeciesFund ---');
  const SpeciesFund = await ethers.getContractFactory(
    ['contract SpeciesFund { constructor(address _registry) {} }'],
    wallet
  );
  // Note: in production, you'd compile the actual contracts
  // This is a placeholder showing the deployment pattern
  
  console.log('\nDeployment addresses:');
  console.log('SpeciesFund: [to be deployed]');
  console.log('AutonomousExecutor: [to be deployed]');
  console.log('\nEstimated gas cost: ~0.003 ETH total');
}

main().catch(console.error);
