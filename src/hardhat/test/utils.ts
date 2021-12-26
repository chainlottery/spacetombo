import { ethers, deployments, getChainId, getNamedAccounts } from 'hardhat';
import { networkConfig } from "../config/hardhat-sub-config";
import { Parameters, Periods, Token, LotteryEvent, ChainlinkVRFData, Ship } from "../types/Lottery"
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { LinkToken, Lottery, LotteryToken, PriceConsumer, VRFCoordinatorMock } from '../typechain';
import { BytesLike, Logger } from 'ethers/lib/utils';
import { LogLevel } from '@ethersproject/logger';

interface SignerIdentity {
    signer: SignerWithAddress;
    lottery: Lottery;
    link: LinkToken;
}

class LocalChain {
    vrfCoordinator: VRFCoordinatorMock;
    
    constructor(vrfCoordinator: VRFCoordinatorMock) {
        this.vrfCoordinator = vrfCoordinator;
    }
    
    vrfFulfillRandomness(requestId: BytesLike, consumerContract: string) {
        const randomness = Math.floor(Math.random() * 1000) + 1; // Random between 1 and 1000
        return this.vrfCoordinator.callBackWithRandomness(requestId, randomness, consumerContract);
    }
}

async function getDefaultParameters(): Promise<Parameters> {
    let vrfCoordinatorAddress;
    let linkAddress;
    let priceConsumerAddress;
    const chainId = await getChainId() as keyof typeof networkConfig;
    
    if (+chainId == 31337) {
        // Local node 
        
        // Deploys fresh chainlink mocks
        await deployments.fixture(['mocks', 'feed']);
        
        // VRF
        const deployedVRFCoordinator = await deployments.get("VRFCoordinatorMock");
        vrfCoordinatorAddress = deployedVRFCoordinator.address;
        
        // Link
        const deployedLINK = await deployments.get("LinkToken");
        linkAddress = deployedLINK.address;
        
        // Price consumer
        const deployedPriceConsumer = await deployments.get("PriceConsumer");
        priceConsumerAddress = deployedPriceConsumer.address;
    } else {
        vrfCoordinatorAddress = networkConfig[chainId]['vrfCoordinator'];
        linkAddress = networkConfig[chainId]['linkToken'];
        priceConsumerAddress = networkConfig[chainId]['ethUsdPriceFeed'];
    }
    
    const currentUnixTimeStamp = Math.floor(new Date().getTime() / 1000);
    
    const periods: Periods = {
        beginningOfParticipationPeriod: BigNumber.from(currentUnixTimeStamp + 60),
        endOfParticipationPeriod: BigNumber.from(currentUnixTimeStamp + 60 * 2),
        endOfPreparationPeriod: BigNumber.from(currentUnixTimeStamp + 60 * 3)
    };
    
    const tokenInfo: Token = {
        name: "LotteryTokenName",
        symbol: "LTN",
        CID: "bafybeia42q2uhfd5erdp76uow4cejkwwdnntgexit36hq2agbqufhrsg3e"
    };
    
    const events: LotteryEvent[] = [
        {    
            timestamp: BigNumber.from(currentUnixTimeStamp + 60 * 4),
            description: "Event 1"
        },
        {    
            timestamp: BigNumber.from(currentUnixTimeStamp + 60 * 5),
            description: "Event 2"
        }
    ];
    
    const vrfData: ChainlinkVRFData = {
        coordinator: vrfCoordinatorAddress,
        link: linkAddress,
        keyHash: networkConfig[chainId]['keyHash'],
        fee: BigNumber.from(networkConfig[chainId]['fee'])
    };
    
    return {
        chainCurrencyDecimals: 18,
        ticketPriceUsd: 4,
        fundsReleaseAddress: "0xf585378ff2A1DeCb335b4899250b83F46DC5c019",
        totalWinners: 3,
        token: tokenInfo,
        periods: periods,
        events: events,
        priceConsumer: priceConsumerAddress,
        vrfData: vrfData
    };
}

async function lotteryFixture(parameters?: Parameters): Promise<[Lottery, Parameters, LocalChain | undefined, LotteryToken, PriceConsumer]> {
    
    if(!parameters) {
        parameters = await getDefaultParameters();
    }
    
    let localChain: LocalChain | undefined;
    if(+await getChainId() === 31337) {
        // Local node
        
        // Set local chain info
        const deployedVRFCoordinator = await deployments.get("VRFCoordinatorMock");
        const vrfCoordinator = await ethers.getContractAt("VRFCoordinatorMock", deployedVRFCoordinator.address);
        localChain = new LocalChain(vrfCoordinator);
    }
    
    const lottery = await deployments.createFixture(async hre => {
        const { deployer } = await hre.getNamedAccounts();
        
        const result = await deployments.deploy('Lottery', {
            from: deployer,
            args: [parameters],
            log: true
        });
        
        return await ethers.getContractAt("Lottery", result.address);
    })();
    
    return [
        lottery,
        parameters,
        localChain,
        await ethers.getContractAt("LotteryToken", await lottery.token()),
        await ethers.getContractAt("PriceConsumer", (await deployments.get("PriceConsumer")).address),
    ];
}


async function getSignersIdentity(): Promise<{ [name: string]: SignerIdentity }> {
    const accounts = await getNamedAccounts();
    const accountsNames = Object.keys(accounts) ;
    //const signers = await ethers.getSigners();
    const deployedLottery = await deployments.get("Lottery");
    //console.log("accountsLength=" + accountsNames.length + " signersCount=" + signers.length);
    //console.log("accounts0=" + accounts[accountsNames[0]]);
    
    let linkAddress;
    const chainId = await getChainId() as keyof typeof networkConfig;
    
    if (+chainId == 31337) {
        // Local node 
        const deployedLINK = await deployments.get("LinkToken");
        linkAddress = deployedLINK.address;
    } else {
        linkAddress = networkConfig[chainId]['linkToken'];
    }
    
    let result: { [name: string]: SignerIdentity } = {};
    for (let i = 0; i < accountsNames.length; i++) {
        const name = accountsNames[i];
        const signer = await ethers.getSigner(accounts[name]);
        
        const lotteryContract = await ethers.getContractAt('Lottery', deployedLottery.address, signer) as Lottery;
        
        /*
        Disable warnings temporarily to avoid the warning "Duplicate definition of Transfer"
        See: https://github.com/ethers-io/ethers.js/issues/905
        */
        Logger.setLogLevel(LogLevel.ERROR);
        const linkContract = await ethers.getContractAt('LinkToken', linkAddress, signer) as LinkToken;
        
        // Restore log level
        Logger.setLogLevel(LogLevel.DEBUG);
        
        const identity: SignerIdentity = {
            signer: signer,
            lottery: lotteryContract,
            link: linkContract
        };
        result[name] = identity;
    }
    //console.log("Result: ");
    //console.log(result);
    return result;
}

const dummyShip: Ship = {
    parts: {
        body: BigNumber.from(0), 
        skin: BigNumber.from(0), 
        weapon: BigNumber.from(0), 
        booster: BigNumber.from(0)
    }
};

export {
    getDefaultParameters,
    lotteryFixture,
    getSignersIdentity,
    dummyShip
};
export type {
    SignerIdentity,
    LocalChain
};