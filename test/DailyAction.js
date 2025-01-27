const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");

async function getCurrentBlockTimestamp() {
    const latestBlock = await ethers.provider.getBlock('latest');
    return latestBlock.timestamp;
}

async function setCurrentBlockTimestamp() {
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
}

describe("Tests DailyAction", function () {
  let DailyAction;
  let dailyAction;

  let defaultAdmin;

  let user1;
  let user2;
  let user3;
  let user4;
  let user5;
  let user6;
  let user7;
  let user8;
  let user9;
  let user10;


  before(async () => {
    [defaultAdmin, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10]= await ethers.getSigners();


    DailyAction = await ethers.getContractFactory(
      "DailyAction",
      defaultAdmin
    );

    dailyAction = await DailyAction.deploy();
    await dailyAction.deployed();


  });

  it("Should be deployed DailyAction contract", async function () {
    expect(dailyAction.address).to.be.properAddress;
  });

  it("Should allow users to perform daily action and track unique users correctly", async function () {
    const initialTimestamp = await getCurrentBlockTimestamp();
  
    await dailyAction.connect(user1).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user2).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user3).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user4).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user5).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user6).performDailyAction();

    const endTimestamp = await getCurrentBlockTimestamp();
    const total = await dailyAction.getUniqueUsersInPeriod(initialTimestamp, endTimestamp);


    expect(total).to.equal(6);
});

it("Should revert if user tries to perform action within 24 hours", async function () {
    await dailyAction.connect(user1).performDailyAction();
    await expect(dailyAction.connect(user1).performDailyAction()).to.be.revertedWithCustomError(dailyAction,
        'TimeError',
      );
});

it("Should correctly count unique users over multiple days", async function () {
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user1).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user2).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user3).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user4).performDailyAction();

    const startTimestamp = await getCurrentBlockTimestamp();

    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user5).performDailyAction();
    await setCurrentBlockTimestamp(); // 1 day
    await dailyAction.connect(user6).performDailyAction();

    const endTimestamp = await getCurrentBlockTimestamp();
    const total = await dailyAction.getUniqueUsersInPeriod(startTimestamp - 3 * 86400, endTimestamp);

    expect(total).to.equal(6);
    
});

it("Should get Unique Users In Period", async function () {
  const startTimestamp = await getCurrentBlockTimestamp();
  const endTimestamp = await getCurrentBlockTimestamp();
  const total = await dailyAction.getUniqueUsersInPeriod(startTimestamp - 5 * 86400, endTimestamp);

  expect(total).to.equal(6);
});

it("Should return zero if the start time is after the end time", async function () {
    const currentTimestamp = await getCurrentBlockTimestamp();
    await expect(dailyAction.getUniqueUsersInPeriod(currentTimestamp + 1000, currentTimestamp)).to.be.revertedWithCustomError(dailyAction,"TimeError");
});
})
