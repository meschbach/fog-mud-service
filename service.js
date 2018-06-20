const {main} = require('junk-bucket');
const bunyan = require('bunyan');
const log = bunyan.createLogger({name: 'mud-coordinator', level: process.env.LOG_LEVEL || 'info'});

const {http_v1} = require('./metadata');

const level = require("level");
class LevelStorage {
	constructor( logger, fileName ) {
		this.logger = logger;
		this.db = level(fileName);
	}

	async writeNode( name, info ){
		this.logger.debug("Writing node metadata", {name, info});
		return await this.db.put( "node/" + name, info);
	}

	async readNode( name ){
		this.logger.debug("Reading node metadata", {name});
		return this.db.get("node/" + name);
	}

	async writeObjectMetadata( name, info ){
		this.logger.debug("Writing object metadata", {name});
		return this.db.put("object/" + name, info);
	}

	async readObjectMetadata( name ){
		this.logger.debug("Reading object metadata", {name});
		return await this.db.read("object/" + name);
	}
}

function level_factory( parentLogger, options) {
	const fileName = options["level-storage"];
	const logger = parentLogger.child({component: "level", fileName });

	return new LevelStorage(logger, fileName);
}

main( async (logger) => {
	const options = require("yargs")
		.option("port", {default: 9977})
		.option("storage", {default: "level"})
		.option("level-storage", {default: "coordinator.level"})
		.argv;
	//Figure out the storage layer
	const storageMechanisms = {
		'level': level_factory
	};
	const storageMechanism = options['storage'];
	const storageFactory = storageMechanisms[storageMechanism];
	if( !storageFactory ){
		logger.error("No such mechanism", {storageMechanism});
		return false;
	}
	const storage = storageFactory( logger, options);

	// Configure the HTTP layer
	const port = options.port;
	http_v1(logger.child({proto: 'http/v1', port}), null, {port});
}, log);
