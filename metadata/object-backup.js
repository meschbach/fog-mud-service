const express = require("express");
const {make_async} = require("junk-bucket/express");

function objectBackupHTTP( logger, metadataStorage ) {
	const router = make_async(express.Router());
	router.a_get("/", async function( req, resp ){
		try {
			//TODO: This is a dumb way to do it, requiring n^n traversals of the metadata
			const containers = await metadataStorage.listContainers();
			logger.debug("Containers: ", containers);
			let objects = [];
			for( const container of containers ){
				const keys = await metadataStorage.list(container, "");
				logger.debug("Key listing", {container, keys});
				const descriptors = keys.map( (key) => {
					return {
						container,
						key
					}
				});
				objects = objects.concat(descriptors);
			}
			resp.json({
				continuation: true,
				objects
			})
		} catch(e) {
			logger.error("Error in retrieving objects to backup", e);
			throw e;
		}
	});
	return router;
}

module.exports = {
	objectBackupHTTP
};
