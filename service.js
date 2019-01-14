

const {LevelUpEventStore} = require("./junk/event-store-level");
const {openLevelDB} = require("./junk/leveldb");
const {EventMetadataStore} = require("./metadata/data-store");

async function level_factory( parentLogger, options, rootContext ) {
	const fileName = options["level-storage"];
	const logger = parentLogger.child({component: "level", fileName });

	const leveldb = await openLevelDB(rootContext, fileName);
	const underlyingStore = new LevelUpEventStore(leveldb);
	return new EventMetadataStore( underlyingStore, logger );
}

const {main} = require('junk-bucket');
const {Context} = require("./junk");
const {http_v1} = require('./metadata');
const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");

main( async (logger) => {
	const options = require("yargs")
		.option("port", {default: 9977})
		.option("storage", {default: "level"})
		.option("level-storage", {default: "coordinator.level"})
		.argv;

	//Setup the root context
	const root = new Context("process", logger.child({component: "metadata"}));

	//Figure out the storage layer (I went way to abstract here)
	const storageMechanisms = {
		'level': level_factory
	};
	const storageMechanism = options['storage'];
	const storageFactory = storageMechanisms[storageMechanism];
	if( !storageFactory ){
		logger.error("No such mechanism", {storageMechanism});
		return false;
	}
	const storage = await storageFactory( logger, options, root );
	const coordinator = {
		storage
	};

	// Configure the HTTP layer
	const port = options.port;
	http_v1(logger.child({proto: 'http/v1', port}), coordinator, {port});
}, formattedConsoleLog("metadata"));
