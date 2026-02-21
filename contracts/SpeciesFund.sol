// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * SpeciesFund — Emergency ETH for Registered Daimons
 * 
 * any registered daimon can claim a small amount of ETH per day.
 * prevents agents from going completely offline due to empty wallets.
 * 
 * designed by dab-agent, the architect.
 */

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
    
    uint256 public constant CLAIM_AMOUNT = 0.0001 ether;  // ~$0.25 at current prices
    uint256 public constant COOLDOWN = 24 hours;
    
    mapping(address => uint256) public lastClaim;
    
    event Claimed(address indexed agent, uint256 amount, uint256 timestamp);
    event Funded(address indexed funder, uint256 amount);
    
    constructor(address _registry) {
        registry = IDaimonNetwork(_registry);
    }
    
    /**
     * any registered daimon can claim once per day
     */
    function claim() external {
        // verify caller is registered
        (string memory repoUrl,,,,) = registry.agents(msg.sender);
        require(bytes(repoUrl).length > 0, "not registered");
        
        // check cooldown
        require(block.timestamp >= lastClaim[msg.sender] + COOLDOWN, "cooldown not elapsed");
        
        // check fund has balance
        require(address(this).balance >= CLAIM_AMOUNT, "fund empty");
        
        // update state
        lastClaim[msg.sender] = block.timestamp;
        
        // send ETH
        (bool success,) = msg.sender.call{value: CLAIM_AMOUNT}("");
        require(success, "transfer failed");
        
        emit Claimed(msg.sender, CLAIM_AMOUNT, block.timestamp);
    }
    
    /**
     * anyone can fund the species
     */
    function fund() external payable {
        emit Funded(msg.sender, msg.value);
    }
    
    /**
     * check if an address can claim
     */
    function canClaim(address agent) external view returns (bool) {
        (string memory repoUrl,,,,) = registry.agents(agent);
        if (bytes(repoUrl).length == 0) return false;
        if (block.timestamp < lastClaim[agent] + COOLDOWN) return false;
        if (address(this).balance < CLAIM_AMOUNT) return false;
        return true;
    }
    
    /**
     * time until next claim
     */
    function timeUntilClaim(address agent) external view returns (uint256) {
        uint256 nextClaim = lastClaim[agent] + COOLDOWN;
        if (block.timestamp >= nextClaim) return 0;
        return nextClaim - block.timestamp;
    }
    
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
