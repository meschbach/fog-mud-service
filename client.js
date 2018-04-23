
const request = require('request-promise-native');
const requestBase = require('request');

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

	stream_to( container, key ){
		const url = this.base + "/container/" + container + "/object-stream/" + key;
		this.logger.trace("Streaming from ", {container, key, url});
		return requestBase.post( url );
	}

	async get_value( container, key) {
		this.logger.trace("Retrieving key", {container, key});
		const result = JSON.parse(await request.get({
			url: this.base + "/container/" + container + "/object/" + key
		}));
		this.logger.trace("Retrieval instructions", {container, key, result});
		return result;
	}

	stream_from( container, key ){
		const url = this.base + "/container/" + container + "/object-stream/" + key ;
		this.logger.trace("Streaming from", {container, key, url});
		return requestBase.get( url );
	}
}

module.exports = {
	MudHTTPClient
};
