// After Effects Camera Null Position Expression
// Apply to: Position property of the camera null that drives the camera
//
// Behavior:
// - Finds layers whose names begin with targetPrefix (for example: node_1, node_2, node_3)
// - Sorts them by inPoint so they behave like a sequence of camera beats
// - Animates from the base camera path to the first target
// - If the next target begins before the current target has fully returned to base,
//   it transitions directly from the current target to the next target
// - Otherwise it returns to the base camera path after the target layer's outPoint
//
// Transition setup:
// - Create an adjustment layer named "Transition"
// - Add a Slider Control effect
// - Keyframe that slider from 0 to 100
// - The slider keyframe timing defines the transition duration
// - The slider easing defines the transition curve

// ===== USER SETTINGS =====
var targetPrefix = "node_";
var transitionLayerName = "Transition";
var transitionSliderName = "Slider Control";
// =========================

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

var ctrl = thisComp.layer(transitionLayerName).effect(transitionSliderName)("Slider");
var kCount = ctrl.numKeys;

if (kCount < 2) {
  value;
} else {
  var tStart = ctrl.key(1).time;
  var tEnd = ctrl.key(kCount).time;
  var transDur = tEnd - tStart;

  function transitionProgress(elapsed) {
    var sampleTime = clamp(tStart + elapsed, tStart, tEnd);
    return clamp(ctrl.valueAtTime(sampleTime) / 100, 0, 1);
  }

  var targets = [];

  for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf(targetPrefix) === 0) {
      targets[targets.length] = L;
    }
  }

  if (targets.length < 1) {
    value;
  } else {
    for (var a = 0; a < targets.length - 1; a++) {
      for (var b = a + 1; b < targets.length; b++) {
        if (targets[b].inPoint < targets[a].inPoint) {
          var temp = targets[a];
          targets[a] = targets[b];
          targets[b] = temp;
        }
      }
    }

    var result = valueAtTime(time);

    if (time < targets[0].inPoint) {
      result = valueAtTime(time);
    } else {
      for (var j = 0; j < targets.length; j++) {
        var cur = targets[j];
        var prev = (j > 0) ? targets[j - 1] : null;
        var next = (j < targets.length - 1) ? targets[j + 1] : null;

        var chainFromPrev = prev != null && cur.inPoint <= prev.outPoint + transDur;
        var chainToNext = next != null && next.inPoint <= cur.outPoint + transDur;

        var inStart = cur.inPoint;
        var inEnd = cur.inPoint + transDur;
        var holdEnd = chainToNext ? next.inPoint : cur.outPoint;
        var outStart = cur.outPoint;
        var outEnd = cur.outPoint + transDur;

        if (time >= inStart && time < inEnd) {
          var fromPos = chainFromPrev ? prev.position.valueAtTime(inStart) : valueAtTime(inStart);
          var toPos = cur.position.valueAtTime(time);
          result = mix(fromPos, toPos, transitionProgress(time - inStart));
          break;
        }

        if (time >= inEnd && time < holdEnd) {
          result = cur.position.valueAtTime(time);
          break;
        }

        if (!chainToNext && time >= outStart && time < outEnd) {
          var returnFrom = cur.position.valueAtTime(outStart);
          var returnTo = valueAtTime(outEnd);
          result = mix(returnFrom, returnTo, transitionProgress(time - outStart));
          break;
        }
      }
    }

    result;
  }
}
