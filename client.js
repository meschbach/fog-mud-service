
const request = require('request-promise-native');

class MudHTTPClient {
	constructor( serviceURL, logger ){
		this.base = serviceURL;
		this.logger = logger.child({mud: "http-v1", serviceURL});
	}

	async store_value( container, key, object ) {
		this.logger.trace("Storing simple value", {key, object});
		const storage_instructions = await request.post({url: this.base + "/container/" + container + "/object/" + key, body: {}, json: true});
		this.logger.trace("Storage instructions", storage_instructions);

		const blocks = storage_instructions.blocks;
		const results = await Promise.all(blocks.map(( {url}, index ) =>{
			this.logger.trace("Block at location", {url, index});
			return request.post({url: url, body: object });
		}));
		return results;
	}

	async get_value( container, key) {
		this.logger.trace("Retrieving key", {key});
		const retrieval_instructions = JSON.parse(await request.post({url: this.base + "/container/" + container + "/object/" + key}));
		this.logger.trace("Retrieval instructions", {key, retrieval_instructions});

		const blocks = retrieval_instructions.blocks;
		if( blocks.length != 1 ){
			throw new Error("TODO");
		}
		const block = blocks[0];
		const value = await request.get({url: block.url });
		this.logger.trace("Retrieved block", value);
		return value;
	}
}

const bunyan = require('bunyan');
const log = bunyan.createLogger({name: 'mud-client', level: process.env.LOG_LEVEL || 'info'});

const {main} = require('junk-drawer');
main( async (logger) => {
	const base = "http://localhost:9977";
	const client = new MudHTTPClient( base, logger );
	await client.store_value( "test", "one-level-object", "example text of a value");
	const result = await client.get_value( "test", "one-level-object");
	logger.info("Received result", {result});
}, log);
