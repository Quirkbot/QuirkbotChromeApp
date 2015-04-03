define(
[
	'libs/interact',
	'happy/_libs/mout/string/hyphenate',
	'ui/VisualNodeInput',
	'ui/VisualNodeOutput',
	'Definitions',
	'Tree',
	'EventsManager'
],
function (
	interact,
	hyphenate,
	VisualNodeInput,
	VisualNodeOutput,
	DEFINITIONS,
	TREE,
	EventsManager
){
	"use strict";

	var COLLECTION_ITEM_PARSE_REGEX = /^items\[([0-9]+)\]$/g;

	var VisualNode = function(id, editor){
		var
		self = this,
		container,
		inputObjects,
		collectionInputObjects,
		outputObjects,
		interactable,
		destroyed;

		var eventsManager = new EventsManager();

		var init = function() {
			var treeNode = TREE.data[id];
			var spec = DEFINITIONS.data[treeNode.type];

			// Container -------------------------------------------------------
			container = document.createElement('div');
			container.classList.add('visual-node');
			container.classList.add(hyphenate(spec.name));
			if(spec.in)
				container.classList.add('in');
			if(spec.out)
				container.classList.add('out');
			if(spec.collection)
				container.classList.add('collection');
		

			// Draggable Layer -------------------------------------------------
			var draggableLayer = document.createElement('div');
			draggableLayer.classList.add('draggable-layer');
			container.appendChild(draggableLayer);

			// Delete Button ---------------------------------------------------
			var deleteButton = document.createElement('button');
			deleteButton.classList.add('delete');
			deleteButton.innerHTML = '';
			container.appendChild(deleteButton);

			// Inputs ----------------------------------------------------------
			inputObjects = {};

			var inputs = document.createElement('div');
			inputs.classList.add('inputs');
			container.appendChild(inputs);

			if(spec.inputs){
				Object.keys(spec.inputs).forEach(function(inputId){
					var input = new VisualNodeInput(
						inputId,
						inputId,
						id,
						spec.inputs[inputId],
						self
					);
					inputObjects[inputId] = input;
					inputs.appendChild(input.container);
				});
			}

			// Collections
			collectionInputObjects = {};
			if(spec.collection){
				
				var collectionContainer = document.createElement('div');
				collectionContainer.classList.add('collection-container');
				collectionContainer.classList.add('placeholder');
				inputs.appendChild(collectionContainer);

				var collectionAdderContainer = document.createElement('div');
				collectionAdderContainer.classList.add('adder-container');
				collectionContainer.appendChild(collectionAdderContainer);

				var collectionAdderButton = document.createElement('div');
				collectionAdderButton.classList.add('button');
				collectionAdderContainer.appendChild(collectionAdderButton);

				var collectionAdderText = document.createElement('div');
				collectionAdderText.classList.add('text');
				collectionAdderText.innerHTML = 'items';
				collectionAdderContainer.appendChild(collectionAdderText);


				eventsManager.addEventListener(collectionAdderButton, 'click', function(){
					createCollectionInput(collectionContainer);
				
				});

				// Monitor the connections, so we can create the collection
				// inputs on the fly
				eventsManager.add(TREE.connectionAdded, function(data){
					var to = data.to.split('.');
					if(to.length != 2) return;
					if(to[0] != id) return;

					var inputId = to[1];

					if(!isInputIdInCollection(inputId)) return;
					if(collectionInputObjects[inputId]) return;

					var inputIndex = getIndexFromCollectionInputId(inputId);
					var collectionLength = inputIndex+1;

					for (var i = 0; i < collectionLength; i++) {
						if(collectionInputObjects['items['+i+']']) continue;
						createCollectionInput(collectionContainer);
					};


					// Manually call the connection, since we are too late to
					// monitor the TREE.connectionAdded
					collectionInputObjects[inputId].proccessIncomingConnection(data);
				}, 999);// <-- this 999 is the priority for the sigal, so this
				// runs before VisualNodeOutput
			}


			// Title -----------------------------------------------------------
			var title = document.createElement('h5');
			title.classList.add('title');
			title.innerHTML = spec.name;
			container.appendChild(title);

			// Outputs ---------------------------------------------------------
			outputObjects = {};

			var outputs = document.createElement('div');
			outputs.classList.add('outputs');
			container.appendChild(outputs);

			if(spec.out){
				var outputId = 'out';
				var output = new VisualNodeOutput(
					outputId,
					id,
					self
				);
				outputObjects[outputId] = output;
				outputs.appendChild(output.container);
			}
			// Mouse events ----------------------------------------------------
			eventsManager.addEventListener(container, 'mouseover', function(){
				container.classList.add('focus');
			})
			eventsManager.addEventListener(container, 'mouseout', function(){
				container.classList.remove('focus');
			})

			// Deleting --------------------------------------------------------
			eventsManager.addEventListener(deleteButton, 'click', function(){
				delete TREE.data[id];
			});
			eventsManager.add(TREE.nodeRemoved, function(_id){
				if(id != _id) return;

				destroy();
				container.parentNode.removeChild(container);
			});
			
			// Dragging	--------------------------------------------------------		
			if(!treeNode._x) treeNode._x = 0;
			if(!treeNode._y) treeNode._y = 0;
			interactable = interact(container)
			.draggable({
				onstart:function(event){
					moveToFront();
				},
				onmove: function (event) {
					var target = event.target;
					treeNode._x += event.dx;
					treeNode._y += event.dy;
				},
				onend: function (event) {}
			})
			.restrict({
				drag: 'parent',
				endOnly: true,
				elementRect: { top: 0, left: 0, bottom: 0, right: 0 }
			});

			// On position updated ---------------------------------------------
			eventsManager.add(TREE.nodePositionUpdated, function(_id, x, y){
				if(id != _id) return;
				container.style.left = x + 'px';
				container.style.top = y + 'px';

				Object.keys(inputObjects).forEach(function(id){
					inputObjects[id].update();
				});
				Object.keys(outputObjects).forEach(function(id){
					outputObjects[id].update();
				});
			})
		}

		var createCollectionInput = function(collectionContainer){
			var collectionKeys =  Object.keys(collectionInputObjects);
			var inputIndex = collectionKeys.length;
			var inputId = getIdFromCollectionInputIndex(inputIndex);

			collectionContainer.classList.remove('placeholder');

			var input = new VisualNodeInput(
				inputIndex,
				inputId,
				id,
				0,
				self
			);
			inputObjects[inputId] = input;
			collectionInputObjects[inputId] = input;

			collectionContainer.appendChild(input.container);

			// Create the delete button
			var deleteButton = document.createElement('div');
			deleteButton.classList.add('delete-button');
			input.container.appendChild(deleteButton);

			eventsManager.addEventListener(deleteButton, 'click', function(){
				// If the object is new (nothing was connected to it), there will
				// be no 'inputs' on the TREE, so we create one one the fly
				if(! TREE.data[id].inputs ) TREE.data[id].inputs = {};


				if(TREE.data[id].inputs[inputId])
					delete TREE.data[id].inputs[inputId];

				Object.keys(TREE.data[id].inputs).forEach(function(key){
					if(!isInputIdInCollection(key)) return;
					var index = getIndexFromCollectionInputId(key);
					if(index <= inputIndex) return;
					var newId = getIdFromCollectionInputIndex(index-1);

					TREE.data[id].inputs[newId] = TREE.data[id].inputs[key];
					delete TREE.data[id].inputs[key];
				});

				// "visually" remove last input
				var lastIndex =  Object.keys(collectionInputObjects).length - 1;
				var lastId =  getIdFromCollectionInputIndex(lastIndex);
				inputObjects[lastId].destroy();
	
				collectionContainer.removeChild(collectionInputObjects[lastId].container);

				delete collectionInputObjects[lastId];
				delete inputObjects[lastId];
			});

		}

		var isInputIdInCollection = function(inputId){
			var regexArray = COLLECTION_ITEM_PARSE_REGEX.exec(inputId);
			COLLECTION_ITEM_PARSE_REGEX.lastIndex = 0; // reset regex
			if(!regexArray) return false;
			if(regexArray.length != 2) return false;
			return true;
		}
		var getIndexFromCollectionInputId = function(inputId){
			var regexArray = COLLECTION_ITEM_PARSE_REGEX.exec(inputId);
			COLLECTION_ITEM_PARSE_REGEX.lastIndex = 0; // reset regex

			var inputIndex = parseInt(regexArray[1]);
			return inputIndex;
		}
		var getIdFromCollectionInputIndex = function(inputIndex){
			return 'items['+inputIndex+']';
		}

		var moveToFront = function(){
			var parentNode = container.parentNode;
			parentNode.removeChild(container);
			parentNode.appendChild(container);
		}

		var destroy = function(){
			eventsManager.destroy();
			interactable.unset();
			Object.keys(inputObjects).forEach(function(id){
				inputObjects[id].destroy();
			});
			inputObjects = null;

			Object.keys(outputObjects).forEach(function(id){
				outputObjects[id].destroy();
			});
			outputObjects = null;
		}
		var update = function(){
			Object.keys(inputObjects).forEach(function(id){
				inputObjects[id].update();
			});
			Object.keys(outputObjects).forEach(function(id){
				outputObjects[id].update();
			});
		}

		Object.defineProperty(self, 'update', {
			value: update
		});
		Object.defineProperty(self, 'destroy', {
			value: destroy
		});
		Object.defineProperty(self, 'container', {
			get: function(){ return container; }
		});
		Object.defineProperty(self, 'editor', {
			get: function(){ return editor; }
		});
		Object.defineProperty(self, 'inputObjects', {
			get: function(){ return inputObjects; }
		});
		Object.defineProperty(self, 'outputObjects', {
			get: function(){ return outputObjects; }
		});

		init();
	}

	return VisualNode;
});