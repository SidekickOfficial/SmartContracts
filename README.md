# Escrow

## Project documentation

[Blockchain documentation](./docs/README.md)

## Usage

### Pre Requisites

add environment variables to in .env

Before running any command, make sure to install dependencies:

```sh
npm install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
npx hardhat compile
```

### Coverage

Run the tests with coverage

```sh
npx hardhat coverage
```

### Test

Run the tests and get a report of gas costs for polygon mainnet, set hardhat.config in gasReporter `enabled` to true

```sh
npx hardhat test
```

### Deploy and Validate a contract with etherscan contract to network (requires private key and ETHERSCAN_API_KEY in .env)

```
npx hardhat deploy  --network opbnb
```

## Thanks

avtor: [SideQuest]()

## License

MIT
