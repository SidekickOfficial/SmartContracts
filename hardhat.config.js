require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("dotenv").config();
const {
  ALCHEMY_API_KEY,
  DEFAULT_PRIVATE_KEY,
  ADMIN_PRIVATE_KEY,
  COINMARKETCAP,
  ETHERSCAN_API_KEY,
} = process.env;

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.14",
      },
      {
        version: "0.8.26",
      },
    ],
  },
  networks: {
    opbnb: {
      url: "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      accounts: [DEFAULT_PRIVATE_KEY, ADMIN_PRIVATE_KEY].filter(Boolean),
    },
  },
};