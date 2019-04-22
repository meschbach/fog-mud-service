/*
 * Version 1 HTTP interface
 */

const assert = require("assert");

const express = require('express');
const morgan = require('morgan');
const {make_async} = require('junk-bucket/express');
const Future = require('junk-bucket/future');
const {promisePiped} = require('junk-bucket/streams');

const bodyParser = require('body-parser');

const {sha256_from_string, endStream, logMorganTo} = require("./junk");

/***********************************************************************************************************************
 * TODO: Junk to be moved
 **********************************************************************************************************************/
async function putBytes(vfs, name, buffer) {
	if( vfs.putBytes ){
		await vfs.putBytes(name,buffer);
	} else {
		const output = vfs.createWritableStream(name);
		await endStream(output, buffer);
	}
}

async function putJSONAsBytes(vfs,name, object) {
	const jsonString = JSON.stringify(object);
	return await putBytes(vfs,name, jsonString);
}

/***********************************************************************************************************************
 * Internal Dependencies
 **********************************************************************************************************************/
const {buildAuthorizationEngine} = require('./security');
const {buildNodesHTTPv1} = require("./metadata/http-nodes");
const {objectBackupHTTP} = require('./metadata/object-backup');
const {NodeHTTPV1} = require("./node/http-v1");

/**********************************************************
 * Internal things which should be moved
 **********************************************************/
function nodeURLFromSpec( spec ){
	return "http://" + spec.host + ":" + spec.port;
}

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
	const httpLogger = log.child({component:"http"});
	app.use(logMorganTo(httpLogger));
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
		const nodeURL = nodeURLFromSpec(service);
		const clientV1 = new NodeHTTPV1(nodeURL);
		log.info("Requested object storage", {container, key, key_sha256, nodeURL});
		//TODO: Under many cases I probably don't care about blocking
		try {
			const input = await clientV1.createReadableStream(key_sha256);
			resp.writeHead(200, "OK", {'Content-Type':"application/json"});
			await promisePiped(input, resp);
		}catch( e ){
			if( e.statusCode == 404 ){
				resp.writeHead(404, "Value not found", {
					'Content-Type': "text/plain"
				});
				resp.end("Value not found");
			} else {
				log.error("Failed to retrieve remote value", {reason: e.message});
				resp.writeHead(502, "Failed to get remote value: " + e.message, {
					'Content-Type': "text/plain"
				});
				resp.end("Failed to get remote value: " + e.message);
			}
		}
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
		const storageNodeURL = nodeURLFromSpec(service);
		const storageClient = new NodeHTTPV1(storageNodeURL);

		const storageBlock = await storageClient.createReadableStream(key_sha256);
		resp.statusCode = 200;
		await promisePiped(storageBlock, resp);
	});

	app.a_post("/container/:container/object/*", async (req, resp) => {
		const key = req.params[0];
		const container = req.params["container"];
		// Authorize
		if( !(await securityLayer.authorized(req, "put")) ){
			log.trace( "Denying get", {container, key} );
			return resp.forbidden("Denied");
		}
		//Verify incoming request
		if( !req.body.object ){
			resp.writeHead(422, "Missing object or falsy", {
				'Content-Type' : 'text/plain'
			});
			resp.end("Missing object in request entity.");
			return;
		}
		const value = req.body.object;
		log.info("Request body",{body:value});
		//
		const object_name =  container + ":" + key;
		const key_sha256 = sha256_from_string( object_name );
		//TODO: Better default nodes
		const size = !value ? 0 : value.length;
		log.info("Searching to store object of size", {size: value.length});
		const matchingNodes = await nodesStorage.findAvailableSpace(size);

		if( !matchingNodes ){
			log.warn("Insufficient space found for storage", {size, matchingNodes} );
			resp.writeHead(503, "No space available", {
				'Content-Type' : 'text/plain'
			});
			resp.end("No space available");
			return;
		}
		const service = matchingNodes.address;
		//TODO: Revisit registration
		log.info("Using node for ingress storage", {service});
		const nodeURL = nodeURLFromSpec(service);
		const v1Client = new NodeHTTPV1(nodeURL);

		const eventID = await metadataStorage.stored( container, key, key_sha256 );
		log.info("Completed recording storage event", {object: req.body.object});

		try {
			log.info("Writing to node", {nodeURL});
			await putJSONAsBytes(v1Client, key_sha256, value);

			log.info("Storage result: ", result);
			const momento = await metadataStorage.currentVersion();
			log.info("Completed storage", {eventID, momento});
			resp.json({momento});
		}catch(e){
			if( e.statusCode != 200 ){
				const message = "Failed to store object because " + e.message;
				resp.writeHead(503, message, {
					'Content-Type' : 'text/plain'
				});
				resp.end(message);
				log.error("Failed to store object", {reason: e.message, object: req.body.object});
			} else {
				throw e;
			}
		}
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
		const storageClientURL = nodeURLFromSpec(service);
		const client = new NodeHTTPV1(storageClientURL);

		const sink = await client.createWritableStream(key_sha256);
		await promisePiped(req, sink);
		await storage.stored( container, key, key_sha256 );
		resp.statusCode = 204;
		resp.end();
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
