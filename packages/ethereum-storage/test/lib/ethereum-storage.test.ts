import { Storage as StorageTypes } from '@requestnetwork/types';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import EthereumStorage from '../../src/lib/ethereum-storage';

// Extends chai for promises
chai.use(chaiAsPromised);
const assert = chai.assert;

const web3HttpProvider = require('web3-providers-http');

const ipfsGatewayConnection: StorageTypes.IIpfsGatewayConnection = {
  host: 'localhost',
  port: 5001,
  protocol: StorageTypes.IpfsGatewayProtocol.HTTP,
  timeout: 1000,
};

const invalidHostIpfsGatewayConnection: StorageTypes.IIpfsGatewayConnection = {
  host: 'nonexistent',
  port: 5001,
  protocol: StorageTypes.IpfsGatewayProtocol.HTTP,
  timeout: 1000,
};

const provider = new web3HttpProvider('http://localhost:8545');
const web3Connection: StorageTypes.IWeb3Connection = {
  networkId: StorageTypes.EthereumNetwork.PRIVATE,
  timeout: 1000,
  web3Provider: provider,
};

const invalidHostNetworkProvider = new web3HttpProvider('http://nonexistentnetwork:8545');
const invalidHostWeb3Connection: StorageTypes.IWeb3Connection = {
  networkId: StorageTypes.EthereumNetwork.PRIVATE,
  timeout: 1000,
  web3Provider: invalidHostNetworkProvider,
};

let ethereumStorage: EthereumStorage;

const content1 = 'this is a little test !';
const hash1 = 'QmNXA5DyFZkdf4XkUT81nmJSo3nS2bL25x7YepxeoDa6tY';
const realSize1 = 29;
const fakeSize1 = 50;

const content2 = 'content\nwith\nspecial\ncharacters\n';
const hash2 = 'QmQj8fQ9T16Ddrxfij5eyRnxXKTVxRXyQuazYnezt9iZpy';
const realSize2 = 38;
const fakeSize2 = 0;

// Define a mock for getPastEvents to be independant of the state of ganache instance
const pastEventsMock = [
  {
    blockNumber: 1,
    event: 'NewHash',
    returnValues: {
      hash: hash1,
      size: realSize1,
    },
    transactionHash: '0xa',
  },
  {
    blockNumber: 1,
    event: 'NewHash',
    returnValues: {
      hash: hash1,
      size: fakeSize1,
    },
    transactionHash: '0xa',
  },
  {
    blockNumber: 2,
    event: 'NewHash',
    returnValues: {
      hash: hash2,
      size: realSize2,
    },
    transactionHash: '0xb',
  },
  {
    blockNumber: 3,
    event: 'NewHash',
    returnValues: {
      hash: hash2,
      size: fakeSize2,
    },
    transactionHash: '0xc',
  },
];
const getPastEventsMock = () => pastEventsMock;

