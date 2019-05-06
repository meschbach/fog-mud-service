
const {LevelUpEventStore} = require("./junk/event-store-level");
const {openLevelDB} = require("./junk/leveldb");
const {EventMetadataStore, NodesEventStore} = require("./metadata/data-store");
const {newMetadataService} = require("./in-proc");

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

	// Extract values from the options
	const levelStorage = options["level-storage"];
	const port = options.port;

	// Setup the root context
	const root = new Context("driver", logger.child({component: "driver"}));

	// Start the service
	const service = await newMetadataService(root, {
		metadataDir: levelStorage,
		port
	});
}, formattedConsoleLog("metadata"));
