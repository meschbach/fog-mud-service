const express = require("express");
const {make_async} = require("junk-bucket/express");

function objectBackupHTTP( logger, metadataStorage ) {
	const router = make_async(express.Router());
	router.a_get("/", async function( req, resp ){
		try {
			//TODO: This is a dumb way to do it, requiring n^n traversals of the metadata
			const revision = await metadataStorage.currentVersion();
			const containers = await metadataStorage.listContainers();
			logger.debug("Containers: ", containers);
			let objects = [];
			for( const container of containers ){
				const keys = await metadataStorage.list(container, "", revision);
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
				continuation: JSON.stringify(revision),
				objects
			})
		} catch(e) {
			logger.error("Error in retrieving objects to backup", e);
			throw e;
		}
	});

	router.a_get("/:id", async function( req, resp ){
		const fromVersion = JSON.parse(req.params["id"]);
		const toRevision = await metadataStorage.currentVersion();
		logger.info("Backup request from ", {fromVersion, toRevision});

		const changes = await metadataStorage.objectChangesBetween(fromVersion, toRevision);
		logger.info("Changes", changes);
		resp.json({
			continuation: JSON.stringify(toRevision),
			changes
		})
	});
	return router;
}

module.exports = {
	objectBackupHTTP
};
