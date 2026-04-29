// Loopout style ping-pong that falls off past layer end point.

// --- SETTINGS ---
var restDur = 2;        // seconds to ease into resting position
var loopType = "pingpong";

// --- CORE ---
var t = time;
var outT = outPoint;

// First keyframe value (rest target)
var firstPos = valueAtTime(key(1).time);

// NORMAL LOOP VALUE at current time
var loopNow = loopOut(loopType);

// LOOP VALUE AT OUT-POINT (critical fix)
var loopAtOut = loopOut(loopType, 1); 
// (The 2nd argument forces AE to evaluate the loop pattern relative to the first two keys,
// which gives a consistent loop sample even when time is outside keyframe range.)

if (t <= outT){
    loopNow;
} else {
    // Time since layer ended
    var dt = t - outT;

    // Ease from 0 → 1 over rest duration
    var eased = ease(dt, 0, restDur, 0, 1);

    // Blend from loop value at out-point → resting value
    linear(eased, 0, 1, loopAtOut, firstPos);
}