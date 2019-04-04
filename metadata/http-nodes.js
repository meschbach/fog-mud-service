const {asyncRouter} = require("junk-bucket/express");
const {validate} = require("junk-bucket/validation");

function buildNodesHTTPv1( log, nodesStorage ){
	const router = asyncRouter(log);
	router.a_post("/:name", async (req, resp) => {
		//Extract request parameters
		const name = req.params["name"];

		//Verify request entity
		const requestValidator = validate(req.body);
		const host = requestValidator.string( "host");
		const port = requestValidator.numeric("port");
		const spaceAvailable = requestValidator.numeric("spaceAvailable");

		const requestValidation = requestValidator.done();
		if( !requestValidation.valid ){
			resp.status(422);
			resp.json({invalid: requestValidation.result});
			return;
		}

		// Update our storage setup
		await nodesStorage.registerNode( name, spaceAvailable, {protocol: "http/v1", host, port} );
		resp.status(204).end();
	});

	router.a_get("/", async (_req, resp) =>{
		const nodes = await nodesStorage.allNodes();
		resp.json(nodes);
	});

	return router;
}

module.exports = {
	buildNodesHTTPv1
};
