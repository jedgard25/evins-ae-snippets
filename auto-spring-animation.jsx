/*
Spring expression for After Effects keyframes with markers.

Placebo bounce effect: motion.dev style.

How it works:
- It scans backward for the most recent keyframe that has a nearby marker.
- That keyframe becomes the spring start time.
- The expression samples the incoming velocity at that moment, then applies a
  damped spring model to continue the motion after the keyframe.
- Use mode 1 for direct physics controls, or mode 0 for duration/bounce style
  controls.
*/

// -------- MODE --------
// 0 = duration + bounce
// 1 = stiffness + damping + mass
mode = 1;

// ====== PHYSICAL CONTROLS (mode 1) ======
stiffness = 200;
damping = 10;
mass = 1;

// ====== PERCEPTUAL CONTROLS (mode 0) ======
duration = 0.5;
bounce = 0.5;
mass_pb = 1;

// ====== SAFETY ======
epsilon = 0.001;

// =========================
// FIND ACTIVE SPRING KEYFRAME
// Check each keyframe (past or present) with a marker near it.
// The most recent such keyframe drives the spring.
// =========================

function hasMarkerNear(t) {
  var thresh = thisComp.frameDuration * 2;
  for (var i = 1; i <= thisLayer.marker.numKeys; i++) {
    if (Math.abs(thisLayer.marker.key(i).time - t) < thresh) {
      return true;
    }
  }
  return false;
}

// Walk backwards through keyframes to find the most recent
// marked keyframe that we've passed.
activeKey = 0;
for (var i = numKeys; i >= 1; i--) {
  if (key(i).time <= time && hasMarkerNear(key(i).time)) {
    activeKey = i;
    break;
  }
}

if (activeKey == 0) {
  value; // No spring keyframe found before the current time.
} else {
  t = time - key(activeKey).time;

  if (t <= 0) {
    value;
  } else {
    // Sample velocity arriving into the keyframe.
    v = velocityAtTime(key(activeKey).time - thisComp.frameDuration / 10);

    // If the next keyframe has started, let it take over instead of
    // keeping this spring running.
    if (activeKey < numKeys && time >= key(activeKey + 1).time) {
      value;
    } else {
      // =========================
      // PARAMETER RESOLUTION
      // =========================
      if (mode == 0) {
        m = mass_pb;
        zeta = Math.max(0.001, 1 - bounce);
        wn = 4 / duration / zeta;
        k = m * wn * wn;
        c = 2 * zeta * Math.sqrt(k * m);
      } else {
        k = stiffness;
        c = damping;
        m = mass;
      }

      // =========================
      // SPRING SOLVER
      // =========================
      wn = Math.sqrt(k / m);
      zeta = c / (2 * Math.sqrt(k * m));

      if (zeta < 1) {
        wd = wn * Math.sqrt(1 - zeta * zeta);
        envelope = Math.exp(-zeta * wn * t);

        if (Math.abs(envelope) < epsilon) {
          value;
        } else {
          x = (v / wd) * Math.sin(wd * t) * envelope;
          value + x;
        }
      } else if (zeta == 1) {
        envelope = Math.exp(-wn * t);
        x = v * t * envelope;
        value + x;
      } else {
        r1 = -wn * (zeta - Math.sqrt(zeta * zeta - 1));
        r2 = -wn * (zeta + Math.sqrt(zeta * zeta - 1));
        A = v / (r2 - r1);
        x = A * (Math.exp(r1 * t) - Math.exp(r2 * t));
        value + x;
      }
    }
  }
}
