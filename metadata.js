/*
 * Version 1 HTTP interface
 */

const assert = require("assert");

const express = require('express');
const morgan = require('morgan');
const {make_async} = require('junk-bucket/express');
const Future = require('junk-bucket/future');
const promiseEvent = Future.promiseEvent;

const bodyParser = require('body-parser');
const request = require('request-promise-native');
const requestStream = require('request');

const {sha256_from_string} = require("./junk");

/***********************************************************************************************************************
 * Internal Dependencies
 **********************************************************************************************************************/
const {buildAuthorizationEngine} = require('./security');
const {objectBackupHTTP} = require('./metadata/object-backup');

/***********************************************************************************************************************
 * Implementation
 **********************************************************************************************************************/
async function http_v1( log, coordinator, config ) { //TODO: The client and system interfaces should be broken apart
	const nodes = {};

	const storage = coordinator.storage;
	const securityLayer = await buildAuthorizationEngine( config, log.child({layer: "security"}) );

	const app = make_async(express());
	const morganLogger = log.child({component:"http/morgan"});
	app.use(morgan('short', {
		stream: {
			write: function(message) {
				morganLogger.info(message);
			}
		}
	}));
	app.use(bodyParser.json());

	app.a_get("/container/:container", async (req, resp) => {
		const prefix = req.query["list"];
		const container = req.params["container"];

		if( !(await securityLayer.authorized(req, "list")) ){
			log.trace( "Security layer denied listing", {container, prefix} );
			return resp.forbidden("Denied");
		}

		log.trace( "Listing", {container, prefix} );

		const subkeys = await storage.list( container, prefix );
		resp.json({keys: subkeys});
	});

	app.a_get("/container", async (req,resp) => {
		if( !(await securityLayer.authorized(req, "list-containers")) ){
			log.trace( "Security layer denied listing containers" );
			return resp.forbidden("Denied");
		}
		const containers = await storage.listContainers();
		resp.json({containers});
	});

	app.a_get("/container/:container/object/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		// Authorize
		if( !(await securityLayer.authorized(req, "get")) ){
			log.trace( "Denying get", {container, prefix} );
			return resp.forbidden("Denied");
		}

		//
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

	app.a_get("/container/:container/object-stream/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		// Authorize
		if( !(await securityLayer.authorized(req, "get")) ){
			log.trace( "Denying get", {container, key} );
			return resp.forbidden("Denied");
		}
		//
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
		// Authorize
		if( !(await securityLayer.authorized(req, "put")) ){
			log.trace( "Denying get", {container, key} );
			return resp.forbidden("Denied");
		}
		//
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default nodes
		if( Object.keys(nodes).length <= 0 ){
			log.warn("No nodes available to store data");
			resp.status( 503 ).send( "No backing nodes registered" ); //TODO: This needs a test
			return resp.end();
		}
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit registration
		log.info("Using node for ingress storage", {service});
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;

		await storage.stored( container, key, key_sha256 );

		const result = await request.post({
			url: serviceURL,
			body: req.body.object
		});
		resp.json(result);
	});


	app.post("/container/:container/object-stream/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		// Authorize
		if( !(await securityLayer.authorized(req, "put")) ){
			log.trace( "Denying get", {container, key} );
			return resp.forbidden("Denied");
		}
		//
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default ndoes
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit registration
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;
		req.pipe(requestStream.post(serviceURL)).on('response', () => {
			storage.stored( container, key, key_sha256 ).then( () =>{
				resp.end();
			}, () => {
				resp.statusCode = 502;
				resp.end();
			});
		}).on('end', () => {
			log.trace("Completed streaming", {container, key});
		});
	});

	app.a_delete("/container/:container/object/*", async function(req, resp) {
		const key = req.params[0];
		const container = req.params["container"];
		// Authorize
		if( !(await securityLayer.authorized(req, "delete")) ){
			log.trace( "Denying delete", {container, key} );
			return resp.forbidden("Denied");
		}
		// Verify we have the object
		const result = await storage.deleteObject(container, key);
		return resp.json({});
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

	//backup interface
	app.use("/object-backup", objectBackupHTTP( log.child({subsystem: "backup"}), storage));

	const addressFuture = new Future();
	const result = {
		address: addressFuture.promised,
		end: function() {
			server.close();
		}
	};
	const server = app.listen( config.port || 0, config.address || '127.0.0.1', (error) => {
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
