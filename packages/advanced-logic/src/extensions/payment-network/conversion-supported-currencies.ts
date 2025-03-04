import { RequestLogicTypes } from '@requestnetwork/types';

/**
 * These currencies are supported by Chainlink for conversion.
 */
export const supportedCurrencies: Record<string, Record<RequestLogicTypes.CURRENCY, string[]>> = {
  private: {
    [RequestLogicTypes.CURRENCY.ISO4217]: ['USD', 'EUR'],
    [RequestLogicTypes.CURRENCY.ERC20]: ['0x38cf23c52bb4b13f051aec09580a2de845a7fa35'],
    [RequestLogicTypes.CURRENCY.ETH]: ['ETH'],
    [RequestLogicTypes.CURRENCY.BTC]: [],
  },
  rinkeby: {
    [RequestLogicTypes.CURRENCY.ISO4217]: ['EUR', 'GBP', 'USD'],
    [RequestLogicTypes.CURRENCY.ERC20]: ['0xfab46e002bbf0b4509813474841e0716e6730136'],
    [RequestLogicTypes.CURRENCY.ETH]: ['ETH-rinkeby'],
    [RequestLogicTypes.CURRENCY.BTC]: [],
  },
  mainnet: {
    [RequestLogicTypes.CURRENCY.ISO4217]: ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'SGD', 'USD'],
    [RequestLogicTypes.CURRENCY.ERC20]: [
      '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
      '0x3845badade8e6dff049820680d1f14bd3903a5d0',
      '0x4e15361fd6b4bb609fa63c81a2be19d873717870',
      '0x6b175474e89094c44da98b954eedeac495271d0f',
      '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      '0x8290333cef9e6d528dd5618fb97a76f268f3edd4',
      '0x8ab7404063ec4dbcfd4598215992dc3f8ec853d7',
      '0x967da4048cd07ab37855c090aaf366e4ce1b9f48',
      '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0xa117000000f279d81a1d3cc75430faa017fa5a2e',
      '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
    ],
    [RequestLogicTypes.CURRENCY.ETH]: ['ETH'],
    [RequestLogicTypes.CURRENCY.BTC]: [],
  },
  matic: {
    [RequestLogicTypes.CURRENCY.ISO4217]: ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'SGD', 'USD'],
    [RequestLogicTypes.CURRENCY.ERC20]: [
      '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      '0x831753dd7087cac61ab5644b308642cc1c33dc13',
    ],
    [RequestLogicTypes.CURRENCY.ETH]: ['ETH'],
    [RequestLogicTypes.CURRENCY.BTC]: [],
  },
  fantom: {
    ISO4217: ['CHF', 'USD'],
    ERC20: ['0x10bf4137b0558c33c2dc9f71c3bb81c2865fa2fb'],
    ETH: [],
    BTC: [],
  },
};
