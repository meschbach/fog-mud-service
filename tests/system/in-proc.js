const {inPorcessService} = require("../../in-proc");
const bunyan = require("bunyan");

describe( "In process harness", function() {
	it("can start and stop", async function(){
		// Taken from: https://github.com/trentm/node-bunyan/issues/436
		const logger = bunyan.createLogger({name: "start-stop-test", streams: [{stream: process.stdout, level: 'fatal'}]});
		const handler = await inPorcessService( logger );
		handler.stop()
	});
});
