
const {LevelUpEventStore} = require("./junk/event-store-level");
const {openLevelDB} = require("./junk/leveldb");
const {EventMetadataStore, NodesEventStore} = require("./metadata/data-store");

const {main} = require('junk-bucket');
const {Context} = require("junk-bucket/context");
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

	const levelDBStorage =  options["level-storage"];
	const leveldb = await openLevelDB(root, levelDBStorage);
	const underlyingStore = new LevelUpEventStore(leveldb);
	const metadataStroge = new EventMetadataStore( underlyingStore, logger );
	const nodesStorage = new NodesEventStore(underlyingStore);
	const coordinator = {
		storage: metadataStroge,
		nodesStorage
	};

	// Configure the HTTP layer
	const port = options.port;
	http_v1(logger.child({proto: 'http/v1', port}), coordinator, {port});
}, formattedConsoleLog("metadata"));
