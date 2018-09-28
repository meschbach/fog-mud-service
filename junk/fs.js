/***********************************************************************************************************************
 * Async File System Adapter
 **********************************************************************************************************************/
const {parallel} = require("junk-bucket/future");

const os = require("os");
const fs = require("fs");
const {promisify} = require("util");

const mkdtemp = promisify(fs.mkdtemp);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

module.exports = {
	//Promise adapters
	mkdtemp,
	mkdir,
	rmdir,
	readdir,
	stat,
	unlink,

	//Extensions
	rm_recursively,
	makeTempDir
};

const path = require("path");

async function rm_recursively( target ){
	const stats = await stat( target );
	if( stats.isDirectory() ) {
		const files = await readdir( target );
		await parallel(files.map( async subfile => {
			const fullPath = path.join( target, subfile );
			await rm_recursively( fullPath );
		}));
		await rmdir( target );
	} else {
		await unlink( target );
	}
}

async function makeTempDir( template, base = os.tmpdir() ) {
	const tempPrefix = path.join( base, template);
	const root = await mkdtemp( tempPrefix );
	return root;
}
