// Editor: Handle the interaction of CodeMirror main editor.
// REFACTOR NEEDED IF WE ARE GOING TO SUPPORT MORE STATUSES
Editor = function() {
	var Editor = {};
	var MainEditor = null;

	// UI support
	// Obseleted: Tips
	// Show the tips
	Editor.ShowTips = function(Content, Callback) {
		if (Callback == null) Callback = () => {};
		$("#Main-Tips").off("click").text(Content).click(Callback).show();
		TipsActive = true;
		Editor.ClearHighlights();
	}
	// Hide the tips
	Editor.HideTips = function() {
		$("#Main-Tips").hide();
		TipsActive = false;
		Editor.ClearHighlights();
	}

	// ShowErrors: Show the error tips & markers.
	Editor.ShowErrors = function(Error) {
		Editor.ClearHighlights();
		var Item = new Highlight("error", JSON.parse(Error)[0]);
		Item.MarkText();
		Item.ShowTips();
		Item.ShowGutter();
		Item.ScrollIntoView();
		Highlights.push(Item);
	}
	// ClearHighlights: Clear all highlights.
	var Highlights = [];
	Editor.ClearHighlights = function() {
		for (var I = 0; I < Highlights.length; I++)
			Highlights[I].Clear();
		Highlights = [];
	}

	// Class: Highlight
	var Highlight = function(Type, Source) {
		this.Type = Type;
		this.Message = Source.message;
		var LineCount = MainEditor.lineCount();
		var Accumulated = 0;
		for (var N = 0; N < LineCount; N++) {
			var Length = MainEditor.getLine(N).length;
			if (this.PositionFrom == null && Source.start <= Accumulated + Length) this.PositionFrom = { line: N, ch: Source.start - Accumulated };
			if (this.PositionTo == null && Source.end <= Accumulated + Length) this.PositionTo = { line: N, ch: Source.end - Accumulated };
			if (this.PositionFrom != null && this.PositionTo != null) break;
			Accumulated += Length + 1;
		}
	}
	Highlight.prototype.Clear = function() {
		if (this.TextMarker != null) this.TextMarker.clear();
		if (this.Gutter != null) MainEditor.doc.setGutterMarker(this.PositionFrom.line, this.Type, null);
		if (this.TipsWidget != null) this.HideTips();
	}
	Highlight.prototype.ScrollIntoView = function(Distance = 200) {
		MainEditor.scrollIntoView(this.PositionFrom, Distance);
	}
	Highlight.prototype.MarkText = function() {
		this.TextMarker = MainEditor.doc.markText(this.PositionFrom, this.PositionTo, { className: "cm-" + this.Type });
		return this;
	}
	Highlight.prototype.ShowTips = function() {
		if (this.TipsWidget != null) return;
		var Element = $("<div class='CodeMirror-context-tips'></div>");
		Element.text(this.Message);
		Element[0].onclick = () => this.HideTips();
		this.TipsWidget = MainEditor.doc.addLineWidget(this.PositionFrom.line, Element[0], {});
	}
	Highlight.prototype.HideTips = function() {
		if (this.TipsWidget == null) return;
		this.TipsWidget.clear();
		this.TipsWidget = null;
	}
	Highlight.prototype.ShowGutter = function() {
		this.Gutter = $("<div class='CodeMirror-marker-" + this.Type + "'></div>")[0];
		this.Gutter.Callback = () => this.ShowTips();
		MainEditor.doc.setGutterMarker(this.PositionFrom.line, this.Type, this.Gutter);
		return this;
	}

	// Editor support
	// SetContent: Set the content of the editor.
	var Generation;
	Editor.SetContent = function(Content, Unapplied) {
		MainEditor.off("changes");
		// Set the content
		if (Content != Editor.GetContent()) {
			MainEditor.setValue(Content);
			MainEditor.doc.clearHistory();
			Editor.ClearHighlights();
		}
		// Mark clean or show tips
		if (!Unapplied) Editor.SetApplied();
		// Event listener
		MainEditor.on("changes", () => Editor.Call("###Unapplied"));
	}

	// GetContent: Get the content of the editor.
	Editor.GetContent = function() {
		return MainEditor.getValue();
	}

	// SetApplied: Set applied status.
	Editor.SetApplied = function() {
		Generation = MainEditor.doc.changeGeneration();
	}

	// SetReadonly: Set readonly status.
	Editor.SetReadonly = function(Status) {
		MainEditor.setOption("readOnly", Status);
	}

	// Undo: Undo last change.
	Editor.Undo = function() {
		if (MainEditor.getOption("readOnly")) return;
		MainEditor.doc.undo();
	}

	// Redo: Redo last change.
	Editor.Redo = function() {
		if (MainEditor.getOption("readOnly")) return;
		MainEditor.doc.redo();
	}

	// Initialize the editor.
	Editor.Initialize = function() {
		// Basic initialization
		MainEditor = CodeMirror(document.getElementById("Main-CodeMirror"), {
			lineNumbers: true,
			lineWrapping: true,
			mode: "netlogo",
			theme: "netlogo-default",
			gutters: ["error", "CodeMirror-linenumbers"]
		});
		// Auto complete
		CodeMirror.registerHelper('hintWords', 'netlogo', window.keywords.all.filter(
			(word) => !window.keywords.unsupported.includes(word)));
		CodeMirror.registerHelper('hint', 'fromList', (cm, options) => {
			var cur = cm.getCursor();
			var token = cm.getTokenAt(cur);
			var to = CodeMirror.Pos(cur.line, token.end);
			if (token.string && /\S/.test(token.string[token.string.length - 1])) {
				term = token.string
				from = CodeMirror.Pos(cur.line, token.start)
			} else {
				term = ''
				from = to
			}
			found = options.words.filter((word) => word.slice(0, term.length) == term)
			if (found.length > 0)
				return { list: found, from: from, to: to }
		});
		MainEditor.on('keyup', (cm, event) => {
			if (!cm.state.completionActive && event.keyCode > 64 && event.keyCode < 91) {
				cm.showHint({ completeSingle: false });
			}
		});
		// Click on gutter
		MainEditor.on('gutterClick', (cm, n) => {
			var Line = cm.doc.getLineHandle(n);
			if (Line.gutterMarkers == null) return;
			Object.keys(Line.gutterMarkers).forEach((Key) => {
				Line.gutterMarkers[Key].Callback();
			});
		});
		// Customize KeyMap
		MainEditor.addKeyMap({
			"Cmd-X": "indentMore"
		});
		// Other interfaces
		Overlays.Initialize();
		Editor.MainEditor = MainEditor;
	}

	// Engine features
	// Resize: Resize the viewport width (on mobile platforms)
	var Resize = function(Width) {
		$("#viewport").attr("content", "width=" + Width + ",user-scalable=no,viewport-fit=cover");
	}
	var ResizeHandler = null;
	Editor.Resize = function (Width) {
		if (navigator.userAgent.indexOf("NetLogo") != -1) {
			if (ResizeHandler != null) clearTimeout(ResizeHandler);
			// On some iOS devices, the animated rotation takes some time
			// and sometimes it causes the scaling to be nullified...
			ResizeHandler = setTimeout(function () {
					Resize(Width - 1);
					ResizeHandler = setTimeout(function () {
							Resize(Width);
							ResizeHandler = null;
					}, 100);
			}, 100);
		} else Resize(Width);
	}

	// Call: Call the Unity engine.
	Editor.Call = function(Code) {
		PostMessage(Code);
	}

	return Editor;
}();

