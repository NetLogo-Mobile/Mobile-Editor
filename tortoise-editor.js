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
		Editor.Container = $("#Main-Editor");
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
		if (Localized.Data && Localized.Data.hasOwnProperty(Source))
		 return Localized.Data[Source];
		return Source;
	}

	return Localized;
}();

// Commands: Handle the interaction of CodeMirror command center.
Commands = function() {
	var Commands = {};
	var CommandEditor = null;
	var Outputs = null;

	// Following three variables are used for command histrory.
	var CommandStack = [];
	var CurrentCommand = [];
	var CurrentCommandIndex = 0;

	// Store [Objective, Input Content]
	Contents = [];

	// Command center would be disabled before compile output come out.
	Commands.Disabled = false;

	// Hide MainEditor and Command Center would show up
	Commands.Show = function() {
		Editor.Container.css("display", "none");
		Commands.Container.css("display", "block");
		bodyScrollLock.clearAllBodyScrollLocks();
		bodyScrollLock.disableBodyScroll(document.querySelector('div.command-output'));
		CommandEditor.refresh();
	}

	// Hide Command Center and MainEditor would show up
	Commands.Hide = function() {
		Editor.Container.css("display", "block");
		Commands.Container.css("display", "none");
		bodyScrollLock.clearAllBodyScrollLocks();
		bodyScrollLock.disableBodyScroll(document.querySelector('.CodeMirror-scroll'), { allowTouchMove: () => true });
	}

	// Initialize the command center
	Commands.Initialize = function() {
		// Get the elements
		Commands.Container = $("#Command-Center");
		Outputs = $(".command-output");
		Commands.Hide();
		// CodeMirror Editor
		CommandEditor = CodeMirror(document.getElementById("Command-Input"), {
			mode: "netlogo",
			theme: "netlogo-default",
			scrollbarStyle: "null",
			viewportMargin: Infinity,
			cursorHeight: 0.8
		});

		CommandEditor.on('keyup', (cm, event) => {
			const key = event.code;
			if (key !== "Enter" && key !== "ArrowUp" && key !== "ArrowDown" && CurrentCommandIndex == 0) {
				const content = CommandEditor.getValue();
				const objective = $('#Command-Objective').val();
				CurrentCommand = [objective, content];
				CurrentCommandIndex = 0;
			}
		});

		// After press key `Enter`, excute command
		CommandEditor.on('keydown', (cm, event) => {
			if (event.key == "Enter" || event.code == "Enter") {
				const content = CommandEditor.getValue().replace(/\n/ig, '');
				if (!content || Commands.Disabled) return;
				const objective = $('#Command-Objective').val();
				Commands.Execute(objective, content);
				CommandStack.push([objective, content]);
				CurrentCommandIndex = 0;
				CurrentCommand = [];
			}
		});

		// After press key `ArrowUp`, get previous command from command history
		CommandEditor.on('keydown', (cm, event) => {
			if (event.key == "ArrowUp" || event.code == "ArrowUp") {
				if (CurrentCommandIndex >= CommandStack.length) return;
				CurrentCommandIndex += 1;
				const index = CommandStack.length - CurrentCommandIndex;
				Commands.SetContent(CommandStack[index][0], CommandStack[index][1]);
				CommandEditor.setCursor(CommandEditor.lineCount(), 0);
			}
		});

		// After press key `ArrowDown`, get next command from command history
		CommandEditor.on('keydown', (cm, event) => {
			if (event.key == "ArrowDown"|| event.code == "ArrowDown") {
				if (CurrentCommandIndex <= 1) {
					CurrentCommandIndex = 0;
					if (CurrentCommand.length == 0) {
						Commands.ClearInput();
					} else {
						Commands.SetContent(CurrentCommand[0], CurrentCommand[1]);
						CommandEditor.setCursor(CommandEditor.lineCount(), 0);
					}
					return;
				}
				const index = CommandStack.length - CurrentCommandIndex;
				Commands.SetContent(CommandStack[index][0], CommandStack[index][1]);
				CommandEditor.setCursor(CommandEditor.lineCount(), 0);
				CurrentCommandIndex -= 1;
			}
		});

		// Listen to the sizing
		if (window.visualViewport)
			window.visualViewport.addEventListener("resize", () => {
				var Height = window.visualViewport.height;
				var Offset = window.innerHeight - Height;
				$("#Container").css("height", `${Height}px`);
				$("#Command-Line").css("bottom", `${Offset}px`);
			});
	}

	// Print a line of input to the screen
	Commands.PrintInput = function(Objective, Content) {
		// CodeMirror Content
		var Wrapper = $(`
			<div class="command-wrapper">
				<div class="content">
					<p class="input Code">${Localized.Get(Objective)}&gt;
						<span class="cm-s-netlogo-default"></span>
					</p>
				</div>
				<div class="icon">
					<img class="copy-icon" src="images/copy.svg">
				</div>
			</div>
		`).appendTo(Outputs);

		// Click to activate
		Wrapper.on("click", () => {
			$(".command-wrapper").removeClass("active");
			$(".command-wrapper .icon").css("display", "none");
			Wrapper.addClass("active");
			Wrapper.children(".icon").get(0).style.display = "flex";
		});

		// Click to copy
		Wrapper.children(".icon").on("click", () => {
			const input = Wrapper.find("p.input").get(0).innerText;
			const [objective, command] = input.split("> ");
			Commands.SetContent(objective, command);
		});

		// Run CodeMirror
		var Snippet = Wrapper.children(".content").children(".Code").children("span");
		CodeMirror.runMode(Content, "netlogo", Snippet.get(0));
	}

	// Provide for Unity to print compiled output
	Commands.PrintOutput = function(Content, Class) {
		var Output;
		switch (Class) {
			case "CompilationError":
				Output = $(`
					<p class="CompilationError output">${Localized.Get("编译错误")}: ${Content}</p>
				`).appendTo(Outputs);
				break;
			case "RuntimeError":
				Output = $(`
					<p class="RuntimeError output">${Localized.Get("执行错误")}: ${Content}</p>
				`).appendTo(Outputs);
				break;
			case "Succeeded":
				Output = $(`
					<p class="Succeeded output">${Localized.Get("成功执行了命令。")}</p>
				`).appendTo(Outputs);
				break;
			case "Output":
				var Last = Outputs.children().last();
				if (Last.hasClass(Class)) {
					Output = Last;
					Last.get(0).innerText += Content;
				} else {
					Output = $(`<p class="Output output"></p>`).appendTo(Outputs);
					Output.get(0).innerText = Content;
				}
				break;
			default:
				var Output = $(`
					<p class="${Class} output">${Content}</p>
				`).appendTo(Outputs);
				break;
		}

		Output.on("click", (event) => {
			previousNode = event.path[0].previousElementSibling;
			if (previousNode.className == "command-wrapper") {
				$(".command-wrapper").removeClass("active");
				$(".command-wrapper .icon").css("display", "none");
				previousNode.className += " active";
				previousNode.children[1].style.display = "flex";
			}
		});

		Commands.ScrollToBottom();
	}

	// Clear the input box of Command Center
	Commands.ClearInput = function() {
		CommandEditor.getDoc().setValue("");
	}

	// Clear the output region of Command Center
	Commands.ClearOutput = function() {
		Outputs.children(":not(.Keep)").remove();
	}

	// After user entered input, screen view should scroll down to the botom line
	Commands.ScrollToBottom = function() {
		const scrollHeight = document.querySelector('.command-output').scrollHeight;
		document.querySelector('.command-output').scrollTop = scrollHeight;
	}

	// Execute a command from the user
	Commands.Execute = function(Objective, Content) {
		Editor.Call("###Execute");
		Commands.PrintInput(Objective, Content);
		Commands.ScrollToBottom();
		Commands.ClearInput();
		Contents = [Objective, Content];
	}

	// Set the content of command input
	Commands.SetContent = function(Objective, Content) {
		CommandEditor.getDoc().setValue(Content);
		document.querySelector('select').value = Objective.toLowerCase();
	}

	// Provide for Unity to get command input
	Commands.GetCommand = function() {
		return JSON.stringify(Contents);
	}

	// Provide for Unity to notify completion of the command
	Commands.FinishExecution = function(Status, Message) {
		Commands.PrintOutput(Message, Status);
		Commands.Disabled = false;
	}

	return Commands;
}();
