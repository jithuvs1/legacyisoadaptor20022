
exports.up = function(knex) {
	return knex.schema
    .createTable('transfers', function (table) {
      table.string('id').primary()
      table.string('quoteId')
      table.foreign('quoteId').references('id').inTable('quotes')
      table.string('transactionRequestId')
      table.foreign('transactionRequestId').references('transactionRequestId').inTable('transactions')
      table.string('fullfilment')
      table.string('transferState')
      table.string('amount')
      table.string('currency', 3)
    })
};

exports.down = function(knex) {
	return knex.schema.dropTableIfExists('transfers')
};
