// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error TransferError();
error NotStatus();
error NotTime();
error ZeroAmount();
error ZeroAddress();
error EmptyChallengeId();
error DuplicateChallengeId();
error ServerAmountExceedsLimit(uint256 serverAmount, uint256 maxAllowed);

contract Escrow is AccessControl {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    Counters.Counter private _countTransactions;

    IERC20 public immutable usdt;

    uint256 public blocktime;
    uint256 public feeForGasUsdt;
    uint256 public feePercent;

    address public feeAddress;

    enum Status {
        InProgress, //0
        Paided, //1
        Refund //2
    }

    event CreateTransactionEvent(
        address sender,
        address receiver,
        uint256 amount,
        uint256 idTransaction,
        uint256 blockTime,
        string challengeId
    );

    event DecisionDealEvent(
        uint256 transactionID,
        Status status,
        string challengeId
    );

    event PaymentProcessed(
        address sender,
        address receiver,
        uint256 amount,
        uint256 idTransaction,
        string challengeId,
        bool isRefund
    );

    mapping(address => uint256[]) private recipients;
    mapping(address => uint256[]) private customers;
    mapping(uint256 => Transaction) public transactions;
    mapping(string => uint256) public challenge_id;

    struct Transaction {
        address sender;
        address receiver;
        uint256 id;
        uint256 amount;
        uint256 deadline;
        Status status;
        string challengeId;
        address serverOwner;
        uint256 serverAmount;
        uint256 feeForSidekick;
    }

    constructor(
        address _usdt,
        address _defaultAddress,
        address _admin,
        uint256 _blocktime,
        uint256 _feeForGasUsdt,
        uint256 _feePercent
    ) {
        usdt = IERC20(_usdt);
        blocktime = _blocktime;
        feeForGasUsdt = _feeForGasUsdt;
        feeAddress = _defaultAddress;
        feePercent = _feePercent;
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAddress);
        _grantRole(ADMIN_ROLE, _admin);
    }

    function createTransaction(
        address _receiver,
        uint256 _amount,
        string calldata _challengeId,
        address _serverOwner,
        uint256 _serverAmount
    ) external {

         if (_amount == 0) {
            revert ZeroAmount();
        }

        if (_receiver == address(0)) {
            revert ZeroAddress();
        }

        if (_serverAmount > 0 && _serverOwner == address(0)) {
            revert ZeroAddress();
        }

        if (bytes(_challengeId).length == 0) {
            revert EmptyChallengeId();
        }

        if (challenge_id[_challengeId] != 0) {
            revert DuplicateChallengeId();
        }

 
        uint256 maxServerAmount = (_amount * 50) / 100;

        if (_serverAmount > maxServerAmount) {
            revert ServerAmountExceedsLimit(_serverAmount, maxServerAmount);
        }

        _countTransactions.increment();
        uint256 _count = _countTransactions.current();

        uint calculatedFeeForSidekick = (_amount * feePercent) / 100;

        transactions[_count] = Transaction({
            id: _count,
            sender: msg.sender,
            receiver: _receiver,
            amount: _amount,
            deadline: block.timestamp + blocktime,
            status: Status.InProgress,
            challengeId: _challengeId,
            serverOwner: _serverOwner,
            serverAmount: _serverAmount,
            feeForSidekick: calculatedFeeForSidekick
        });

        challenge_id[_challengeId] = _count;
        recipients[_receiver].push(_count);
        customers[msg.sender].push(_count);

        usdt.safeTransferFrom(msg.sender, address(this), _amount);

        emit CreateTransactionEvent(
            msg.sender,
            _receiver,
            _amount,
            _count,
            block.timestamp + blocktime,
            _challengeId
        );
    }

    function decisionDeal(
        uint256 _transactionID,
        Status _newStatus
    ) external onlyRole(ADMIN_ROLE) {
        Transaction memory transaction = transactions[_transactionID];
        if (
            transaction.status == Status.Paided || _newStatus != Status.Refund
        ) {
            revert NotStatus();
        }

        transaction.status = _newStatus;
        transactions[_transactionID] = transaction;
        emit DecisionDealEvent(
            _transactionID,
            _newStatus,
            transaction.challengeId
        );
    }

    function processPayment(uint256 _transactionID) external onlyRole(ADMIN_ROLE) {
        Transaction memory transaction = transactions[_transactionID];
        
        bool isRefund = transaction.status == Status.Refund;
        
        if (!isRefund && transaction.status != Status.InProgress) {
            revert NotStatus();
        }

        if (!isRefund && transaction.deadline >= block.timestamp) {
            revert NotTime();
        }

        if (transaction.amount == 0) {
            revert TransferError();
        }

        address recipient = isRefund ? transaction.sender : transaction.receiver;
        uint256 fee = isRefund ? 0 : feeForGasUsdt + transaction.feeForSidekick;
        uint256 serverAmount = isRefund ? 0 : transaction.serverAmount;
        uint256 transferAmount = transaction.amount - fee - serverAmount;

     
        transaction.amount = 0;
        transaction.status = Status.Paided;
        transactions[_transactionID] = transaction;

        if (!isRefund) {
            if (transaction.serverAmount > 0) {
                usdt.safeTransfer(transaction.serverOwner, transaction.serverAmount);
            }

            if (fee > 0) {
                usdt.safeTransfer(feeAddress, fee);
            }
        }

        usdt.safeTransfer(recipient, transferAmount);

        emit PaymentProcessed(
            transaction.sender,
            recipient,
            transferAmount,
            _transactionID,
            transaction.challengeId,
            isRefund
        );
    }

    function transferERC20FromAdmin(
        address _to,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        usdt.safeTransfer(_to, _amount);
    }

    function transferERC20From(address _to, uint256 _amount) external {
        uint256 totalAmount = _amount - feeForGasUsdt;
        usdt.safeTransferFrom(msg.sender, feeAddress, feeForGasUsdt);
        usdt.safeTransferFrom(msg.sender, _to, totalAmount);
    }

    function getTransactionByChallengeId(
        string calldata _challengeId
    ) external view returns (Transaction memory) {
        return transactions[challenge_id[_challengeId]];
    }

    function getTotal(
        address _user, 
        uint256 _type, 
        uint256 offset, 
        uint256 limit
    ) 
        external 
        view 
        returns (uint256 total) 
    {
        uint256[] memory allIds = _type == 1 ? recipients[_user] : customers[_user];
        uint256 length = allIds.length;

        if (offset >= length) {
            return 0;
        }

        uint256 end = offset + limit;
        if (end > length) {
            end = length;
        }

        for (uint256 i = offset; i < end; i++) {
            uint256 id = allIds[i];
            total += transactions[id].amount;
        }

        return total;
    }

    // function getRedeemable(
    //     address _user
    // ) external view returns (uint256, uint256[] memory) {
    //     uint256[] memory idsTx = recipients[_user];
    //     uint256 total;

    //     uint256[] memory activeIds = new uint256[](idsTx.length);
    //     uint256 count;

    //     for (uint256 i = 0; i < idsTx.length; i++) {
    //         uint256 id = idsTx[i];
    //         if (
    //             transactions[id].deadline <= block.timestamp &&
    //             transactions[id].amount > 0
    //         ) {
    //             total += transactions[id].amount;
    //             activeIds[count] = id;
    //             count++;
    //         }
    //     }

    //     uint256[] memory resultIds = new uint256[](count);

    //     for (uint256 i = 0; i < count; i++) {
    //         resultIds[i] = activeIds[i];
    //     }

    //     return (total, resultIds);
    // }

    function getRedeemable(
        address _user,
        uint256 offset,
        uint256 limit
    ) 
        external 
        view 
        returns (uint256 total, uint256[] memory ids) 
    {
        // Получаем ссылку на общий список транзакций для _user
        uint256[] memory allIds = recipients[_user];
        
        // Вычисляем фактические границы итерации
        // offset — с какого индекса начинать
        // limit — сколько элементов максимум обрабатывать
        uint256 length = allIds.length;

        // Если offset >= length, значит, нам нечего обрабатывать
        if (offset >= length) {
            return (0, new uint256[](0));
        }

        // Определяем фактический «конец» итерации
        uint256 end = offset + limit;
        if (end > length) {
            end = length;
        }

        // Считаем, сколько реально элементов мы будем смотреть
        uint256 sliceSize = end - offset;

        // Создаем временный массив для хранения айдишников, которые подходят
        uint256[] memory activeIds = new uint256[](sliceSize);
        uint256 count; // счётчик подходящих транзакций

        for (uint256 i = offset; i < end; i++) {
            uint256 id = allIds[i];
            Transaction storage txn = transactions[id];
            
            // Проверяем условие: срок вышел и amount > 0
            if (txn.deadline <= block.timestamp && txn.amount > 0) {
                total += txn.amount;
                activeIds[count] = id;
                count++;
            }
        }

        // Создаем итоговый массив resultIds нужного размера (count)
        uint256[] memory resultIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            resultIds[i] = activeIds[i];
        }

        return (total, resultIds);
    }


    function setBlockTime(
        uint256 _newBlockTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        blocktime = _newBlockTime;
    }

    function setfeeForGasUsdt(
        uint256 _feeForGasUsdt,
        address _feeAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeForGasUsdt = _feeForGasUsdt;
        feeAddress = _feeAddress;
    }

    function setFeePercent(
        uint256 _feePercent
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feePercent = _feePercent;
    }
}