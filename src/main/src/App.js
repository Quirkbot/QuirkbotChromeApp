define(
[
	'happy/app/BaseApp',
	'Tree',
	'Definitions',
	'SVGDrawing',
	'UI'
],
function (
	BaseApp,
	TREE,
	DEFINITIONS,
	SVGDrawing,
	UI
){
	"use strict";

	var App = function(){
		var 
		self = this;

	
		self.setup = function(){	
			self.container.classList.add('loading');

			DEFINITIONS.load(self.container.dataset.indexPath 
				|| 'nodes/index.json')
			.then(function () {
				self.container.classList.remove('loading');
				createUI();
				TREE.load(); 

			})
			.catch(function(error) {
				self.container.classList.remove('loading');
				logError(error);
			});
			
		}

		var createUI = function(){
			UI.init();

			self.container.appendChild(UI.definitionList.container);
			self.container.appendChild(UI.visualEditor.container);

			SVGDrawing.init(UI.visualEditor.container);

		}

		self.onResize = function(size){
			SVGDrawing.resize();
		}
		self.update = function(){
			SVGDrawing.update();
		}

		var logError = function (error) {
			if(error.stack) console.error(error.stack);
			else console.error(error);
		}

		
	}
	App.prototype = new BaseApp();
	return App;
});