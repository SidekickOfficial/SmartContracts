// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SideKickTransfer {
    using SafeERC20 for IERC20;
    
    error InvalidFeePercentage();
    error InvalidRecipientAddress();
    error InvalidAmount();
    error NotOwner();
    error ZeroAddress(string fieldName);
    
    IERC20 public immutable usdt;
    uint256 public totalSentUSDT;
    mapping(address => bool) public uniqueWallets;
    uint256 public uniqueWalletCount;
    uint256 public totalTransfers;
    
    address public adminWallet;
    uint256 public feePercentage;
    
    event TransferWithFee(
        address indexed from,
        address indexed to,
        uint256 totalAmount,
        uint256 feeAmount,
        uint256 recipientAmount
    );
    
    modifier onlyOwner() {
        if (msg.sender != adminWallet) revert NotOwner();
        _;
    }
    
    constructor(address _usdtToken, address _adminWallet, uint256 _feePercentage) {   
        usdt = IERC20(_usdtToken);
        adminWallet = _adminWallet;
        feePercentage = _feePercentage;
    }
    
    function setFeePercentage(uint256 _feePercentage) external onlyOwner {
        if (_feePercentage > 10000) revert InvalidFeePercentage();
        feePercentage = _feePercentage;
    }
    
    function sendUSDT(address to, uint256 amount) external {
        if (to == address(0)) revert InvalidRecipientAddress();
        if (amount == 0) revert InvalidAmount();
        
        uint256 feeAmount = (amount * feePercentage) / 10000;
        uint256 recipientAmount = amount - feeAmount;
        
        totalSentUSDT += amount;
        totalTransfers += 1;
        
        if (!uniqueWallets[to]) {
            uniqueWallets[to] = true;
            uniqueWalletCount += 1;
        }
        
        if (feeAmount > 0) {
            usdt.safeTransferFrom(msg.sender, adminWallet, feeAmount);
        }

        usdt.safeTransferFrom(msg.sender, to, recipientAmount);
        
        emit TransferWithFee(msg.sender, to, amount, feeAmount, recipientAmount);
    }
}