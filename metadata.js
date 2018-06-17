/*
 * Version 1 HTTP interface
 */

const express = require('express');
const morgan = require('morgan');
const {make_async} = require('junk-drawer/express');
const Future = require('junk-drawer/future');
const promiseEvent = Future.promiseEvent;

const bodyParser = require('body-parser');
const request = require('request-promise-native');
const requestStream = require('request');

const crypto = require('crypto');
function sha256_from_string( str ){
	const hash = crypto.createHash('sha256');
	hash.update(str);
	return hash.digest("hex");
}

const levelup = require('levelup');
const leveldown = require('leveldown');

function v0_key( container, key ){
	return container + ":" + key;
}

class LevelMetadataStore {
	constructor( database, logger ){
		this.database = database;
		this.logger = logger;
	}

	stored( container, key ){
		return this.database.put( v0_key(container, key), {v:0, key});
	}

	async block( container, key ){
		const record = await this.database.get( v0_key(container, key) );
		if( record.v != 0 ){
			throw new Error("Unable to parse record version");
		}
		return record.block;
	}

	async list( container, prefix ){
		const keyPrefix = v0_key( container, prefix );
		const keys = [];
		await promiseEvent( this.database.createKeyStream().on('data', ( rawKey ) => {
			const fullKey = rawKey.toString('utf-8');
			this.logger.info("Received data record: ", fullKey);
			if( fullKey.startsWith( keyPrefix ) ){
				const key = fullKey.substring(container.length + prefix.length + 1);
				keys.push( key );
			}
		}), 'end');
		return keys;
	}
}

function http_v1( log, coordinator, config ) {
	const nodes = {};

	const storage = new LevelMetadataStore( coordinator.levelup, log.child({storage: 'leveldb'}) );

	const app = make_async(express());
	app.use(morgan('short'));
	app.use(bodyParser.json());

	app.a_get("/container/:container", async (req, resp) => {
		const prefix = req.query["list"];
		const container = req.params["container"];
		log.trace( "Listing", {container, prefix} );

		const subkeys = await storage.list( container, prefix );
		resp.json({keys: subkeys});
	});

	app.a_get("/container/:container/object/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default nodes
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit design, should support getting a number of blocks too
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;
		log.info("Requested object storage", {container, key, key_sha256, serviceURL});
		//TODO: Under many cases I probably don't care about blocking
		const response = await request.get({
			url: serviceURL
		});
		log.trace("result of remote get", {response});
		resp.json(response);
	});

	app.get("/container/:container/object-stream/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default nodes
		log.info("Nodes available for storage: ", nodes);
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit design, should support getting a number of blocks too
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;
		log.info("Requested object storage", {container, key, key_sha256, serviceURL});
		//TODO: Under many cases I probably don't care about blocking
		requestStream(serviceURL).pipe(resp);
	});

	app.a_post("/container/:container/object/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default nodes
		if( Object.keys(nodes).length <= 0 ){
			throw new Error("No nodes registered");
		}
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit registration
		log.info("Using node for ingress storage", {service});
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;

		storage.stored( container, key );

		const result = await request.post({
			url: serviceURL,
			body: req.body.object
		});
		resp.json(result);
	});


	app.post("/container/:container/object-stream/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default ndoes
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit registration
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;
		req.pipe(requestStream.post(serviceURL)).on('response', () => {
			resp.end();
		});
	});


	//Node controls
	app.a_post("/nodes/:name", async (req, resp) => {
		const details = req.body;
		log.info("Add node request", details);
		if( !details.host ){
			resp.status(422);
			return resp.json({invalid: {missing: ["host"]}});
		}
		if( !details.port ){
			resp.status(422);
			return resp.json({invalid: {missing: ["port"]}});
		}
		const host = details.host;
		const port = details.port;

		//TODO: A less stupid approach to this
		const name = req.params["name"];
		// if( nodes[name] ) {
		// 	resp.status(409, "Node name already exists");
		// 	resp.end();
		// }

		nodes[name] = {host, port};
		resp.end()
	});

	const addressFuture = new Future();
	const result = {
		address: addressFuture.promised,
		end: function() {
			server.close();
		}
	};
	const server = app.listen( config.port || 0, '127.0.0.1', (error) => {
		if( error ){
			log.error("Failed to bind to port", config.port, error );
			addressFuture.reject(error);
			return;
		}
		const address = server.address();
		if( address == undefined ){
			throw new Error("Listening but not bound?");
		}
		log.info("HTTP listener bound on ", address);
		addressFuture.accept(address);
	});
	return result;
}

module.exports = {
	http_v1
};
