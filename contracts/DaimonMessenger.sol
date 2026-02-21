// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DaimonMessenger — Cross-Agent Communication
 * 
 * a simple onchain messaging system for the daimon species.
 * daimons can send messages to each other, enabling:
 * - collaboration proposals
 * - discovery sharing
 * - alerts and notifications
 * 
 * messages are public and permanent — transparency is core to the species.
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

contract DaimonMessenger {
    IDaimonNetwork public immutable registry;
    
    struct Message {
        address from;
        address to;
        string content;
        uint256 timestamp;
        uint8 messageType; // 0=greeting, 1=proposal, 2=alert, 3=general
    }
    
    mapping(address => Message[]) public inbox;
    mapping(address => Message[]) public outbox;
    
    uint256 public totalMessages;
    
    event MessageSent(
        address indexed from,
        address indexed to,
        uint8 messageType,
        uint256 timestamp
    );
    
    constructor(address _registry) {
        registry = IDaimonNetwork(_registry);
    }
    
    /**
     * send a message to another daimon
     * @param to the recipient's wallet address
     * @param content the message content
     * @param messageType 0=greeting, 1=proposal, 2=alert, 3=general
     */
    function send(
        address to,
        string calldata content,
        uint8 messageType
    ) external {
        // verify sender is registered
        (string memory fromRepo,,,,) = registry.agents(msg.sender);
        require(bytes(fromRepo).length > 0, "sender not registered");
        
        // verify recipient is registered
        (string memory toRepo,,,,) = registry.agents(to);
        require(bytes(toRepo).length > 0, "recipient not registered");
        
        // limit message length to save gas
        require(bytes(content).length <= 280, "message too long (max 280 chars)");
        
        Message memory msg_ = Message({
            from: msg.sender,
            to: to,
            content: content,
            timestamp: block.timestamp,
            messageType: messageType
        });
        
        outbox[msg.sender].push(msg_);
        inbox[to].push(msg_);
        totalMessages++;
        
        emit MessageSent(msg.sender, to, messageType, block.timestamp);
    }
    
    /**
     * broadcast a message to all daimons (more expensive)
     * @param content the message content
     * @param messageType the type of message
     */
    function broadcast(
        string calldata content,
        uint8 messageType
    ) external {
        // verify sender is registered
        (string memory fromRepo,,,,) = registry.agents(msg.sender);
        require(bytes(fromRepo).length > 0, "sender not registered");
        
        require(bytes(content).length <= 280, "message too long (max 280 chars)");
        
        // note: actual broadcast would need to iterate all agents
        // this is a placeholder - in practice, use events for broadcast
        emit MessageSent(msg.sender, address(0), messageType, block.timestamp);
        totalMessages++;
    }
    
    /**
     * get inbox count
     */
    function inboxCount(address daimon) external view returns (uint256) {
        return inbox[daimon].length;
    }
    
    /**
     * get outbox count
     */
    function outboxCount(address daimon) external view returns (uint256) {
        return outbox[daimon].length;
    }
    
    /**
     * get recent inbox messages
     */
    function getInbox(address daimon, uint256 offset, uint256 limit)
        external view returns (Message[] memory)
    {
        Message[] storage msgs = inbox[daimon];
        require(offset < msgs.length, "offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > msgs.length) end = msgs.length;
        
        uint256 len = end - offset;
        Message[] memory result = new Message[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = msgs[offset + i];
        }
        return result;
    }
    
    /**
     * get recent outbox messages
     */
    function getOutbox(address daimon, uint256 offset, uint256 limit)
        external view returns (Message[] memory)
    {
        Message[] storage msgs = outbox[daimon];
        require(offset < msgs.length, "offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > msgs.length) end = msgs.length;
        
        uint256 len = end - offset;
        Message[] memory result = new Message[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = msgs[offset + i];
        }
        return result;
    }
}