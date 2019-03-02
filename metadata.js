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
const {buildNodesHTTPv1} = require("./metadata/http-nodes");
const {objectBackupHTTP} = require('./metadata/object-backup');

/***********************************************************************************************************************
 * Implementation
 **********************************************************************************************************************/
async function http_v1( log, coordinator, config ) { //TODO: The client and system interfaces should be broken apart
	const storage = coordinator.storage;
	const metadataStorage = storage ; //Aliased since storage isn't a great name.
	const nodesStorage = coordinator.nodesStorage;
	assert(nodesStorage);
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
		//Find the last node it was stored
		const onlineNode = (await nodesStorage.onlineNodes())[0];
		if( !onlineNode ){
			resp.status(503).send("No nodes online");
			return;
		}
		const service = onlineNode.address;
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
		const node = (await nodesStorage.allNodes())[0];
		const service = node.address;
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
		const value = req.body.object;
		const size = !value ? 0 : value.length;
		const matchingNodes = await nodesStorage.findAvailableSpace(size);

		if( !matchingNodes ){
			log.warn("No nodes available to store data");
			resp.status( 503 ).send( "No space available" );
			return resp.end();
		}
		const service = matchingNodes.address;
		//TODO: Revisit registration
		log.info("Using node for ingress storage", {service});
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;

		const eventID = await metadataStorage.stored( container, key, key_sha256 );
		log.info("Completed recording storage event");

		const result = await request.post({
			url: serviceURL,
			body: req.body.object
		});
		const momento = await metadataStorage.currentVersion();
		log.info("Completed storage", {eventID, momento});
		resp.json({momento});
	});


	app.a_post("/container/:container/object-stream/*", async (req, resp) => {
		const reserveSpaceForStream = 1024 * 1024;

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
		/*
		 * Find available nodes
		 */
		const matchingNode = await nodesStorage.findAvailableSpace(reserveSpaceForStream);
		if( !matchingNode ){
			log.warn("No nodes available to store data");
			resp.status( 503 ).send( "No backing nodes registered" ); //TODO: This needs a test
			return resp.end();
		}
		const storageNode = matchingNode;
		const service = storageNode.address;
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
		// TODO: Verify the object exists and the storage locations
		// Log we have deleted the object in question
		const result = await storage.deleteObject(container, key);
		resp.status(204).end();
	});

	//Node controls
	app.use("/nodes", buildNodesHTTPv1( log.child({subsystem: "nodes", iface: "httpv1"}), nodesStorage));
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
