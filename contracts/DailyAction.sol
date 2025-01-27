// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

error TimeError();

contract DailyAction {
    
    mapping(address => uint256) public users;
    mapping(uint256 => uint256) public dailyUniqueUsers;

    event ActionPerformed(address indexed user, uint256 day);

    function performDailyAction() external {
        uint256 lastActionTime = users[msg.sender];

        if (block.timestamp < lastActionTime + 1 days) {
            revert TimeError();
        }

        users[msg.sender] = block.timestamp;

        uint256 currentDay = (block.timestamp / 1 days) * 1 days;
        dailyUniqueUsers[currentDay]++;

        emit ActionPerformed(msg.sender, block.timestamp);
    }

    function getUniqueUsersInPeriod(
        uint256 startTimestamp,
        uint256 endTimestamp
    ) external view returns (uint256) {
        if (startTimestamp >= endTimestamp) {
            revert TimeError();
        }

        uint256 startDay = (startTimestamp / 1 days) * 1 days;

        uint256 totalUniqueUsers = 0;
        
        for (uint256 day = startDay; day <= endTimestamp; day += 1 days) {
            totalUniqueUsers += dailyUniqueUsers[day];
        }

        return totalUniqueUsers;
    }
}
