
const bunyan = require('bunyan');
const log = bunyan.createLogger({name: 'mud-client', level: process.env.LOG_LEVEL || 'info'});

const {MudHTTPClient} = require('./client');

const {main} = require('junk-drawer');
main( async (logger) => {
	const base = "http://localhost:9977";
	const client = new MudHTTPClient( base, logger );
	await client.store_value( "test", "one-level-object", "example text of a value");
	const result = await client.get_value( "test", "one-level-object");
	logger.info("Received result", {result});
}, log);
