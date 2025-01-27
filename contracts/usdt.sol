// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract USDT is ERC20, ERC20Burnable {
    constructor() ERC20("USDT", "USDT") {}

    function mint() public {
        _mint(msg.sender, 100000000000000000000000);
    }
}
