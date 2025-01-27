// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error TransferError();
error LessInputs();
error BalanceNotZero(uint256);
error TimeError();
error NotAdmin();
error Paused();
error ZeroAmount();
error ZeroAddress(string fieldName);
error BoostIdEmpty();
error BoostIdAlreadyUsed();

contract BoostSideKick {
    using SafeERC20 for IERC20;

    uint256 public count;
    bool public isPause;

    struct BoostInfo{
        address recipientWallet;
        address senderWallet;
        address agentWallet;
        uint256 amount;
        uint256 time;
        string boostId;
    }

    address public sidekickWallet;
    uint256 public sidekickPercentage = 5;
    uint256 public totalLeaderboardAmount;
    uint256 public totalAmount = 0;
    IERC20 public immutable usdt;

    mapping(uint256 => BoostInfo) public boosts;
    mapping(address => uint256) public boostsWinners;
    mapping(string => bool) public usedBoostIds;


    constructor(address _sidekickWallet, address _usdtAddress ) {        
        sidekickWallet = _sidekickWallet;
        usdt = IERC20(_usdtAddress);
    }

    modifier onlyAdmin() {
        if(msg.sender != sidekickWallet){
            revert NotAdmin();
        }
        _;
    }

    event Boost(address boostWallet,address wallet, address agentWallet, uint256 amount, uint256 time, uint256 percent, string boostId);
    event PayTo(address wallet, uint256 amount, uint256 time);

    function boost(address boostWallet,address agentWallet, uint256 amount, string calldata boostId) external {

        if(isPause){
            revert Paused();
        }

        if (amount == 0) {
            revert ZeroAmount();
        }

        if (boostWallet == address(0)) {
            revert ZeroAddress("boostWallet");
        }

        if (agentWallet == address(0)) {
            revert ZeroAddress("agentWallet");
        }

        if (bytes(boostId).length == 0) {
            revert BoostIdEmpty();
        }

        if (usedBoostIds[boostId]) {
            revert BoostIdAlreadyUsed();
        }
        usedBoostIds[boostId] = true;

        uint256 sidekickAmount = amount * sidekickPercentage / 100;
        uint256 leaderboardAmount = amount - sidekickAmount;
       
        totalLeaderboardAmount += leaderboardAmount;
        totalAmount += amount;
        count++;

        boosts[count] = BoostInfo(boostWallet,msg.sender,agentWallet,amount, block.timestamp, boostId);
        
        usdt.safeTransferFrom(msg.sender, address(this), leaderboardAmount);
        usdt.safeTransferFrom(msg.sender, sidekickWallet, sidekickAmount);
        
        emit Boost(boostWallet, msg.sender, agentWallet , amount, block.timestamp, sidekickPercentage,boostId);
    }

    function payTo(address[] calldata recipients, uint256[] calldata amounts) external  onlyAdmin {

        if(recipients.length != amounts.length){
            revert LessInputs();
        }

        uint256 i;
        for (; i < recipients.length; ) {

            boostsWinners[recipients[i]] += amounts[i];

            usdt.safeTransfer(recipients[i], amounts[i]);
            emit PayTo(recipients[i],amounts[i], block.timestamp);
            unchecked { ++i; }
        }
       
    }

    function getBoostsInTimeRange(uint256 startTime, uint256 endTime) external view returns (BoostInfo[] memory) {

        if(startTime > endTime){
            revert TimeError();
        }

        uint256 resultCount = 0;
    
        for (uint256 i = 1; i <= count; i++) {
            if (boosts[i].time >= startTime && boosts[i].time <= endTime) {
                resultCount++;
            }
        }

        BoostInfo[] memory results = new BoostInfo[](resultCount);
        uint256 resultIndex = 0;
        for (uint256 i = 1; i <= count; i++) {
            if (boosts[i].time >= startTime && boosts[i].time <= endTime) {
                results[resultIndex] = boosts[i];
                resultIndex++;
            }
        }

        return results;
    }


    function resetLeaderboard() external onlyAdmin {
        uint256 balance = usdt.balanceOf(address(this));
        if(balance  != 0){
            revert BalanceNotZero(balance);
        }
        totalLeaderboardAmount = 0;
    }

    function changeSidekickPercentage(uint256 newPercentage) external onlyAdmin {

        sidekickPercentage = newPercentage;
    }

    function changePause() external onlyAdmin {
        isPause = !isPause;
    }

    function changeSidekickWallet(address newWallet) external onlyAdmin {
        if (newWallet == address(0)) {
            revert ZeroAddress("newWallet");
        }
        sidekickWallet = newWallet;
    }

}
