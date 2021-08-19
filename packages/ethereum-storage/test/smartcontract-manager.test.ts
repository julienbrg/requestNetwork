/* eslint-disable @typescript-eslint/no-explicit-any */
import * as SmartContracts from '@requestnetwork/smart-contracts';
import { StorageTypes } from '@requestnetwork/types';
import { ethers, providers } from 'ethers';
import SmartContractManager from '../src/smart-contract-manager';
import * as web3Utils from 'web3-utils';
import { RequestHashStorage__factory } from '@requestnetwork/smart-contracts/types';

/* eslint-disable no-magic-numbers */

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
const wallet = ethers.Wallet.fromMnemonic(
  'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat',
);
const web3Connection: StorageTypes.IWeb3Connection = {
  networkId: StorageTypes.EthereumNetwork.PRIVATE,
  timeout: 1000,
  signer: wallet.connect(provider),
};

// Contract instance necessary to get event logs

const invalidHostWeb3Connection: StorageTypes.IWeb3Connection = {
  networkId: StorageTypes.EthereumNetwork.PRIVATE,
  timeout: 1000,
  signer: wallet.connect(
    new ethers.providers.JsonRpcProvider({ url: 'https://nonexistent.com', timeout: 100 }, 0),
  ),
};

const invalidNetwork = 999999;
const invalidNetworkWeb3Connection: StorageTypes.IWeb3Connection = {
  networkId: invalidNetwork,
  timeout: 1000,
  signer: wallet.connect(provider),
};

let smartContractManager: SmartContractManager;

const hashStr = 'QmNXA5DyFZkdf4XkUT81nmJSo3nS2bL25x7YepxeoDa6tY';
const realSize = 29;
const realSizeBytes32Hex = web3Utils.padLeft(web3Utils.toHex(realSize), 64);
const fakeSize = 50;
const fakeSizeBytes32Hex = web3Utils.padLeft(web3Utils.toHex(fakeSize), 64);
const otherContent =
  'This is not a hash but but we should be able to add any content into Ethereum, the gas cost for the transaction will be higher';
const otherSize = 100000;
const otherSizeBytes32Hex = web3Utils.padLeft(web3Utils.toHex(otherSize), 64);

const contractHashStorage = RequestHashStorage__factory.connect(
  SmartContracts.requestHashStorageArtifact.getAddress('private'),
  web3Connection.signer,
);

const addressRequestHashSubmitter = SmartContracts.requestHashSubmitterArtifact.getAddress(
  'private',
);

// Define a mock for getPastEvents to be independant of the state of ganache instance
const pastEventsMock = [
  {
    blockNumber: 0,
    event: 'NewHash',
    args: {
      feesParameters: realSizeBytes32Hex,
      hash: hashStr,
      hashSubmitter: addressRequestHashSubmitter,
    },
    transactionHash: '0xa',
  },
  // This event has an invalid size but it should not be ignored in smart contract manager
  {
    blockNumber: 4,
    event: 'NewHash',
    args: {
      feesParameters: fakeSizeBytes32Hex,
      hash: hashStr,
      hashSubmitter: addressRequestHashSubmitter,
    },
    transactionHash: '0xb',
  },
  // We can add any data into the storage
  {
    blockNumber: 6,
    event: 'NewHash',
    args: {
      feesParameters: otherSizeBytes32Hex,
      hash: otherContent,
      hashSubmitter: addressRequestHashSubmitter,
    },
    transactionHash: '0xc',
  },
  // We can add any data into the storage
  {
    blockNumber: 9,
    event: 'NewHash',
    args: {
      feesParameters: otherSizeBytes32Hex,
      hash: otherContent,
      hashSubmitter: addressRequestHashSubmitter,
    },
  },
];

// Return past event from pastEventsMock from fromBlock
const getPastEventsMock: any = async (
  _: any,
  fromBlock: number | string,
  toBlock: number | string,
): Promise<any> => {
  const toBlockInt = toBlock === 'latest' ? Infinity : toBlock;

  return Promise.resolve(
    pastEventsMock.filter(
      (block) => block.blockNumber >= fromBlock && block.blockNumber <= toBlockInt,
    ),
  );
};

// Mock to test case whare events are badly formatted
const badEventsMock: any = [
  {
    blockNumber: 2,
    event: 'NewHash',
    args: {
      feesParameters: fakeSizeBytes32Hex,
    },
    transactionHash: '0xb',
  },
];
// eslint-disable-next-line
const getBadEventsMock = async () => Promise.resolve(badEventsMock);

