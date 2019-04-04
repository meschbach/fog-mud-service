
describe("For a block backup system", function(){
	describe("On-line backup system", function(){
		describe("which is available", function(){
			describe("when a new object is uploaded", function(){
				it("notifies the system of the blocks to be backed up")
			});
		});

		describe("which is not available", function(){
			describe("when it comes on-line", function(){
				it("notifies the system of the blocks to be backed up")
			});
		});
	});

	describe("A batch backup system", function(){
		describe("when it runs", function(){
			it("notifies the system of the blocks to be backed up");
		});
	});
});