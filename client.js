
const request = require('request-promise-native');

class MudHTTPClient {
	constructor( serviceURL, logger ){
		this.base = serviceURL;
		this.logger = logger.child({mud: "http-v1", serviceURL});
	}

	async store_value( container, key, object ) {
		this.logger.trace("Storing simple value", {key, object});
		const storage_result = await request.post({
			url: this.base + "/container/" + container + "/object/" + key,
			headers: {
				'X-Mud-Type' : 'Immediate'
			},
			body: { object: object},
			json: true});
		this.logger.trace("Storage result", storage_result);
		return storage_result;
	}

	async get_value( container, key) {
		this.logger.trace("Retrieving key", {container, key});
		const result = JSON.parse(await request.get({
			url: this.base + "/container/" + container + "/object/" + key,
			headers: {
				'X-Mud-Type' : 'Immediate'
			}
		}));
		this.logger.trace("Retrieval instructions", {container, key, result});
		return result;
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
