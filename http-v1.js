/*
 * Version 1 HTTP interface
 */

const express = require('express');
const morgan = require('morgan');
const {make_async} = require('junk-drawer/express');

const bodyParser = require('body-parser');

const crypto = require('crypto');
function sha256_from_string( str ){
	const hash = crypto.createHash('sha256');
	hash.update(str);
	return hash.digest("hex");
}

function http_v1( log, coordinator, config ) {
	const nodes = {};

	const app = make_async(express());
	app.use(morgan('short'));
	app.use(bodyParser.json());
	app.a_get("/object/*", async (req, resp) => {
		const key = req.params[0];
		const key_sha256 = sha256_from_string(key);
		//TODO: Better default ndoes
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit shortcut
		log.info("Requested object", {key, key_sha256});
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;
		//TODO: Validate this object actually exists
		resp.json({blocks: [{url: serviceURL}]});
	});

	app.a_post("/object/*", async (req, resp) => {
		const key = req.params[0];
		const key_sha256 = sha256_from_string(key);
		//TODO: Better default ndoes
		const defaultNode =  Object.keys(nodes)[0];
		const service = nodes[defaultNode];
		//TODO: Revisit registration
		const serviceURL = "http://" +service.host + ":" + service.port + "/block/" + key_sha256;

		log.info("Placing object at ", {node: defaultNode, url: serviceURL});
		resp.json({blocks: [{type: "put", url: serviceURL}]});
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

	app.listen( config.port, () => {
		log.info("HTTP listener bound on ", config.port);
	});
}

module.exports = {
	http_v1
};