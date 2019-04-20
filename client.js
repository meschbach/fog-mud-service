
const assert = require("assert");
const request = require('request-promise-native');
const requestBase = require('request');

class MudHTTPClient {
	constructor( serviceURL, logger ){
		this.base = serviceURL;
		this.logger = logger.child({mud: "http-v1", serviceURL});
		this.baseHeaders = {};
	}

	attachJWT( jwt ){
		this.baseHeaders["Authorization"] = "Token " + jwt;
	}

	async store_value( container, key, object) {
		if( object === undefined ){ object = null; }
		try {
			this.logger.trace("Storing simple value", {key, object});
			const storage_result = await request.post({
				url: this.base + "/container/" + container + "/object/" + key,
				headers: Object.assign({
					'X-Mud-Type': 'Immediate'
				}, this.baseHeaders),
				json: {object}
			});
			this.logger.trace("Storage result", {storage_result});
			return storage_result;
		}catch(e) {
			if( e.statusCode == 503 ) {
				throw new Error("Unavailable: " + e.message);
			} else if( e.statusCode == 500 ){
				throw new Error("Server error: " + e.message)
			} else {
				throw new Error("Mud client request error: " + e.message);
			}
		}
	}

	stream_to( container, key ){
		const url = this.base + "/container/" + container + "/object-stream/" + key;
		this.logger.trace("Streaming to ", {container, key, url});
		return requestBase.post( url );
	}

	async get_value( container, key) {
		this.logger.trace("Retrieving key", {container, key});
		try {
			const responseEntity = await request.get({
				url: this.base + "/container/" + container + "/object/" + key,
				json: true
			});
			return responseEntity;
		}catch(e){
			if( e.statusCode === 404){
				throw new Error("No such key '" + key + "' in container '" + container + "'");
			} else {
				throw new Error("Failed to retrieve value because: " + e.message);
			}
		}
	}

	stream_from( container, key ){
		const url = this.base + "/container/" + container + "/object-stream/" + key ;
		this.logger.trace("Streaming from", {container, key, url});
		return requestBase.get({url: url, headers: this.baseHeaders } );
	}

	async list( container, prefix ){
		assert(container, "container");
		this.logger.trace("Listing", {container, prefix});
		const url = this.base + "/container/" + container + "?list=" + prefix;
		try {
			const prefixResults = await request({
				method: "GET",
				url: url,
				headers: Object.assign({
					'X-Mud-Type': 'Immediate'
				}, this.baseHeaders),
				json: true
			});

			this.logger.trace("Prefix results", prefixResults);
			return prefixResults;
		}catch (e) {
			if( e.statusCode == 403 ){
				throw new Error("Forbidden -- " + e.options.method  + " " + e.options.url);
			}else {
				throw e;
			}
		}
	}

	async listContainers( ){
		this.logger.trace("Listing containers");
		try {
			const results = await request({
				url: this.base + "/container",
				headers: {},
				json: true,
				method: "GET"
			});
			this.logger.trace("Completed container listing");
			return results;
		}catch(e){
			throw new Error("Failed to list containers because " + e.message );
		}
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
			this.logger.trace("Deleted", {deleteResults});
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
				throw new Error("Unexpected error communicating with server @ " + url + ": " + e.message);
			}
		}
	}

	async incrementalBackupChanges( momento ){
		assert( momento );
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
				throw new Error("Unexpected error communicating with server @ " + url + ": " + e.message);
			}
		}
	}
}

module.exports = {
	MudHTTPClient
};