// This getPastEvents mock simulates cases where there could be more than 1000 results for a block interval
// txPerBlock describes number of result for each block between 0 and 9
// If the block interval provided by info contains more than 1000 results
// 'query returned more than 1000 results' is thrown
const noMoreThan1000ResultsGetPastEventsMock = async (
  txPerBlock: number[],
  info: {
    fromBlock: any;
    toBlock: any;
  },
): Promise<any[]> => {
  // Compute the total number of result
  let totalResult = 0;
  for (let i = info.fromBlock; i < info.toBlock; i++) {
    totalResult += txPerBlock[i];
  }

  // Return the concerned error if total number of result is more than 1000
  if (totalResult > 1000) {
    // We use totalResult for the message because we should handle any
    // "query returned more than XXX results" error message
    throw Error(`query returned more than ${totalResult} results`);
  }

  // Same return as previous mock
  return pastEventsMock.filter(
    (block) => block.blockNumber >= info.fromBlock && block.blockNumber <= info.toBlock,
  );
};

// Configuration where the recursive call of getPastEvents never happens
const txPerBlockConfiguration1 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

// Configuration where the recursive call of getPastEvents happens for each range of more than 1 block
const txPerBlockConfiguration2 = [999, 999, 999, 999, 999, 999, 999, 999, 999, 999];

// Various configurations
const txPerBlockConfiguration3 = [999, 999, 999, 999, 999, 1, 1, 1, 1, 1];
const txPerBlockConfiguration4 = [1, 1, 1, 1, 1, 999, 999, 999, 999, 999];
const txPerBlockConfiguration5 = [100, 200, 150, 400, 1, 670, 300, 140, 20, 600];

