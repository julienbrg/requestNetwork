import { LogTypes, StorageTypes } from '@requestnetwork/types';
import Utils from '@requestnetwork/utils';
import * as Bluebird from 'bluebird';
import * as artifactsRequestHashStorageUtils from './artifacts-request-hash-storage-utils';
import * as artifactsRequestHashSubmitterUtils from './artifacts-request-hash-submitter-utils';
import * as config from './config';
import EthereumBlocks from './ethereum-blocks';
import EthereumUtils from './ethereum-utils';
import GasPriceDefiner from './gas-price-definer';

const web3Eth = require('web3-eth');
const web3Utils = require('web3-utils');

const bigNumber: any = require('bn.js');

// Maximum number of attempt to create ethereum metadata when transaction to add hash and size to Ethereum is confirmed
// 23 is the number of call of the transaction's confirmation event function
// if higher the promise may block since the confirmation event function will not be called anymore
const CREATING_ETHEREUM_METADATA_MAX_ATTEMPTS = 23;

// Regular expression to detect if the Web3 API returns "query returned more than XXX results" error
const MORE_THAN_XXX_RESULTS_REGEX: RegExp = new RegExp(
  'query returned more than [1-9][0-9]* results',
);

const LENGTH_BYTES32_STRING = 64;

/**
 * Manages the smart contract used by the storage layer
 * to store the hashes of the data on Ethereum
 */
export default class SmartContractManager {
  public eth: any;
  public requestHashStorage: any;
  public requestHashSubmitter: any;

  /**
   * Handles the block numbers and blockTimestamp
   */
  public ethereumBlocks: EthereumBlocks;

  /**
   * Maximum number of concurrent calls
   */
  public maxConcurrency: number;

  protected networkName: string = '';
  protected hashStorageAddress: string;
  protected hashSubmitterAddress: string;

  // Block where the contract has been created
  // This value is stored in config file for each network
  // This value is used to optimize past event retrieval
  private creationBlockNumberHashStorage: number;

  // Timeout threshold when connecting to Web3 provider
  private timeout: number;

  /**
   * Logger instance
   */
  private logger: LogTypes.ILogger;

  /**
   * Maximum number of retries to attempt for web3 API calls
   */
  private maxRetries: number | undefined;

  /**
   * Delay between retries for web3 API calls
   */
  private retryDelay: number | undefined;

  /**
   * Constructor
   * @param web3Connection Object to connect to the Ethereum network
   * @param [options.getLastBlockNumberDelay] the minimum delay to wait between fetches of lastBlockNumber
   * If values are missing, private network is used as http://localhost:8545
   */
  public constructor(
    web3Connection?: StorageTypes.IWeb3Connection,
    {
      maxConcurrency,
      getLastBlockNumberDelay,
      logger,
      maxRetries,
      retryDelay,
    }: {
      maxConcurrency: number;
      logger?: LogTypes.ILogger;
      getLastBlockNumberDelay?: number;
      maxRetries?: number;
      retryDelay?: number;
    } = {
      maxConcurrency: Number.MAX_SAFE_INTEGER,
    },
  ) {
    this.maxConcurrency = maxConcurrency;
    this.logger = logger || new Utils.SimpleLogger();

    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;

    web3Connection = web3Connection || {};

    try {
      this.eth = new web3Eth(
        web3Connection.web3Provider ||
          new web3Eth.providers.HttpProvider(config.getDefaultEthereumProvider()),
      );
    } catch (error) {
      throw Error(`Can't initialize web3-eth ${error}`);
    }

    // Checks if networkId is defined
    // If not defined we use default value from config
    this.networkName =
      typeof web3Connection.networkId === 'undefined'
        ? config.getDefaultEthereumNetwork()
        : EthereumUtils.getEthereumNetworkNameFromId(web3Connection.networkId);

    // If networkName is undefined, it means the network doesn't exist
    if (typeof this.networkName === 'undefined') {
      throw Error(`The network id ${web3Connection.networkId} doesn't exist`);
    }

    this.hashStorageAddress = artifactsRequestHashStorageUtils.getAddress(this.networkName);
    this.hashSubmitterAddress = artifactsRequestHashSubmitterUtils.getAddress(this.networkName);

    // Initialize smart contract instance
    this.requestHashStorage = new this.eth.Contract(
      artifactsRequestHashStorageUtils.getContractAbi(),
      this.hashStorageAddress,
    );
    this.requestHashSubmitter = new this.eth.Contract(
      artifactsRequestHashSubmitterUtils.getContractAbi(),
      this.hashSubmitterAddress,
    );

    this.timeout = web3Connection.timeout || config.getDefaultEthereumProviderTimeout();

    this.creationBlockNumberHashStorage =
      artifactsRequestHashStorageUtils.getCreationBlockNumber(this.networkName) || 0;

    this.ethereumBlocks = new EthereumBlocks(
      this.eth,
      this.creationBlockNumberHashStorage,
      this.retryDelay || config.getEthereumRetryDelay(),
      this.maxRetries || config.getEthereumMaxRetries(),
      getLastBlockNumberDelay,
      this.logger,
    );
  }

