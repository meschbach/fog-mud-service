/***********************************************************************************************************************
 * Utilities without a proper home at this time.
 *
 * Some of these are likely to find a home in junk-bucket.
 **********************************************************************************************************************/

/***********************************************************************************************************************
 * Cryptography related
 **********************************************************************************************************************/
const crypto = require('crypto');
function sha256_from_string( str ){
	const hash = crypto.createHash('sha256');
	hash.update(str);
	return hash.digest("hex");
}

/***********************************************************************************************************************
 * File System Promise adapters
 **********************************************************************************************************************/
const {parallel, promiseEvent} = require("junk-bucket/future");
const {makeTempDir, mkdir, mkdtemp, rmRecursively} = require("junk-bucket/fs");

/***********************************************************************************************************************
 * Level Database
 **********************************************************************************************************************/
const os = require("os");

const levelup = require('levelup');
const leveldown = require('leveldown');

/**
 * Creates a new LevelUp instance within a temporary directory
 * @returns {Promise<{}>}
 */
async function level_mktemp() {
	const dir = await makeTempDir("level-");
	const db = levelup(leveldown( dir ));

	return {
		close: async function(){
			if( db.isOpen() ){
				await db.close();
			}
			await rmRecursively(dir);
		},
		db
	};
}

async function level_forEachKey( db, onKey ){
	await promiseEvent( db.createKeyStream().on('data', ( rawKey ) => {
		const fullKey = rawKey.toString('utf-8');
		onKey(fullKey);
	}), 'end');
}

/***********************************************************************************************************************
 * Context
 **********************************************************************************************************************/
//TODO: Event Emitter maybe?
/**
 * Provides a simple control structure to allow for composition of destruction operation.
 *
 * For example: when creating a temporary directory this may register to cleanup said directory
 */
class Context {
	constructor(name, logger){
		this.name = name;
		this.logger = logger;
		this.toCleanup = [];
	}

	onCleanup( f ){
		this.toCleanup.unshift(f);
	}

	async cleanup(){
		for( const f of this.toCleanup ){
			try {
				await f(this);
			}catch( e ){
				this.logger.error("Failed to cleanup", e);
			}
		}
	}
}

/***********************************************************************************************************************
 * Exports
 **********************************************************************************************************************/
module.exports = {
	sha256_from_string,

	fs_mkdir: mkdir,
	fs_mkdtemp: mkdtemp,

	level_mktemp,
	level_forEachKey,

	Context
};
