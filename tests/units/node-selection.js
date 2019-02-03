const {expect} = require("chai");
const {fake} = require("sinon");

function findSpace( nodes, size, selectedNode, noSpace ){
	const nodesWithSize = nodes.filter( (node) => node.spaceAvailable >= size );
	if( nodesWithSize.length == 0 ){
		noSpace();
	}else {
		selectedNode(nodesWithSize[0]);
	}
}

describe("Given a system backed by a single nodes", function () {
	describe("When asked to store an object", function () {
		describe('And it fits on the node', function () {
			it("selects the node", function(){
				const selected = fake();
				const noSpace = fake();

				const targetSize = 1024 * 4;

				const node = {
					spaceAvailable: targetSize
				};
				const nodes = [
					node
				];
				findSpace(nodes, targetSize, selected, noSpace );
				expect(selected.lastCall.args).to.deep.eq([node]);
			});
		});

		describe("And it does not fit on the node", function () {
			it("notifies the user it's out of space", function () {
				const selected = fake();
				const noSpace = fake();

				const node = {
					spaceAvailable: 1024
				};
				const nodes = [
					node
				];
				findSpace(nodes, 1024 * 4, selected, noSpace );
				expect(noSpace.lastCall.args).to.deep.eq([]);
			});
		});
	});
});

describe("Given a system without any nodes", function () {
	describe("When asked for 0 byte object", function () {
		it("it claims no space", function(){
			const selected = fake();
			const noSpace = fake();

			const nodes = [];
			findSpace(nodes, 0, selected, noSpace );
			expect(noSpace.lastCall.args).to.deep.eq([]);
		});
	});

	describe('When asked for 1024 bytes', function () {
		it("has no space", function () {
			const selected = fake();
			const noSpace = fake();

			const nodes = [];
			findSpace(nodes, 1024, selected, noSpace );
			expect(noSpace.lastCall.args).to.deep.eq([]);
		})
	});
});