  /**
   * Check if the ethereum node is accessible
   * @return Promise resolving if the node is accessible, throw otherwise
   */
  public async checkEthereumNodeConnection(): Promise<void> {
    try {
      if (!(await this.eth.net.isListening())) {
        throw Error('Node not listening');
      }
    } catch (error) {
      throw Error(`Ethereum node is not reachable: ${error}`);
    }
  }

  /**
   * Check if the contracts are deployed and configured on ethereum
   * @return Promise resolving if the contracts are deployed and configured, throws otherwise
   */
  public async checkContracts(): Promise<void> {
    try {
      const isSubmitterWhitelisted = await this.requestHashStorage.methods
        .isWhitelisted(this.hashSubmitterAddress)
        .call();

      if (!isSubmitterWhitelisted) {
        throw Error('The hash submitter not whitelisted in request Hash Storage contract');
      }

      // throw if requestHashSubmitter is not deployed
      await this.requestHashSubmitter.methods.getFeesAmount(0).call();
    } catch (error) {
      throw Error(`Contracts are not deployed or not well configured: ${error}`);
    }
  }

  /**
   * Get the account used for transaction (account[0] of the wallet)
   * @return Promise resolving the default account
   */
  public async getMainAccount(): Promise<string> {
    // Get the accounts on the provider
    // Throws an error if timeout is reached
    const accounts = await Promise.race([
      Utils.timeoutPromise(this.timeout, 'Web3 getAccounts connection timeout'),
      this.eth.getAccounts(),
    ]);

    if (!accounts || !accounts[0]) {
      throw Error('No account found');
    }
    return accounts[0];
  }

  /**
   * Adds hash to smart contract from content hash and content feesParameters
   * @param contentHash Hash of the content to store, this hash should be used to retrieve the content
   * @param feesParameters parameters used to compute storage fee
   * @param gasPrice Replace the default gas price
   * @returns Promise resolved when transaction is confirmed on Ethereum
   */
  public async addHashAndSizeToEthereum(
    contentHash: string,
    feesParameters: StorageTypes.IFeesParameters,
    gasPrice?: number,
  ): Promise<StorageTypes.IEthereumMetadata> {
    // Get the account for the transaction
    const account = await this.getMainAccount();

    // Handler to get gas price
    const gasPriceDefiner = new GasPriceDefiner();

    // Get the fee from the size of the content
    // Throws an error if timeout is reached
    const fee = await Promise.race([
      Utils.timeoutPromise(this.timeout, 'Web3 getFeesAmount connection timeout'),
      this.requestHashSubmitter.methods.getFeesAmount(feesParameters.contentSize).call(),
    ]);

    // Determines the gas price to use
    // If the gas price is provided as a parameter, we use this value
    // If the gas price is not provided and we use mainnet, we determine it from gas price api providers
    // We use the fast value provided by the api providers
    // Otherwise, we use default value from config
    const gasPriceToUse =
      gasPrice ||
      (await gasPriceDefiner.getGasPrice(StorageTypes.GasPriceType.FAST, this.networkName));

    // parse the fees parameters to hex bytes
    const feesParametersAsBytes = web3Utils.padLeft(
      web3Utils.toHex(feesParameters.contentSize),
      LENGTH_BYTES32_STRING,
    );

    // Send transaction to contract
    // TODO(PROT-181): Implement a log manager for the library
    // use it for the different events (error, transactionHash, receipt and confirmation)
    return new Promise(
      (resolve, reject): any => {
        // This boolean is set to true once the ethereum metadata has been created and the promise has been resolved
        // When set to true, we use it to ignore next confirmation event function call
        let ethereumMetadataCreated: boolean = false;

        this.requestHashSubmitter.methods
          .submitHash(contentHash, feesParametersAsBytes)
          .send({
            from: account,
            gas: '100000',
            gasPrice: gasPriceToUse,
            value: fee,
          })
          .on('error', (transactionError: string) => {
            reject(Error(`Ethereum transaction error:  ${transactionError}`));
          })
          .on('confirmation', (confirmationNumber: number, receiptAfterConfirmation: any) => {
            if (!ethereumMetadataCreated) {
              const gasFee = new bigNumber(receiptAfterConfirmation.gasUsed).mul(
                new bigNumber(gasPriceToUse),
              );
              const cost = gasFee.add(new bigNumber(fee));

              // Try to create ethereum metadata
              // If the promise rejects, which is likely to happen because the last block is not fetchable
              // we retry the next event function call
              this.createEthereumMetaData(
                receiptAfterConfirmation.blockNumber,
                receiptAfterConfirmation.transactionHash,
                cost.toString(),
                fee,
                gasFee.toString(),
              )
                .then((ethereumMetadata: StorageTypes.IEthereumMetadata) => {
                  ethereumMetadataCreated = true;
                  resolve(ethereumMetadata);
                })
                .catch(e => {
                  if (confirmationNumber >= CREATING_ETHEREUM_METADATA_MAX_ATTEMPTS) {
                    reject(Error(`Maximum number of confirmation reached: ${e}`));
                  }
                });
            }
          });
      },
    );
  }

