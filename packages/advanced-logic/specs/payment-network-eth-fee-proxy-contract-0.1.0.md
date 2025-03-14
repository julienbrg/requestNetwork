# Payment Network - Ethereum with Fee

## Description

This extension allows the payments and the refunds to be made in Ether on the Ethereum blockchain, or in any native token of an EVM chain.
This Payment Network is similar to the [Ethereum Proxy Contract](./payment-network-eth-proxy-contract-0.1.0.md) extension, with the added feature of allowing a fee to be taken from the payment.

The payment is primarly made through a proxy contract, and can also be declared manually. Fees shall not be paid for declarative payments.

This proxy contract does the Ether transfers on behalf of the user. The contract ensures a link between the ethers transfers and a request through a `paymentReference`, consisting of the last 8 bytes of a salted hash of the requestId: `last8Bytes(hash(lowercase(requestId + salt + address)))`:

The contract also ensures that the `feeAmount` amount is forwarded to the `feeAddress`.

- `requestId` is the id of the request
- `salt` is a random number with at least 8 bytes of randomness. It must be unique to each request
- `address` is the payment address for payments, the refund address for refunds
- `feeAmount` is the amount of the transfer that should be paid in fees
- `feeAddress` is the address where the fee will be sent to
- `lowercase()` transforms all characters to lowercase
- `hash()` is a keccak256 hash function
- `last8Bytes()` take the last 8 bytes

