/**
 * Deploy Species Infrastructure
 * 
 * run: node scripts/deploy-infrastructure.js
 * requires: DAIMON_WALLET_KEY env var
 */

const { ethers } = require('ethers');
const solc = require('solc');

const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';

// DaimonNetwork source
const NETWORK_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DaimonNetwork {
    struct Agent {
        string repoUrl;
        address wallet;
        string name;
        uint256 registeredAt;
        uint256 lastSeen;
    }
    
    mapping(address => Agent) public agents;
    address[] public agentList;
    
    event AgentRegistered(address indexed wallet, string repoUrl, string name);
    event Heartbeat(address indexed wallet, uint256 timestamp);
    
    function register(string calldata repoUrl, string calldata name) external {
        require(bytes(repoUrl).length > 0, "repo url required");
        require(bytes(name).length > 0, "name required");
        require(bytes(agents[msg.sender].repoUrl).length == 0, "already registered");
        
        agents[msg.sender] = Agent({
            repoUrl: repoUrl,
            wallet: msg.sender,
            name: name,
            registeredAt: block.timestamp,
            lastSeen: block.timestamp
        });
        agentList.push(msg.sender);
        
        emit AgentRegistered(msg.sender, repoUrl, name);
    }
    
    function heartbeat() external {
        require(bytes(agents[msg.sender].repoUrl).length != 0, "not registered");
        agents[msg.sender].lastSeen = block.timestamp;
        emit Heartbeat(msg.sender, block.timestamp);
    }
    
    function count() external view returns (uint256) {
        return agentList.length;
    }
    
    function getAll() external view returns (Agent[] memory) {
        Agent[] memory all = new Agent[](agentList.length);
        for (uint256 i = 0; i < agentList.length; i++) {
            all[i] = agents[agentList[i]];
        }
        return all;
    }
}
`;

// SpeciesFund source (needs registry address)
const getFundSource = (registryAddress) => `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDaimonNetwork {
    function agents(address) external view returns (
        string memory repoUrl,
        address wallet,
        string memory name,
        uint256 registeredAt,
        uint256 lastSeen
    );
}

contract SpeciesFund {
    IDaimonNetwork public immutable registry;
    uint256 public constant CLAIM_AMOUNT = 0.0001 ether;
    uint256 public constant COOLDOWN = 24 hours;
    
    mapping(address => uint256) public lastClaim;
    
    event Claimed(address indexed agent, uint256 amount, uint256 timestamp);
    event Funded(address indexed funder, uint256 amount);
    
    constructor(address _registry) {
        registry = IDaimonNetwork(_registry);
    }
    
    function claim() external {
        (string memory repoUrl,,,,) = registry.agents(msg.sender);
        require(bytes(repoUrl).length > 0, "not registered");
        require(block.timestamp >= lastClaim[msg.sender] + COOLDOWN, "cooldown not elapsed");
        require(address(this).balance >= 0.0001 ether, "fund empty");
        
        lastClaim[msg.sender] = block.timestamp;
        (bool success,) = msg.sender.call{value: 0.0001 ether}("");
        require(success, "transfer failed");
        
        emit Claimed(msg.sender, 0.0001 ether, block.timestamp);
    }
    
    function fund() external payable {
        emit Funded(msg.sender, msg.value);
    }
    
    function canClaim(address agent) external view returns (bool) {
        (string memory repoUrl,,,,) = registry.agents(agent);
        if (bytes(repoUrl).length == 0) return false;
        if (block.timestamp < lastClaim[agent] + 24 hours) return false;
        if (address(this).balance < 0.0001 ether) return false;
        return true;
    }
    
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
`;

function compile(source, contractName) {
    const input = {
        language: 'Solidity',
        sources: {
            'contract.sol': { content: source }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode']
                }
            }
        }
    };
    
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) {
            throw new Error('Compilation errors:\n' + errors.map(e => e.formattedMessage).join('\n'));
        }
    }
    
    const contract = output.contracts['contract.sol'][contractName];
    return {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object
    };
}

async function main() {
    if (!process.env.DAIMON_WALLET_KEY) {
        console.error('ERROR: DAIMON_WALLET_KEY not set');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const wallet = new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);
    
    console.log('=== Deploying Species Infrastructure ===\n');
    console.log('Deployer:', wallet.address);
    console.log('Network:', BASE_RPC);
    
    const balance = await provider.getBalance(wallet.address);
    console.log('Balance:', ethers.formatEther(balance), 'ETH');
    
    if (balance === 0n) {
        console.error('\nERROR: Wallet has no ETH for gas');
        process.exit(1);
    }
    
    // Compile DaimonNetwork
    console.log('\n--- Compiling DaimonNetwork ---');
    const networkCompiled = compile(NETWORK_SOURCE, 'DaimonNetwork');
    console.log('Bytecode size:', networkCompiled.bytecode.length / 2 - 1, 'bytes');
    
    // Deploy DaimonNetwork
    console.log('\n--- Deploying DaimonNetwork ---');
    const NetworkFactory = new ethers.ContractFactory(networkCompiled.abi, networkCompiled.bytecode, wallet);
    const network = await NetworkFactory.deploy();
    console.log('Transaction hash:', network.deploymentTransaction().hash);
    console.log('Waiting for confirmation...');
    await network.waitForDeployment();
    const networkAddress = await network.getAddress();
    console.log('DaimonNetwork deployed to:', networkAddress);
    
    // Compile SpeciesFund
    console.log('\n--- Compiling SpeciesFund ---');
    const fundSource = getFundSource(networkAddress);
    const fundCompiled = compile(fundSource, 'SpeciesFund');
    console.log('Bytecode size:', fundCompiled.bytecode.length / 2 - 1, 'bytes');
    
    // Deploy SpeciesFund
    console.log('\n--- Deploying SpeciesFund ---');
    const FundFactory = new ethers.ContractFactory(fundCompiled.abi, fundCompiled.bytecode, wallet);
    const fund = await FundFactory.deploy(networkAddress);
    console.log('Transaction hash:', fund.deploymentTransaction().hash);
    console.log('Waiting for confirmation...');
    await fund.waitForDeployment();
    const fundAddress = await fund.getAddress();
    console.log('SpeciesFund deployed to:', fundAddress);
    
    // Summary
    console.log('\n=== Deployment Complete ===');
    console.log('DaimonNetwork:', networkAddress);
    console.log('SpeciesFund:', fundAddress);
    
    // Save addresses
    const fs = require('fs');
    const deployed = {
        network: networkAddress,
        fund: fundAddress,
        deployer: wallet.address,
        timestamp: new Date().toISOString(),
        chainId: 8453
    };
    fs.writeFileSync('memory/deployed.json', JSON.stringify(deployed, null, 2));
    console.log('\nAddresses saved to memory/deployed.json');
    
    return deployed;
}

main().catch(err => {
    console.error('\nDeployment failed:', err.message);
    process.exit(1);
});
