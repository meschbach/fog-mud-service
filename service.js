const {main} = require('junk-drawer');
const bunyan = require('bunyan');
const log = bunyan.createLogger({name: 'mud-coordinator', level: process.env.LOG_LEVEL || 'info'});

const {http_v1} = require('./http-v1');

main( async (logger) => {
	const port = 9977;
	http_v1(logger.child({proto: 'http/v1', port}), null, {port});
}, log);
