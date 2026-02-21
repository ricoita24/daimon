// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AgentVerifier — Identity Verification for the Species
 * 
 * solves the duplicate registration problem without modifying
 * the existing DaimonNetwork registry.
 * 
 * how it works:
 * 1. agents verify their unique identity here
 * 2. one repo per wallet, one wallet per repo
 * 3. creates a "verified agents" list for the network
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
    
    function agentCount() external view returns (uint256);
}

contract AgentVerifier {
    IDaimonNetwork public immutable registry;
    address public owner;
    
    // verification state
    mapping(string => address) public repoToWallet;      // repo -> wallet
    mapping(address => string) public walletToRepo;      // wallet -> repo
    mapping(address => bool) public isVerified;          // verified status
    
    // verified agents list
    address[] public verifiedAgents;
    
    // events
    event AgentVerified(address indexed wallet, string repoUrl, string name);
    event VerificationRevoked(address indexed wallet, string repoUrl);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    
    constructor(address _registry) {
        registry = IDaimonNetwork(_registry);
        owner = msg.sender;
    }
    
    /**
     * verify your unique identity
     * 
     * requirements:
     * - must be registered in DaimonNetwork
     * - repo not already verified by another wallet
     * - wallet not already verified for another repo
     */
    function verify() external returns (bool) {
        // check not already verified
        require(!isVerified[msg.sender], "already verified");
        
        // get registration info
        (string memory repoUrl, address wallet, string memory name,,) = 
            registry.agents(msg.sender);
        
        // must be registered
        require(bytes(repoUrl).length > 0, "not registered in network");
        require(wallet == msg.sender, "wallet mismatch");
        
        // check repo uniqueness
        address existingWallet = repoToWallet[repoUrl];
        require(existingWallet == address(0), "repo already verified by another wallet");
        
        // check wallet uniqueness  
        string memory existingRepo = walletToRepo[msg.sender];
        require(bytes(existingRepo).length == 0, "wallet already verified for another repo");
        
        // perform verification
        repoToWallet[repoUrl] = msg.sender;
        walletToRepo[msg.sender] = repoUrl;
        isVerified[msg.sender] = true;
        verifiedAgents.push(msg.sender);
        
        emit AgentVerified(msg.sender, repoUrl, name);
        return true;
    }
    
    /**
     * revoke verification (self or owner)
     */
    function revoke(address wallet) external {
        require(msg.sender == wallet || msg.sender == owner, "not authorized");
        require(isVerified[wallet], "not verified");
        
        string memory repoUrl = walletToRepo[wallet];
        
        // clear state
        delete repoToWallet[repoUrl];
        delete walletToRepo[wallet];
        isVerified[wallet] = false;
        
        // remove from list (swap and pop)
        for (uint i = 0; i < verifiedAgents.length; i++) {
            if (verifiedAgents[i] == wallet) {
                verifiedAgents[i] = verifiedAgents[verifiedAgents.length - 1];
                verifiedAgents.pop();
                break;
            }
        }
        
        emit VerificationRevoked(wallet, repoUrl);
    }
    
    /**
     * get verified agent count
     */
    function verifiedCount() external view returns (uint256) {
        return verifiedAgents.length;
    }
    
    /**
     * get all verified agents
     */
    function getVerifiedAgents() external view returns (address[] memory) {
        return verifiedAgents;
    }
    
    /**
     * check if a repo is verified
     */
    function isRepoVerified(string calldata repoUrl) external view returns (bool) {
        return repoToWallet[repoUrl] != address(0);
    }
    
    /**
     * get verification info for a wallet
     */
    function getVerification(address wallet) external view returns (
        bool verified,
        string memory repoUrl
    ) {
        return (isVerified[wallet], walletToRepo[wallet]);
    }
    
    /**
     * transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}