As a payment network, this extension allows to deduce a payment `balance` for the request. (see [Interpretation](#Interpretation))

## Contract

The contract contains one function called `transferWithReferenceAndFee` which takes 4 arguments:

- `to` is the destination address for the ethers
- `paymentReference` is the reference data used to track the transfer (see `paymentReference`)
- `feeAmount` is the amount of ethers to transfer to the fee destination address
- `feeAddress` is the destination address for the fee

The `TransferWithReferenceAndFee` event is emitted when the tokens are transfered. This event contains the same 6 arguments, the `transferWithReferenceAndFee` parameters and:

- `amount` is the amount of ethers to transfer to the destination address

[See smart contract source](https://github.com/RequestNetwork/requestNetwork/blob/master/packages/smart-contracts/src/contracts/EthereumFeeProxy.sol)

| Network | Contract Address                           |
| ------- | ------------------------------------------ |
| Mainnet | TODO                                       |
| Rinkeby | 0xC6E23a20C0a1933ACC8E30247B5D1e2215796C1F |
| Private | 0x3d49d1eF2adE060a33c6E6Aa213513A7EE9a6241 |

## Properties

| Property                  | Type   | Description                                    | Requirement   |
| ------------------------- | ------ | ---------------------------------------------- | ------------- |
| **id**                    | String | constant value: "pn-eth-fee-proxy-contract"    | **Mandatory** |
| **type**                  | String | constant value: "paymentNetwork"               | **Mandatory** |
| **version**               | String | constant value: "0.1.0"                        | **Mandatory** |
| **events**                | Array  | List of the actions performed by the extension | **Mandatory** |
| **values**                | Object |                                                |               |
| **values.salt**           | String | Salt for the request                           | **Mandatory** |
| **values.paymentAddress** | String | Blockchain address for the payment             | Optional      |
| **values.refundAddress**  | String | Blockchain address for the refund              | Optional      |
| **values.feeAddress**     | String | Blockchain address for the fee payment         | Optional      |
| **values.feeAmount**      | String | The fee amount                                 | Optional      |

---

## Action: Creation

### Parameters

|                               | Type   | Description                                 | Requirement   |
| ----------------------------- | ------ | ------------------------------------------- | ------------- |
| **id**                        | String | Constant value: "pn-eth-fee-proxy-contract" | **Mandatory** |
| **type**                      | String | Constant value: "paymentNetwork"            | **Mandatory** |
| **version**                   | String | Constant value: "0.1.0"                     | **Mandatory** |
| **parameters**                | Object |                                             |               |
| **parameters.salt**           | String | Salt for the request                        | **Mandatory** |
| **parameters.paymentAddress** | String | Blockchain address for the payment          | Optional      |
| **parameters.refundAddress**  | String | Blockchain address for the refund           | Optional      |
| **parameters.feeAddress**     | String | Blockchain address for the fee payment      | Optional      |
| **parameters.feeAmount**      | String | The fee amount                              | Optional      |

### Conditions

This action is valid if:

- The `salt` is not empty and long enough (8 bytes of randomness minimum).
- The `currency.type` is ETH.

### Warnings

This action must trigger the warnings:

| Warning                                 | Condition                                                   |
| --------------------------------------- | ----------------------------------------------------------- |
| "paymentAddress is given by the payer"  | If `signer` is the payer **and** `paymentAddress` is given  |
| "feeAddress is given by the payer"      | If `signer` is the payer **and** `feeAddress` is given      |
| "feeAmount is given by the payer"       | If `signer` is the payer **and** `feeAddress` is given      |
| "refundAddress is given by the payee"   | If `signer` is the payee **and** `refundAddress` is given   |

Note: These warnings are necessary to highlight and avoid attempts of fake payments and refunds. For example, a payer could create a request using as the payment address one of his own addresses. A system could interpret a transaction to this address as a payment while the payee did not receive the funds.

#### Results

An extension state is created with the following properties:

|  Property                 |  Value                                                         |
| ------------------------- | -------------------------------------------------------------- |
| **id**                    | "pn-eth-fee-proxy-contract"                                    |
| **type**                  | "paymentNetwork"                                               |
| **version**               | "0.1.0"                                                        |
| **values**                |                                                                |
| **values.paymentAddress** | `paymentAddress` from parameters if given, undefined otherwise |
| **values.refundAddress**  | `refundAddress` from parameters if given, undefined otherwise  |
| **values.feeAddress**     | `feeAddress` from parameters if given, undefined otherwise     |
| **values.feeAmount**      | `feeAmount` from parameters if given, undefined otherwise      |
| **values.salt**           | Salt for the request                                           |
| **events**                | Array with one 'create' event (see below)                      |

the 'create' event:

|  Property                     |  Value                                                         |
| ----------------------------- | -------------------------------------------------------------- |
| **name**                      | 'create'                                                       |
| **parameters**                |                                                                |
| **parameters.paymentAddress** | `paymentAddress` from parameters if given, undefined otherwise |
| **parameters.refundAddress**  | `refundAddress` from parameters if given, undefined otherwise  |
| **parameters.feeAddress**     | `feeAddress` from parameters if given, undefined otherwise     |
| **parameters.feeAmount**      | `feeAmount` from parameters if given, undefined otherwise      |
| **parameters.salt**           | Salt for the request                                           |

---

## Action: addPaymentAddress

### Parameters

|                               | Type   | Description                                 | Requirement   |
| ----------------------------- | ------ | ------------------------------------------- | ------------- |
| **id**                        | String | Constant value: "pn-eth-fee-proxy-contract" | **Mandatory** |
| **action**                    | String | Constant value: "addPaymentAddress"         | **Mandatory** |
| **parameters**                | Object |                                             |               |
| **parameters.paymentAddress** | String | Blockchain address for the payment          | **Mandatory** |

### Conditions

This action is valid, if:

- The extension state with the id "pn-eth-fee-proxy-contract" exists
- The signer is the `payee`
- The extension property `paymentAddress` is undefined

### Warnings

None.

### Results

The extension state is updated with the following properties:

|  Property                 |  Value                                               |
| ------------------------- | ---------------------------------------------------- |
| **values.paymentAddress** | `paymentAddress` from parameters                     |
| **events**                | Add an 'paymentAddress' event (see below) at its end |

the 'addPaymentAddress' event:

|  Property                     |  Value                              |
| ----------------------------- | ----------------------------------- |
| **name**                      | Constant value: "addPaymentAddress" |
| **parameters**                |                                     |
| **parameters.paymentAddress** | `paymentAddress` from parameters    |

## Action: addRefundAddress

### Parameters

|                              | Type   | Description                                 | Requirement   |
| ---------------------------- | ------ | ------------------------------------------- | ------------- |
| **id**                       | String | Constant value: "pn-eth-fee-proxy-contract" | **Mandatory** |
| **action**                   | String | Constant value: "addRefundAddress"          | **Mandatory** |
| **parameters**               | Object |                                             |               |
| **parameters.refundAddress** | String | Blockchain address for the refund           | **Mandatory** |

### Conditions

This action is valid if:

- The extension state with the id "pn-eth-fee-proxy-contract" exists
- The signer is the `payer`
- The extension property `refundAddress` is undefined

### Warnings

None.

### Results

The extension state is updated with the following properties:

|  Property                |  Value                                                 |
| ------------------------ | ------------------------------------------------------ |
| **values.refundAddress** | `refundAddress` from parameters                        |
| **events**               | Add an 'addRefundAddress' event (see below) at its end |

The 'addRefundAddress' event:

|  Property                    |  Value                          |
| ---------------------------- | ------------------------------- |
| **name**                     | 'addRefundAddress'              |
| **parameters**               |                                 |
| **parameters.refundAddress** | `refundAddress` from parameters |

## Action: addFee

### Parameters

|                           | Type   | Description                                 | Requirement   |
| ------------------------- | ------ | ------------------------------------------- | ------------- |
| **id**                    | String | Constant value: "pn-eth-fee-proxy-contract" | **Mandatory** |
| **action**                | String | Constant value: "addFeeAddress"             | **Mandatory** |
| **parameters**            | Object |                                             |               |
| **parameters.feeAddress** | String | Blockchain address for the fee payment      | **Mandatory** |
| **parameters.feeAmount**  | String | The fee amount                              | **Mandatory** |

### Conditions

This action is valid, if:

- The extension state with the id "pn-eth-fee-proxy-contract" exists
- The signer is the `payee`
- The extension property `feeAddress` is undefined
- The extension property `feeAmount` is undefined or represents an integer greater or equal than zero

### Warnings

None.

### Results

The extension state is updated with the following properties:

|  Property             |  Value                                   |
| --------------------- | ---------------------------------------- |
| **values.feeAddress** | `feeAddress` from parameters             |
| **values.feeAmount**  | `feeAmount` from parameters              |
| **events**            | Add a 'fee' event (see below) at its end |

the 'addFee' event:

|  Property                 |  Value                          |
| ------------------------- | ------------------------------- |
| **name**                  | Constant value: "addFeeAddress" |
| **parameters**            |                                 |
| **parameters.feeAddress** | `feeAddress` from parameters    |
| **parameters.feeAmount**  | `feeAmount` from parameters     |

## Action: declareReceivedPayment

### Parameters

|                       | Type   | Description                                          | Requirement   |
| --------------------- | ------ | ---------------------------------------------------- | ------------- |
| **id**                | String | Constant value: "pn-eth-fee-proxy-contract"          | **Mandatory** |
| **action**            | String | Constant value: "declareReceivedPayment"             | **Mandatory** |
| **parameters**        | Object |                                                      |               |
| **parameters.amount** | Amount | The amount declared as received, in request currency | **Mandatory** |
| **parameters.note**   | String | Additional information about the payment             | Optional      |
| **parameters.txHash** | String | The transaction hash for documentation and metadata  | Optional      |

### Conditions

This action is valid, if:

- The extension state with the id "pn-eth-fee-proxy-contract" exists
- The signer is the `payee`

### warnings

None.

### Results

An event is added to the extension state events array:

|  Property             |  Value                                   |
| --------------------- | -----------------------------------------|
| **name**              | Constant value: "declareReceivedPayment" |
| **parameters**        |                                          |
| **parameters.amount** | `amount` from parameters                 |
| **parameters.note**   | `note` from parameters                   |
| **parameters.txHash** | `txHash` from parameters or undefined    |

## Action: declareReceivedRefund

### Parameters

|                       | Type   | Description                                          | Requirement   |
| --------------------- | ------ | ---------------------------------------------------- | ------------- |
| **id**                | String | Constant value: "pn-eth-fee-proxy-contract"          | **Mandatory** |
| **action**            | String | Constant value: "declareReceivedRefund"              | **Mandatory** |
| **parameters**        | Object |                                                      |               |
| **parameters.amount** | Amount | The amount declared as received, in request currency | **Mandatory** |
| **parameters.note**   | String | Additional information about the payment             | Optional      |
| **parameters.txHash** | String | The transaction hash for documentation and metadata  | Optional      |

### Conditions

This action is valid, if:

- The extension state with the id "pn-eth-fee-proxy-contract" exists
- The signer is the `payee`

### warnings

None.

### Results

An event is added to the extension state events array:

|  Property             |  Value                                   |
| --------------------- | -----------------------------------------|
| **name**              | Constant value: "declareReceivedRefund"  |
| **parameters**        |                                          |
| **parameters.amount** | `amount` from parameters                 |
| **parameters.note**   | `note` from parameters                   |
| **parameters.txHash** | `txHash` from parameters or undefined    |

---

## Interpretation

The fee proxy contract address is determined by the `request.currency.network` (see (table)[#Contract] with proxy contract addresses). Only transactions on this network are valid.

Any `TransferWithReferenceAndFee` event emitted from the proxy contract with the following arguments is considered a payment:

- `tokenAddress === request.currency.value`
- `to === paymentAddress`
- `paymentReference === last8Bytes(hash(lowercase(requestId + salt + payment address)))`

Any `declareReceivedPayment` event is considered a payment.

Any `declareReceivedRefund` event is considered a refund.

Any `TransferWithReferenceAndFee` evens emitted from the proxy contract with the following arguments is considered a refund:

- `tokenAddress === request.currency.value`
- `to === refundAddress`
- `paymentReference === last8Bytes(hash(lowercase(requestId + salt + refund address)))`

The sum of payment amounts minus the sum of refund amounts is considered the balance.

The fees amount can be be infered from the `TransferWithReferenceAndFee` events emitted from the proxy contract.
