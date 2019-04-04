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

	async stored( container, key, block ) {
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
		if( !prefix ){
			prefix = "";
		}
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

		const logger = this.logger.child({op: "Event replay"});
		let first = true; //TODO: build this into the store replay
		await this.store.replay( function (momento, event) {
			if( first ){
				first = false;
				return;
			}
			logger.debug("Replaying", {momento, event});
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

const EVENT_PREFIX = "mud:nodes.";
const REGISTER_NODE = EVENT_PREFIX + "register";
const NODE_OFFLINE = EVENT_PREFIX + "offline";
const NODE_SPACE_USED = EVENT_PREFIX + "used-space";

class NodesEventStore {
	constructor( events ){
		this.events = events;
	}

	async allNodes(){
		let nodes = {};
		await this.events.replay( ( _m, e) => {
			const type = e.type;
			if( type === REGISTER_NODE ){
				if( e.v !== 0 ){ throw new Error("Unexpected version"); }
				nodes[e.name] = {name: e.name, spaceAvailable: e.spaceAvailable, online: true, address: e.address};
			} else if( type === NODE_OFFLINE ) {
				if (e.v !== 0) { throw new Error("Unexpected version"); }
				const nodeName = e.name;
				const node = nodes[nodeName];
				if (!node) {
					throw new Error("Missing node while marking offline " + nodeName);
				}
				node.online = false;
			} else if( type == NODE_SPACE_USED ){
				if (e.v !== 0) { throw new Error("Unexpected version"); }
				const nodeName = e.name;
				const node = nodes[nodeName];
				if (!node) {
					throw new Error("Missing node while marking offline " + nodeName);
				}
				node.spaceAvailable = node.spaceAvailable - e.size;
			}
		});
		return Object.values(nodes);
	}

	async onlineNodes(){
		return (await this.allNodes()).filter( (n) => n.online);
	}

	async registerNode( name, spaceAvailable, address ){
		assert(address);
		return await this.events.publish({
			type: REGISTER_NODE,
			v:0,
			name,
			spaceAvailable,
			address
		});
	}

	async offline( name ){
		return await this.events.publish({
			type: NODE_OFFLINE,
			v:0,
			name
		});
	}

	async usedSpace( name, size ){
		return await this.events.publish({
			type: NODE_SPACE_USED,
			v:0,
			name,
			size
		});
	}

	async findAvailableSpace( size ){
		const onlineNodes = await this.onlineNodes();
		const fittingNodes = onlineNodes.filter( (n) => n.spaceAvailable >= size );
		if( fittingNodes.length == 0 ){ return undefined; }
		const selectedNode = fittingNodes[0];
		await this.usedSpace(selectedNode.name, size);
		return selectedNode;
	}
}

module.exports = {
	EventMetadataStore,
	NodesEventStore
};
