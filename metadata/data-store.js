const assert = require('assert');

const TYPE_STORED = "metadata.stored";
const TYPE_DELETED = "metadata.deleted";

class EventMetadataStore {
	constructor( store, logger ){
		assert(store);
		assert(logger);

		this.store = store;
		this.logger = logger;
	}

	/**
	 * Retrieves a revision of the current metadata
	 * @returns {Promise<void>}
	 */
	async currentVersion(){
		return await this.store.currentVersion();
	}

	async stored( container, key, block ){
		const event = {
			type: TYPE_STORED,
			v: 0,
			container,
			key,
			block
		};
		this.logger.debug("Storing block", event);
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
		let keys = [];

		await this.store.replay( function (momento, event) {
			logger.debug("Replay", {container, prefix, momento, event});
			if( ! [TYPE_STORED, TYPE_DELETED].includes( event.type ) ) { return; }
			//TODO: Be more intelligent about versions
			assert(event.v == 0, "Version unsupported");
			if( event.container == container ){
				logger.debug("Correct container", {container, prefix, momento, event});
				//TODO: Definitely faster ways to than checking all keys every time
				if( event.key.startsWith(prefix) ) {
					if( event.type == TYPE_STORED ) {
						if( !keys.includes(event.key)  ){
							keys.push(event.key);
							logger.debug("Inserted into keys", keys);
						}
					}
					if( event.type == TYPE_DELETED ) {
						keys = keys.filter( (k) => k != event.key );
					}
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

	async objectChangesBetween( fromEvent, toEvent ){
		const changes = {
			modified: [],
			created: [],
			destroyed: []
		};

		let first = true; //TODO: build this into the store replay
		await this.store.replay( function (momento, event) {
			if( first ){
				first = false;
				return;
			}
			//TODO: These algorithms could be faster & take less space
			//TODO: Interpret other types
			if( TYPE_STORED === event.type ) {
				//TODO: Be more intelligent about versions
				assert(event.v == 0, "Version unsupported");
				//Check to see if it was deleted
				const wasDestroyed = changes.destroyed.filter((obj) => {
					return obj.container === event.container && obj.key == event.key;
				});
				if( wasDestroyed.length > 0 ){
					changes.destroyed = changes.destroyed.filter( (obj) => {
						return !(obj.container === event.container && obj.key == event.key);
					});
					changes.modified.push({container: event.container, key: event.key});
				} else {
					changes.created.push({container: event.container, key: event.key});
				}
			} else  if( TYPE_DELETED === event.type ){
				//TODO: Be more intelligent about versions
				assert(event.v == 0, "Version unsupported");
				changes.destroyed.push({container: event.container, key: event.key});
			}
		}, fromEvent, toEvent );
		return changes;
	}

	async deleteObject( container, key ) {
		const event = {
			type: TYPE_DELETED,
			v: 0,
			container,
			key
		};
		this.logger.debug("Deleting object", event);
		return await this.store.publish(event);
	}
}

module.exports = {
	EventMetadataStore
};
