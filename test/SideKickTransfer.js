const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SideKickTransfer", function () {
  let SideKickTransfer, sideKickTransfer;
  let USDT, usdt;
  let owner, adminWallet, user1, user2, user3;
  const initialMint = ethers.utils.parseEther("1000000");
  const feePercentage = 500;

  before(async () => {
    [owner, adminWallet, user1, user2, user3] = await ethers.getSigners();

    USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy();
    await usdt.deployed();

    await usdt.connect(user1).mint();
    await usdt.connect(user2).mint();

    SideKickTransfer = await ethers.getContractFactory("SideKickTransfer");
    sideKickTransfer = await SideKickTransfer.deploy(usdt.address, adminWallet.address, feePercentage);
    await sideKickTransfer.deployed();

    await usdt.connect(user1).approve(sideKickTransfer.address, initialMint);
    await usdt.connect(user2).approve(sideKickTransfer.address, initialMint);
  });

  it("Should have correct initial values", async function () {
    expect(await sideKickTransfer.adminWallet()).to.equal(adminWallet.address);
    expect(await sideKickTransfer.feePercentage()).to.equal(feePercentage);
    expect(await sideKickTransfer.totalSentUSDT()).to.equal(0);
    expect(await sideKickTransfer.uniqueWalletCount()).to.equal(0);
    expect(await sideKickTransfer.totalTransfers()).to.equal(0);
  });

  it("Should revert if non-owner tries to set fee", async function () {
    await expect(sideKickTransfer.connect(user1).setFeePercentage(1000))
      .to.be.revertedWithCustomError(sideKickTransfer, 'NotOwner');
  });

  it("Should revert if feePercentage > 10000", async function () {
    await expect(sideKickTransfer.connect(adminWallet).setFeePercentage(10001))
      .to.be.revertedWithCustomError(sideKickTransfer, 'InvalidFeePercentage');
  });

  it("Should allow owner to change feePercentage", async function () {
    await sideKickTransfer.connect(adminWallet).setFeePercentage(200);
    expect(await sideKickTransfer.feePercentage()).to.equal(200);

    await sideKickTransfer.connect(adminWallet).setFeePercentage(feePercentage);
  });

  it("Should revert sendUSDT if recipient is zero address", async function () {
    await expect(sideKickTransfer.connect(user1).sendUSDT(ethers.constants.AddressZero, ethers.utils.parseEther("100")))
      .to.be.revertedWithCustomError(sideKickTransfer, 'InvalidRecipientAddress');
  });

  it("Should revert sendUSDT if amount = 0", async function () {
    await expect(sideKickTransfer.connect(user1).sendUSDT(user2.address, 0))
      .to.be.revertedWithCustomError(sideKickTransfer, 'InvalidAmount');
  });

  it("Should correctly send USDT and charge fee", async function () {
    const amount = ethers.utils.parseEther("100");

    const initialUser1Balance = await usdt.balanceOf(user1.address);
    const initialUser2Balance = await usdt.balanceOf(user2.address);
    const initialAdminBalance = await usdt.balanceOf(adminWallet.address);
    const initialTotalSent = await sideKickTransfer.totalSentUSDT();
    const initialUniqueCount = await sideKickTransfer.uniqueWalletCount();
    const initialTotalTransfers = await sideKickTransfer.totalTransfers();
 
    await expect(sideKickTransfer.connect(user1).sendUSDT(user2.address, amount))
      .to.emit(sideKickTransfer, 'TransferWithFee');

    const finalUser1Balance = await usdt.balanceOf(user1.address);
    const finalUser2Balance = await usdt.balanceOf(user2.address);
    const finalAdminBalance = await usdt.balanceOf(adminWallet.address);
    const finalTotalSent = await sideKickTransfer.totalSentUSDT();
    const finalUniqueCount = await sideKickTransfer.uniqueWalletCount();
    const finalTotalTransfers = await sideKickTransfer.totalTransfers();

    expect(finalUser1Balance).to.equal(initialUser1Balance.sub(amount));
    expect(finalUser2Balance).to.equal(initialUser2Balance.add(amount.sub(amount.mul(feePercentage).div(10000))));
    expect(finalAdminBalance).to.equal(initialAdminBalance.add(amount.mul(feePercentage).div(10000)));
    expect(finalTotalSent).to.equal(initialTotalSent.add(amount));
    expect(finalUniqueCount).to.equal(initialUniqueCount.add(1));
    expect(finalTotalTransfers).to.equal(initialTotalTransfers.add(1));
    expect(await sideKickTransfer.uniqueWallets(user2.address)).to.equal(true);
  });

  it("Should not increase uniqueWalletCount for known recipient", async function () {
    const amount = ethers.utils.parseEther("500");
    const initialUniqueCount = await sideKickTransfer.uniqueWalletCount();

    await sideKickTransfer.connect(user1).sendUSDT(user2.address, amount);
    const finalUniqueCount = await sideKickTransfer.uniqueWalletCount();
    expect(finalUniqueCount).to.equal(initialUniqueCount);
  });

  it("Should allow another recipient and increase unique count", async function () {
    const amount = ethers.utils.parseEther("200");
    const initialUniqueCount = await sideKickTransfer.uniqueWalletCount();

    await sideKickTransfer.connect(user1).sendUSDT(user3.address, amount);
    const finalUniqueCount = await sideKickTransfer.uniqueWalletCount();
    expect(finalUniqueCount).to.equal(initialUniqueCount.add(1));
  });

  it("Should send with zero fee", async function () {
    const amount = 200000000000000000000n
    await sideKickTransfer.connect(adminWallet).setFeePercentage(0);

    await expect(() =>
      sideKickTransfer.connect(user1).sendUSDT(user2.address, amount)
    ).to.changeTokenBalances(usdt, [user1, sideKickTransfer], [-amount, 0]);
  });
});
