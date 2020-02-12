import { Server } from 'hapi'
import { TransactionsService } from './services/transactions-service'
import * as TransactionRequestsController from './controllers/transaction-requests-controller'
import * as QuotesController from './controllers/quotes-controller'
import * as PartiesController from './controllers/parties-controller'
import swagger from './interface/swagger.json'
import { IsoMessagingClient } from './services/iso-messaging-client'
import { IsoMessageService } from './services/iso-message-service'
import { QuotesService } from './services/quotes-service'
import { AuthorizationsService } from './services/authorizations-service'
import * as AuthorizationController from './controllers/authorizations-controller'
import { TransfersService } from './services/transfers-service'
import * as TransfersController from './controllers/transfers-controller'
import { MojaloopRequests } from '@mojaloop/sdk-standard-components'
import { QueueService } from './services/queue-service'
import * as TransactionRequestErrorsController from './controllers/transaction-request-errors-controller'
import * as AuthorizationErrorsController from './controllers/authorization-errors-controller'
import * as QuoteErrorsController from './controllers/quote-errors-controller'
import * as TransferErrorsController from './controllers/transfer-errors-controller'

const CentralLogger = require('@mojaloop/central-services-logger')

export type AdaptorConfig = {
  port?: number | string;
  host?: string;
}

export type AdaptorServices = {
  transactionsService: TransactionsService;
  isoMessagesService: IsoMessageService;
  quotesService: QuotesService;
  authorizationsService: AuthorizationsService;
  mojaClient: MojaloopRequests;
  logger: Logger;
  transfersService: TransfersService;
  queueService: QueueService;
}

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  debug: (message: string) => void;
  error: (message: string) => void;
}

declare module 'hapi' {
  interface ApplicationState {
    transactionsService: TransactionsService;
    isoMessagesService: IsoMessageService;
    quotesService: QuotesService;
    authorizationsService: AuthorizationsService;
    mojaClient: MojaloopRequests;
    logger: Logger;
    isoMessagingClients: Map<string, IsoMessagingClient>;
    transfersService: TransfersService;
    queueService: QueueService;
  }
}

export async function createApp (services: AdaptorServices, config?: AdaptorConfig): Promise<Server> {

  const adaptor = new Server(config)

  // register services
  adaptor.app.transactionsService = services.transactionsService
  adaptor.app.isoMessagesService = services.isoMessagesService
  adaptor.app.quotesService = services.quotesService
  adaptor.app.authorizationsService = services.authorizationsService
  adaptor.app.mojaClient = services.mojaClient
  adaptor.app.isoMessagingClients = new Map()
  adaptor.app.transfersService = services.transfersService
  adaptor.app.queueService = services.queueService
  adaptor.app.logger = services.logger

  await adaptor.register({
    plugin: require('hapi-openapi'),
    options: {
      api: swagger,
      handlers: {
        health: {
          get: () => ({ status: 'ok' })
        },
        transactionRequests: {
          '{ID}': {
            put: TransactionRequestsController.update,
            error: {
              put: TransactionRequestErrorsController.create
            }
          }
        },
        authorizations: {
          '{ID}': {
            get: AuthorizationController.show,
            error: {
              put: AuthorizationErrorsController.create
            }
          }
        },
        parties: {
          '{Type}': {
            '{ID}': {
              put: PartiesController.update
            }
          }
        },
        quotes: {
          post: QuotesController.create,
          '{ID}': {
            put: () => 'dummy handler',
            error: {
              put: QuoteErrorsController.create
            }
          }
        },
        transfers: {
          post: TransfersController.create,
          '{ID}': {
            put: TransfersController.update,
            error: {
              put: TransferErrorsController.create
            }
          }
        }
      }
    }
  })

  return adaptor
}
