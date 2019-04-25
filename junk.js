/***********************************************************************************************************************
 * Utilities without a proper home at this time.
 *
 * Some of these are likely to find a home in junk-bucket.
 **********************************************************************************************************************/

/***********************************************************************************************************************
 * Cryptography related
 **********************************************************************************************************************/
const crypto = require('crypto');
//TODO: Moved into junk-bucket@1.3.0
function sha256_from_string( str ){
	const hash = crypto.createHash('sha256');
	hash.update(str);
	return hash.digest("hex");
}

/***********************************************************************************************************************
 * File System Promise adapters
 **********************************************************************************************************************/
const {promiseEvent} = require("junk-bucket/future");
const {makeTempDir, mkdir, mkdtemp, rmRecursively} = require("junk-bucket/fs");

/***********************************************************************************************************************
 * Level Database
 **********************************************************************************************************************/

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

/**********************************************************
 * Express
 **********************************************************/
const morgan = require("morgan");
function logMorganTo(logger){
	return morgan('short', {
		stream: {
			write: function (message) {
				logger.info(message.trim());
			}
		}
	})
}

/**********************************************************
 * Streams
 **********************************************************/
const {PassThrough} = require("stream");

class FinishOnResolve extends PassThrough {
	constructor(response, onFlush) {
		super();
		this._response = response;
		this._onFlush = onFlush;
	}

	_flush(callback) {
		this._onFlush();
		this._response.then(
			() => {
				callback()
			},
			(problem) => callback(problem)
		);
	}
}

async function endStream( stream, lastChunk ){
	const done = promiseEvent(stream, "finish");
	stream.end(lastChunk);
	await done;
}


/**********************************************************
 * streaming requests
 **********************************************************/
const Future = require("junk-bucket/future");
const request = require("request");
const http = require("http");
const {MemoryWritable} = require("junk-bucket/streams");

/**
 * Blocks a request entity from being considered complete until response headers have been received and interpreted.
 * This is helpful for streaming entities of unknown sizes.
 *
 * @param opts request options
 * @param interpretResponse a possibly async function to interpret the response body
 * @returns {Writable} a writable which will not finish until the response is received and interpreted
 */
function streamRequestEntity( opts, interpretResponse ) {
	//TODO: I would really like streaming here.  Eventually maybe we'll find a way to do it.
	const buffer = new MemoryWritable();
	buffer.on("finish", () => {
		const newOpts = Object.assign({}, opts, {body: buffer.bytes});
		const call = request(newOpts);
		call.on("response", (resp) => {
			try {
				Promise.resolve(interpretResponse(resp))
					.then(
						() => buffer.emit("close"),
						(p) => buffer.emit("error",p)
					);
			}catch( e ){
				buffer.emit("error", e);
			}
		});
	});
	return buffer;
}


/**********************************************************
 *
 **********************************************************/
const path = require("path");

//TODO: Moved into junk-bucket@1.3.0
function jailedPath( root, relative ){
	const relativeNormalized = path.normalize(relative);
	const resolvedPath = path.resolve(root, relativeNormalized);
	const relativeResult = path.relative(root, resolvedPath);
	const actualParts = relativeResult.split(path.sep).filter((c) => c != "..");
	return [root].concat(actualParts).join(path.sep);
}


/**********************************************************
 *
 **********************************************************/
//TODO: Moved into junk-bucket@1.3.0
class JailedVFS {
	constructor(root, vfs) {
		this.root = root;
		this.vfs = vfs;
	}

	async exists( file ){
		const fileName = jailedPath(this.root, file);
		return await this.vfs.exists(fileName);
	}

	async unlink( file ){
		const fileName = jailedPath(this.root, file);
		return await this.vfs.unlink(fileName);
	}

	async createReadableStream( file ){
		const fileName = jailedPath(this.root, file);
		return await this.vfs.createReadableStream(fileName);
	}

	async asBytes( file ){
		const fileName = jailedPath(this.root, file);
		return await this.vfs.asBytes(fileName);
	}

	async putBytes( file, bytes, encoding ){
		const fileName = jailedPath(this.root, file);
		return await this.vfs.putBytes(fileName);
	}

	async createWritableStream( file ){
		const fileName = jailedPath(this.root, file);
		return await this.vfs.createWritableStream(fileName);
	}
}

//TODO: Moved into junk-bucket@1.3.0
const fs = require("fs");
const {
	exists,
	unlink,
	readFile
} = require("junk-bucket/fs");

const {promisify} = require("util");
const writeFile = promisify(fs.writeFile);

class LocalFileSystem {
	async exists( file ){
		return await exists(file);
	}

	async unlink( file ){
		return await unlink(file);
	}

	async createReadableStream( file ){
		return fs.createReadStream(file);
	}

	async createWritableStream( file ){
		return fs.createWriteStream(file);
	}

	async asBytes( file ){
		return await readFile( file );
	}

	async putBytes( file, bytes, encoding ){
		await writeFile(file, bytes, {encoding});
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

	logMorganTo,
	FinishOnResolve,
	streamRequestEntity,
	endStream,

	jailedPath,
	JailedVFS,
	LocalFileSystem
};
