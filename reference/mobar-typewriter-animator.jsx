// ### Source Text

try{
// Cursor character
var cursorSymbol = "|";

// Get the length of the source text
var sourceTextLength = text.sourceText.length;

var isCursorEnabled = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0002").value;
var hideCursorAfterTyping = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0003").value;
var typingAnimation = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0001");

var progress = linear(typingAnimation, 0, 100, 0, sourceTextLength);

var totalKeys = typingAnimation.numKeys;
if (totalKeys > 0) {
    var lastKeyTime = typingAnimation.key(totalKeys).time;
}

// Hide cursor due to the conditions
//(hideCursorAfterTyping && typingAnimation.value == 100 && time > lastKeyTime) ? substring(0, progress): substring(0, progress) + cursorSymbol;
substring(0, progress) + cursorSymbol;
}catch(err) {text.sourceText.value;}

// ### Expression Selector 1

textIndex === textTotal ? 100 : 0;

// ### Position

try{
effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0005");
}catch(err) {value;}

// ### Scale

try{
x = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0006");
y = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0007");
[x,y];
}catch(err) {value;}

// ### Opacity

try{
var isCursorEnabled = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0002").value;
var hideCursorAfterTyping = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0003").value;
var typingAnimation = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0001");

var s = 0;
if (isCursorEnabled) {
    s = effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0004").value;
}

var sinValue = Math.sin(time * s);
var cursorVisibility = 0;

if (isCursorEnabled) {
    if (hideCursorAfterTyping && typingAnimation.value == 100 && typingAnimation.numKeys > 0) {
        var lastKeyTime = typingAnimation.key(typingAnimation.numKeys).time;
        cursorVisibility = time > lastKeyTime ? 0 : sinValue >= 0 ? 0 : 100;
		
		if (hideCursorAfterTyping && time > lastKeyTime) cursorVisibility = 0;
    } else {
        cursorVisibility = sinValue >= 0 ? 0 : 100;
    }
} else {
	cursorVisibility = 0;
}

cursorVisibility;
}catch(err) {value;}


// ### Fill Color

try{
effect("MoBar Typewriter")("Pseudo/0.5257470431184776-0008");
}catch(err) {value;}