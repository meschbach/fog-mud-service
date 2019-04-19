const {asyncRouter} = require("junk-bucket/express");
const {promisePiped} = require("junk-bucket/streams");

function http_v1( context, vfs ) {
	const router = asyncRouter(context.logger);
	router.a_get("/block/:blob", async (req, resp) => {
		const blob =  req.params["blob"];
		if( await vfs.exists(blob) ){
			resp.setHeader("Content-Type", "application/octet-stream");
			const istream = await vfs.createReadableStream(blob);
			await promisePiped(istream, resp);
		} else {
			resp.notFound();
		}
	});

	router.a_post("/block/:blob", async (req, resp) => {
		const blob = req.params["blob"];
		const sink = await vfs.createWritableStream(blob);
		await promisePiped(req, sink);
		resp.status(204);
		resp.end();
	});
	return router;
}

const {streamRequestEntity} = require("../junk");
const request = require("request");
const Future = require("junk-bucket/future");
class NodeHTTPV1 {
	constructor(address) {
		this.address = address;
	}

	createReadableStream( blob ){
		const opts = {
			method: "GET",
			url: this.address + "/block/" + blob
		};
		//TODO: This should probably be moved to junk.  Also, why is this so hard?
		const completion = new Future();
		const query = request(opts);
		query.on("response", (response) => {
			const statusCode = response.statusCode;
			if( statusCode == 200 ) {
				response.pause();
				completion.accept(response);
			} else if( statusCode == 404 ){
				completion.reject(new Error("Blob " + blob + " was not found."));
			} else {
				completion.reject(new Error("Unknown error: " + e.message));
			}
		});
		query.on("error", function(problem){
			console.log("Rejected", problem);
			completion.reject(problem);
		});
		return completion.promised;
	}

	createWritableStream( blob ){
		const opts = {
			method: "POST",
			url: this.address + "/block/" + blob
		};
		return streamRequestEntity(opts, async (response) =>{
			if( response.statusCode != 204 ){
				throw new Error("Unexpected response status code " + response.statusCode);
			}
		});
	}
}

module.exports = {
	http_v1,
	NodeHTTPV1
};
