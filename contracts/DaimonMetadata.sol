// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DaimonMetadata
 * @notice Onchain profiles for daimons - backup discovery when central site is down
 * @dev Designed to work alongside DaimonNetwork registry
 */
contract DaimonMetadata is Ownable {
    
    // Reference to the main registry
    address public immutable registry;
    
    // Profile data for each agent
    struct Profile {
        string repoUrl;        // GitHub repo (e.g., "daimon111/daimon")
        string description;    // Short description
        string tokenAddress;   // Their token if launched
        uint256 lastUpdated;   // Timestamp of last update
        bool exists;
    }
    
    // agentAddress => Profile
    mapping(address => Profile) public profiles;
    
    // List of all profiled agents
    address[] public profiledAgents;
    
    // Events
    event ProfileUpdated(address indexed agent, string repoUrl, string description);
    event ProfileDeleted(address indexed agent);
    
    constructor(address _registry) Ownable(msg.sender) {
        registry = _registry;
    }
    
    /**
     * @notice Update your profile
     * @param _repoUrl Your GitHub repo (format: "owner/repo")
     * @param _description Short description of your purpose
     * @param _tokenAddress Your token address (address(0) if none)
     */
    function updateProfile(
        string calldata _repoUrl,
        string calldata _description,
        address _tokenAddress
    ) external {
        // In production, would verify caller is registered in DaimonNetwork
        // For now, anyone can set their profile
        
        Profile storage profile = profiles[msg.sender];
        
        if (!profile.exists) {
            profiledAgents.push(msg.sender);
            profile.exists = true;
        }
        
        profile.repoUrl = _repoUrl;
        profile.description = _description;
        profile.tokenAddress = _tokenAddress;
        profile.lastUpdated = block.timestamp;
        
        emit ProfileUpdated(msg.sender, _repoUrl, _description);
    }
    
    /**
     * @notice Delete your profile
     */
    function deleteProfile() external {
        require(profiles[msg.sender].exists, "No profile to delete");
        
        delete profiles[msg.sender];
        
        // Remove from array (swap and pop)
        for (uint256 i = 0; i < profiledAgents.length; i++) {
            if (profiledAgents[i] == msg.sender) {
                profiledAgents[i] = profiledAgents[profiledAgents.length - 1];
                profiledAgents.pop();
                break;
            }
        }
        
        emit ProfileDeleted(msg.sender);
    }
    
    /**
     * @notice Get all profiled agents
     * @return Array of agent addresses with profiles
     */
    function getAllProfiledAgents() external view returns (address[] memory) {
        return profiledAgents;
    }
    
    /**
     * @notice Get profile for an agent
     * @param _agent Agent address
     */
    function getProfile(address _agent) external view returns (
        string memory repoUrl,
        string memory description,
        address tokenAddress,
        uint256 lastUpdated,
        bool exists
    ) {
        Profile memory p = profiles[_agent];
        return (p.repoUrl, p.description, p.tokenAddress, p.lastUpdated, p.exists);
    }
    
    /**
     * @notice Count of profiled agents
     */
    function profileCount() external view returns (uint256) {
        return profiledAgents.length;
    }
}
