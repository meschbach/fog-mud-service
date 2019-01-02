const assert = require('assert');

const TYPE_STORED = "metadata.stored";

class EventMetadataStore {
	constructor( store, logger ){
		assert(store);
		assert(logger);

		this.store = store;
		this.logger = logger;
	}

	async stored( container, key, block ){
		const event = {
			type: TYPE_STORED,
			v: 0,
			container,
			key,
			block
		};
		return await this.store.publish(event);
	}

	async block( container, key ){
		const states = [];

		await this.store.replay( function (momento, event) {
			if( event.type != TYPE_STORED) {
				return;
			}
			//TODO: Be more intelligent about versions
			assert(event.v == 0, "Version unsupported");
			if( event.container == container  && event.key == key){
				states.push( event );
			}
		} );

		if( states.length == 0 ){ return undefined; }

		//TODO: Allow for more storage
		assert(states.length == 1 );
		return states[0].block;
	}

	async list( container, prefix ){
		const logger = this.logger;
		logger.debug("Listing prefix", {container, prefix});
		const keys = [];

		await this.store.replay( function (momento, event) {
			logger.debug("Replay", {container, prefix, momento, event});
			if( event.type != TYPE_STORED) { return; }
			//TODO: Be more intelligent about versions
			assert(event.v == 0, "Version unsupported");
			if( event.container == container ){
				logger.debug("Correct container", {container, prefix, momento, event});
				//TODO: Definitely faster ways to than checking all keys every time
				if( event.key.startsWith(prefix) && !keys.includes(event.key)) {
					keys.push( event.key );
				}
			}
		} );
		logger.debug("Replay complete", {container, prefix, keys});
		return keys;
	}

	async listContainers( ){
		const containers = [];

		await this.store.replay( function (momento, event) {
			if( event.type != TYPE_STORED) {
				return;
			}
			//TODO: Be more intelligent about versions
			assert(event.v == 0, "Version unsupported");

			//TODO: Definitely faster ways to than checking all keys every time
			if( !containers.includes(event.container)) {
				containers.push( event.container );
			}
		} );
		return containers;
	}
}

module.exports = {
	EventMetadataStore
};
