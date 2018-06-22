
class AllowAllEngine {
	async authorized( request, action ){
		return true;
	}
}

const jwt = require("jsonwebtoken");
const Future = require("junk-bucket/future");

class JWTEngine {
	constructor( secretKey, logger ) {
		this.key = secretKey;
		this.logger = logger;
	}

	async authorized( request, action ){
		this.logger.trace("Authorizing");
		const auth = request.header("Authorization");
		if( !auth ) {
			this.logger.trace("Missing Authorization header", request.headers);
			return false;
		}
		const parts = auth.split(" ");
		if( parts.length > 2 ){
			this.logger.trace("Header containers too many parts");
			return false;
		}
		if( parts[0] != "Token" ) {
			this.logger.trace("Header is not a Token");
			return false;
		}
		const encryptedToken = parts[1];
		const tokenSync = new Future();
		jwt.verify(encryptedToken, this.key, (err, decoded) => {
			if( err ){
				tokenSync.reject(err);
			} else {
				tokenSync.accept(decoded);
			}
		});
		try {
			const token = await tokenSync.promised;
			this.logger.trace("Token valid");
			return true;
		}catch (e) {
			this.logger.debug("Failed to decode JWT", e);
			return false;
		}
	}
}

const fs = require('fs');
const {promisify} = require('util');

const fs_readFile = promisify(fs.readFile);

async function buildAuthorizationEngine( config, logger ){
	if( config.jwt ){
		logger.info("Using JWT key");
		const secretKey = await fs_readFile(config.jwt);
		return new JWTEngine(secretKey, logger );
	}
	logger.info("No authorization configuration present, party mode!");
	return new AllowAllEngine();
}

module.exports = {
	buildAuthorizationEngine
};
