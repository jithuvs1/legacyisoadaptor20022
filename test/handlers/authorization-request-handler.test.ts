import Knex from 'knex'
import { AdaptorServicesFactory } from '../factories/adaptor-services'
import { ISO0100Factory } from '../factories/iso-messages'
import { authorizationRequestHandler } from '../../src/handlers/authorization-request-handler'
import { TransactionState, Transaction, LpsMessage, LegacyMessageType } from '../../src/models'
import { Model } from 'objection'
const uuid = require('uuid/v4')
const Logger = require('@mojaloop/central-services-logger')
Logger.log = Logger.info

describe('Authorization Request Handler', function () {
  let knex: Knex
  const services = AdaptorServicesFactory.build()
  const transactionInfo = {
    lpsId: 'lps1',
    lpsKey: 'lps1-001-abc',
    transactionRequestId: uuid(),
    transactionId: uuid(),
    initiator: 'PAYEE',
    initiatorType: 'DEVICE',
    scenario: 'WITHDRAWAL',
    amount: '100',
    currency: 'USD',
    state: TransactionState.quoteResponded,
    expiration: new Date(Date.now()).toUTCString(),
    authenticationType: 'OTP',
    payer: {
      type: 'payer',
      identifierType: 'MSISDN',
      identifierValue: '0821234567',
      fspId: 'mojawallet'
    },
    payee: {
      type: 'payee',
      identifierType: 'DEVICE',
      identifierValue: '1234',
      subIdOrType: 'abcd',
      fspId: 'adaptor'
    },
    quote: {
      id: uuid(),
      transferAmount: '107',
      transferAmountCurrency: 'USD',
      amount: '100',
      amountCurrency: 'USD',
      feeAmount: '7',
      feeCurrency: 'USD',
      ilpPacket: 'test-packet',
      condition: 'test-condition',
      expiration: new Date(Date.now() + 10000).toUTCString()
    }
  }

  beforeAll(async () => {
    knex = Knex({
      client: 'sqlite3',
      connection: {
        filename: ':memory:',
        supportBigNumbers: true
      },
      useNullAsDefault: true
    })
    Model.knex(knex)
  })

  beforeEach(async () => {
    await knex.migrate.latest()
  })

  afterEach(async () => {
    await knex.migrate.rollback()
  })

  afterAll(async () => {
    await knex.destroy()
  })

  test('puts LegacyAuthorizationResponse message on to AuthorizationResponses queue for the lps that the transaction request came from', async () => {
    const legacyAuthRequest = await LpsMessage.query().insertAndFetch({ lpsId: transactionInfo.lpsId, lpsKey: transactionInfo.lpsKey, type: LegacyMessageType.authorizationRequest, content: ISO0100Factory.build() })
    const transaction = await Transaction.query().insertGraph(transactionInfo)
    await transaction.$relatedQuery<LpsMessage>('lpsMessages').relate(legacyAuthRequest)
    const headers = {
      'fspiop-source': 'payerFSP',
      'fspiop-destination': 'payeeFSP'
    }

    await authorizationRequestHandler(services, transactionInfo.transactionRequestId, headers)

    expect(services.queueService.addToQueue).toHaveBeenCalledWith('lps1AuthorizationResponses', {
      lpsAuthorizationRequestMessageId: legacyAuthRequest.id,
      fees: {
        amount: '7',
        currency: 'USD'
      },
      transferAmount: {
        amount: '107',
        currency: 'USD'
      }
    })
  })

  test('updates transaction state to be authSent', async () => {
    const legacyAuthRequest = await LpsMessage.query().insertAndFetch({ lpsId: transactionInfo.lpsId, lpsKey: transactionInfo.lpsKey, type: LegacyMessageType.authorizationRequest, content: ISO0100Factory.build() })
    let transaction = await Transaction.query().insertGraph(transactionInfo)
    await transaction.$relatedQuery<LpsMessage>('lpsMessages').relate(legacyAuthRequest)
    const headers = {
      'fspiop-source': 'payerFSP',
      'fspiop-destination': 'payeeFSP'
    }

    await authorizationRequestHandler(services, transactionInfo.transactionRequestId, headers)

    transaction = await transaction.$query()
    expect(transaction.state).toBe(TransactionState.authSent)
    expect(transaction.previousState).toBe(TransactionState.quoteResponded)
  })

  test('sends error message if it fails to process the authorization request', async () => {
    const headers = {
      'fspiop-source': 'payerFSP',
      'fspiop-destination': 'payeeFSP'
    }

    await authorizationRequestHandler(services, transactionInfo.transactionRequestId, headers)

    expect(services.authorizationsService.sendAuthorizationsErrorResponse).toHaveBeenCalled()
  })
})