// Overlays: Overlays manager.
Overlays = function() {
	var Overlays = {};

	// Initialize: Initialize all overlays.
	Overlays.Initialize = function() {
		// RotateScreen: Rotate-Screen dialog.
		Overlays.RotateScreen = $("#Rotate-Screen").asOverlay().click(() => Overlays.RotateScreen.Hide());
	}

	return Overlays;
}();

// Localized: Localized support.
Localized = function() {
	var Localized = {};

	// Initialize: Initialize the manager with given data.
	Localized.Initialize = function(Data) {
		Localized.Data = Data;
		$(".Localized").each((Index, Target) => $(Target).text(Localized.Get($(Target).text())));
	}

	// Get: Get localized string.
	Localized.Get = function(Source) {
		if (Localized.Data.hasOwnProperty(Source)) return Localized.Data[Source];
		return Source;
	}

	return Localized;
}();

// Commands: Handle the interaction of CodeMirror command center.
Commands = function() {
	var Commands = {};

	Commands.Show = function() {
		$('#Main-Editor').css("display", "none");
	}

	Commands.Hide = function() {
		$('#Main-Editor').css("display", "block");
	}

	Commands.PrintInput = function(Objective, Content) {
		$('.command-output').append(`
			<p class="Localized comment">${Objective}> ${Content}</p>
		`)
	}

	Commands.PrintOutput = function(Content) {
		$('.command-output').append(`
			<p class="Localized comment">${Content}</p>
		`)
	}

	Commands.Compile = function(Content) {
		return Content
	}

	return Commands;
}();
