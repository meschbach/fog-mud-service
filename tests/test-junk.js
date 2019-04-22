
class MemoryEventStore {
	constructor( ){
		this._events = [];
	}

	currentVersion(){
		return this._events.length - 1;
	}

	async countRecords(){
		return this._events.length;
	}

	async publish( event ){
		const eventCopy = Object.assign({}, event);
		const immtuableEvent = Object.freeze(eventCopy);
		this._events.push(immtuableEvent);
	}

	async byMomento( momento ){
		return this._events[momento];
	}

	async replay( consumer, fromMomento ){
		if( fromMomento < 0 ){ throw new Error("This will not work on real event stores"); }
		const end = this.currentVersion();
		for( let i = 0; i <= end; i++ ){
			await consumer( i, this._events[i] );
		}
		return this.currentVersion();
	}
}

const {addressOnListen} = require("junk-bucket/sockets");
async function listen(context, server){
	const result = addressOnListen(server);
	result.socket.on("close", function(){
		context.logger.trace("Server socket closed");
	});
	context.onCleanup(() => {
		context.logger.trace("Cleaning up server",{address});
		result.stop();
	});
	const address = await result.address;
	context.logger.trace("Server bound to",{address});
	return address.host + ":" + address.port;
}

const {Context} = require("junk-bucket/context");
const {createTestLogger} = require("./system/test-junk");

function testContext( name, debug ){
	return new Context(name, createTestLogger(name, debug));
}

module.exports = {
	MemoryEventStore,
	listen,
	testContext
};
