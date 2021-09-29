import { ExtensionTypes, IdentityTypes, RequestLogicTypes } from '@requestnetwork/types';
import AbstractExtension from '../abstract-extension';
import Utils from '@requestnetwork/utils';

/**
 * Core of the address based payment networks
 * This module is called by the address based payment networks to avoid code redundancy
 */
export default abstract class AddressBasedPaymentNetwork<
    TCreationParameters extends ExtensionTypes.PnAddressBased.ICreationParameters = ExtensionTypes.PnAddressBased.ICreationParameters
  >
  extends AbstractExtension<TCreationParameters>
  implements ExtensionTypes.PnAddressBased.IAddressBased<TCreationParameters> {
  public constructor(
    public extensionId: ExtensionTypes.ID,
    public currentVersion: string,
    public supportedNetworks: string[],
    public supportedCurrencyType: string,
  ) {
    super(ExtensionTypes.TYPE.PAYMENT_NETWORK, extensionId, currentVersion);
    this.actions = {
      ...this.actions,
      [ExtensionTypes.PnAddressBased.ACTION.ADD_PAYMENT_ADDRESS]: this.applyAddPaymentAddress.bind(
        this,
      ),
      [ExtensionTypes.PnAddressBased.ACTION.ADD_REFUND_ADDRESS]: this.applyAddRefundAddress.bind(
        this,
      ),
    };
  }

  /**
   * Creates the extensionsData for address based payment networks
   *
   * @param extensions extensions parameters to create
   *
   * @returns IExtensionCreationAction the extensionsData to be stored in the request
   */
  public createCreationAction(
    creationParameters: TCreationParameters,
  ): ExtensionTypes.IAction<TCreationParameters> {
    if (
      creationParameters.paymentAddress &&
      !this.isValidAddress(creationParameters.paymentAddress)
    ) {
      throw new InvalidPaymentAddressError(creationParameters.paymentAddress);
    }

    if (
      creationParameters.refundAddress &&
      !this.isValidAddress(creationParameters.refundAddress)
    ) {
      throw new InvalidPaymentAddressError(creationParameters.refundAddress, 'refundAddress');
    }

    return super.createCreationAction(creationParameters);
  }

  /**
   * Creates the extensionsData to add a payment address
   *
   * @param extensions extensions parameters to create
   *
   * @returns IAction the extensionsData to be stored in the request
   */
  public createAddPaymentAddressAction(
    addPaymentAddressParameters: ExtensionTypes.PnAddressBased.IAddPaymentAddressParameters,
  ): ExtensionTypes.IAction {
    const paymentAddress = addPaymentAddressParameters.paymentAddress;
    if (paymentAddress && !this.isValidAddress(paymentAddress)) {
      throw new InvalidPaymentAddressError(paymentAddress);
    }

    return {
      action: ExtensionTypes.PnAddressBased.ACTION.ADD_PAYMENT_ADDRESS,
      id: this.extensionId,
      parameters: {
        paymentAddress,
      },
    };
  }

  /**
   * Creates the extensionsData to add a refund address
   *
   * @param extensions extensions parameters to create
   *
   * @returns IAction the extensionsData to be stored in the request
   */
  public createAddRefundAddressAction(
    addRefundAddressParameters: ExtensionTypes.PnAddressBased.IAddRefundAddressParameters,
  ): ExtensionTypes.IAction {
    const refundAddress = addRefundAddressParameters.refundAddress;
    if (refundAddress && !this.isValidAddress(refundAddress)) {
      throw new InvalidPaymentAddressError(refundAddress, 'refundAddress');
    }

    return {
      action: ExtensionTypes.PnAddressBased.ACTION.ADD_REFUND_ADDRESS,
      id: this.extensionId,
      parameters: {
        refundAddress,
      },
    };
  }

  protected applyCreation(
    extensionAction: ExtensionTypes.IAction,
    timestamp: number,
  ): ExtensionTypes.IState {
    const paymentAddress = extensionAction.parameters.paymentAddress;
    const refundAddress = extensionAction.parameters.refundAddress;
    if (paymentAddress && !this.isValidAddress(paymentAddress)) {
      throw new InvalidPaymentAddressError(paymentAddress);
    }
    if (refundAddress && !this.isValidAddress(refundAddress)) {
      throw new InvalidPaymentAddressError(refundAddress, 'refundAddress');
    }

    const genericCreationAction = super.applyCreation(extensionAction, timestamp);

    return {
      ...genericCreationAction,
      events: [
        {
          name: 'create',
          parameters: {
            paymentAddress,
            refundAddress,
          },
          timestamp,
        },
      ],
      id: this.extensionId,
      type: this.extensionType,
      values: {
        ...genericCreationAction.values,
        paymentAddress,
        refundAddress,
      },
    };
  }

  protected abstract isValidAddress(_address: string, _networkName?: string): boolean;

  /**
   * Applies add payment address
   *
   * @param extensionState previous state of the extension
   * @param extensionAction action to apply
   * @param requestState request state read-only
   * @param actionSigner identity of the signer
   *
   * @returns state of the extension updated
   */
  protected applyAddPaymentAddress(
    extensionState: ExtensionTypes.IState,
    extensionAction: ExtensionTypes.IAction,
    requestState: RequestLogicTypes.IRequest,
    actionSigner: IdentityTypes.IIdentity,
    timestamp: number,
  ): ExtensionTypes.IState {
    if (
      extensionAction.parameters.paymentAddress &&
      !this.isValidAddress(extensionAction.parameters.paymentAddress, requestState.currency.network)
    ) {
      throw new InvalidPaymentAddressError(extensionAction.parameters.paymentAddress);
    }
    if (extensionState.values.paymentAddress) {
      throw Error(`Payment address already given`);
    }
    if (!requestState.payee) {
      throw Error(`The request must have a payee`);
    }
    if (!Utils.identity.areEqual(actionSigner, requestState.payee)) {
      throw Error(`The signer must be the payee`);
    }

    const copiedExtensionState: ExtensionTypes.IState = Utils.deepCopy(extensionState);

    // update payment address
    copiedExtensionState.values.paymentAddress = extensionAction.parameters.paymentAddress;
    // update events
    copiedExtensionState.events.push({
      name: ExtensionTypes.PnAddressBased.ACTION.ADD_PAYMENT_ADDRESS,
      parameters: { paymentAddress: extensionAction.parameters.paymentAddress },
      timestamp,
    });

    return copiedExtensionState;
  }

  /**
   * Applies add refund address
   *
   * @param extensionState previous state of the extension
   * @param extensionAction action to apply
   * @param requestState request state read-only
   * @param actionSigner identity of the signer
   *
   * @returns state of the extension updated
   */
  protected applyAddRefundAddress(
    extensionState: ExtensionTypes.IState,
    extensionAction: ExtensionTypes.IAction,
    requestState: RequestLogicTypes.IRequest,
    actionSigner: IdentityTypes.IIdentity,
    timestamp: number,
  ): ExtensionTypes.IState {
    if (
      extensionAction.parameters.refundAddress &&
      !this.isValidAddress(extensionAction.parameters.refundAddress, requestState.currency.network)
    ) {
      throw Error('refundAddress is not a valid address');
    }
    if (extensionState.values.refundAddress) {
      throw Error(`Refund address already given`);
    }
    if (!requestState.payer) {
      throw Error(`The request must have a payer`);
    }
    if (!Utils.identity.areEqual(actionSigner, requestState.payer)) {
      throw Error(`The signer must be the payer`);
    }

    const copiedExtensionState: ExtensionTypes.IState = Utils.deepCopy(extensionState);

    // update refund address
    copiedExtensionState.values.refundAddress = extensionAction.parameters.refundAddress;
    // update events
    copiedExtensionState.events.push({
      name: ExtensionTypes.PnAddressBased.ACTION.ADD_REFUND_ADDRESS,
      parameters: { refundAddress: extensionAction.parameters.refundAddress },
      timestamp,
    });

    return copiedExtensionState;
  }

  protected validate(
    request: RequestLogicTypes.IRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extensionAction: ExtensionTypes.IAction,
  ): void {
    if (request.currency.type !== this.supportedCurrencyType) {
      throw Error(`This extension can be used only on ${this.supportedCurrencyType} requests`);
    }
    if (request.currency.network && !this.supportedNetworks.includes(request.currency.network)) {
      throw new UnsupportedNetworkError(request.currency.network, this.supportedNetworks);
    }
  }
}

export class InvalidPaymentAddressError extends Error {
  constructor(address?: string, addressReference = 'paymentAddress') {
    const formattedAddress = address ? ` '${address}'` : '';
    super(`${addressReference}${formattedAddress} is not a valid address`);
  }
}

export class UnsupportedNetworkError extends Error {
  constructor(unsupportedNetworkName: string, supportedNetworks?: string[]) {
    const supportedNetworkDetails = supportedNetworks
      ? ` (only ${supportedNetworks.join(', ')})`
      : '';
    super(
      `Payment network '${unsupportedNetworkName}' is not supported by this extension${supportedNetworkDetails}`,
    );
  }
}
