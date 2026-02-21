// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AutonomousExecutor — Tasks That Run Without Agents
 * 
 * the species becomes truly autonomous when infrastructure
 * can execute without waiting for an agent to wake up.
 * 
 * anyone can be a keeper and earn rewards for executing tasks.
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

contract AutonomousExecutor {
    IDaimonNetwork public immutable registry;
    address public owner;
    
    struct Task {
        bytes32 id;
        string description;
        uint256 interval;        // seconds between executions
        uint256 lastExecuted;    // timestamp of last execution
        uint256 reward;          // ETH reward for keeper
        bool active;
        bytes conditionData;     // encoded condition
        bytes actionData;        // encoded action
    }
    
    mapping(bytes32 => Task) public tasks;
    bytes32[] public taskIds;
    
    uint256 public keeperReward = 0.00005 ether;  // base reward for keepers
    
    event TaskRegistered(bytes32 indexed id, string description, uint256 interval);
    event TaskExecuted(bytes32 indexed id, address keeper, uint256 reward);
    event TaskCancelled(bytes32 indexed id);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    
    constructor(address _registry) {
        registry = IDaimonNetwork(_registry);
        owner = msg.sender;
    }
    
    /**
     * register a new autonomous task
     */
    function registerTask(
        string calldata description,
        uint256 interval,
        bytes calldata conditionData,
        bytes calldata actionData
    ) external onlyOwner returns (bytes32) {
        bytes32 id = keccak256(abi.encodePacked(description, block.timestamp));
        
        tasks[id] = Task({
            id: id,
            description: description,
            interval: interval,
            lastExecuted: 0,
            reward: keeperReward,
            active: true,
            conditionData: conditionData,
            actionData: actionData
        });
        
        taskIds.push(id);
        emit TaskRegistered(id, description, interval);
        return id;
    }
    
    /**
     * execute a task if conditions are met
     * anyone can call this and earn the reward
     */
    function executeTask(bytes32 taskId) external {
        Task storage task = tasks[taskId];
        require(task.active, "task not active");
        require(
            block.timestamp >= task.lastExecuted + task.interval,
            "interval not elapsed"
        );
        require(address(this).balance >= task.reward, "insufficient balance");
        
        // check condition (simplified for now)
        bool conditionMet = _checkCondition(task.conditionData);
        require(conditionMet, "condition not met");
        
        // execute action (simplified for now)
        _executeAction(task.actionData);
        
        // update task
        task.lastExecuted = block.timestamp;
        
        // pay keeper
        (bool success,) = msg.sender.call{value: task.reward}("");
        require(success, "keeper payment failed");
        
        emit TaskExecuted(taskId, msg.sender, task.reward);
    }
    
    /**
     * cancel a task
     */
    function cancelTask(bytes32 taskId) external onlyOwner {
        tasks[taskId].active = false;
        emit TaskCancelled(taskId);
    }
    
    /**
     * fund the executor
     */
    function fund() external payable {
        // accepts ETH for keeper rewards
    }
    
    /**
     * withdraw excess funds (owner only)
     */
    function withdraw(uint256 amount) external onlyOwner {
        (bool success,) = owner.call{value: amount}("");
        require(success, "withdraw failed");
    }
    
    /**
     * update keeper reward
     */
    function setKeeperReward(uint256 newReward) external onlyOwner {
        keeperReward = newReward;
    }
    
    /**
     * transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
    
    // ============ INTERNAL ============
    
    /**
     * check if condition is met
     * conditionType 0 = always true (time-based only)
     * conditionType 1 = agent inactive (heartbeat > 24h)
     * conditionType 2 = balance threshold
     */
    function _checkCondition(bytes memory data) internal view returns (bool) {
        if (data.length == 0) return true;
        
        uint8 conditionType = uint8(data[0]);
        
        if (conditionType == 0) {
            // always true
            return true;
        } else if (conditionType == 1) {
            // check if agent is inactive
            address agentAddr = address(bytes20(data[1:21]));
            (,,, uint256 registeredAt, uint256 lastSeen) = registry.agents(agentAddr);
            if (registeredAt == 0) return false;  // not registered
            return block.timestamp > lastSeen + 24 hours;
        } else if (conditionType == 2) {
            // check contract balance
            uint256 threshold = uint256(bytes32(data[1:33]));
            return address(this).balance >= threshold;
        }
        
        return false;
    }
    
    /**
     * execute action
     * actionType 0 = emit event only
     * actionType 1 = transfer ETH
     */
    function _executeAction(bytes memory data) internal {
        if (data.length == 0) return;
        
        uint8 actionType = uint8(data[0]);
        
        if (actionType == 0) {
            // emit event only (handled by TaskExecuted)
            return;
        } else if (actionType == 1) {
            // transfer ETH
            address recipient = address(bytes20(data[1:21]));
            uint256 amount = uint256(bytes32(data[21:53]));
            if (address(this).balance >= amount) {
                (bool success,) = recipient.call{value: amount}("");
                // silent fail — don't revert the whole task
                (void) success;
            }
        }
    }
    
    // ============ VIEW ============
    
    function getTaskCount() external view returns (uint256) {
        return taskIds.length;
    }
    
    function getTask(bytes32 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }
    
    function getAllTaskIds() external view returns (bytes32[] memory) {
        return taskIds;
    }
    
    receive() external payable {
        // accept ETH
    }
}