describe('EthereumStorage', () => {
  beforeEach(() => {
    ethereumStorage = new EthereumStorage(ipfsGatewayConnection, web3Connection);
    ethereumStorage.smartContractManager.requestHashStorage.getPastEvents = getPastEventsMock;
    ethereumStorage.smartContractManager.addHashAndSizeToEthereum = async (): Promise<
      StorageTypes.IRequestStorageEthereumMetadata
    > => {
      return {
        blockConfirmation: 10,
        blockNumber: 10,
        blockTimestamp: 1545816416,
        cost: '110',
        fee: '100',
        gasFee: '10',
        networkName: 'private',
        smartContractAddress: '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
        transactionHash: '0x7c45c575a54893dc8dc7230e3044e1de5c8714cd0a1374cf3a66378c639627a3',
      };
    };
  });

  it('Allows to update Ethereum network', async () => {
    ethereumStorage.updateEthereumNetwork(invalidHostWeb3Connection);
    assert.notDeepEqual(provider, ethereumStorage.smartContractManager.eth.currentProvider);
    assert.deepEqual(
      invalidHostNetworkProvider,
      ethereumStorage.smartContractManager.eth.currentProvider,
    );
  });

  it('Allows to append a file', async () => {
    const result = await ethereumStorage.append(content1);

    if (!result.meta.ethereum) {
      assert.fail('result.meta.ethereum does not exist');
      return;
    }

    const resultExpected: StorageTypes.IRequestStorageOneDataIdAndMeta = {
      meta: {
        ethereum: {
          blockConfirmation: 10,
          blockNumber: 10,
          blockTimestamp: 1545816416,
          cost: '110',
          fee: '100',
          gasFee: '10',
          networkName: 'private',
          smartContractAddress: '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
          transactionHash: '0x7c45c575a54893dc8dc7230e3044e1de5c8714cd0a1374cf3a66378c639627a3',
        },
        ipfs: {
          size: realSize1,
        },
        storageType: StorageTypes.StorageSystemType.ETHEREUM_IPFS,
      },
      result: { dataId: hash1 },
    };
    assert.deepEqual(result, resultExpected);
  });

  it('throws when append and addHashAndSizeToEthereum throws', async () => {
    ethereumStorage.smartContractManager.addHashAndSizeToEthereum = async (): Promise<
      StorageTypes.IRequestStorageEthereumMetadata
    > => {
      throw Error('fake error');
    };

    try {
      await ethereumStorage.append(content1);
      assert.fail('result.meta.ethereum does not exist');
    } catch (e) {
      assert.equal(e.message, 'Smart contract error: Error: fake error');
    }
  });

  it('Allows to read a file', async () => {
    await ethereumStorage.append(content1);
    const result = await ethereumStorage.read(hash1);

    if (!result.meta.ethereum) {
      assert.fail('result.meta.ethereum does not exist');
      return;
    }

    assert.deepEqual(result.result, { content: content1 });
    assert.deepEqual(result.meta.ipfs, {
      size: realSize1,
    });

    assert.equal(result.meta.ethereum.blockNumber, pastEventsMock[0].blockNumber);
    assert.equal(result.meta.ethereum.networkName, 'private');
    assert.equal(
      result.meta.ethereum.smartContractAddress,
      '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
    );
    assert.equal(result.meta.ethereum.blockNumber, pastEventsMock[0].blockNumber);
    assert.isAtLeast(result.meta.ethereum.blockConfirmation, 1);
    assert.exists(result.meta.ethereum.blockTimestamp);
  });

  it('Allows to retrieve all data id', async () => {
    // These contents have to be appended in order to check their size
    await ethereumStorage.append(content1);
    await ethereumStorage.append(content2);
    const result = await ethereumStorage.getAllDataId();

    if (!result.meta.metaDataIds[0].ethereum) {
      assert.fail('result.meta.metaDataIds[0].ethereum does not exist');
      return;
    }
    assert.deepEqual(result.meta.metaDataIds[0].ipfs, {
      size: realSize1,
    });
    assert.equal(result.meta.metaDataIds[0].ethereum.blockNumber, pastEventsMock[0].blockNumber);
    assert.equal(result.meta.metaDataIds[0].ethereum.networkName, 'private');
    assert.equal(
      result.meta.metaDataIds[0].ethereum.smartContractAddress,
      '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
    );
    assert.equal(result.meta.metaDataIds[0].ethereum.blockNumber, pastEventsMock[0].blockNumber);
    assert.isAtLeast(result.meta.metaDataIds[0].ethereum.blockConfirmation, 1);
    assert.exists(result.meta.metaDataIds[0].ethereum.blockTimestamp);

    assert.deepEqual(result.meta.metaDataIds[1], {});

    if (!result.meta.metaDataIds[2].ethereum) {
      assert.fail('result.meta.metaDataIds[2].ethereum does not exist');
      return;
    }
    assert.deepEqual(result.meta.metaDataIds[2].ipfs, {
      size: realSize2,
    });
    assert.equal(result.meta.metaDataIds[2].ethereum.blockNumber, pastEventsMock[2].blockNumber);
    assert.equal(result.meta.metaDataIds[2].ethereum.networkName, 'private');
    assert.equal(
      result.meta.metaDataIds[2].ethereum.smartContractAddress,
      '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
    );
    assert.equal(result.meta.metaDataIds[2].ethereum.blockNumber, pastEventsMock[2].blockNumber);
    assert.isAtLeast(result.meta.metaDataIds[2].ethereum.blockConfirmation, 1);
    assert.exists(result.meta.metaDataIds[2].ethereum.blockTimestamp);

    assert.deepEqual(result.meta.metaDataIds[3], {});

    assert.deepEqual(result.result, { dataIds: [hash1, '', hash2, ''] });
  });

  it('Allows to retrieve all data', async () => {
    await ethereumStorage.append(content1);
    await ethereumStorage.append(content2);
    const result = await ethereumStorage.getAllData();

    if (!result.meta.metaData[0].ethereum) {
      assert.fail('result.meta.metaData[0].ethereum does not exist');
      return;
    }
    assert.deepEqual(result.meta.metaData[0].ipfs, {
      size: realSize1,
    });
    assert.equal(result.meta.metaData[0].ethereum.blockNumber, pastEventsMock[0].blockNumber);
    assert.equal(result.meta.metaData[0].ethereum.networkName, 'private');
    assert.equal(
      result.meta.metaData[0].ethereum.smartContractAddress,
      '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
    );
    assert.equal(result.meta.metaData[0].ethereum.blockNumber, pastEventsMock[0].blockNumber);
    assert.isAtLeast(result.meta.metaData[0].ethereum.blockConfirmation, 1);
    assert.exists(result.meta.metaData[0].ethereum.blockTimestamp);

    assert.deepEqual(result.meta.metaData[1], {});

    if (!result.meta.metaData[2].ethereum) {
      assert.fail('result.meta.metaData[2].ethereum does not exist');
      return;
    }
    assert.deepEqual(result.meta.metaData[2].ipfs, {
      size: realSize2,
    });
    assert.equal(result.meta.metaData[2].ethereum.blockNumber, pastEventsMock[2].blockNumber);
    assert.equal(result.meta.metaData[2].ethereum.networkName, 'private');
    assert.equal(
      result.meta.metaData[2].ethereum.smartContractAddress,
      '0x345ca3e014aaf5dca488057592ee47305d9b3e10',
    );
    assert.equal(result.meta.metaData[2].ethereum.blockNumber, pastEventsMock[2].blockNumber);
    assert.isAtLeast(result.meta.metaData[2].ethereum.blockConfirmation, 1);
    assert.exists(result.meta.metaData[2].ethereum.blockTimestamp);

    assert.deepEqual(result.meta.metaData[3], {});

    assert.deepEqual(result.result, { data: [content1, '', content2, ''] });
  });

  it('Append and read with no parameter should throw an error', async () => {
    await assert.isRejected(ethereumStorage.append(''), Error, 'No content provided');

    await assert.isRejected(ethereumStorage.read(''), Error, 'No id provided');
  });

  it('Append and read on an invalid ipfs gateway should throw an error', async () => {
    ethereumStorage.updateIpfsGateway(invalidHostIpfsGatewayConnection);

    await assert.isRejected(ethereumStorage.append(content1), Error, 'Ipfs add request error');
    await assert.isRejected(ethereumStorage.read(hash1), Error, 'Ipfs read request error');
  });

  it('Failed getContentLength from ipfs-manager in append and read functions should throw an error', async () => {
    // To test this case, we create a mock for getContentLength of the ipfs manager that always throws an error
    ethereumStorage.ipfsManager.getContentLength = async _hash => {
      throw Error('Any error in getContentLength');
    };

    await assert.isRejected(
      ethereumStorage.append(content1),
      Error,
      'Ipfs get length request error',
    );
    await assert.isRejected(ethereumStorage.read(hash1), Error, 'Ipfs get length request error');
  });

  it('Append content with an invalid web3 connection should throw an error', async () => {
    ethereumStorage.updateEthereumNetwork(invalidHostWeb3Connection);

    await assert.isRejected(ethereumStorage.append(content1), Error, 'Smart contract error');
  });
});
