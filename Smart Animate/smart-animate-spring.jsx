// Smart Animate + Auto Spring
// Apply to: Position property of the layer that should follow the smart animate path.
//
// Setup:
// - Create target layers whose names begin with targetPrefix.
// - Create a transition layer with a Slider Control animated from 0 to 100.
// - The transition timing and easing define both the move and the spring trigger.
// - Spring fires automatically when a smart-animate move finishes.

// ===== USER SETTINGS =====
var targetPrefix = "node_";
var transitionLayerName = "Transition";
var transitionSliderName = "Slider Control";
var springOnArrival = true;
var springOnReturn = true;
var stiffness = 200;
var damping = 10;
var mass = 1;
var maxSpringDuration = 1.25;

var epsilon = 0.001;
var velocitySampleFrames = 0.1;
// =========================

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isArrayLike(v) {
  return v !== null && typeof v === "object" && v.length !== undefined;
}

function addValues(a, b) {
  if (isArrayLike(a)) {
    var out = [];
    for (var i = 0; i < a.length; i++) {
      out[i] = a[i] + b[i];
    }
    return out;
  }
  return a + b;
}

function subValues(a, b) {
  if (isArrayLike(a)) {
    var out = [];
    for (var i = 0; i < a.length; i++) {
      out[i] = a[i] - b[i];
    }
    return out;
  }
  return a - b;
}

function scaleValue(v, amount) {
  if (isArrayLike(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) {
      out[i] = v[i] * amount;
    }
    return out;
  }
  return v * amount;
}

function mixValues(a, b, t) {
  return addValues(a, scaleValue(subValues(b, a), t));
}

function magnitude(v) {
  if (isArrayLike(v)) {
    var total = 0;
    for (var i = 0; i < v.length; i++) {
      total += v[i] * v[i];
    }
    return Math.sqrt(total);
  }
  return Math.abs(v);
}

var transitionLayer = thisComp.layer(transitionLayerName);
var ctrl = transitionLayer.effect(transitionSliderName)("Slider");
var kCount = ctrl.numKeys;

