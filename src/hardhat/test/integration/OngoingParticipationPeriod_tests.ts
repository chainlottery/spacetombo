import chai, { expect } from 'chai';
import "@appliedblockchain/chainlink-plugins-fund-link";
import { Periods, Ship } from "../../types/Lottery"
import { getDefaultParameters, lotteryFixture, getSignersIdentity, SignerIdentity, dummyShip } from '../utils';
import { BigNumber } from '@ethersproject/bignumber';
import { network, ethers } from "hardhat";
chai.use(require('chai-bn')(BigNumber));

// To run a test: 
// yarn hardhat test ./src/hardhat/test/FILENAME

describe('Lottery Unit Tests', async function () {
    it('OngoingParticipationPeriod/Entry price', async () => {
        // Generate a new lottery and keep a reference to its parameters
        const lotteryParameters = await getDefaultParameters();
        const [ lottery,,,, priceConsumer ] = await lotteryFixture(lotteryParameters);
        const { deployer, p1 } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // Jump to participation period
        const periods: Periods = await lottery.periods();
        await network.provider.send("evm_mine", [periods.beginningOfParticipationPeriod.toNumber()]);
        
        const priceConsumerPrice = await priceConsumer.getLatestPrice();
        
        // Price consumer valid price check
        expect(priceConsumerPrice).to.be.bignumber.greaterThan(BigNumber.from(0));
        
        // Entry price check
        const latestPriceAdjusted = priceConsumerPrice.mul(BigNumber.from(10)
        .pow(BigNumber.from(lotteryParameters.chainCurrencyDecimals)
        .sub(await priceConsumer.decimals())));
        
        const expectedPrice = BigNumber.from(10).pow(BigNumber.from(lotteryParameters.chainCurrencyDecimals).mul(2))
        .mul(BigNumber.from(lotteryParameters.ticketPriceUsd))
        .div(latestPriceAdjusted)
        .div(BigNumber.from(10).pow(BigNumber.from(2 /* constant value lottery.ticketPriceDecimals from Lottery.sol */)))
        
        const entryPrice: BigNumber = await lottery.getPriceToParticipate();
        expect(expectedPrice).to.be.bignumber.equal(entryPrice);
        
        // Ensure participation with anything lower than entryPrice is rejected
        await expect(p1.lottery.participate(dummyShip, { value: entryPrice.sub(1) }))
        .to.be.revertedWith("Not enough funds");
        
        // Check lottery balance is at 0
        expect(await ethers.provider.getBalance(lottery.address)).to.be.bignumber.equal(BigNumber.from(0));
        
        // P1 participates
        await p1.lottery.participate(dummyShip, { value: entryPrice });
        
        // Check lottery balance has increased
        expect(await ethers.provider.getBalance(lottery.address)).to.be.bignumber.equal(entryPrice);
    });
    
    it('OngoingParticipationPeriod/Players 1,2,3 participate', async () => {
        // Generate a new lottery
        const [ lottery,,, lotteryToken ] = await lotteryFixture();
        const { deployer, p1, p2, p3 } = await getSignersIdentity();
        
        // Fund links
        const linkFeesToPay = await lottery.getLINKAmountRequired();
        await deployer.link.transfer(lottery.address, linkFeesToPay);
        
        // Fast-forward to the beginning of the participation period
        await network.provider.send("evm_mine", [(await lottery.periods()).beginningOfParticipationPeriod.toNumber()]);
        
        const participants: Array<[SignerIdentity, Ship]> = [ 
            [ 
                p1, 
                {
                    parts: {
                        body: BigNumber.from(0),
                        skin: BigNumber.from(0),
                        weapon: BigNumber.from(0),
                        booster: BigNumber.from(0)
                    }
                } 
            ], 
            [   p2, 
                {
                    parts: {
                        body: BigNumber.from(1),
                        skin: BigNumber.from(1),
                        weapon: BigNumber.from(1),
                        booster: BigNumber.from(1)
                    }
                } 
            ], 
            [   p3, 
                {
                    parts: {
                        body: BigNumber.from(0),
                        skin: BigNumber.from(1),
                        weapon: BigNumber.from(0),
                        booster: BigNumber.from(1)
                    }
                } 
            ] 
        ];
        
        const entryPrice: BigNumber = await lottery.getPriceToParticipate();
        
        // Make all players register as participants
        participants.forEach(async ([player, ship]) => {
            await player.lottery.participate(ship, { value: entryPrice });
        });
        
        // Verify each participant is registered
        for (let i = 0; i < participants.length; i++) {
            const [player, ship] = participants[i];
            const [wallet, tokenId] = await lottery.participants(i);
            
            // Check wallet registration
            expect(player.signer.address).equal(wallet);
            
            // Check NFT has been minted and belongs to the player
            expect(await lotteryToken.ownerOf(tokenId)).equal(wallet);
            
            // Check ship integrity
            const mintedShip: Ship = await lotteryToken.getShip(tokenId);
            expect(mintedShip.parts.body).equal(ship.parts.body);
            expect(mintedShip.parts.skin).equal(ship.parts.skin);
            expect(mintedShip.parts.weapon).equal(ship.parts.weapon);
            expect(mintedShip.parts.booster).equal(ship.parts.booster);
        }
        
        // Check there is no more than the required number of participants
        await expect(lottery.participants(participants.length)).to.be.reverted;
        
        // Check the lottery balance matches the number of players
        expect(await ethers.provider.getBalance(lottery.address)).to.be.bignumber.equal(entryPrice.mul(participants.length));
    });
});