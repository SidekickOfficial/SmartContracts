const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BoostSideKick contract tests", function () {
  let BoostSideKick, boostSideKick;
  let USDT, usdt;
  let sidekickWallet, admin, user1, user2, user3, agent, newSidekick;
  const oneUsd = 1000000000000000000n;
  const initialBalance = 100000000000000000000000n;
  const boostAmount = 1000n * oneUsd;

  before(async () => {
    [sidekickWallet, admin, user1, user2, user3, agent, newSidekick] = await ethers.getSigners();

    USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy();
    await usdt.deployed();

    BoostSideKick = await ethers.getContractFactory("BoostSideKick");
    boostSideKick = await BoostSideKick.deploy(sidekickWallet.address, usdt.address);
    await boostSideKick.deployed();
  });

  it("Should deploy and have correct initial values", async function () {
    expect(await boostSideKick.sidekickWallet()).to.equal(sidekickWallet.address);
    expect(await boostSideKick.sidekickPercentage()).to.equal(5);
    expect(await boostSideKick.totalLeaderboardAmount()).to.equal(0);
    expect(await boostSideKick.totalAmount()).to.equal(0);
    expect(await boostSideKick.isPause()).to.equal(false);
  });

  it("Should mint and approve USDT for users", async function () {
    for (const user of [user1, user2, user3, agent]) {
      await usdt.connect(user).mint();
      const bal = await usdt.balanceOf(user.address);
      expect(bal).to.equal(initialBalance);
      await usdt.connect(user).approve(boostSideKick.address, initialBalance);
      await usdt.connect(user).approve(sidekickWallet.address, initialBalance);
    }
  });

  it("Should revert boost if paused", async function () {
    await boostSideKick.connect(sidekickWallet).changePause();
    expect(await boostSideKick.isPause()).to.equal(true);

    await expect(
      boostSideKick.connect(user1).boost(user2.address, agent.address, boostAmount, "boost-1")
    ).to.be.revertedWithCustomError(boostSideKick, 'Paused');

    await boostSideKick.connect(sidekickWallet).changePause();
    expect(await boostSideKick.isPause()).to.equal(false);
  });

  it("Should create a boost and reset Leaderboard" , async function () {
    await expect(boostSideKick.connect(user1).boost(user2.address, agent.address, 0, "boost-1")).to.be.revertedWithCustomError(boostSideKick, 'ZeroAmount');
    await expect(boostSideKick.connect(user1).boost(ethers.constants.AddressZero, agent.address, boostAmount, "boost-1")).to.be.revertedWithCustomError(boostSideKick, 'ZeroAddress');
    await expect(boostSideKick.connect(user1).boost(user2.address, ethers.constants.AddressZero, boostAmount, "boost-1")).to.be.revertedWithCustomError(boostSideKick, 'ZeroAddress');
    await expect(boostSideKick.connect(user1).boost(user2.address, agent.address, boostAmount, "")).to.be.revertedWithCustomError(boostSideKick, 'BoostIdEmpty');
   
    await expect(() =>
      boostSideKick.connect(user1).boost(user2.address, agent.address, boostAmount, "boost-1")
    ).to.changeTokenBalances(usdt, [user1, boostSideKick, sidekickWallet], [-1000n * oneUsd, 950n * oneUsd, 50n * oneUsd]);

    await expect(boostSideKick.connect(user1).boost(user2.address, agent.address, boostAmount, "boost-1")).to.be.revertedWithCustomError(boostSideKick, 'BoostIdAlreadyUsed');

    const count = await boostSideKick.count();
    expect(count).to.equal(1);

    const boostInfo = await boostSideKick.boosts(count);
    expect(boostInfo.recipientWallet).to.equal(user2.address);
    expect(boostInfo.senderWallet).to.equal(user1.address);
    expect(boostInfo.agentWallet).to.equal(agent.address);
    expect(boostInfo.amount).to.equal(boostAmount);

    const totalLeaderboardAmount = await boostSideKick.totalLeaderboardAmount();
    const totalAmount = await boostSideKick.totalAmount();
    expect(totalLeaderboardAmount).to.equal(950n * oneUsd);
    expect(totalAmount).to.equal(1000n * oneUsd);
  });

  it("Should create multiple boosts", async function () {
    await expect(() =>
      boostSideKick.connect(user2).boost(user3.address, agent.address, boostAmount, "boost-2")
    ).to.changeTokenBalances(usdt, [user2, boostSideKick, sidekickWallet], [-1000n * oneUsd, 950n * oneUsd, 50n * oneUsd]);

    await expect(() =>
      boostSideKick.connect(user3).boost(user1.address, agent.address, boostAmount, "boost-3")
    ).to.changeTokenBalances(usdt, [user3, boostSideKick, sidekickWallet], [-1000n * oneUsd, 950n * oneUsd, 50n * oneUsd]);

    const count = await boostSideKick.count();
    expect(count).to.equal(3);
  });

  it("Should getBoostsInTimeRange", async function () {
    const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
    await boostSideKick.getBoostsInTimeRange(currentTime, currentTime)
  });

  it("Should revert payTo if not admin", async function () {
    const amounts = [17500n * oneUsd, 17500n * oneUsd];

    const recipients = [user1.address, user2.address];

    await expect(boostSideKick.connect(user1).payTo([user1.address],[oneUsd]))
      .to.be.revertedWithCustomError(boostSideKick, 'NotAdmin');
  });

  it("Should payTo multiple recipients", async function () {
    const amounts = [100n * oneUsd, 200n * oneUsd];
    const recipients = [user1.address, user2.address];

    await expect(() =>
      boostSideKick.connect(sidekickWallet).payTo(recipients, amounts)
    ).to.changeTokenBalances(
      usdt,
      [boostSideKick, user1, user2],
      [-(100n * oneUsd + 200n * oneUsd), 100n * oneUsd, 200n * oneUsd]
    );

    const boostsWinnerUser1 = await boostSideKick.boostsWinners(user1.address);
    const boostsWinnerUser2 = await boostSideKick.boostsWinners(user2.address);
    expect(boostsWinnerUser1).to.equal(100n * oneUsd);
    expect(boostsWinnerUser2).to.equal(200n * oneUsd);
  });

  it("Should revert payTo if inputs length not match", async function () {
    await expect(
      boostSideKick.connect(sidekickWallet).payTo([user1.address, user2.address], [oneUsd])
    ).to.be.revertedWithCustomError(boostSideKick, 'LessInputs');
  });

  it("Should revert getBoostsInTimeRange with wrong time", async function () {
    const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
    await expect(
      boostSideKick.getBoostsInTimeRange(currentTime + 100, currentTime)
    ).to.be.revertedWithCustomError(boostSideKick, 'TimeError');
  });

  it("Should return boosts in time range", async function () {
    await usdt.connect(user1).approve(boostSideKick.address, initialBalance);
    await usdt.connect(user1).approve(sidekickWallet.address, initialBalance);
    await expect(() =>
      boostSideKick.connect(user1).boost(user2.address, agent.address, boostAmount, "boost-latest")
    ).to.changeTokenBalances(usdt, [user1, boostSideKick, sidekickWallet], [-1000n * oneUsd, 950n * oneUsd, 50n * oneUsd]);

    const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
    const boostsInRange = await boostSideKick.getBoostsInTimeRange(currentTime - 10, currentTime + 10);
    expect(boostsInRange.length).to.be.gte(1);
    expect(boostsInRange[boostsInRange.length - 1].boostId).to.equal("boost-latest");
  });

  it("Should revert resetLeaderboard if balance not zero and if not call admin", async function () {
    const contractBalance = await usdt.balanceOf(boostSideKick.address);
    expect(contractBalance).to.be.gt(0);

    await expect(boostSideKick.connect(user1).resetLeaderboard()).revertedWithCustomError(
      boostSideKick,
      "NotAdmin"
    );

    await expect(
      boostSideKick.connect(sidekickWallet).resetLeaderboard()
    ).to.be.revertedWithCustomError(boostSideKick, 'BalanceNotZero');

  });

  it("Should reset Leaderboard by admin", async function () {
    let bal = await usdt.balanceOf(boostSideKick.address);
    expect(bal).to.equal(3500000000000000000000n);

    const amounts = [1750n * oneUsd, 1750n * oneUsd];

    const recipients = [user1.address, user2.address];

    await expect(() =>
      boostSideKick.connect(sidekickWallet).payTo(recipients, amounts)
    ).to.changeTokenBalances(
      usdt,
      [boostSideKick, user1, user2],
      [-(1750n * oneUsd + 1750n * oneUsd), 1750n * oneUsd, 1750n * oneUsd]
    );

     await boostSideKick.connect(sidekickWallet).resetLeaderboard();

    bal = await usdt.balanceOf(boostSideKick.address);
    expect(bal).to.equal(0);
  });

  it("Should changeSidekickPercentage by admin", async function () {
    await expect(
      boostSideKick.connect(user1).changeSidekickPercentage(10)
    ).to.be.revertedWithCustomError(boostSideKick, 'NotAdmin');

    await boostSideKick.connect(sidekickWallet).changeSidekickPercentage(10);
    expect(await boostSideKick.sidekickPercentage()).to.equal(10);
  });

  it("Should changePause by admin and revert if not admin", async function () {
    await expect(boostSideKick.connect(user1).changePause()).revertedWithCustomError(
      boostSideKick,
      "NotAdmin"
    );

    await boostSideKick.connect(sidekickWallet).changePause();
    expect(await boostSideKick.isPause()).to.equal(true);
    await boostSideKick.connect(sidekickWallet).changePause();
    expect(await boostSideKick.isPause()).to.equal(false);
  });

  it("Should changeSidekickWallet by admin", async function () {
    await expect(
      boostSideKick.connect(user1).changeSidekickWallet(newSidekick.address)
    ).to.be.revertedWithCustomError(boostSideKick, 'NotAdmin');

    await expect(
      boostSideKick.connect(sidekickWallet).changeSidekickWallet(ethers.constants.AddressZero)
    ).to.be.revertedWithCustomError(boostSideKick, 'ZeroAddress');

    await boostSideKick.connect(sidekickWallet).changeSidekickWallet(newSidekick.address);
    expect(await boostSideKick.sidekickWallet()).to.equal(newSidekick.address);
  });

});
