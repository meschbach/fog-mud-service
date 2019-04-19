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

const {FinishOnResolve} = require("../junk");
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
			if( response.statusCode == 404 ){
				completion.reject(new Error("Blob " + blob + " was not found."));
			} else {
				response.pause();
				completion.accept(response);
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
		const query = request(opts);
		const responseCompletion = new Future();
		query.on("response", function (response) {
			if( response.statusCode != 204 ){
				responseCompletion.reject(new Error("Unexpected response status code " + response.statusCode));
			} else {
				responseCompletion.accept();
			}
		});
		const gate = new FinishOnResolve(responseCompletion.promised, () => query.end());
		gate.pipe(query);
		return gate;
	}
}

module.exports = {
	http_v1,
	NodeHTTPV1
};
