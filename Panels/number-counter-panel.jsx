/*
  Number Counter Panel

  Dockable ScriptUI prototype for a single-slot drum-style animated number
  counter. Creates three recycled text layers, a transition layer, and a
  controller layer with one animated value control.
*/

(function numberCounterPanel(thisObj) {
  var PANEL_TITLE = "Number Counter";
  var MAX_LOG_LINES = 120;
  var GLOBAL_STATE_KEY = "__numberCounterPanelState__";

  var SET_PREFIX = "Number Counter";
  var CONTROLLER_SUFFIX = " Controls";
  var TRANSITION_SUFFIX = " Transition";
  var DIGIT_NAMES = ["Digit Middle", "Digit Bottom", "Digit Top"];

  var MATCH_EFFECT_PARADE = "ADBE Effect Parade";
  var MATCH_SLIDER_CONTROL = "ADBE Slider Control";
  var MATCH_CHECKBOX_CONTROL = "ADBE Checkbox Control";
  var MATCH_CAMERA_LENS_BLUR = "ADBE Camera Lens Blur2";
  var MATCH_TRANSFORM_GROUP = "ADBE Transform Group";
  var MATCH_POSITION = "ADBE Position";
  var MATCH_OPACITY = "ADBE Opacity";
  var MATCH_TEXT_PROPERTIES = "ADBE Text Properties";
  var MATCH_TEXT_DOCUMENT = "ADBE Text Document";

  var VALUE_EFFECT = "Value";
  var LINE_HEIGHT_EFFECT = "Line Height";
  var OPACITY_TO_EFFECT = "Opacity To";
  var BLUR_ENABLED_EFFECT = "Blur Enabled";
  var BLUR_STRENGTH_EFFECT = "Blur Strength";
  var TRANSITION_EFFECT = "Slider Control";
  var CAMERA_LENS_BLUR_EFFECT = "Camera Lens Blur";

  var DEFAULT_VALUE = 4;
  var DEFAULT_FONT_SIZE = 96;
  var DEFAULT_AUTO_LEADING = 1.18;
  var DEFAULT_LINE_HEIGHT = DEFAULT_FONT_SIZE * DEFAULT_AUTO_LEADING;
  var DEFAULT_OPACITY_TO = 0;
  var DEFAULT_BLUR_ENABLED = 1;
  var DEFAULT_BLUR_STRENGTH = 12;
  var DEFAULT_TRANSITION_FRAMES = 10;
  var OPACITY_EXIT_TRIGGER_DISTANCE = 0.25;
  var OPACITY_ENTER_TRIGGER_DISTANCE = 0.45;

  function getState() {
    if (!$.global[GLOBAL_STATE_KEY]) {
      $.global[GLOBAL_STATE_KEY] = { logLines: [] };
    }
    if (!$.global[GLOBAL_STATE_KEY].logLines) {
      $.global[GLOBAL_STATE_KEY].logLines = [];
    }
    return $.global[GLOBAL_STATE_KEY];
  }

  function timestampForLog() {
    var now = new Date();
    function pad(value) {
      return value < 10 ? "0" + value : String(value);
    }
    return (
      pad(now.getHours()) +
      ":" +
      pad(now.getMinutes()) +
      ":" +
      pad(now.getSeconds())
    );
  }

  function appendLog(logText, message) {
    if (!logText) {
      return;
    }

    var state = getState();
    state.logLines.push("[" + timestampForLog() + "] " + message);
    if (state.logLines.length > MAX_LOG_LINES) {
      state.logLines = state.logLines.slice(
        state.logLines.length - MAX_LOG_LINES
      );
    }
    renderLog(logText);
  }

  function clearLog(logText) {
    getState().logLines = [];
    renderLog(logText);
  }

  function renderLog(logText) {
    if (logText) {
      logText.text = getState().logLines.join("\n");
    }
  }

  function getActiveComp() {
    var item = app.project && app.project.activeItem;
    if (item && item instanceof CompItem) {
      return item;
    }
    return null;
  }

  function findLayerByName(comp, layerName) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      if (comp.layer(i).name === layerName) {
        return comp.layer(i);
      }
    }
    return null;
  }

  function hasSuffix(value, suffix) {
    value = String(value);
    suffix = String(suffix);
    return (
      value.length >= suffix.length &&
      value.substring(value.length - suffix.length) === suffix
    );
  }

  function nextSetName(comp) {
    var index = 1;
    var candidate;

    do {
      candidate = SET_PREFIX + " " + index;
      index += 1;
    } while (
      findLayerByName(comp, candidate + CONTROLLER_SUFFIX) ||
      findLayerByName(comp, candidate + TRANSITION_SUFFIX)
    );

    return candidate;
  }

  function getEffectsGroup(layer) {
    return layer.property(MATCH_EFFECT_PARADE);
  }

  function findEffectByName(layer, effectName) {
    var effects = getEffectsGroup(layer);
    var i;

    if (!effects) {
      return null;
    }

    for (i = 1; i <= effects.numProperties; i += 1) {
      if (effects.property(i).name === effectName) {
        return effects.property(i);
      }
    }

    return null;
  }

  function ensureSlider(layer, effectName, defaultValue) {
    var effects = getEffectsGroup(layer);
    var effect = findEffectByName(layer, effectName);
    var slider;

    if (!effects) {
      throw new Error("Layer '" + layer.name + "' does not support effects.");
    }

    if (!effect) {
      effect = effects.addProperty(MATCH_SLIDER_CONTROL);
      effect.name = effectName;
    }

    slider = effect.property("Slider") || effect.property(1);
    if (!slider) {
      throw new Error("Could not create slider '" + effectName + "'.");
    }

    if (slider.numKeys === 0) {
      slider.setValue(defaultValue);
    }

    return slider;
  }

  function ensureCheckbox(layer, effectName, defaultValue) {
    var effects = getEffectsGroup(layer);
    var effect = findEffectByName(layer, effectName);
    var checkbox;

    if (!effects) {
      throw new Error("Layer '" + layer.name + "' does not support effects.");
    }

    if (!effect) {
      effect = effects.addProperty(MATCH_CHECKBOX_CONTROL);
      effect.name = effectName;
    }

    checkbox = effect.property("Checkbox") || effect.property(1);
    if (!checkbox) {
      throw new Error("Could not create checkbox '" + effectName + "'.");
    }

    if (checkbox.numKeys === 0) {
      checkbox.setValue(defaultValue);
    }

    return checkbox;
  }

  function ensureEffect(layer, effectName, matchName) {
    var effects = getEffectsGroup(layer);
    var effect = findEffectByName(layer, effectName);
    var matchNames;
    var i;

    if (!effects) {
      throw new Error("Layer '" + layer.name + "' does not support effects.");
    }

    if (!effect) {
      matchNames = matchName instanceof Array ? matchName : [matchName];
      for (i = 0; i < matchNames.length && !effect; i += 1) {
        try {
          effect = effects.addProperty(matchNames[i]);
        } catch (err) {}
      }
      if (!effect) {
        throw new Error("Could not create effect '" + effectName + "'.");
      }
      effect.name = effectName;
    }

    return effect;
  }

  function findEffectPropertyByName(effect, names) {
    var i;
    var j;
    var prop;

    for (j = 0; j < names.length; j += 1) {
      prop = effect.property(names[j]);
      if (prop) {
        return prop;
      }
    }

    for (i = 1; i <= effect.numProperties; i += 1) {
      prop = effect.property(i);
      for (j = 0; j < names.length; j += 1) {
        if (prop.name === names[j] || prop.matchName === names[j]) {
          return prop;
        }
      }
    }

    return null;
  }

  function requireEffectPropertyByName(effect, names, label) {
    var prop = findEffectPropertyByName(effect, names);

    if (!prop) {
      throw new Error("Could not find " + label + ".");
    }

    return prop;
  }

  function ensureDefaultTransitionKeys(comp, slider) {
    var startTime;
    var endTime;
    var ease;

    if (slider.numKeys >= 2) {
      return;
    }

    while (slider.numKeys > 0) {
      slider.removeKey(1);
    }

    startTime = comp.displayStartTime;
    endTime =
      startTime +
      Math.max(DEFAULT_TRANSITION_FRAMES - 1, 1) * comp.frameDuration;

    slider.setValueAtTime(startTime, 0);
    slider.setValueAtTime(endTime, 100);

    try {
      slider.setInterpolationTypeAtKey(
        1,
        KeyframeInterpolationType.BEZIER,
        KeyframeInterpolationType.BEZIER
      );
      slider.setInterpolationTypeAtKey(
        2,
        KeyframeInterpolationType.BEZIER,
        KeyframeInterpolationType.BEZIER
      );
      ease = new KeyframeEase(0, 33);
      slider.setTemporalEaseAtKey(1, [ease], [ease]);
      slider.setTemporalEaseAtKey(2, [ease], [ease]);
    } catch (err) {}
  }

  function getPositionProperty(layer) {
    var transform =
      layer.property(MATCH_TRANSFORM_GROUP) || layer.property("Transform");
    return transform
      ? transform.property(MATCH_POSITION) || transform.property("Position")
      : null;
  }

  function getOpacityProperty(layer) {
    var transform =
      layer.property(MATCH_TRANSFORM_GROUP) || layer.property("Transform");
    return transform
      ? transform.property(MATCH_OPACITY) || transform.property("Opacity")
      : null;
  }

  function getSourceTextProperty(layer) {
    var textProps =
      layer.property(MATCH_TEXT_PROPERTIES) || layer.property("Text");
    return textProps
      ? textProps.property(MATCH_TEXT_DOCUMENT) ||
          textProps.property("Source Text")
      : layer.property("Source Text");
  }

  function quoteString(value) {
    return (
      '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
    );
  }

  function buildCommonExpression(controllerName) {
    return [
      "var controller = thisComp.layer(" + quoteString(controllerName) + ");",
      "function sliderProp(layer, name) {",
      "  try { return layer.effect(name)(\"Slider\"); } catch (err) { return null; }",
      "}",
      "function mod(n, m) { return ((n % m) + m) % m; }",
      "var valueProp = sliderProp(controller, \"" + VALUE_EFFECT + "\");",
      "var counterValue = valueProp ? valueProp.value : " + DEFAULT_VALUE + ";",
      "var frameStep = Math.max(thisComp.frameDuration, 0.001);",
      "var prevValue = valueProp ? valueProp.valueAtTime(time - frameStep) : counterValue;",
      "var nextValue = valueProp ? valueProp.valueAtTime(time + frameStep) : counterValue;",
      "var delta = counterValue - prevValue;",
      "if (Math.abs(delta) < 0.0001) { delta = nextValue - counterValue; }",
      "var direction = delta < 0 ? -1 : 1;",
      "var baseNumber = direction >= 0 ? Math.floor(counterValue) : Math.ceil(counterValue);",
      "var frac = direction >= 0 ? counterValue - baseNumber : baseNumber - counterValue;",
      "frac = Math.max(0, Math.min(0.999999, frac));",
      "var stepIndex = baseNumber - " + DEFAULT_VALUE + ";",
      "var role = mod(slotPhase - mod(stepIndex, 3), 3);",
    ].join("\n");
  }

  function buildSourceTextExpression(controllerName, slotPhase) {
    return [
      "var slotPhase = " + slotPhase + ";",
      buildCommonExpression(controllerName),
      "var digitValue = baseNumber;",
      "var slotUnits = role;",
      "if (slotUnits === 2) { slotUnits = -1; }",
      "var offsetUnits = slotUnits + (direction >= 0 ? -frac : frac);",
      "var cycleShift = 0;",
      "if (direction >= 0) {",
      "  if (offsetUnits <= -1.5) { cycleShift = 3; }",
      "} else {",
      "  if (offsetUnits >= 1.5) { cycleShift = -3; }",
      "}",
      "digitValue = baseNumber + slotUnits + cycleShift;",
      "digitValue = mod(Math.round(digitValue), 10);",
      "var doc = value;",
      "try {",
      "  doc.text = String(digitValue);",
      "  doc.justification = ParagraphJustification.CENTER_JUSTIFY;",
      "} catch (err) {",
      "  doc = String(digitValue);",
      "}",
      "doc;",
    ].join("\n");
  }

  function buildPositionExpression(controllerName, slotPhase) {
    return [
      "var slotPhase = " + slotPhase + ";",
      buildCommonExpression(controllerName),
      "var lineHeightProp = sliderProp(controller, \"" + LINE_HEIGHT_EFFECT + "\");",
      "var distance = lineHeightProp ? lineHeightProp.value : " + DEFAULT_LINE_HEIGHT + ";",
      "distance = Math.max(1, distance);",
      "function sourceFontSize() {",
      "  var size = " + DEFAULT_FONT_SIZE + ";",
      "  try { size = text.sourceText.style.fontSize; } catch (err1) {}",
      "  try { var doc = text.sourceText.value; if (doc.fontSize) { size = doc.fontSize; } } catch (err2) {}",
      "  return Math.max(1, size);",
      "}",
      "function sourceLeading(fontSize) {",
      "  var leading = fontSize * " + DEFAULT_AUTO_LEADING + ";",
      "  try { var styleLeading = text.sourceText.style.leading; if (styleLeading > 0) { leading = styleLeading; } } catch (err1) {}",
      "  try { var doc = text.sourceText.value; if (doc.leading && doc.leading > 0) { leading = doc.leading; } } catch (err2) {}",
      "  return Math.max(fontSize, leading);",
      "}",
      "var slotUnits = role;",
      "if (slotUnits === 2) { slotUnits = -1; }",
      "var offsetUnits = slotUnits + (direction >= 0 ? -frac : frac);",
      "if (direction >= 0) {",
      "  if (offsetUnits <= -1.5) { offsetUnits += 3; }",
      "} else {",
      "  if (offsetUnits >= 1.5) { offsetUnits -= 3; }",
      "}",
      "var offset = offsetUnits * distance;",
      "if (value.length > 2) { [value[0], value[1] + offset, value[2]]; } else { [value[0], value[1] + offset]; }",
    ].join("\n");
  }

  function buildOpacityExpression(controllerName, transitionName, slotPhase) {
    return [
      "var slotPhase = " + slotPhase + ";",
      buildCommonExpression(controllerName),
      "var transition = thisComp.layer(" + quoteString(transitionName) + ");",
      "var ctrl = transition.effect(\"" + TRANSITION_EFFECT + "\")(\"Slider\");",
      "var opacityToProp = sliderProp(controller, \"" + OPACITY_TO_EFFECT + "\");",
      "var opacityTo = opacityToProp ? opacityToProp.value : " + DEFAULT_OPACITY_TO + ";",
      "function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }",
      "function transitionProgress(progress) {",
      "  progress = clamp(progress, 0, 1);",
      "  var keyCount = ctrl.numKeys;",
      "  if (keyCount < 2) { return progress; }",
      "  var tStart = ctrl.key(1).time;",
      "  var tEnd = ctrl.key(keyCount).time;",
      "  var sampleTime = tStart + progress * Math.max(tEnd - tStart, thisComp.frameDuration);",
      "  return clamp(ctrl.valueAtTime(sampleTime) / 100, 0, 1);",
      "}",
      "opacityTo = clamp(opacityTo, 0, 100);",
      "var exitTriggerDistance = " + OPACITY_EXIT_TRIGGER_DISTANCE + ";",
      "var enterTriggerDistance = " + OPACITY_ENTER_TRIGGER_DISTANCE + ";",
      "var slotUnits = role;",
      "if (slotUnits === 2) { slotUnits = -1; }",
      "var offsetUnits = slotUnits + (direction >= 0 ? -frac : frac);",
      "if (direction >= 0) {",
      "  if (offsetUnits <= -1.5) { offsetUnits += 3; }",
      "} else {",
      "  if (offsetUnits >= 1.5) { offsetUnits -= 3; }",
      "}",
      "var distanceFromCenter = Math.abs(offsetUnits);",
      "var enterRole = direction >= 0 ? 1 : 2;",
      "var opacityValue = opacityTo;",
      "if (role === 0) {",
      "  if (distanceFromCenter <= exitTriggerDistance) {",
      "    opacityValue = 100;",
      "  } else {",
      "    var exitProgress = (distanceFromCenter - exitTriggerDistance) / Math.max(1 - exitTriggerDistance, 0.0001);",
      "    opacityValue = opacityTo + (100 - opacityTo) * (1 - transitionProgress(exitProgress));",
      "  }",
      "} else if (role === enterRole) {",
      "  if (distanceFromCenter <= enterTriggerDistance) {",
      "    var enterProgress = (enterTriggerDistance - distanceFromCenter) / Math.max(enterTriggerDistance, 0.0001);",
      "    opacityValue = opacityTo + (100 - opacityTo) * transitionProgress(enterProgress);",
      "  }",
      "}",
      "clamp(opacityValue, 0, 100);",
    ].join("\n");
  }

  function buildBlurRadiusExpression(controllerName, transitionName, slotPhase) {
    return [
      "var slotPhase = " + slotPhase + ";",
      buildCommonExpression(controllerName),
      "var transition = thisComp.layer(" + quoteString(transitionName) + ");",
      "var ctrl = transition.effect(\"" + TRANSITION_EFFECT + "\")(\"Slider\");",
      "var controller = thisComp.layer(" + quoteString(controllerName) + ");",
      "function sliderValue(name, fallback) {",
      "  try { return controller.effect(name)(\"Slider\").value; } catch (err) { return fallback; }",
      "}",
      "function checkboxValue(name, fallback) {",
      "  try { return controller.effect(name)(\"Checkbox\").value; } catch (err) { return fallback; }",
      "}",
      "function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }",
      "function transitionProgress(progress) {",
      "  progress = clamp(progress, 0, 1);",
      "  var keyCount = ctrl.numKeys;",
      "  if (keyCount < 2) { return progress; }",
      "  var tStart = ctrl.key(1).time;",
      "  var tEnd = ctrl.key(keyCount).time;",
      "  var sampleTime = tStart + progress * Math.max(tEnd - tStart, thisComp.frameDuration);",
      "  return clamp(ctrl.valueAtTime(sampleTime) / 100, 0, 1);",
      "}",
      "var enabled = checkboxValue(\"" + BLUR_ENABLED_EFFECT + "\", " + DEFAULT_BLUR_ENABLED + ") >= 0.5;",
      "var strength = sliderValue(\"" + BLUR_STRENGTH_EFFECT + "\", " + DEFAULT_BLUR_STRENGTH + ");",
      "var exitTriggerDistance = " + OPACITY_EXIT_TRIGGER_DISTANCE + ";",
      "var enterTriggerDistance = " + OPACITY_ENTER_TRIGGER_DISTANCE + ";",
      "var slotUnits = role;",
      "if (slotUnits === 2) { slotUnits = -1; }",
      "var offsetUnits = slotUnits + (direction >= 0 ? -frac : frac);",
      "if (direction >= 0) {",
      "  if (offsetUnits <= -1.5) { offsetUnits += 3; }",
      "} else {",
      "  if (offsetUnits >= 1.5) { offsetUnits -= 3; }",
      "}",
      "var distanceFromCenter = Math.abs(offsetUnits);",
      "var enterRole = direction >= 0 ? 1 : 2;",
      "var activeProgress = 0;",
      "if (role === 0) {",
      "  if (distanceFromCenter <= exitTriggerDistance) {",
      "    activeProgress = 1;",
      "  } else {",
      "    var exitProgress = (distanceFromCenter - exitTriggerDistance) / Math.max(1 - exitTriggerDistance, 0.0001);",
      "    activeProgress = 1 - transitionProgress(exitProgress);",
      "  }",
      "} else if (role === enterRole) {",
      "  if (distanceFromCenter <= enterTriggerDistance) {",
      "    var enterProgress = (enterTriggerDistance - distanceFromCenter) / Math.max(enterTriggerDistance, 0.0001);",
      "    activeProgress = transitionProgress(enterProgress);",
      "  }",
      "}",
      "enabled ? Math.max(0, strength) * (1 - clamp(activeProgress, 0, 1)) : 0;",
    ].join("\n");
  }

  function applyExpression(prop, expression, label) {
    if (!prop || !prop.canSetExpression) {
      throw new Error(label + " does not allow expressions.");
    }

    prop.expression = "";
    prop.expression = expression;
    if (prop.expressionError) {
      throw new Error(label + " expression error: " + prop.expressionError);
    }
  }

  function setTextLayerStyle(layer, textValue, fontSize) {
    var sourceText = getSourceTextProperty(layer);
    var doc;

    if (!sourceText) {
      throw new Error("Could not access Source Text on '" + layer.name + "'.");
    }

    doc = sourceText.value;
    doc.text = String(textValue);
    doc.fontSize = fontSize;
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    sourceText.setValue(doc);
  }

  function createControllerLayer(comp, setName) {
    var layer = comp.layers.addNull();
    layer.name = setName + CONTROLLER_SUFFIX;
    layer.label = 10;
    layer.guideLayer = true;
    layer.threeDLayer = false;
    layer.transform.position.setValue([comp.width * 0.5 - 160, comp.height * 0.5]);
    ensureSlider(layer, VALUE_EFFECT, DEFAULT_VALUE);
    ensureSlider(layer, LINE_HEIGHT_EFFECT, DEFAULT_LINE_HEIGHT);
    ensureSlider(layer, OPACITY_TO_EFFECT, DEFAULT_OPACITY_TO);
    ensureCheckbox(layer, BLUR_ENABLED_EFFECT, DEFAULT_BLUR_ENABLED);
    ensureSlider(layer, BLUR_STRENGTH_EFFECT, DEFAULT_BLUR_STRENGTH);
    return layer;
  }

  function createTransitionLayer(comp, setName) {
    var layer = comp.layers.addNull();

    layer.name = setName + TRANSITION_SUFFIX;
    layer.label = 9;
    layer.guideLayer = true;
    layer.transform.position.setValue([comp.width * 0.5 + 160, comp.height * 0.5]);

    ensureDefaultTransitionKeys(comp, ensureSlider(layer, TRANSITION_EFFECT, 0));
    return layer;
  }

  function createDigitLayer(comp, setName, index, controllerName, transitionName) {
    var layer = comp.layers.addText(String(DEFAULT_VALUE));
    var sourceText;
    var position;
    var opacity;
    var blurEffect;
    var blurRadius;
    var repeatEdgePixels;

    layer.name = setName + " " + DIGIT_NAMES[index];
    layer.label = 11;
    layer.transform.position.setValue([comp.width * 0.5, comp.height * 0.5]);
    layer.transform.anchorPoint.setValue([0, 0]);
    setTextLayerStyle(layer, DEFAULT_VALUE, DEFAULT_FONT_SIZE);

    sourceText = getSourceTextProperty(layer);
    position = getPositionProperty(layer);
    opacity = getOpacityProperty(layer);
    applyExpression(
      sourceText,
      buildSourceTextExpression(controllerName, index),
      layer.name + " Source Text"
    );
    applyExpression(
      position,
      buildPositionExpression(controllerName, index),
      layer.name + " Position"
    );
    applyExpression(
      opacity,
      buildOpacityExpression(controllerName, transitionName, index),
      layer.name + " Opacity"
    );
    blurEffect = ensureEffect(
      layer,
      CAMERA_LENS_BLUR_EFFECT,
      [MATCH_CAMERA_LENS_BLUR, "ADBE Camera Lens Blur"]
    );
    blurRadius = requireEffectPropertyByName(
      blurEffect,
      [
        "Blur Radius",
        "ADBE Camera Lens Blur2-0001",
        "ADBE Camera Lens Blur-0001"
      ],
      layer.name + " blur radius"
    );
    repeatEdgePixels = findEffectPropertyByName(blurEffect, [
      "Repeat Edge Pixels",
      "Repeat Edge",
      "ADBE Camera Lens Blur2-0013",
      "ADBE Camera Lens Blur-0013"
    ]);
    if (repeatEdgePixels && repeatEdgePixels.numKeys === 0) {
      try {
        repeatEdgePixels.setValue(0);
      } catch (err) {}
    }
    applyExpression(
      blurRadius,
      buildBlurRadiusExpression(controllerName, transitionName, index),
      layer.name + " Blur Radius"
    );

    return layer;
  }

  function createCounterSet(logText) {
    var comp = getActiveComp();
    var setName;
    var controller;
    var transition;
    var createdLayers = [];
    var i;

    if (!comp) {
      appendLog(logText, "Open a composition first.");
      return;
    }

    app.beginUndoGroup("Create Number Counter Set");

    try {
      setName = nextSetName(comp);
      appendLog(logText, "Creating '" + setName + "'...");

      controller = createControllerLayer(comp, setName);
      transition = createTransitionLayer(comp, setName);
      createdLayers.push(controller);
      createdLayers.push(transition);

      for (i = 0; i < 3; i += 1) {
        createdLayers.push(
          createDigitLayer(comp, setName, i, controller.name, transition.name)
        );
      }

      for (i = 1; i <= comp.numLayers; i += 1) {
        comp.layer(i).selected = false;
      }
      for (i = 0; i < createdLayers.length; i += 1) {
        createdLayers[i].selected = true;
      }

      appendLog(
        logText,
        "Done. Animate '" + controller.name + "' > '" + VALUE_EFFECT + "'."
      );
      appendLog(
        logText,
        "'" + transition.name + "' is reserved for exchange blur/opacity timing."
      );
    } catch (error) {
      appendLog(logText, "Error: " + error.toString());
      alert(error.toString());
    } finally {
      app.endUndoGroup();
    }
  }

  function refreshCounterExpressions(logText) {
    var comp = getActiveComp();
    var refreshed = 0;
    var i;
    var j;
    var layer;
    var setName;
    var digitLayer;
    var sourceText;
    var position;
    var opacity;
    var transition;

    if (!comp) {
      appendLog(logText, "Open a composition first.");
      return;
    }

    app.beginUndoGroup("Refresh Number Counter Expressions");

    try {
      for (i = 1; i <= comp.numLayers; i += 1) {
        layer = comp.layer(i);
        if (!hasSuffix(layer.name, CONTROLLER_SUFFIX)) {
          continue;
        }

        setName = layer.name.substring(
          0,
          layer.name.length - CONTROLLER_SUFFIX.length
        );

        if (setName.indexOf(SET_PREFIX) !== 0) {
          continue;
        }

        ensureSlider(layer, VALUE_EFFECT, DEFAULT_VALUE);
        ensureSlider(layer, LINE_HEIGHT_EFFECT, DEFAULT_LINE_HEIGHT);
        ensureSlider(layer, OPACITY_TO_EFFECT, DEFAULT_OPACITY_TO);
        ensureCheckbox(layer, BLUR_ENABLED_EFFECT, DEFAULT_BLUR_ENABLED);
        ensureSlider(layer, BLUR_STRENGTH_EFFECT, DEFAULT_BLUR_STRENGTH);

        transition = findLayerByName(comp, setName + TRANSITION_SUFFIX);
        if (!transition) {
          appendLog(logText, "Missing transition layer for '" + setName + "'.");
          continue;
        }
        ensureDefaultTransitionKeys(
          comp,
          ensureSlider(transition, TRANSITION_EFFECT, 0)
        );

        for (j = 0; j < DIGIT_NAMES.length; j += 1) {
          digitLayer = findLayerByName(comp, setName + " " + DIGIT_NAMES[j]);
          if (!digitLayer) {
            appendLog(logText, "Missing digit layer for '" + setName + "'.");
            continue;
          }

          sourceText = getSourceTextProperty(digitLayer);
          position = getPositionProperty(digitLayer);
          opacity = getOpacityProperty(digitLayer);
          applyExpression(
            sourceText,
            buildSourceTextExpression(layer.name, j),
            digitLayer.name + " Source Text"
          );
          applyExpression(
            position,
            buildPositionExpression(layer.name, j),
            digitLayer.name + " Position"
          );
          applyExpression(
            opacity,
            buildOpacityExpression(layer.name, transition.name, j),
            digitLayer.name + " Opacity"
          );
          var blurEffect = ensureEffect(
            digitLayer,
            CAMERA_LENS_BLUR_EFFECT,
            [MATCH_CAMERA_LENS_BLUR, "ADBE Camera Lens Blur"]
          );
          var blurRadius = requireEffectPropertyByName(
            blurEffect,
            [
              "Blur Radius",
              "ADBE Camera Lens Blur2-0001",
              "ADBE Camera Lens Blur-0001"
            ],
            digitLayer.name + " blur radius"
          );
          var repeatEdgePixels = findEffectPropertyByName(blurEffect, [
            "Repeat Edge Pixels",
            "Repeat Edge",
            "ADBE Camera Lens Blur2-0013",
            "ADBE Camera Lens Blur-0013"
          ]);
          if (repeatEdgePixels && repeatEdgePixels.numKeys === 0) {
            try {
              repeatEdgePixels.setValue(0);
            } catch (err) {}
          }
          applyExpression(
            blurRadius,
            buildBlurRadiusExpression(layer.name, transition.name, j),
            digitLayer.name + " Blur Radius"
          );
          refreshed += 1;
        }
      }

      appendLog(logText, "Refreshed " + refreshed + " digit expressions.");
    } catch (error) {
      appendLog(logText, "Error: " + error.toString());
      alert(error.toString());
    } finally {
      app.endUndoGroup();
    }
  }

  function buildUI(container) {
    var panel =
      container instanceof Panel
        ? container
        : new Window("palette", PANEL_TITLE, undefined, { resizeable: true });

    panel.orientation = "column";
    panel.alignChildren = ["fill", "top"];
    panel.spacing = 8;
    panel.margins = 12;

    var helpText = panel.add(
      "statictext",
      undefined,
      "Prototype: create one 3-layer digit tower driven by a single animated Value slider.",
      { multiline: true }
    );
    helpText.alignment = ["fill", "top"];

    var createButton = panel.add("button", undefined, "Create Set");
    var refreshButton = panel.add("button", undefined, "Refresh Expressions");
    var clearButton = panel.add("button", undefined, "Clear Log");
    var logText = panel.add("edittext", undefined, "", {
      multiline: true,
      readonly: true,
      scrolling: true
    });
    logText.alignment = ["fill", "fill"];
    logText.minimumSize = [240, 220];
    logText.preferredSize.height = 260;

    createButton.onClick = function () {
      createCounterSet(logText);
    };

    refreshButton.onClick = function () {
      refreshCounterExpressions(logText);
    };

    clearButton.onClick = function () {
      clearLog(logText);
      appendLog(logText, "Log cleared.");
    };

    panel.onActivate = function () {
      renderLog(logText);
    };

    panel.onResizing = panel.onResize = function () {
      this.layout.resize();
    };

    appendLog(logText, "Panel ready.");
    renderLog(logText);
    return panel;
  }

  var panel = buildUI(thisObj);

  if (panel instanceof Window) {
    panel.center();
    panel.show();
  } else {
    panel.layout.layout(true);
  }
})(this);
