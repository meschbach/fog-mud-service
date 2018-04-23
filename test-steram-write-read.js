const fs = require('fs');

const bunyan = require('bunyan');
const log = bunyan.createLogger({name: 'mud-client', level: process.env.LOG_LEVEL || 'info'});

const {MudHTTPClient} = require('./client');

const {main} = require('junk-drawer');
main( async (logger) => {
	const base = "http://localhost:9977";
	const client = new MudHTTPClient( base, logger );
	const sink = client.stream_to("test", "stream");
	const source = fs.createReadStream("test.png");
	sink.on('response', () => {
		logger.info("Written");

		const object = client.stream_from("test","stream");
		object.pipe(fs.createWriteStream("test-output.png"));
	});
	source.pipe(sink);
}, log);
