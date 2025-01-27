const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Escrow contract tests", function () {
  let Escrow, escrow;
  let USDT, usdt;
  let defaultAdmin, admin, user1, user2, user3, user4, user5, user6;
  const oneUsd = 1000000000000000000n;
  const initialBalance = 100000000000000000000000n;
  const feeForGasUsdt = oneUsd;

  before(async () => {
    [defaultAdmin, admin, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
    USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy();
    await usdt.deployed();
    Escrow = await ethers.getContractFactory("Escrow", defaultAdmin);
    escrow = await Escrow.deploy(
      usdt.address,
      defaultAdmin.address,
      admin.address,
      1,
      feeForGasUsdt,
      0
    );
    await escrow.deployed();
  });

  it("Should be deployed Escrow and USDT contracts", async function () {
    expect(escrow.address).to.be.properAddress;
    expect(usdt.address).to.be.properAddress;
  });

  it("Should mint and approve usdt to users", async function () {
    for (const user of [user1, user2, user3, user4, user5]) {
      await usdt.connect(user).mint();
      const balanceUser = await usdt.balanceOf(user.address);
      expect(balanceUser).to.equal(initialBalance);
      await usdt.connect(user).approve(escrow.address, initialBalance);
    }
  });

  it("Should create transactions in escrow", async function () {
    const _amount = 200000000000000000000n;
    const _uuid = '1-c';
    let count = 1;
    const statusInProgress = 0;

    await expect(escrow.connect(user1).createTransaction(user1.address, 0, _uuid, user4.address, 0)).to.be.revertedWithCustomError(escrow, 'ZeroAmount');
    await expect(escrow.connect(user1).createTransaction(ethers.constants.AddressZero, _amount, _uuid, user4.address, 0)).to.be.revertedWithCustomError(escrow, 'ZeroAddress');
    await expect(escrow.connect(user1).createTransaction(user1.address, _amount, _uuid, ethers.constants.AddressZero, 500)).to.be.revertedWithCustomError(escrow, 'ZeroAddress');
    await expect(escrow.connect(user1).createTransaction(user1.address, _amount, "", user4.address, 0)).to.be.revertedWithCustomError(escrow, 'EmptyChallengeId');
    await expect(escrow.connect(user1).createTransaction(user1.address, _amount, _uuid, user4.address, _amount + _amount)).to.be.revertedWithCustomError(escrow, 'ServerAmountExceedsLimit');

    await expect(() =>
      escrow.connect(user1).createTransaction(user1.address, _amount, _uuid, user4.address, 0)
    ).to.changeTokenBalances(usdt, [user1, escrow], [-_amount, _amount]);

    await expect(escrow.connect(user1).createTransaction(user1.address, _amount, _uuid, user4.address, 0)).to.be.revertedWithCustomError(escrow, 'DuplicateChallengeId');

    let txUser1 = await escrow.transactions(count);
    expect(txUser1.status).to.equal(statusInProgress);
    expect(txUser1.amount).to.equal(_amount);

    let txByChallenge = await escrow.getTransactionByChallengeId(_uuid);
    expect(txByChallenge.amount).to.equal(_amount);

    count++;
    await expect(() =>
      escrow.connect(user2).createTransaction(user3.address, _amount, _uuid + 'v', user4.address, 0)
    ).to.changeTokenBalances(usdt, [user2, escrow], [-_amount, _amount]);

    let txUser2 = await escrow.transactions(count);
    expect(txUser2.status).to.equal(statusInProgress);
    expect(txUser2.amount).to.equal(_amount);

    count++;
    await expect(() =>
      escrow.connect(user3).createTransaction(user4.address, _amount, _uuid + 'g', user4.address, 0)
    ).to.changeTokenBalances(usdt, [user3, escrow], [-_amount, _amount]);

    let txUser3 = await escrow.transactions(count);
    expect(txUser3.status).to.equal(statusInProgress);
    expect(txUser3.amount).to.equal(_amount);
  });

  it("Should not allow non-admin to call decisionDeal and test revert conditions", async function () {
    const idTx = 1;
    await expect(escrow.decisionDeal(idTx, 2)).to.be.reverted;
    await expect(escrow.connect(admin).decisionDeal(idTx, 1)).to.be.revertedWithCustomError(escrow, 'NotStatus');
  });

  it("Should allow admin to decisionDeal to Refund", async function () {
    const idTx = 1;
    await escrow.connect(admin).decisionDeal(idTx, 2);
    const txUser1 = await escrow.transactions(idTx);
    expect(txUser1.status).to.be.equal(2);
  });

  it("Should change block time by defaultAdmin", async function () {
    const lastBlockTime = await escrow.blocktime();
    expect(lastBlockTime).to.equal(1);
    const newBlockTime = 8600;
    await expect(escrow.connect(admin).setBlockTime(newBlockTime)).to.be.reverted;
    await escrow.connect(defaultAdmin).setBlockTime(newBlockTime);
    const newBlockTimeFromContract = await escrow.blocktime();
    expect(newBlockTimeFromContract).to.be.equal(newBlockTime);
  });

  it("Should process payment in Refund scenario", async function () {
    const idTx = 1;
    const _amount = 200000000000000000000n;
    await expect(escrow.processPayment(idTx)).to.be.reverted;
    await expect(() => escrow.connect(admin).processPayment(idTx))
      .to.changeTokenBalances(usdt, [user1, escrow], [_amount, -_amount]);
    const updatedTx = await escrow.transactions(idTx);
    expect(updatedTx.amount).to.equal(0);
    expect(updatedTx.status).to.equal(1);
  });

  it("Should revert processPayment if already processed (NotStatus)", async function () {
    const idTx = 1;
    await expect(escrow.connect(admin).processPayment(idTx)).to.be.revertedWithCustomError(escrow, 'NotStatus');
  });

  it("Should test processPayment for normal (non-refund) flow", async function () {
    await escrow.connect(defaultAdmin).setBlockTime(1);
    const _amount = 1000n * oneUsd;
    const _uuid = 'unique-uuid';
    await expect(() =>
      escrow.connect(user2).createTransaction(user3.address, _amount, _uuid, user5.address, 100n * oneUsd)
    ).to.changeTokenBalances(usdt, [user2, escrow], [-_amount, _amount]);

    const count = await (await escrow.getTransactionByChallengeId(_uuid)).id;
    await expect(escrow.connect(admin).processPayment(count)).to.be.revertedWithCustomError(escrow, 'NotTime');
    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");
    await expect(() => escrow.connect(admin).processPayment(count))
      .to.changeTokenBalances(usdt, [user3, user5, defaultAdmin, escrow], [899n * oneUsd, 100n * oneUsd, oneUsd, -_amount]);
    const txAfter = await escrow.transactions(count);
    expect(txAfter.amount).to.equal(0);
    expect(txAfter.status).to.equal(1);
  });

  it("Should test setfeeForGasUsdt and setFeePercent", async function () {
    const newFeeForGas = 2n * oneUsd;
    await expect(escrow.connect(admin).setfeeForGasUsdt(newFeeForGas, user6.address)).to.be.reverted;
    await escrow.connect(defaultAdmin).setfeeForGasUsdt(newFeeForGas, user6.address);
    const newPercent = 10;
    await expect(escrow.connect(admin).setFeePercent(newPercent)).to.be.reverted;
    await escrow.connect(defaultAdmin).setFeePercent(newPercent);
    const contractFeeForGas = await escrow.feeForGasUsdt();
    const contractFeeAddress = await escrow.feeAddress();
    const contractFeePercent = await escrow.feePercent();
    expect(contractFeeForGas).to.equal(newFeeForGas);
    expect(contractFeeAddress).to.equal(user6.address);
    expect(contractFeePercent).to.equal(newPercent);
  });

  it("Should test getTotal()", async function () {
    const _amount = 500n * oneUsd;
    const _uuid = 'test-total';

    let totalCustomer = await escrow.getTotal(user1.address, 0, 0, 1);
    expect(totalCustomer).to.equal(0);
    await escrow.connect(user1).createTransaction(user2.address, _amount, _uuid, user4.address, 0);
    const txId = (await escrow.getTransactionByChallengeId(_uuid)).id;

    totalCustomer = await escrow.getTotal(user1.address, 0, 30, 1);
    expect(totalCustomer).to.equal(0);
    totalCustomer = await escrow.getTotal(user1.address, 0, 0, 10);
    expect(totalCustomer).to.equal(_amount);
    totalCustomer = await escrow.getTotal(user1.address, 0, 0, 1);
    expect(totalCustomer).to.equal(0);
  
    totalCustomer = await escrow.getTotal(user1.address, 0, 10, 10);
    expect(totalCustomer).to.equal(0);
 
    let totalRecipient = await escrow.getTotal(user2.address, 1, 0, 15);
    expect(totalRecipient).to.equal(_amount);

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");
    await escrow.connect(admin).processPayment(txId);
    
    totalCustomer = await escrow.getTotal(user1.address, 0, 0 , 20);
    expect(totalCustomer).to.equal(0);
   
    totalRecipient = await escrow.getTotal(user2.address, 1,0 , 50);
    expect(totalRecipient).to.equal(0);
  });

  it("Should test getRedeemable()", async function () {
    const _amount = 300n * oneUsd;
    const _uuid = 'redeem-test';
    await escrow.connect(user2).createTransaction(user2.address, _amount, _uuid, user4.address, 0);
    const txInfo = await escrow.getTransactionByChallengeId(_uuid);
    const txId = txInfo.id;
    let [total, ids] = await escrow.getRedeemable(user2.address,0 , 15);
    expect(total).to.equal(0);
    expect(ids.length).to.equal(0);
    await ethers.provider.send("evm_increaseTime", [1000]);
    await ethers.provider.send("evm_mine");
    [total, ids] = await escrow.getRedeemable(user2.address, 0 , 25);
    expect(total).to.equal(_amount);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(txId);

    let [totalZero, idsZero] = await escrow.getRedeemable(user2.address,15, 15);
    expect(totalZero).to.equal(0);
    expect(idsZero.length).to.equal(0);

    [totalZero, idsZero] = await escrow.getRedeemable(user2.address,1, 1);
    expect(totalZero).to.equal(_amount);
    expect(idsZero.length).to.equal(1);
  });

  it("Should test transferERC20FromAdmin() and revert if not Admin", async function () {
    const amountToTransfer = 10n * oneUsd;
    await escrow.connect(defaultAdmin).transferERC20FromAdmin(user5.address, amountToTransfer);
    const balanceUser5 = await usdt.balanceOf(user5.address);
    expect(balanceUser5).to.be.gt(initialBalance);
    await expect(escrow.connect(user1).transferERC20FromAdmin(user5.address, amountToTransfer)).to.be.revertedWith('AccessControl: account 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc is missing role 0x0000000000000000000000000000000000000000000000000000000000000000');
  });

  it("Should test transferERC20From()", async function () {
    const initialBalanceUser2 = await usdt.balanceOf(user2.address);
    const initialBalanceUser6 = await usdt.balanceOf(user6.address);
    const initialBalanceUser3 = await usdt.balanceOf(user3.address);
    const transferAmount = 50n * 1000000000000000000n;
    await usdt.connect(user2).approve(escrow.address, transferAmount);
    await escrow.connect(user2).transferERC20From(user3.address, transferAmount);
    const finalBalanceUser2 = await usdt.balanceOf(user2.address);
    const finalBalanceUser6 = await usdt.balanceOf(user6.address);
    const finalBalanceUser3 = await usdt.balanceOf(user3.address);
    expect(finalBalanceUser2).to.equal(BigInt(initialBalanceUser2) - 50000000000000000000n);
    expect(finalBalanceUser6).to.equal(BigInt(initialBalanceUser6) + 2n * 1000000000000000000n);
    expect(finalBalanceUser3).to.equal(BigInt(initialBalanceUser3) + 48n * 1000000000000000000n);
  });

  it("Should revert decisionDeal if status not correct", async function () {
    const _amount = 200n * oneUsd;
    const _uuid = 'wrong-status';
    await escrow.connect(user1).createTransaction(user2.address, _amount, _uuid, user4.address, 0);
    const txInfo = await escrow.getTransactionByChallengeId(_uuid);
    await escrow.connect(admin).decisionDeal(txInfo.id, 2);
    await expect(escrow.connect(admin).decisionDeal(txInfo.id, 1)).to.be.revertedWithCustomError(escrow, 'NotStatus');
  });

  it("Should process payment with zero fees after the deadline and then revert when calling decisionDeal() due to the final transaction status.", async function () {
    const _amount = 200n * oneUsd;
    const _uuid = 'refund-time-check';
    await escrow.connect(defaultAdmin).setfeeForGasUsdt(0, user6.address);
    await escrow.connect(defaultAdmin).setFeePercent(0);

    await escrow.connect(user1).createTransaction(user2.address, _amount, _uuid, user4.address, 0);
    const txInfo = await escrow.getTransactionByChallengeId(_uuid);

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");
    await expect(() => escrow.connect(admin).processPayment(txInfo.id))
      .to.changeTokenBalances(usdt, [user1, escrow], [0, -_amount]);

    await expect(escrow.connect(admin).decisionDeal(txInfo.id, 1)).to.be.revertedWithCustomError(escrow, 'NotStatus');
  });

  it("Should processPayment revert with zero amount", async function () {
    const _uuid = 'refund-time-check2';
 
    await  expect(escrow.connect(user1).createTransaction(user2.address, 0, _uuid, user4.address, 0)).to.be.revertedWithCustomError(escrow, 'ZeroAmount');
    const txInfo = await escrow.getTransactionByChallengeId(_uuid);

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");

    await expect(escrow.connect(admin).processPayment(txInfo.id)).to.be.revertedWithCustomError(escrow, 'TransferError');
  });
});
