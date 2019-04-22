const yargs =  require("yargs");

const bunyan = require("bunyan");

/**
 * Initializes the logging subsystem
 *
 * @param argv the argument parser to extract the log level from
 */
function initLogLevel( name, args ){
	const log = bunyan.createLogger({ name: name, level: args["log-level"] });
	return log;
}

const path = require("path");
const metadata = require("./metadata");
const levelup = require("levelup");
const leveldown = require("leveldown");
const {MudHTTPClient} = require("./client");

const {fsNodeStorage} = require("./fs-node");
const {CoordinatorHTTPClient} = require("./metadata/coordinator");

const fs = require("fs");
const {fs_mkdir} = require("./junk");

//TODO: This and in-process look very similar.  These should probably be refactored to share code.
async function omniService( args ) {
	const log = initLogLevel("fog-omni-service", args);
	log.info("Starting the omni service");

	// Extract the interface
	const configMetadataAddress = args["metadata-address"];

	// Extract the paths
	const root = args["fs-root"];
	const fsMetadataStorage = path.resolve( root, args["metadata-storage"] );
	const fsBlockStorageLocation = path.resolve( root, args["block-storage"] );
	log.info("Using storage on the local file system at ", {metadata: fsMetadataStorage, block: fsBlockStorageLocation});
	if( !fs.existsSync( fsMetadataStorage ) ) {
		await fs_mkdir(fsMetadataStorage);
	}
	if( !fs.existsSync( fsBlockStorageLocation )) {
		await fs_mkdir(fsBlockStorageLocation);
	}

	//
	const metadataLogger = log.child({app: "metadata"});
	const storage = {
		levelup: levelup(leveldown( fsMetadataStorage ))
	};
	const metaData = await metadata.http_v1(metadataLogger, storage, {address: configMetadataAddress, port: args["metadata-port"], jwt: args["jwt-material"] });

	//
	const fsConfig = {
		client: "http://127.0.0.1:" + await metaData.port,
		storage: fsBlockStorageLocation,
		name: 'primary'
	};
	const blockStorage = fsNodeStorage(log.child({app: 'fs-storage'}), null, fsConfig);

	//create the client
	const metadataAddress = await metaData.address;
	const client = new MudHTTPClient("http://127.0.0.1:"+ metadataAddress.port, log.child({proto: "httpv1.1/metadata"}));

	//Register the block storage node with the client
	const blockStorageAddress = await blockStorage.address;
	log.info("Block storage: ", blockStorageAddress);
	const coordination = new CoordinatorHTTPClient("http://127.0.0.1:" + metadataAddress.port, log.child({proto: "http/1.1/metadata"}));
	await coordination.register_http("default", blockStorageAddress.address, blockStorageAddress.port );
}

//TODO: Explore if I can collapse this with junk-drawer:main
function runCommand( target ){
	return function (args) {
		target(args).then( () => {}, (error) => {
			console.error(error);
		});
	}
}

const args = yargs
	.option( "log-level", {alias: 'v', default: 'info'})
	.command( "omni", "co-locates both an FS node and the metadata service", ( yargs ) => {
		yargs
			.option( "jwt-material", {description: "File path to private key for the JWT"})
			.option( "fs-root", {default: process.cwd()} )
			.option( "block-storage", {default: "fs-block-storage" } )
			.option( "metadata-storage", {default: "metadata-storage" } )
			.option( "metadata-address", {default: "0.0.0.0" } )
			.option( "metadata-port", {default: 12345})
	}, runCommand( omniService ) )
	.command("nodes", "Operates on nodes", ( yargs) => {
		yargs
			.command("list", "Lists currently registered nodes", (yargs) => {
				yargs
					.option("service", {description: "Control Interface to connect to", default: "http://localhost:9977"})
					.option("format", {description: "How to format output {pretty = human, json = machine}", default: "human"})
			}, async (argv) => {
				const {NodesHTTPClient} = require("./client/nodes");
				const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");

				const url = argv.service;
				const logger = formattedConsoleLog("nodes-list");

				const client = new NodesHTTPClient(url, logger);
				const nodes = await client.allNodes();

				if( "json" === argv.format){
					process.stdout.write(JSON.stringify(nodes));
				}else{
					logger.info("Nodes", nodes);
				}
			})
			.command("add-capacity <node> <size>", "Adds additional capacity to the given node", (yargs) => {
				yargs
					.positional("node", {description: "Node to increase the size of"})
					.positional("size", {description: "Size in megabytes to increase"})
					.option("service", {description: "Control Interface to connect to", default: "http://localhost:9977"})
			}, async (argv) => {
				const {NodesHTTPClient} = require("./client/nodes");
				const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");

				const logger = formattedConsoleLog("nodes-list");
				const client = new NodesHTTPClient(argv.service, logger);
				const updated = await client.increaseNodeCapacity(argv.node, argv.size * 1024 * 1024);
				logger.info("Increased node capacity", updated);
			})
			.demandCommand(1)
	})
	.demandCommand(1)
	.help()
	.argv;
