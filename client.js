
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
		this.logger.trace("Streaming to ", {container, key, url});
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

	async list( container, prefix ){
		this.logger.trace("Listing", {container, prefix});
		const prefixResults = await request({
			url: this.base + "/container/" + container + "?list=" + prefix,
			headers: {
				'X-Mud-Type' : 'Immediate'
			},
			json: true});
		this.logger.trace("Prefix results", prefixResults);
		return prefixResults;
	}

	async delete( container, key ){
		this.logger.trace("Deleting", {container, key});
		try {
			const deleteResults = await request({
				url: this.base + "/container/" + container + "/object/" + key,
				headers: {},
				json: true,
				method: "DELETE"
			});
			this.logger.trace("Deleted", deleteResults);
			return deleteResults;
		}catch (e) {
			throw new Error("Failed to delete '" + key + "' from container '" + container + "' because " + e.message );
		}
	}

	async initiateObjectBackup(){
		const url = this.base + "/object-backup";
		this.logger.trace("Initiate Object Backup for all containers");
		const config = {
			url: url,
			headers: { },
			json: true
		};

		try {
			const result = await request( config );
			this.logger.trace("Done with object backup request", result);
			return result;
		}catch(e) {
			if (e.statusCode == 404) {
				throw new Error("Object backup not supported (404 for " + url + " )");
			} else if( e.statusCode == 500 ){
				throw new Error("Server error ( "+ e.statusCode + " for " + url + ": '" + e.statusText+ "' )");
			} else {
				throw e;
			}
		}
	}

	async incrementalBackupChanges( momento ){
		const url = this.base + "/object-backup/" + momento;
		this.logger.trace("Incremental backup using momento", {momento});
		const config = {
			url: url,
			headers: { },
			json: true
		};

		try {
			const result = await request( config );
			this.logger.trace("Done with incremental backup", {momento, statusCode: result.statusCode});
			return result;
		}catch(e) {
			if (e.statusCode == 404) {
				throw new Error("Object backup not supported (404 for " + url + " )");
			} else if( e.statusCode == 500 ){
				throw new Error("Server error ( "+ e.statusCode + " for " + url + ": '" + e.statusText+ "' )");
			} else {
				throw e;
			}
		}
	}
}

module.exports = {
	MudHTTPClient
};
