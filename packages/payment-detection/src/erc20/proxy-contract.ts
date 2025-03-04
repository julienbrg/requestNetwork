import { BigNumber } from 'ethers';
import {
  AdvancedLogicTypes,
  ExtensionTypes,
  PaymentTypes,
  RequestLogicTypes,
} from '@requestnetwork/types';
import Utils from '@requestnetwork/utils';
import { erc20ProxyArtifact } from '@requestnetwork/smart-contracts';
import getBalanceErrorObject from '../balance-error';
import PaymentReferenceCalculator from '../payment-reference-calculator';
import ProxyInfoRetriever from './proxy-info-retriever';
import TheGraphInfoRetriever from './thegraph-info-retriever';
import { networkSupportsTheGraph } from '../thegraph';
import DeclarativePaymentNetwork from '../declarative';
import { makeGetDeploymentInformation } from '../utils';

/* eslint-disable max-classes-per-file */
/** Exception when network not supported */
class NetworkNotSupported extends Error {}
/** Exception when version not supported */
class VersionNotSupported extends Error {}

const PROXY_CONTRACT_ADDRESS_MAP = {
  ['0.1.0']: '0.1.0',
};

/**
 * Handle payment networks with ERC20 proxy contract extension
 */
export class ERC20ProxyPaymentDetector<
    ExtensionType extends ExtensionTypes.PnReferenceBased.IReferenceBased = ExtensionTypes.PnReferenceBased.IReferenceBased
  >
  extends DeclarativePaymentNetwork<ExtensionType>
  implements PaymentTypes.IPaymentNetwork<ExtensionType> {
  protected _extensionTypeId: ExtensionTypes.ID;

  /**
   * @param extension The advanced logic payment network extensions
   */
  public constructor({ advancedLogic }: { advancedLogic: AdvancedLogicTypes.IAdvancedLogic }) {
    super({ advancedLogic });
    this._extensionTypeId = ExtensionTypes.ID.PAYMENT_NETWORK_ERC20_PROXY_CONTRACT;
    this.extension = advancedLogic.extensions.proxyContractErc20;
    this._paymentNetworkId = PaymentTypes.PAYMENT_NETWORK_ID.ERC20_PROXY_CONTRACT;
  }

  /**
   * Creates the extensions data for the creation of this extension.
   * Will set a salt if none is already given
   *
   * @param paymentNetworkCreationParameters Parameters to create the extension
   * @returns The extensionData object
   */
  public async createExtensionsDataForCreation(
    paymentNetworkCreationParameters: PaymentTypes.IReferenceBasedCreationParameters,
  ): Promise<ExtensionTypes.IAction> {
    // If no salt is given, generate one
    const salt =
      paymentNetworkCreationParameters.salt || (await Utils.crypto.generate8randomBytes());

    return this.extension.createCreationAction({
      paymentAddress: paymentNetworkCreationParameters.paymentAddress,
      refundAddress: paymentNetworkCreationParameters.refundAddress,
      salt,
    });
  }

  /**
   * Creates the extensions data to add payment address
   *
   * @param parameters to add payment address
   * @returns The extensionData object
   */
  public createExtensionsDataForAddPaymentAddress(
    parameters: ExtensionTypes.PnReferenceBased.IAddPaymentAddressParameters,
  ): ExtensionTypes.IAction {
    return this.extension.createAddPaymentAddressAction({
      paymentAddress: parameters.paymentAddress,
    });
  }

  /**
   * Creates the extensions data to add refund address
   *
   * @param Parameters to add refund address
   * @returns The extensionData object
   */
  public createExtensionsDataForAddRefundAddress(
    parameters: ExtensionTypes.PnReferenceBased.IAddRefundAddressParameters,
  ): ExtensionTypes.IAction {
    return this.extension.createAddRefundAddressAction({
      refundAddress: parameters.refundAddress,
    });
  }

  /**
   * Gets the balance and the payment/refund events
   *
   * @param request the request to check
   * @param paymentNetworkId payment network id
   * @param tokenContractAddress the address of the token contract
   * @returns the balance and the payment/refund events
   */
  public async getBalance(
    request: RequestLogicTypes.IRequest,
  ): Promise<PaymentTypes.IBalanceWithEvents> {
    const paymentNetworkId = ExtensionTypes.ID.PAYMENT_NETWORK_ERC20_PROXY_CONTRACT;
    const paymentNetwork = request.extensions[paymentNetworkId];

    if (!paymentNetwork) {
      return getBalanceErrorObject(
        `The request does not have the extension : ${paymentNetworkId}`,
        PaymentTypes.BALANCE_ERROR_CODE.WRONG_EXTENSION,
      );
    }
    try {
      const paymentAddress = paymentNetwork.values.paymentAddress;
      const refundAddress = paymentNetwork.values.refundAddress;
      const salt = paymentNetwork.values.salt;

      let payments: PaymentTypes.IBalanceWithEvents = { balance: '0', events: [] };
      if (paymentAddress) {
        payments = await this.extractBalanceAndEvents(
          request,
          salt,
          paymentAddress,
          PaymentTypes.EVENTS_NAMES.PAYMENT,
          paymentNetwork.version,
        );
      }

      let refunds: PaymentTypes.IBalanceWithEvents = { balance: '0', events: [] };
      if (refundAddress) {
        refunds = await this.extractBalanceAndEvents(
          request,
          salt,
          refundAddress,
          PaymentTypes.EVENTS_NAMES.REFUND,
          paymentNetwork.version,
        );
      }

      const balance: string = BigNumber.from(payments.balance || 0)
        .sub(BigNumber.from(refunds.balance || 0))
        .toString();

      const events: PaymentTypes.ERC20PaymentNetworkEvent[] = [
        ...payments.events,
        ...refunds.events,
      ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      return {
        balance,
        events,
      };
    } catch (error) {
      let code: PaymentTypes.BALANCE_ERROR_CODE | undefined;
      if (error instanceof NetworkNotSupported) {
        code = PaymentTypes.BALANCE_ERROR_CODE.NETWORK_NOT_SUPPORTED;
      }
      if (error instanceof VersionNotSupported) {
        code = PaymentTypes.BALANCE_ERROR_CODE.VERSION_NOT_SUPPORTED;
      }
      return getBalanceErrorObject((error as Error).message, code);
    }
  }

  /**
   * Extracts the balance and events of an address
   *
   * @private
   * @param address Address to check
   * @param eventName Indicate if it is an address for payment or refund
   * @param network The id of network we want to check
   * @param tokenContractAddress the address of the token contract
   * @returns The balance and events
   */
  private async extractBalanceAndEvents(
    request: RequestLogicTypes.IRequest,
    salt: string,
    toAddress: string,
    eventName: PaymentTypes.EVENTS_NAMES,
    paymentNetworkVersion: string,
  ): Promise<PaymentTypes.IBalanceWithEvents> {
    const network = request.currency.network;

    if (!network) {
      throw new NetworkNotSupported(`Payment network not supported by ERC20 payment detection`);
    }

    let proxyContractAddress: string;
    let proxyCreationBlockNumber: number;
    try {
      const info = ERC20ProxyPaymentDetector.getDeploymentInformation(
        network,
        paymentNetworkVersion,
      );
      proxyContractAddress = info.address;
      proxyCreationBlockNumber = info.creationBlockNumber;
    } catch (e) {
      const errMessage = (e as Error)?.message || '';
      if (errMessage.startsWith('No deployment for network')) {
        throw new NetworkNotSupported(
          `Network not supported for this payment network: ${request.currency.network}`,
        );
      }
      if (
        errMessage.startsWith('No contract matches payment network version') ||
        errMessage.startsWith('No deployment for version')
      ) {
        throw new VersionNotSupported(errMessage);
      }
      throw e;
    }

    const paymentReference = PaymentReferenceCalculator.calculate(
      request.requestId,
      salt,
      toAddress,
    );

    const infoRetriever = networkSupportsTheGraph(network)
      ? new TheGraphInfoRetriever(
          paymentReference,
          proxyContractAddress,
          request.currency.value,
          toAddress,
          eventName,
          network,
        )
      : new ProxyInfoRetriever(
          paymentReference,
          proxyContractAddress,
          proxyCreationBlockNumber,
          request.currency.value,
          toAddress,
          eventName,
          network,
        );

    const declaredEvents = (await super.getBalance(request)).events;
    const events = [...declaredEvents, ...(await infoRetriever.getTransferEvents())];

    const balance = events
      .reduce((acc, event) => acc.add(BigNumber.from(event.amount)), BigNumber.from(0))
      .toString();

    return {
      balance,
      events,
    };
  }
  /*
   * Returns deployment information for the underlying smart contract for a given payment network version
   */
  public static getDeploymentInformation = makeGetDeploymentInformation(
    erc20ProxyArtifact,
    PROXY_CONTRACT_ADDRESS_MAP,
  );
}