  /**
   * Get Ethereum metadata from the content hash
   * @param contentHash Hash of the content to store, this hash should be used to retrieve the content
   * @returns Promise resolved when transaction is confirmed on Ethereum
   */
  public async getMetaFromEthereum(contentHash: string): Promise<StorageTypes.IEthereumMetadata> {
    // Read all event logs
    const events = await this.recursiveGetPastEvents(this.creationBlockNumberHashStorage, 'latest');

    this.logger.debug(`${events.length} events fetched in getMetaFromEthereum`, ['ethereum']);

    const event = events.find((element: any) => element.returnValues.hash === contentHash);
    if (!event) {
      throw Error(`contentHash not indexed on ethereum`);
    }

    return this.createEthereumMetaData(event.blockNumber, event.transactionHash);
  }

  /**
   * Get all hashes and sizes with metadata inside storage smart contract past events
   *
   * @param options timestamp boundaries for the hash retrieval
   * @return hashes and sizes with metadata
   */
  public async getHashesAndSizesFromEthereum(
    options?: StorageTypes.ITimestampBoundaries,
  ): Promise<StorageTypes.IGetAllHashesAndSizes[]> {
    let fromBlock = this.creationBlockNumberHashStorage;
    let toBlock: number | undefined;

    // get fromBlock from the timestamp given in options
    if (options && options.from) {
      const optionFromBlockNumbers = await this.ethereumBlocks.getBlockNumbersFromTimestamp(
        options.from,
      );
      fromBlock = optionFromBlockNumbers.blockAfter;
    }

    // get toBlock from the timestamp given in options
    if (options && options.to) {
      const optionToBlockNumbers = await this.ethereumBlocks.getBlockNumbersFromTimestamp(
        options.to,
      );
      toBlock = optionToBlockNumbers.blockBefore;
    }

    if (toBlock && toBlock < fromBlock) {
      throw Error(
        `toBlock must be larger than fromBlock: fromBlock:${fromBlock} toBlock:${toBlock}`,
      );
    }

    return this.getHashesAndSizesFromEvents(fromBlock, toBlock);
  }

  /**
   * Get hashes and sizes with metadata inside storage smart contract past events
   *
   * @param fromBlock number of the block to start to get events
   * @param toBlock number of the block to stop to get events
   * @return Hashes and sizes with metadata
   */
  public async getHashesAndSizesFromEvents(
    fromBlock: number,
    toBlock?: number | string,
  ): Promise<any[]> {
    fromBlock =
      fromBlock < this.creationBlockNumberHashStorage
        ? this.creationBlockNumberHashStorage
        : fromBlock;
    toBlock = toBlock || 'latest';

    // Read all event logs
    let events = await this.recursiveGetPastEvents(fromBlock, toBlock);

    this.logger.debug(`${events.length} events fetched in getHashesAndSizesFromEvents`, [
      'ethereum',
    ]);

    // TODO PROT-235: getPastEvents returns all events, not just NewHash
    events = events.filter((eventItem: any) => eventItem.event === 'NewHash');

    const eventsWithMetaData = await Bluebird.map(
      events,
      (eventItem: any) => this.checkAndAddMetaDataToEvent(eventItem),
      {
        concurrency: this.maxConcurrency,
      },
    );

    return eventsWithMetaData;
  }

