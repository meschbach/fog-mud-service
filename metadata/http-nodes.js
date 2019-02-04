const {asyncRouter} = require("junk-bucket/express");

function buildNodesHTTPv1( log, nodesStorage ){
	const router = asyncRouter(log);
	router.a_post("/:name", async (req, resp) => {
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
		if( details.spaceAvailable === undefined || details.spaceAvailable == null ){
			resp.status(422);
			return resp.json({invalid: {missing: ["spaceAvailable"]}});
		}
		const host = details.host;
		const port = details.port;
		const spaceAvailable = details.spaceAvailable;

		//TODO: A less stupid approach to this
		const name = req.params["name"];

		await nodesStorage.registerNode( name, spaceAvailable, {protocol: "http/v1", host, port} );
		resp.end();
	});
	return router;
}

module.exports = {
	buildNodesHTTPv1
};
