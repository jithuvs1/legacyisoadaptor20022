import { Request, ResponseToolkit, ResponseObject } from 'hapi'
import { ISO0200 } from 'types/iso-messages'
import { AuthorizationsIDPutResponse } from 'types/mojaloop'
import { TransactionState } from '../services/transactions-service'
// const uuid = require('uuid/v4')

export async function show (request: Request, h: ResponseToolkit): Promise <ResponseObject> {
  try {
    const transactionRequestID = request.params.ID
    const transactionsService = request.server.app.transactionsService
    const transaction = await transactionsService.get(transactionRequestID, 'transactionRequestId')
    const isoMessageService = request.server.app.isoMessagesService
    const iso0100 = await isoMessageService.get(transactionRequestID, transaction.lpsKey, '0100')
    const iso0110 = {
      0: '0110',
      3: iso0100[3],
      4: iso0100[4],
      7: iso0100[7],
      11: iso0100[11],
      28: iso0100[28],
      37: iso0100[37],
      39: '00',
      41: iso0100[41],
      42: iso0100[42],
      49: iso0100[49],
      102: iso0100[102],
      103: iso0100[103],
      127.2: iso0100[127.2]
    }

    const iso110db = await isoMessageService.create(transactionRequestID, transaction.lpsKey, transaction.lpsId, iso0110)

    if (!iso110db) {
      throw new Error('Error creating Authorization transaction request.')
    }
    const client = request.server.app.isoMessagingClients.get(transaction.lpsId)

    if (!client) {
      console.log('cant get any client here !')
      throw new Error('No client is set')
    }

    await client.sendAuthorizationRequest(iso110db)

    return h.response().code(200)
  } catch (error) {
    request.server.app.logger.error(`Error creating Authorization transaction request. ${error.message}`)
    return h.response().code(500)
  }

}

export async function update (request: Request, h: ResponseToolkit): Promise<ResponseObject> {
  try {

    request.server.app.logger.info('iso8583 Authorization  Controller: Received request from tcp-relay request. payload:' + JSON.stringify(request.payload))
    const isoMessage = request.payload as ISO0200
    const { lpsKey, lpsId } = isoMessage
    const transactionsService = request.server.app.transactionsService
    const authorizationsService = request.server.app.authorizationsService
    const isoMessageService = request.server.app.isoMessagesService
    const transaction = await transactionsService.getTransactiontransactionRequestId(lpsKey, lpsId)
    if (!transaction.transactionRequestId) {
      throw new Error('Cannot find transactionRequestId')
    }
    const db200 = await isoMessageService.create(transaction.transactionRequestId, lpsKey, lpsId, isoMessage)
    if (!db200) {
      throw new Error('Cannot Insert 0200 message')
    }
    const authorizationTransaction = await transactionsService.updateState(transaction.transactionRequestId, 'transactionRequestId', TransactionState.financialRequestSent)
    if (!authorizationTransaction) {

      throw new Error('Cannot Update  transaction state to financial request sent')
    }
    const headers = {
      'fspiop-destination': request.headers[`${authorizationTransaction.payer.fspId}`],
      'fspiop-source': request.headers[`${transaction.payer.fspId}`]
    }

    const authorizationsResponse: AuthorizationsIDPutResponse = {
      authenticationInfo: authorizationTransaction.authenticationType,
      responseType: db200[103]
    }
    await authorizationsService.sendAuthorizationsResponse(transaction.transactionRequestId, authorizationsResponse, headers)

    return h.response().code(200)
  } catch (error) {
    request.server.app.logger.error(`iso8583 Authorizations Requests Controller: Error creating transaction request. ${error.message}`)

    return h.response().code(500)
  }
}
