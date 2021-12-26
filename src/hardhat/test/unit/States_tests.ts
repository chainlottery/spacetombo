import chai, { expect } from 'chai';
import "@appliedblockchain/chainlink-plugins-fund-link";
import { LotteryEvent, LotteryState, Periods } from "../../types/Lottery"
import { lotteryFixture, getSignersIdentity, dummyShip } from '../utils';
import { BigNumber } from '@ethersproject/bignumber';
import { network } from "hardhat";
chai.use(require('chai-bn')(BigNumber));

// To run a test: 
// yarn hardhat test ./src/hardhat/test/FILENAME

describe('Lottery Unit Tests', async function () {
    it('State check/WaitingForLINK', async () => {
        // Generate a new lottery and keep a reference to its parameters
        const [ lottery, lotteryParams ] = await lotteryFixture();
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.WaitingForLINK);
        
        // Verify link amount to pay
        const linkFeesToPay = lotteryParams.vrfData.fee.mul(BigNumber.from(lotteryParams.events.length));
        const linkFeesToPayFromContract = await lottery.getLINKAmountRequired();
        expect(linkFeesToPay).to.be.equal(linkFeesToPayFromContract);
    });
    
    it('State check/WaitingForParticipationPeriod', async () => {
        // Generate a new lottery
        const [ lottery ] = await lotteryFixture();
        const { deployer } = await getSignersIdentity();
        
        const linkAmount = await deployer.link.balanceOf(deployer.signer.address);
        // Using the local node, some LINK should have been funded to the deployer
        expect(linkAmount).to.be.bignumber.greaterThan(BigNumber.from(0));
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.WaitingForLINK);
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.WaitingForParticipationPeriod);
    });
    
    it('State check/OngoingParticipationPeriod', async () => {
        // Generate a new lottery
        const [ lottery ] = await lotteryFixture();
        const { deployer } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.WaitingForParticipationPeriod);
        
        // Mine a new block and set its timestamp to the beginning of the participation period
        const periods: Periods = await lottery.periods();
        await network.provider.send("evm_mine", [periods.beginningOfParticipationPeriod.toNumber()]);
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.OngoingParticipationPeriod);
    });
    
    it('State check/No participant', async () => {
        // Generate a new lottery
        const [ lottery ] = await lotteryFixture();
        const { deployer } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // Mine a new block and set its timestamp to the beginning of the preparation period
        const periods: Periods = await lottery.periods();
        await network.provider.send("evm_mine", [periods.endOfParticipationPeriod.toNumber()]);
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.Complete);
    });
    
    it('State check/At least one participant', async () => {
        // Generate a new lottery
        const [ lottery ] = await lotteryFixture();
        const { deployer, p1 } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // Mine a new block and set its timestamp to the beginning of the participation period
        const periods: Periods = await lottery.periods();
        await network.provider.send("evm_mine", [periods.beginningOfParticipationPeriod.toNumber()]);
        
        // P1 participates
        const entryPrice: BigNumber = await lottery.getPriceToParticipate();
        await p1.lottery.participate(dummyShip, { value: entryPrice });
        
        // Mine a new block and set its timestamp to the beginning of the preparation period
        await network.provider.send("evm_mine", [periods.endOfParticipationPeriod.toNumber()]);
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.OngoingPreparationPeriod);
    });
    
    it('State check/WaitingForNextEvent', async () => {
        // Generate a new lottery
        const [ lottery ] = await lotteryFixture();
        const { deployer, p1 } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // Mine a new block and set its timestamp to the beginning of the participation period
        const periods: Periods = await lottery.periods();
        await network.provider.send("evm_mine", [periods.beginningOfParticipationPeriod.toNumber()]);
        
        // P1 participates
        const entryPrice: BigNumber = await lottery.getPriceToParticipate();
        await p1.lottery.participate(dummyShip, { value: entryPrice });
        
        // Mine a new block and set its timestamp to the end of the preparation period
        await network.provider.send("evm_mine", [periods.endOfPreparationPeriod.toNumber()]);
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.WaitingForNextEvent);
    });
    
    it('State check/Complete', async () => {
        // Generate a new lottery
        const [ lottery,, localChain ] = await lotteryFixture();
        const { deployer, p1 } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // Mine a new block and set its timestamp to the beginning of the participation period
        const periods: Periods = await lottery.periods();
        await network.provider.send("evm_mine", [periods.beginningOfParticipationPeriod.toNumber()]);
        
        // P1 participates
        const entryPrice: BigNumber = await lottery.getPriceToParticipate();
        await p1.lottery.participate(dummyShip, { value: entryPrice });
        
        // Mine a new block and set its timestamp to the end of the preparation period
        await network.provider.send("evm_mine", [periods.endOfPreparationPeriod.toNumber()]);
        
        const remainingEvents = await lottery.remainingEventsCount();
        for (let i = 0; i < remainingEvents.toNumber(); i++) {
            const event: LotteryEvent = await lottery.events(i);
            
            // Mine a new block and set its timestamp to the beginning of the event
            await network.provider.send("evm_mine", [event.timestamp.toNumber()]);
            
            // Trigger the event
            // Wait for 1 confirmation as per chainlink unit tests examples
            // See: https://github.com/smartcontractkit/hardhat-starter-kit/blob/main/test/unit/RandomNumberConsumer_unit_test.js
            const transaction = await lottery.triggerNextEvent();
            const tx_receipt = await transaction.wait(1);
            const requestId = tx_receipt.events![2].topics[1];
            expect(requestId).to.not.be.null;
            
            if(localChain) {
                // Local node - Fake oracle callback
                await localChain.vrfFulfillRandomness(requestId, lottery.address);
            } else {
                // Testnet
                // TODO - Wait for oracle callback
                // TODO - See https://github.com/smartcontractkit/hardhat-starter-kit/blob/main/test/integration/RandomNumberConsumer_int_test.js
            }
        }
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.WaitingForFundsRelease);
        
        await lottery.triggerCompletion();
        
        // State check
        expect(await lottery.getState()).to.be.equal(LotteryState.Complete);
    });
});