if (kCount < 2) {
  value;
} else {
  var tStart = ctrl.key(1).time;
  var tEnd = ctrl.key(kCount).time;
  var transDur = tEnd - tStart;
  var velocitySampleStep = Math.max(
    thisComp.frameDuration * velocitySampleFrames,
    0.0001,
  );
  var springEnabled = springOnArrival || springOnReturn;

  function transitionProgress(elapsed) {
    var sampleTime = clamp(tStart + elapsed, tStart, tEnd);
    return clamp(ctrl.valueAtTime(sampleTime) / 100, 0, 1);
  }

  var targets = [];

  for (var i = 1; i <= thisComp.numLayers; i++) {
    var layer = thisComp.layer(i);
    if (layer.name.indexOf(targetPrefix) === 0) {
      targets[targets.length] = layer;
    }
  }

  if (targets.length < 1) {
    value;
  } else {
    for (var a = 0; a < targets.length - 1; a++) {
      for (var b = a + 1; b < targets.length; b++) {
        if (targets[b].inPoint < targets[a].inPoint) {
          var swap = targets[a];
          targets[a] = targets[b];
          targets[b] = swap;
        }
      }
    }

    function analyzeTime(sampleTime) {
      var result = valueAtTime(sampleTime);
      var eventTime = -1;
      var eventCutoff = -1;

      if (sampleTime < targets[0].inPoint) {
        return {
          value: result,
          eventTime: eventTime,
          eventCutoff: eventCutoff,
        };
      }

      for (var j = 0; j < targets.length; j++) {
        var cur = targets[j];
        var prev = j > 0 ? targets[j - 1] : null;
        var next = j < targets.length - 1 ? targets[j + 1] : null;

        var chainFromPrev =
          prev !== null && cur.inPoint <= prev.outPoint + transDur;
        var chainToNext =
          next !== null && next.inPoint <= cur.outPoint + transDur;

        var inStart = cur.inPoint;
        var inEnd = cur.inPoint + transDur;
        var holdEnd = chainToNext ? next.inPoint : cur.outPoint;
        var outStart = cur.outPoint;
        var outEnd = cur.outPoint + transDur;

        if (sampleTime >= inStart && sampleTime < inEnd) {
          var fromPos = chainFromPrev
            ? prev.position.valueAtTime(inStart)
            : valueAtTime(inStart);
          var toPos = cur.position.valueAtTime(sampleTime);

          result = mixValues(
            fromPos,
            toPos,
            transitionProgress(sampleTime - inStart),
          );

          return {
            value: result,
            eventTime: eventTime,
            eventCutoff: eventCutoff,
          };
        }

        if (sampleTime >= inEnd && sampleTime < holdEnd) {
          result = cur.position.valueAtTime(sampleTime);

          if (springOnArrival) {
            eventTime = inEnd;
            eventCutoff = holdEnd;
          }

          return {
            value: result,
            eventTime: eventTime,
            eventCutoff: eventCutoff,
          };
        }

        if (!chainToNext && sampleTime >= outStart && sampleTime < outEnd) {
          var returnFrom = cur.position.valueAtTime(outStart);
          var returnTo = valueAtTime(outEnd);

          result = mixValues(
            returnFrom,
            returnTo,
            transitionProgress(sampleTime - outStart),
          );

          return {
            value: result,
            eventTime: eventTime,
            eventCutoff: eventCutoff,
          };
        }

        if (!chainToNext) {
          var returnHoldEnd = next !== null ? next.inPoint : 999999;

          if (sampleTime >= outEnd && sampleTime < returnHoldEnd) {
            if (springOnReturn) {
              eventTime = outEnd;
              eventCutoff = returnHoldEnd;
            }

            return {
              value: result,
              eventTime: eventTime,
              eventCutoff: eventCutoff,
            };
          }
        }
      }

      return {
        value: result,
        eventTime: eventTime,
        eventCutoff: eventCutoff,
      };
    }

    var current = analyzeTime(time);
    var result = current.value;
    var activeEventTime = current.eventTime;
    var activeEventCutoff = current.eventCutoff;

    if (!springEnabled || activeEventTime < 0) {
      result;
    } else {
      var cappedCutoff = Math.min(
        activeEventCutoff,
        activeEventTime + maxSpringDuration,
      );

      if (time >= cappedCutoff) {
        result;
      } else {
        var springTime = time - activeEventTime;

        if (springTime <= 0) {
          result;
        } else {
          var previousSampleTime = Math.max(
            0,
            activeEventTime - velocitySampleStep,
          );
          var sampleDelta = Math.max(
            activeEventTime - previousSampleTime,
            0.0001,
          );
          var eventValue = analyzeTime(activeEventTime).value;
          var previousValue = analyzeTime(previousSampleTime).value;
          var incomingVelocity = scaleValue(
            subValues(eventValue, previousValue),
            1 / sampleDelta,
          );
          var wn = Math.sqrt(stiffness / mass);
          var zeta = damping / (2 * Math.sqrt(stiffness * mass));

          if (zeta < 1) {
            var wd = wn * Math.sqrt(1 - zeta * zeta);
            var envelope = Math.exp(-zeta * wn * springTime);

            if (
              Math.abs(envelope) < epsilon ||
              magnitude(incomingVelocity) < epsilon
            ) {
              result;
            } else {
              var offset = scaleValue(
                incomingVelocity,
                (Math.sin(wd * springTime) * envelope) / wd,
              );
              addValues(result, offset);
            }
          } else if (Math.abs(zeta - 1) < 0.0001) {
            var criticalEnvelope = Math.exp(-wn * springTime);
            addValues(
              result,
              scaleValue(incomingVelocity, springTime * criticalEnvelope),
            );
          } else {
            var rootTerm = Math.sqrt(zeta * zeta - 1);
            var r1 = -wn * (zeta - rootTerm);
            var r2 = -wn * (zeta + rootTerm);
            var overdampedScale =
              (Math.exp(r1 * springTime) - Math.exp(r2 * springTime)) /
              (r2 - r1);
            addValues(result, scaleValue(incomingVelocity, overdampedScale));
          }
        }
      }
    }
  }
}
