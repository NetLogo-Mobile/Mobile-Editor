// Editor: Handle the interaction of CodeMirror main editor.
// REFACTOR NEEDED IF WE ARE GOING TO SUPPORT MORE STATUSES
Editor = function() {
	var Editor = {};
	var MainEditor = null;
	var DarkMode = null;

	// UI support
	// Obseleted: Tips
	// Show the tips
	Editor.ShowTips = function(Content, Callback) {
		if (Callback == null) Callback = () => { Editor.HideTips(); };
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
		var Message = JSON.parse(Error)[0];
		if (Message.start == 2147483647) {
			Editor.ShowTips(Message.message);
		} else {
			Highlights.push(new Highlight("error", Message).ShowAll());
		}
	}

	// ClearHighlights: Clear all highlights.
	var Highlights = [];
	var ContextualHighlight = null;
	Editor.ClearHighlights = function() {
		for (var I = 0; I < Highlights.length; I++)
			Highlights[I].Clear();
		Editor.ClearExplanation();
		Highlights = [];
	}

	// Class: Highlight
	var Highlight = function(Type, Source) {
		this.Type = Type;
		this.Message = Source.message;
		this.PositionFrom = Source.from;
		this.PositionTo = Source.to;
		if (this.PositionFrom != null && this.PositionTo != null) return;
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
		return null;
	}
	Highlight.prototype.ScrollIntoView = function(Distance = 200) {
		MainEditor.scrollIntoView(this.PositionFrom, Distance);
		return this;
	}
	Highlight.prototype.MarkText = function() {
		this.TextMarker = MainEditor.doc.markText(this.PositionFrom, this.PositionTo, { className: "cm-" + this.Type });
		return this;
	}
	Highlight.prototype.ShowTips = function(Callback) {
		if (this.TipsWidget != null) return;
		var Element = $("<div class='CodeMirror-context-tips'></div>");
		if (this.Message.indexOf("<span") != -1)
			Element.html(this.Message);
		else Element.text(this.Message);
		Element.click(Callback != null ? Callback : () => this.HideTips());
		this.TipsWidget = MainEditor.doc.addLineWidget(this.PositionFrom.line, Element[0], {});
		return this;
	}
	Highlight.prototype.HideTips = function() {
		if (this.TipsWidget == null) return;
		this.TipsWidget.clear();
		this.TipsWidget = null;
		return this;
	}
	Highlight.prototype.ShowGutter = function() {
		this.Gutter = $("<div class='CodeMirror-marker-" + this.Type + "'></div>")[0];
		this.Gutter.Callback = () => this.ShowTips();
		MainEditor.doc.setGutterMarker(this.PositionFrom.line, this.Type, this.Gutter);
		return this;
	}
	Highlight.prototype.ShowAll = function(Callback) {
		return this.MarkText().ShowTips(Callback).ShowGutter().ScrollIntoView();
	}

	// Explain support
	// Explain: Start explaining things.
	Editor.Explain = function(Explicit = true) {
		if (Commands.Visible) {
			Commands.Explain(Explicit);
		} else {
			ExplainInternal(Explicit);
		}
	}

	// ExplainNotFound: Show toast for explain not found.
	Editor.ExplainNotFound = function() {
		Editor.Toast("warning", Localized.Get("未能找到选中内容的相关信息。"));
	}

	// ClearExplanation: Clear the explanation.
	Editor.ClearExplanation = function() {
		if (ContextualHighlight != null)
			ContextualHighlight = ContextualHighlight.Clear();
	}
	
	// ExplainInEditor: Explain in the editor.
	var ExplainHandle = 0;
	var ExplainInternal = function(Explicit) {
		// Clear the timeout handle
		clearTimeout(ExplainHandle);
		if (!MainEditor.doc.somethingSelected()) return;
		// Get the first and try to expand it
		var Selection = MainEditor.doc.listSelections()[0];
		var Packet = { from: Selection.anchor, to: Selection.head };
		// Recognize the command
		for (var I = Packet.from.line; I <= Packet.to.line; I++) {
			var Tokens = MainEditor.getLineTokens(I);
			for (var Token of Tokens) {
				// Check eligibility
				if (I == Packet.from.line && Token.end < Packet.from.ch) continue;
				if (I == Packet.to.line && Token.start > Packet.to.ch) continue;
				if (Token.type == null) continue;
				// Ignore if there are multiple eligible tokens
				if (Packet.message != null && !Explicit) return;
				// Show information
				var Command = `<span class="cm-${Token.type}">${Token.string}</span>`
				Packet.command = Token.string;
				if (Dictionary.Check(Packet.command)) {
					Packet.message = `${Command}: ${Dictionary.Get(Packet.command)} ➤`;
				} else if (Dictionary.Check("~" + Token.type)) {
					Packet.message = Dictionary.Get("~" + Token.type).replace("{0}", Command);
					Packet.command = null;
				} else {
					// Packet.message = Token.type;
				}
			}
			if (Packet.message != null) break;
		}
		// Message not found
		if (Packet.message == null) {
			if (!Explicit) return;
			return Editor.ExplainNotFound();
		} 
		// Show the highlight
		Editor.ClearExplanation();
		ContextualHighlight = new Highlight("help", Packet).ShowAll(() => {
			if (Packet.command != null)
				Commands.Execute(null, `help ${Packet.command} -full`);
			Editor.ClearExplanation();
		});
	}

	// Interface-related
	// ClearDialogs: Clear all dialogs.
	Editor.ClearDialogs = function() {
		var Dialog = $(".CodeMirror-dialog");
		return Dialog.remove();
	}

	// Toast: Show a toast.
	Editor.Toast = function(Type, Content, Subject) {
		toastr[Type](Content, Subject);
	}

	// Confirm: Show a confirm.
	Editor.Confirm = function(Subject, Content, OK, Cancel) {
		$.confirm({
			title: Localized.Get(Subject),
			content: Localized.Get(Content),
			type: 'green',
			useBootstrap: false,
			buttons: {   
				ok: {
					text: Localized.Get("确定"),
					btnClass: 'btn-primary',
					keys: ['enter'],
					action: OK
				},
				cancel: {
					text: Localized.Get("取消"),
					action: Cancel
				}
			}
		});
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
		MainEditor.on("changes", () => Editor.Call({ Type: "CodeChanged" }));
	}

	// GetEditor: Get the main editor.
	Editor.GetEditor = function() {
		return MainEditor;
	}

	// GetContent: Get the content of the editor.
	Editor.GetContent = function(Finalizing) {
		if (Finalizing) {
			Editor.Blur();
			Commands.Blur();
		}
		return MainEditor.getValue();
	}

	// SetApplied: Set applied status.
	Editor.SetApplied = function() {
		Generation = MainEditor.doc.changeGeneration();
		Editor.HideTips();
	}

	// SetReadonly: Set readonly status.
	Editor.SetReadonly = function(Status) {
		MainEditor.setOption("readOnly", Status);
	}

	// Blur: Blur the editor.
	Editor.Blur = function() {
		MainEditor.getInputField().blur();
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

	// Find: Start finding things.
	Editor.Find = function() {
		Editor.ClearDialogs();
		MainEditor.execCommand("find");
	}

	// Replace: Start replace things.
	Editor.Replace = function() {
		Editor.ClearDialogs();
		MainEditor.execCommand("replace");
	}
	
	// JumpTo: Try to jump to lines or a specific place.
	Editor.JumpTo = function(Data) {
		if (Data != null) {
			
		} else {
			Editor.ClearDialogs();
			MainEditor.execCommand("jumpToLine");
		}
	}

	// JumpNetTango: Jump to the NetTango portion.
	Editor.JumpNetTango = function() {
		Commands.Hide();
		var Index = Editor.GetContent().indexOf("; --- NETTANGO BEGIN ---");
		if (Index == -1) return;
		var Start = MainEditor.doc.posFromIndex(Index);
		MainEditor.scrollTo(0, MainEditor.getScrollInfo().height);
		MainEditor.scrollIntoView(Start, 0);
	}

	// SelectAll: Select all text.
	Editor.SelectAll = function() {
		MainEditor.focus();
		MainEditor.execCommand("selectAll");
	}

	// Reset: Show the reset dialog.
	Editor.Reset = function() {
		Editor.Confirm(Localized.Get("重置代码"), Localized.Get("是否将代码重置到最后一次成功编译的状态？"),
			() => Editor.Call({ Type: "CodeReset" }));
	}

	// ShowMenu: Show a feature menu.
	Editor.ShowMenu = function() {
		var Dialog = $("#Dialog-Procedures")
		var List = Dialog.children("ul").empty();
		Dialog.children("h4").text(Localized.Get("更多功能"));
		var Features = {};
		Features[Localized.Get("选择全部")] = Editor.SelectAll;
		Features[Localized.Get("撤销操作")] = Editor.Undo;
		Features[Localized.Get("重做操作")] = Editor.Redo;
		Features[Localized.Get("跳转到行")] = Editor.JumpTo;
		Features[Localized.Get("重置代码")] = Editor.Reset;
		for (var Feature in Features) {
			$(`<li>${Feature}</li>`).attr("Tag", Feature).appendTo(List).click(function() {
				Features[$(this).attr("Tag")]();
				$.modal.close();
			});
		}
		$("#Dialog-Procedures").modal({});
	}

	// ShowProcedures: List all procedures in the code.
	Editor.ShowProcedures = function() {
		var Procedures = Editor.GetProcedures();
		if (Object.keys(Procedures).length == 0) {
			Editor.Toast("warning", Localized.Get("代码中还没有任何子程序。"));
		} else {
			var Dialog = $("#Dialog-Procedures")
			var List = Dialog.children("ul").empty();
			Dialog.children("h4").text(Localized.Get("跳转到子程序"));
			var Handler = function() {
				var Start = MainEditor.doc.posFromIndex($(this).attr("start"));
				var End = MainEditor.doc.posFromIndex($(this).attr("end"));
				MainEditor.scrollIntoView(Start, 200);
				MainEditor.setSelection(Start, End);
				$.modal.close();
			};
			for (var Procedure in Procedures) {
				$(`<li>${Procedure}</li>`).appendTo(List)
					.attr("start", Procedures[Procedure][0])
					.attr("end", Procedures[Procedure][1]).click(Handler);
			}
			$("#Dialog-Procedures").modal({});
		}
	}

	// GetProcedures: Get all procedures from the code.
	Editor.GetProcedures = function() {
		var Rule = /^\s*(?:to|to-report)\s(?:\s*;.*\n)*\s*(\w\S*)/gm // From NLW
		var Content = Editor.GetContent(); var Names = [];
		while (Match = Rule.exec(Content)) {
			var Length = Match.index + Match[0].length;
			Names[Match[1]] = [ Length - Match[1].length, Length ];
		}
		return Names;
	}

	// Initialize the editor.
	Editor.Initialize = function() {
		Editor.Container = $("#Main-Editor");
		DarkMode = new Darkmode();
		// Basic initialization
		MainEditor = CodeMirror(document.getElementById("Main-CodeMirror"), {
			lineNumbers: true,
			lineWrapping: true,
			mode: "netlogo",
			theme: "netlogo-default",
			gutters: ["error", "CodeMirror-linenumbers"],
			matchBrackets: true,
			autoCloseBrackets: true
		});
		// Auto complete
		CodeMirror.registerHelper('hintWords', 'netlogo', window.keywords.all.filter(
			(word) => !window.keywords.unsupported.includes(word)));
		CodeMirror.registerHelper('hint', 'fromList', (cm, options) => {
			var cur = cm.getCursor();
			var token = cm.getTokenAt(cur);
			var to = CodeMirror.Pos(cur.line, token.end);
			if (token.string && /\S/.test(token.string[token.string.length - 1])) {
				term = token.string.toLowerCase();
				from = CodeMirror.Pos(cur.line, token.start);
			} else {
				term = '';
				from = to;
			}
			found = options.words.filter((word) => word.slice(0, term.length) == term).map((word) => word.replace("\\?", "?")).sort();
			if (found.length > 0 && !(found.length == 1 && found[0] == term))
				return { list: found, from: from, to: to };
		});
		MainEditor.on('keyup', (cm, event) => {
			if (cm.state.completionActive || event.ctrlKey || event.code.startsWith("Control")) return;
			if ((event.keyCode > 64 && event.keyCode < 91) || event.keyCode == 186 || event.keyCode == 189) {
				cm.showHint({ completeSingle: false, container: $("#Container").get(0) });
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
		// Selection
		MainEditor.on('beforeSelectionChange', (cm, obj) => {
			if (obj.ranges.length == 0) return;
			// Only identify single-line selections
			var Range = obj.ranges[0];
			if (Range.anchor.line != Range.head.line || Range.anchor.ch == Range.head.ch) {
				Editor.ClearExplanation();
				return;
			}
			// For different origins, we do differently
			clearTimeout(ExplainHandle);
			if (obj.origin == "double-tap") {
				ExplainHandle = setTimeout(() => Editor.Explain(false), 1);
			} else if (obj.origin != "triple-tap" && navigator.maxTouchPoints == 0) {
				ExplainHandle = setTimeout(() => Editor.Explain(false), 500);
			} else {
				Editor.ClearExplanation();
			}
		});
		// Customize KeyMap
		MainEditor.addKeyMap({
			"Cmd-X": "indentMore"
		});
		// Other interfaces
		Overlays.Initialize();
		Editor.ClearDialogs();
		Editor.MainEditor = MainEditor;
	}

	// Engine features
	// Resize: Resize the viewport width (on mobile platforms)
	Editor.Resize = function (Ratio) {
		$("body").addClass("Mobile");
		$("#viewport").attr("content", `width=device-width,initial-scale=${Ratio},maximum-scale=${Ratio},minimum-scale=${Ratio},user-scalable=no,viewport-fit=cover`);
	}

	// SetDesktop: Set the desktop mode.
	Editor.SetFontsize = function(Status) {
		$("html").css("font-size", Status + "px");
	}

	// ToggleDark: Toggle the dark mode.
	Editor.ToggleDark = function(Status) {
		if (Status != DarkMode.isActivated()) DarkMode.toggle();
	}

	// SetPlatform: Set the platform of the editor.
	Editor.SetPlatform = function(Platform) {
		$("body").addClass(Platform);
	}

	// TransformLinks: Transform the embedded links.
	Editor.TransformLinks = function(Element) {
		Element.find("a").each((Index, Link) => {
			Link = $(Link);
			var Href = Link.attr("href");
			Link.attr("href", "javascript:void(0);");
			Link.on("click", function() { Editor.Call({ Type: "Visit", Target: Href })});
		});
	}

	// Call: Call the Unity engine.
	Editor.Call = function(Code) {
		PostMessage(JSON.stringify(Code));
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
		Editor.GetEditor().options.phrases = Data;
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

// Dictionary: Dictionary support.
Dictionary = function() {
	var Dictionary = {};

	// Initialize: Initialize the manager with given data.
	Dictionary.Initialize = function(Data) {
		Dictionary.Data = Data;
	}

	// Get: Get dictionary string.
	Dictionary.Get = function(Source) {
		if (Dictionary.Check(Source.trim().toLowerCase()))
			return Dictionary.Data[Source];
		return Source;
	}
	
	// Check: Check dictionary item.
	Dictionary.Check = function(Source) {
		return Dictionary.Data && Dictionary.Data.hasOwnProperty(Source.trim().toLowerCase());
	}

	return Dictionary;
}();

// Commands: Handle the interaction of CodeMirror command center.
Commands = function() {
	var Commands = {};
	var CommandEditor = null;
	var Outputs = null;
	var Fulltext = null;

	// Following three variables are used for command histrory.
	var CommandStack = [];
	var CurrentCommand = [];
	var CurrentCommandIndex = 0;

	// Store [Objective, Input Content]
	Contents = [];

	// Command center would be disabled before compile output come out.
	Commands.Disabled = false;

	// Whether it is visible.
	Commands.Visible = true;

	// Hide MainEditor and Command Center would show up
	Commands.Show = function() {
		Editor.Container.css("display", "none");
		Commands.Container.css("display", "block");
		bodyScrollLock.clearAllBodyScrollLocks();
		bodyScrollLock.disableBodyScroll(document.querySelector('div.command-output'));
		bodyScrollLock.disableBodyScroll(document.querySelector('div.command-fulltext'));
		CommandEditor.refresh();
		Commands.HideFullText();
		Commands.Visible = true;
		Editor.ClearDialogs();
	}

	// Hide Command Center and MainEditor would show up
	Commands.Hide = function() {
		Editor.Container.css("display", "block");
		Commands.Container.css("display", "none");
		Commands.Visible = false;
		bodyScrollLock.clearAllBodyScrollLocks();
		bodyScrollLock.disableBodyScroll(document.querySelector('.CodeMirror-scroll'), { allowTouchMove: () => true });
		Editor.MainEditor.refresh();
	}

	// Blur the command center's editor.
	Commands.Blur = function() {
		CommandEditor.getInputField().blur();
	}

	// Initialize the command center
	Commands.Initialize = function() {
		// Get the elements
		Commands.Container = $("#Command-Center");
		Outputs = $(".command-output");
		Fulltext = $(".command-fulltext");
		AnnotateCode(Outputs.find(".keep code"), null, true);
		KeepSize = Outputs.children(".Keep").length;
		// CodeMirror Editor
		CommandEditor = CodeMirror(document.getElementById("Command-Input"), {
			mode: "netlogo",
			theme: "netlogo-default",
			scrollbarStyle: "null",
			viewportMargin: Infinity,
			cursorHeight: 0.8,
			matchBrackets: true,
			autoCloseBrackets: true
		});

		CommandEditor.on('keyup', (cm, event) => {
			const key = event.code;
			if (key !== "Enter" && key !== "ArrowUp" && key !== "ArrowDown" && CurrentCommandIndex == 0) {
				const content = CommandEditor.getValue();
				const objective = $('#Command-Objective').val();
				CurrentCommand = [objective, content];
				CurrentCommandIndex = 0;
			}
			
			if (cm.state.completionActive || event.ctrlKey || key.startsWith("Control")) return;
			if ((event.keyCode > 64 && event.keyCode < 91) || event.keyCode == 186 || event.keyCode == 189) {
				cm.showHint({ completeSingle: false, container: $("#Container").get(0) });
			}
		});

		// After press key `Enter`, excute command
		CommandEditor.on('keydown', (cm, event) => {
			if (event.key == "Enter" || event.code == "Enter") {
				const content = CommandEditor.getValue().replace(/\n/ig, '');
				Commands.ClearInput();
				if (!content || Commands.Disabled) return;
				const objective = $('#Command-Objective').val();
				Commands.Disabled = true;
				Commands.Execute(objective, content);
				CommandStack.push([objective, content]);
				CurrentCommandIndex = 0;
				CurrentCommand = [];
				CommandEditor.closeHint();
			}
		});

		// After press key `ArrowUp`, get previous command from command history
		CommandEditor.on('keydown', (cm, event) => {
			if (event.key == "ArrowUp" || event.code == "ArrowUp") {
				if (CurrentCommandIndex >= CommandStack.length) return;
				CurrentCommandIndex += 1;
				const index = CommandStack.length - CurrentCommandIndex;
				Commands.SetContent(CommandStack[index][0], CommandStack[index][1]);
			}
		});

		// After press key `ArrowDown`, get next command from command history
		CommandEditor.on('keydown', (cm, event) => {
			if (event.key == "ArrowDown" || event.code == "ArrowDown") {
				if (CurrentCommandIndex <= 1) {
					CurrentCommandIndex = 0;
					if (CurrentCommand.length == 0) {
						Commands.ClearInput();
					} else {
						Commands.SetContent(CurrentCommand[0], CurrentCommand[1]);
					}
					return;
				}
				const index = CommandStack.length - CurrentCommandIndex;
				Commands.SetContent(CommandStack[index][0], CommandStack[index][1]);
				CurrentCommandIndex -= 1;
			}
		});

		// Listen to selection changed
		/*var ExplainHandler = null;
		if (navigator.maxTouchPoints == 0) {
			document.addEventListener("selectionchange", () => {
				clearTimeout(ExplainHandler);
				ExplainHandler = setTimeout(() => {
					clearTimeout(ExplainHandler);
					Commands.Explain();
				}, 500);
			});
		}*/

		// Listen to the sizing
		if (window.VisualViewport)
			window.visualViewport.addEventListener("resize", () => {
				if (navigator.userAgent.indexOf("Macintosh") == -1 && navigator.userAgent.indexOf("Mac OS X") == -1) {
					var Height = window.visualViewport.height;
					$("#Container").css("height", `${Height}px`);
				} else {
					setTimeout(() => $(".command-output, .command-fulltext").css("padding-top", `calc(0.5em + ${document.body.scrollHeight - window.visualViewport.height}px)`), 100);
				}
				if (Commands.Visible) $(".command-output").scrollTop(100000);
			});
			
		Commands.Show();
	}

	// Batch printing support
	var Fragment = null;
	// Buffer size
	var BufferSize = 1000;
	// Keep size
	var KeepSize = -1;
	// Print to a batch.
	var WriteOutput = function(Element) {
		if (Fragment == null)
			Outputs.append(Element);
		else Fragment.append(Element);
	}
	// Open a printing batch.
	Commands.OpenBatch = function() {
		Fragment = $(document.createDocumentFragment());
	}
	// Close a printing batch.
	Commands.CloseBatch = function() {
		if (Fragment == null) return;
		// Trim the buffer (should refactor later) & the display
		var Length = Fragment.children().length;
		if (Length > BufferSize) {
			Fragment.children().slice(0, Length - BufferSize).remove();
			Outputs.children().slice(KeepSize).remove();
		} else {
			var NewLength = Outputs.children().length - KeepSize + Length;
			if (NewLength > BufferSize)
				Outputs.children().slice(KeepSize, NewLength - BufferSize + KeepSize).remove();
		}
		// Append to the display
		Outputs.append(Fragment);
		Fragment = null;
		Commands.ScrollToBottom();
	}

	// Print a line of input to the screen
	Commands.PrintInput = function(Objective, Content, Embedded) {
		if (Objective == null) Objective = $('#Command-Objective').val();
		else $('#Command-Objective').val(Objective);

		// CodeMirror Content
		var Wrapper = $(`
			<div class="command-wrapper">
				<div class="content">
					<p class="input Code">${Objective}&gt;
						<span class="cm-s-netlogo-default"></span>
					</p>
				</div>
				<div class="icon">
					<img class="copy-icon" src="images/copy.png"/>
				</div>
			</div>
		`);
		
		if (!Embedded) WriteOutput(Wrapper);
		Wrapper.attr("objective", Objective);
		Wrapper.attr("content", Content);

		// Click to copy
		Wrapper.children(".icon").on("click", () => {
			Commands.SetContent(Wrapper.attr("objective"), Wrapper.attr("content"));
			Editor.Call({ Type: "ClipboardWrite", Content: `${Wrapper.attr("objective")}: ${Wrapper.attr("content")}` });
		});

		// Run CodeMirror
		AnnotateCode(Wrapper.children(".content").children(".Code").children("span"), Content);
		return Wrapper;
	}

	// Provide for Unity to print compiled output
	Commands.PrintOutput = function(Content, Class) {
		var Output;
		switch (Class) {
			case "CompilationError":
				Output = $(`
					<p class="CompilationError output">${Localized.Get("抱歉，未能理解你输入的命令")}: ${Content}</p>
				`);
				break;
			case "RuntimeError":
				Output = $(`
					<p class="RuntimeError output">${Localized.Get(Content)}</p>
				`);
				break;
			case "Succeeded":
				Output = $(`
					<p class="Succeeded output">${Localized.Get("成功执行了命令。")}</p>
				`);
				break;
			case "Output":
				var Last = Outputs.children().last();
				Output = $(`<p class="Output output"></p>`);
				Output.get(0).innerText = Content;
				break;
			case "Help":
				var Output = null;
				if (typeof Content === 'string' || Content instanceof String) {
					if (Content.indexOf("<div class=\"block\">") >= 0) {
						Output = $(Content);
					} else {
						Output = $(`
							<p class="${Class} output">${Content}</p>
						`);
					}
				} else if (typeof Content === 'array' || Content instanceof Array) {
					Output = $(`
						<div class="block">
							${Content.map((Source) => `<p class="${Class} output">${Source}</p>`).join("")}
						</div>
					`);
				} else if (Content.Parameter == "-full") {
					this.ShowFullText(Content);
				} else {
					Output = $(`
						<div class="block">
							<p class="${Class} output"><code>${Content["display_name"]}</code> - ${Content["agents"].map((Agent) => `${RenderAgent(Agent)}`).join(", ")}</p>
							<p class="${Class} output">${Content["short_description"]} (<a class='command' target='help ${Content["display_name"]} -full'">${Localized.Get("阅读全文")}</a>)</p>
							<p class="${Class} output">${Localized.Get("参见")}: ${Content["see_also"].map((Name) => `<a class='command' target='help ${Name}'>${Name}</a>`).join(", ")}</p>
						</div>
					`);
				}
				if (Output != null) {
					LinkCommand(Output.find("a.command"));
					AnnotateInput(Output.find("div.command"));
					AnnotateCode(Output.find("code"));
				}
				break;
			default:
				var Output = $(`
					<p class="${Class} output">${Content}</p>
				`);
				break;
		}
		WriteOutput(Output);

		/*Output.on("click", (event) => {
			previousNode = event.path[0].previousElementSibling;
			if (previousNode != null && previousNode.className == "command-wrapper") {
				$(".command-wrapper").removeClass("active");
				previousNode.className += " active";
				previousNode.children[1].style.display = "flex";
			}
		});*/

		if (Fragment == null) Commands.ScrollToBottom();
	}
	
	/* Rendering stuff */
	// Annotate some code snippets.
	var AnnotateCode = function(Target, Content, AllowCopy) {
		for (var Item of Target.get()) {
			var Snippet = $(Item);
			// Render the code
			Snippet.addClass("cm-s-netlogo-default");
			CodeMirror.runMode(Content ? Content : Item.innerText, "netlogo", Item);
			// Copy support
			if (AllowCopy && Item.innerText.trim().indexOf(" ") >= 0 && Snippet.parent("pre").length == 0)
				Snippet.addClass("copyable").append($(`<img class="copy-icon" src="images/copy.png"/>`)).on("click", function() {
					Commands.SetContent("observer", this.innerText);
				});
		}
	}
	
	// Annotate some code inputs.
	var AnnotateInput = function(Query) {
		Query.each((Index, Item) => {
			Item = $(Item);
			Item.replaceWith(Commands.PrintInput(Item.attr("objective"), Item.attr("target"), true));
		});
	}

	// Generate a link for another command.
	var LinkCommand = function(Query) {
		Query.each((Index, Item) => {
			Item = $(Item);
			var Target = Item.attr("target");
			if (Target == null) Target = Item.text();
			var Objective = Item.attr("objective");
			if (!Objective) Objective = "null";
			Item.attr("href", "javascript:void(0)");
			Item.attr("onclick", `Commands.Execute(${Objective}, '${Target}')`);
		})
		return Query;
	}

	// Render tips for an agent type.
	var RenderAgent = (Agent) => {
		var Message = Agent;
		switch (Agent) {
			case "turtles":
				Message = `${Localized.Get("海龟")}🐢`;
				break;
			case "patches":
				Message = `${Localized.Get("格子")}🔲`;
				break;
			case "links":
				Message = `${Localized.Get("链接")}🔗`;
				break;
			case "observer":
				Message = `${Localized.Get("观察者")}🔎`;
				break;
			case "utilities":
				Message = `${Localized.Get("工具")}🔨`;
				break;
		}
		return Message;
	}

	// Clear the input box of Command Center
	Commands.ClearInput = function() {
		CommandEditor.getDoc().setValue("");
	}

	// Clear the output region of Command Center
	Commands.ClearOutput = function() {
		Outputs.children().slice(KeepSize).remove();
	}

	// After user entered input, screen view should scroll down to the botom line
	Commands.ScrollToBottom = function() {
		const scrollHeight = document.querySelector('.command-output').scrollHeight;
		document.querySelector('.command-output').scrollTop = scrollHeight;
	}

	// Execute a command from the user
	Commands.Execute = function(Objective, Content) {
		Editor.Call({ Type: "CommandExecute", Source: Objective, Command: Content });
		Commands.PrintInput(Objective, Content);
		Commands.ScrollToBottom();
	}

	// Set the content of command input
	Commands.SetContent = function(Objective, Content) {
		document.querySelector('select').value = Objective.toLowerCase();
		CommandEditor.getDoc().setValue(Content);
		CommandEditor.focus();
		setTimeout(() => CommandEditor.setCursor(Content.length), 1);
	}

	// Provide for Unity to notify completion of the command
	Commands.FinishExecution = function(Status, Message) {
		Commands.HideFullText();
		Commands.PrintOutput(Message, Status);
		Commands.Disabled = false;
	}

	// Show the full text of a command.
	var PreviousVisible = false;
	Commands.ShowFullText = function(Data) {
		PreviousVisible = Commands.Visible;
		if (!Commands.Visible) Commands.Show();
		// Change the status
		Fulltext.show();
		Outputs.hide();
		// Render the subject
		$(Fulltext.find("h2 strong")).text(Data["display_name"]);
		$(Fulltext.find("h2 span")).text(`(${Data["agents"].map((Agent) => `${RenderAgent(Agent)}`).join(", ")})`);
		// Render the list
		var SeeAlso = Fulltext.find("ul.SeeAlso").empty();
		for (var Primitive in Data["see_also"])
			LinkCommand($(`<li><a class="command" target="help ${Primitive}">${Primitive}</a> - ${Data["see_also"][Primitive]}</li>`).appendTo(SeeAlso).find("a"));
		// Machine-translation
		var Translator = Fulltext.find(".translator");
		if (Data["translation"] != null && Data["verified"] != true)
			Translator.show();
		else Translator.hide();
		var Original = Translator.find("a.Original").bind("click", () => {
			Original.hide();
			Translation.show();
			SetContent(Data["content"]);
		}).parent().show();
		var Translation = Translator.find("a.Translation").bind("click", () => {
			Translation.hide();
			Original.show();
			SetContent(Data["translation"]);
		}).parent().hide();
		// Render the full text
		var SetContent = (Content) => {
			if (Content != null) Fulltext.find("div.fulltext")
				.html(new showdown.Converter().makeHtml(Content));
			AnnotateCode(Fulltext.find("code"), null, true);
			Fulltext.get(0).scrollTop = 0;
		}
		SetContent(Data["translation"] != null ? Data["translation"] : Data["content"]);
		// Acknowledge
		Editor.TransformLinks(Fulltext.find(".Acknowledge").html(Data["acknowledge"]));
	}

	// Hide the full text mode.
	Commands.HideFullText = function(Explicit) {
		Fulltext.hide();
		Outputs.show();
		Commands.ScrollToBottom();
		if (Explicit && !PreviousVisible) Commands.Hide();
	}

	// Explain: Explain the selected text in the command center.
	Commands.Explain = function() {
		var Selection = window.getSelection();
		if (Selection.rangeCount == 0) return;
		var Parent = $(window.getSelection().focusNode).parents();
		if (!Parent.is(".command-output")) return;
		// Check the plain text
		if (ExplainInternal(Selection.toString())) return;
		// Check the grammatical tag
		if (Parent.hasClass("cm-command") || Parent.hasClass("cm-reporter") || Parent.hasClass("cm-keyword")) 
			ExplainInternal(Parent.get(0).innerText);
	}

	var ExplainInternal = function(Command) {
		if (!Dictionary.Check(Command)) return false;
		Commands.ScrollToBottom();
		Commands.Execute(null, `ask ${Command} -full`);
	}

	return Commands;
}();

(function($, undefined){
	$.fn.asOverlay = function(Timeout = 3000, Animation = 300) {
		this.Hide = () => this.fadeOut(Animation);
		this.Show = () => {
			clearTimeout(this.timeout);
			this.timeout = setTimeout(() => this.fadeOut(Animation), Timeout);
			this.fadeIn(Animation);
		}
		return this;
	}
})(jQuery);