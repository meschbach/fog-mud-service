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

const fs = require("fs");
const path = require("path");
const {promisify} = require("util");

const fs_mkdtemp = promisify(fs.mkdtemp);
const fs_mkdir = promisify(fs.mkdir);
const fs_rmdir = promisify(fs.rmdir);
const fs_readdir = promisify(fs.readdir);
const fs_state = promisify(fs.stat);
const fs_unlink = promisify(fs.unlink);

async function fs_rm_recursively( target ){
	const stats = await fs_state( target );
	if( stats.isDirectory() ) {
		const files = await fs_readdir( target );
		await parallel(files.map( async subfile => {
			const fullPath = path.join( target, subfile );
			await fs_rm_recursively( fullPath );
		}));
		await fs_rmdir( target );
	} else {
		await fs_unlink( target );
	}
}

async function makeTempDir( template, base = os.tmpdir() ) {
	const tempPrefix = path.join( base, template);
	const root = await fs_mkdtemp( tempPrefix );
	return root;
}

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
			await fs_rm_recursively(dir);
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
 * Exports
 **********************************************************************************************************************/
module.exports = {
	sha256_from_string,

	fs_mkdir,
	fs_mkdtemp,

	level_mktemp,
	level_forEachKey
};