/* eslint-disable no-magic-numbers */
describe('SmartContractManager', () => {
  beforeEach(() => {
    smartContractManager = new SmartContractManager(web3Connection);
    jest
      .spyOn(smartContractManager.requestHashStorage, 'queryFilter')
      .mockImplementation(getPastEventsMock);

    smartContractManager.ethereumBlocks.retryDelay = 0;
    smartContractManager.ethereumBlocks.maxRetries = 0;
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  it('can get config', async () => {
    expect(smartContractManager.getConfig()).toEqual({
      creationBlockNumberHashStorage: 0,
      currentProvider: 'http://localhost:8545',
      hashStorageAddress: '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
      hashSubmitterAddress: '0xf25186b5081ff5ce73482ad761db0eb0d25abfbf',
      maxConcurrency: Number.MAX_SAFE_INTEGER,
      maxRetries: 5,
      networkName: 'private',
      retryDelay: 0,
    });
  });

  it('getMainAccount should return the main account', async () => {
    const accounts = await provider.listAccounts();
    const mainAccount = await smartContractManager.getMainAccount();

    expect(mainAccount).toEqual(accounts[0]);
  });

  it('allows to add hashes to contractHashStorage', async () => {
    const blockNumber = await provider.getBlockNumber();

    await smartContractManager.addHashAndSizeToEthereum(hashStr, { contentSize: realSize });

    // Reading last event log
    const events = await contractHashStorage.queryFilter(
      contractHashStorage.filters.NewHash(null, null, null),
      blockNumber + 1,
      'latest',
    );

    // Only one event is parsed
    expect(events.length).toEqual(1);

    expect(events[0].args.hash).toEqual(hashStr);
    expect(events[0].args.hashSubmitter.toLowerCase()).toEqual(addressRequestHashSubmitter);
    expect(events[0].args.feesParameters).toEqual(realSizeBytes32Hex);
  });

  // TODO since the migration to jest, this test fails.
  it('allows to add other content than hash to contractHashStorage', async () => {
    await smartContractManager.addHashAndSizeToEthereum(otherContent, { contentSize: otherSize });
    const lastBlock = await provider.getBlockNumber();
    // Reading last event log
    const events = await contractHashStorage.queryFilter(
      contractHashStorage.filters.NewHash(null, null, null),
      lastBlock,
      'latest',
    );

    // Only one event is parsed
    expect(events.length).toEqual(1);

    expect(events[0].args.hash).toEqual(otherContent);
    expect(events[0].args.hashSubmitter.toLowerCase()).toEqual(addressRequestHashSubmitter);
    expect(events[0].args.feesParameters).toEqual(otherSizeBytes32Hex);
  });

  it('allows to get all hashes', async () => {
    // Inside getBlockNumberFromNumberOrString, this function will be only called with parameter 'latest'
    // For getPastEventsMock the number of the latest block is 9
    jest.spyOn(smartContractManager.provider, 'getBlock').mockImplementation(() =>
      Promise.resolve({
        number: 9,
      } as any),
    );

    const { ethereumEntries } = await smartContractManager.getEntriesFromEthereum();

    expect(ethereumEntries.length).toEqual(4);
    expect(ethereumEntries[0].hash).toEqual(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toEqual(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toEqual(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
    expect(ethereumEntries[3].hash).toEqual(otherContent);
    expect(ethereumEntries[3].feesParameters).toMatchObject({ contentSize: otherSize });
  });

  it('allows to get all hashes with options from', async () => {
    // Inside getBlockNumberFromNumberOrString, this function will be only called with parameter 'latest'
    // For getPastEventsMock the number of the latest block is 9
    const mockBlocksEthereum = [7, 30, 45, 87, 100, 150, 209, 234, 290, 306];
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlock')
      .mockImplementation((i: any): any => {
        return mockBlocksEthereum[i] ? { timestamp: mockBlocksEthereum[i] } : undefined;
      });
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlockNumber')
      .mockImplementation(() => Promise.resolve(9));
    // TODO ? smartContractManager.ethereumBlocks = new EthereumBlocks(mockEth, 1, 0, 0);

    const { ethereumEntries } = await smartContractManager.getEntriesFromEthereum({
      from: 299,
    });

    expect(ethereumEntries.length).toEqual(1);
    expect(ethereumEntries[0].hash).toEqual(otherContent);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: otherSize });
  });

  it('allows to get all hashes with options to', async () => {
    const mockBlocksEthereum = [7, 30, 45, 87, 100, 150, 209, 234, 290, 306];
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlock')
      .mockImplementation((i: any): any => {
        return mockBlocksEthereum[i] ? { timestamp: mockBlocksEthereum[i] } : undefined;
      });
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlockNumber')
      .mockImplementation(() => Promise.resolve(9));

    const { ethereumEntries } = await smartContractManager.getEntriesFromEthereum({
      to: 299,
    });
    expect(ethereumEntries.length).toEqual(3);
    expect(ethereumEntries[0].hash).toEqual(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toEqual(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toEqual(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
  });

  it('allows to get all hashes with options from and to', async () => {
    const mockBlocksEthereum = [7, 30, 45, 87, 100, 150, 209, 234, 290, 306];

    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlock')
      .mockImplementation((i: any): any => {
        return mockBlocksEthereum[i] ? { timestamp: mockBlocksEthereum[i] } : undefined;
      });
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlockNumber')
      .mockImplementation(() => Promise.resolve(9));

    const { ethereumEntries } = await smartContractManager.getEntriesFromEthereum({
      from: 10,
      to: 299,
    });
    expect(ethereumEntries.length).toEqual(2);
    expect(ethereumEntries[0].hash).toEqual(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[1].hash).toEqual(otherContent);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: otherSize });
  });

  it('addHashAndSizeToEthereum with a invalid host provider should throw an error', async () => {
    smartContractManager = new SmartContractManager(invalidHostWeb3Connection);
    await expect(
      smartContractManager.addHashAndSizeToEthereum(hashStr, { contentSize: realSize }),
    ).rejects.toThrowError(/could not detect network/);
  });

  it('getEntriesFromEthereum with a invalid host provider should throw a timeout error', async () => {
    smartContractManager = new SmartContractManager(invalidHostWeb3Connection);
    smartContractManager.ethereumBlocks.retryDelay = 0;
    smartContractManager.ethereumBlocks.maxRetries = 0;
    await expect(smartContractManager.getEntriesFromEthereum()).rejects.toThrowError(/timeout/);
  });

  it('getEntriesFromEthereum rejects if fromBlock is larger than toBlock', async () => {
    const mockBlocksEthereum = [7, 30, 45, 87, 100, 150, 209, 234, 290, 306];
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlock')
      .mockImplementation((i: any): any => {
        return mockBlocksEthereum[i] ? { timestamp: mockBlocksEthereum[i] } : undefined;
      });
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlockNumber')
      .mockImplementation(() => Promise.resolve(9));

    await expect(
      smartContractManager.getEntriesFromEthereum({
        from: 200,
        to: 10,
      }),
    ).rejects.toThrowError('toBlock must be larger than fromBlock');
  });

  it('initializes smartcontract-manager with an invalid network should throw an error', () => {
    expect(() => new SmartContractManager(invalidNetworkWeb3Connection)).toThrowError(
      `The network id ${invalidNetwork} doesn't exist`,
    );
  });

  it('getAddress in artifactsRequestHashStorageUtils with a invalid host network should throw an error', () => {
    expect(() => SmartContracts.requestHashStorageArtifact.getAddress('nonexistent')).toThrowError(
      'No deployment for network',
    );
  });

  it('getAddress in artifactsRequestHashSubmitterUtils with a invalid host network should throw an error', () => {
    expect(() =>
      SmartContracts.requestHashSubmitterArtifact.getAddress('nonexistent'),
    ).toThrowError('No deployment for network');
  });

  it('getCreationBlockNumber in artifactsRequestHashSubmitterUtils', () => {
    expect(SmartContracts.requestHashSubmitterArtifact.getCreationBlockNumber('private')).toBe(1);
  });

  fit('allows to getMetaFromEthereum() a hash', async () => {
    // Inside getBlockNumberFromNumberOrString, this function will be only called with parameter 'latest'
    // For getPastEventsMock the number of the latest block is 3
    jest
      .spyOn(smartContractManager.provider, 'getBlock')
      .mockImplementation(() => Promise.resolve({ number: 3 } as any));
    const meta = await smartContractManager.getMetaFromEthereum(hashStr);

    expect(meta.blockNumber).toBe(pastEventsMock[0].blockNumber);
    expect(meta.networkName).toBe('private');
    expect(meta.smartContractAddress).toBe('0x345ca3e014aaf5dca488057592ee47305d9b3e10');
    expect(meta.transactionHash).toBe('0xa');
    expect(meta.blockConfirmation).toBeGreaterThanOrEqual(0);
  }, 15000);

  it('allows to getMetaFromEthereum() a hash not indexed', async () => {
    await expect(smartContractManager.getMetaFromEthereum('empty')).rejects.toThrowError(
      'contentHash not indexed on ethereum',
    );
  }, 10000);

  it('badly formatted events from web3 should throw an error', async () => {
    jest
      .spyOn(smartContractManager.requestHashStorage, 'queryFilter')
      .mockImplementation(getBadEventsMock);

    const allHashesPromise = smartContractManager.getEntriesFromEthereum();

    await expect(allHashesPromise).rejects.toThrowError(
      `event is incorrect: doesn't have a hash or feesParameters`,
    );
  });

  it('allows to get hashes and sizes from events on block interval with over 1000 results', async () => {
    jest
      .spyOn(smartContractManager.provider, 'getBlock')
      .mockImplementation(() => Promise.resolve({ number: 9 } as any));

    jest
      .spyOn(smartContractManager.requestHashStorage, 'queryFilter')
      .mockImplementationOnce((_, fromBlock, toBlock) =>
        noMoreThan1000ResultsGetPastEventsMock(txPerBlockConfiguration1, { fromBlock, toBlock }),
      )
      .mockImplementationOnce((_, fromBlock, toBlock) =>
        noMoreThan1000ResultsGetPastEventsMock(txPerBlockConfiguration2, { fromBlock, toBlock }),
      )
      .mockImplementationOnce((_, fromBlock, toBlock) =>
        noMoreThan1000ResultsGetPastEventsMock(txPerBlockConfiguration3, { fromBlock, toBlock }),
      )
      .mockImplementationOnce((_, fromBlock, toBlock) =>
        noMoreThan1000ResultsGetPastEventsMock(txPerBlockConfiguration4, { fromBlock, toBlock }),
      )
      .mockImplementationOnce((_, fromBlock, toBlock) =>
        noMoreThan1000ResultsGetPastEventsMock(txPerBlockConfiguration5, { fromBlock, toBlock }),
      );

    let { ethereumEntries } = await smartContractManager.getEntriesFromEthereum();

    expect(ethereumEntries.length).toBe(4);
    expect(ethereumEntries[0].hash).toBe(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toBe(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toBe(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
    expect(ethereumEntries[3].hash).toBe(otherContent);
    expect(ethereumEntries[3].feesParameters).toMatchObject({ contentSize: otherSize });

    ethereumEntries = (await smartContractManager.getEntriesFromEthereum()).ethereumEntries;

    expect(ethereumEntries.length).toBe(4);
    expect(ethereumEntries[0].hash).toBe(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toBe(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toBe(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
    expect(ethereumEntries[3].hash).toBe(otherContent);
    expect(ethereumEntries[3].feesParameters).toMatchObject({ contentSize: otherSize });

    ethereumEntries = (await smartContractManager.getEntriesFromEthereum()).ethereumEntries;

    expect(ethereumEntries.length).toBe(4);
    expect(ethereumEntries[0].hash).toBe(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toBe(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toBe(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
    expect(ethereumEntries[3].hash).toBe(otherContent);
    expect(ethereumEntries[3].feesParameters).toMatchObject({ contentSize: otherSize });

    ethereumEntries = (await smartContractManager.getEntriesFromEthereum()).ethereumEntries;

    expect(ethereumEntries.length).toBe(4);
    expect(ethereumEntries[0].hash).toBe(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toBe(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toBe(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
    expect(ethereumEntries[3].hash).toBe(otherContent);
    expect(ethereumEntries[3].feesParameters).toMatchObject({ contentSize: otherSize });

    ethereumEntries = (await smartContractManager.getEntriesFromEthereum()).ethereumEntries;

    expect(ethereumEntries.length).toBe(4);
    expect(ethereumEntries[0].hash).toBe(hashStr);
    expect(ethereumEntries[0].feesParameters).toMatchObject({ contentSize: realSize });
    expect(ethereumEntries[1].hash).toBe(hashStr);
    expect(ethereumEntries[1].feesParameters).toMatchObject({ contentSize: fakeSize });
    expect(ethereumEntries[2].hash).toBe(otherContent);
    expect(ethereumEntries[2].feesParameters).toMatchObject({ contentSize: otherSize });
    expect(ethereumEntries[3].hash).toBe(otherContent);
    expect(ethereumEntries[3].feesParameters).toMatchObject({ contentSize: otherSize });
  });

  it('cannot get hashes and sizes from events with incorrect toBlock option', async () => {
    await expect(
      smartContractManager.getEthereumEntriesFromEvents(0, 'incorrectBlockDescriber'),
    ).rejects.toThrowError(`Cannot get the number of the block`);
  });

  it('cannot get hashes and sizes from events with toBlock option containing no number', async () => {
    jest
      .spyOn(smartContractManager.ethereumBlocks.provider, 'getBlock')
      .mockImplementation((block): any => {
        if (block === 'pending') {
          return {
            transactions: ['0x10', '0x20', '0x30'],
          };
        }
        return null;
      });

    await expect(
      smartContractManager.getEthereumEntriesFromEvents(0, 'pending'),
    ).rejects.toThrowError(`Block pending has no number`);
  });

  it('allows to check if the web3 provider is listening', async () => {
    // smartContractManager check on http://localhost:8545
    await expect(smartContractManager.checkWeb3ProviderConnection(10000)).resolves.not.toThrow();
  });

  it('should throw an error if the web3 provider is not listening', async () => {
    jest
      .spyOn(smartContractManager.provider as providers.JsonRpcProvider, 'send')
      .mockImplementation(() => Promise.resolve(false));
    await expect(smartContractManager.checkWeb3ProviderConnection(10000)).rejects.toThrowError(
      'The Web3 provider is not listening',
    );
  });

  it('should throw an error if the web3 provider is not reachable or takes too long to respond', async () => {
    jest
      .spyOn(smartContractManager.provider as providers.JsonRpcProvider, 'send')
      .mockImplementation(
        () =>
          new Promise((resolve): void => {
            setTimeout(() => resolve(1), 300);
          }),
      );

    // Timeout is lower to not reach the mocha test timeout
    await expect(smartContractManager.checkWeb3ProviderConnection(100)).rejects.toThrowError(
      'The Web3 provider is not reachable, did you use the correct protocol (http/https)?',
    );
  });

  it('should throw an error if an error occurs when checking if the web3 provider is listening', async () => {
    jest
      .spyOn(smartContractManager.provider as providers.JsonRpcProvider, 'send')
      .mockImplementation(() => Promise.reject(new Error('A connection error')));

    await expect(smartContractManager.checkWeb3ProviderConnection(10000)).rejects.toThrowError(
      'Error when trying to reach Web3 provider',
    );
  });
});