  /**
   * Get events inside storage smart contract for a specified block range
   * Some web3 providers, including Infura, send error if the past event number for a specific range is over 1000
   * In this case we divide the range and call the function recursively
   *
   * @param fromBlock number of the block to start to get events
   * @param toBlock number of the block to stop to get events
   * @return Past events of requestHashStorage of the specified range
   */
  private async recursiveGetPastEvents(
    fromBlock: number,
    toBlock: number | string,
  ): Promise<any[]> {
    const toBlockNumber: number = await this.getBlockNumberFromNumberOrString(toBlock);

    // Reading event logs
    // If getPastEvents doesn't throw, we can return the returned events from the function
    let events;
    try {
      events = await Utils.retry(
        (args: any) =>
          Promise.race([
            Utils.timeoutPromise(this.timeout, 'Web3 getPastEvents connection timeout'),
            this.requestHashStorage.getPastEvents(args),
          ]),
        {
          maxRetries: this.maxRetries || config.getEthereumMaxRetries(),
          retryDelay: this.retryDelay || config.getEthereumRetryDelay(),
        },
      )({
        event: 'NewHash',
        fromBlock,
        toBlock: toBlockNumber,
      });

      this.logger.debug(`Events from ${fromBlock} to ${toBlock} fetched`, ['ethereum']);

      return events;
    } catch (e) {
      // Checks if the API returns "query returned more than XXX results" error
      // In this case we perform a dichotomy in order to fetch past events with a smaller range
      if (e.toString().match(MORE_THAN_XXX_RESULTS_REGEX)) {
        const intervalHalf = Math.floor((fromBlock + toBlockNumber) / 2);
        const eventsFirstHalfPromise = this.recursiveGetPastEvents(fromBlock, intervalHalf);
        const eventsSecondHalfPromise = this.recursiveGetPastEvents(
          intervalHalf + 1,
          toBlockNumber,
        );

        return Promise.all([eventsFirstHalfPromise, eventsSecondHalfPromise])
          .then(halves => Utils.flatten2DimensionsArray(halves))
          .catch(err => {
            throw err;
          });
      } else {
        throw e;
      }
    }
  }

  /**
   * Throws an error if the event is not correctly formatted (missing field)
   * Attaches to the event the corresponding metadata
   * @param event event of type NewHash
   * @returns processed event
   */
  private async checkAndAddMetaDataToEvent(
    event: any,
  ): Promise<{
    hash: string;
    meta: StorageTypes.IEthereumMetadata;
    feesParameters: StorageTypes.IFeesParameters;
  }> {
    // Check if the event object is correct
    // We check "typeof field === 'undefined'"" instead of "!field"
    // because you can add empty string as hash or 0 as size in the storage smart contract
    if (
      typeof event.returnValues === 'undefined' ||
      typeof event.returnValues.hash === 'undefined' ||
      typeof event.returnValues.feesParameters === 'undefined'
    ) {
      throw Error(`event is incorrect: doesn't have a hash or feesParameters`);
    }

    const contentSize = web3Utils.hexToNumber(event.returnValues.feesParameters);
    const meta = await this.createEthereumMetaData(event.blockNumber, event.transactionHash);

    return {
      feesParameters: { contentSize },
      hash: event.returnValues.hash,
      meta,
    };
  }

  /**
   * Create the ethereum metadata
   * @param blockNumber block number of the ethereum transaction
   * @param transactionHash transactionHash of the ethereum transaction
   * @param cost total cost of the transaction (gas fee + request network fee)
   * @param fee Request network fee
   * @param gasFee gas fee of the ethereum transaction
   * @return IEthereumMetadata the metadata formatted
   */
  private async createEthereumMetaData(
    blockNumber: number,
    transactionHash: string,
    cost?: string,
    fee?: string,
    gasFee?: string,
  ): Promise<StorageTypes.IEthereumMetadata> {
    // Get the number confirmations of the block hosting the transaction
    let blockConfirmation;
    try {
      blockConfirmation = await this.ethereumBlocks.getConfirmationNumber(blockNumber);
    } catch (error) {
      throw Error(`Error getting block confirmation number: ${error}`);
    }

    // Get timestamp of the block hosting the transaction
    let blockTimestamp;
    try {
      blockTimestamp = await this.ethereumBlocks.getBlockTimestamp(blockNumber);
    } catch (error) {
      throw Error(`Error getting block ${blockNumber} timestamp: ${error}`);
    }

    return {
      blockConfirmation,
      blockNumber,
      blockTimestamp,
      cost,
      fee,
      gasFee,
      networkName: this.networkName,
      smartContractAddress: this.hashStorageAddress,
      transactionHash,
    };
  }

  /**
   * Get the number of a block given its number or string describing it
   * We need this function because recursive calls of getPastEvents need to use variable of type number
   *
   * @param block block number or string describing the block (latest, genesis, pending)
   * @return number of the block
   */
  private async getBlockNumberFromNumberOrString(block: number | string): Promise<number> {
    if (typeof block === 'number') {
      // If the block number is already of type number, we return it
      return block;
    } else {
      let blockObject;
      try {
        // Otherwise, we get the number of the block with getBlock web3 function
        // Use Utils.retry to rerun if getBlock fails
        blockObject = await this.ethereumBlocks.getBlock(block);
      } catch (e) {
        // getBlock can throw in certain case
        // For example, if the block describer is "pending", we're not able to get the number of the block
        // Therefore, this function should throw
        throw Error(`Cannot get the number of the block: ${e}`);
      }

      if (!blockObject || !blockObject.number) {
        throw Error(`Block ${block} has no number`);
      }

      return blockObject.number;
    }
  }
}
