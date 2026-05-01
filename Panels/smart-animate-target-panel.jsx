/*
  Smart Animate Target Panel

  Dockable ScriptUI panel for quickly creating target layers, adding layer-side
  dropdown controls, and assigning the smart animate spring expression.
*/

(function smartAnimateTargetPanel(thisObj) {
  var PANEL_TITLE = "Smart Animate Targets";
  var TARGET_SUFFIX = "_T_";
  var TARGETS_EFFECT_NAME = "Targets Available";
  var CURVE_EFFECT_NAME = "Spring Curve";
  var TRANSITION_LAYER_NAME = "Transition";
  var TRANSITION_SLIDER_NAME = "Slider Control";
  var DEFAULT_TARGET_DURATION = 1.0;
  var CURVE_PRESETS = ["Soft", "Medium", "Snappy"];
  var FALLBACK_TARGET_OPTION = ["No Targets"];
  var TRANSFORM_MODE_OPTIONS = ["Position Only", "Position + Rotation"];
  var TRANSFORM_MODE_POSITION_ONLY = 1;
  var TRANSFORM_MODE_POSITION_AND_ROTATION = 2;
  var MAX_LOG_LINES = 80;

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
      "Select one layer, create a target, or refresh dropdowns/expression.",
      { multiline: true },
    );
    helpText.alignment = ["fill", "top"];

    var transformModeGroup = panel.add("group");
    transformModeGroup.orientation = "row";
    transformModeGroup.alignChildren = ["left", "center"];
    transformModeGroup.alignment = ["fill", "top"];
    transformModeGroup.add("statictext", undefined, "Animate:");
    var transformModeDropdown = transformModeGroup.add(
      "dropdownlist",
      undefined,
      TRANSFORM_MODE_OPTIONS,
    );
    transformModeDropdown.alignment = ["fill", "center"];
    transformModeDropdown.selection = 0;

    var createButton = panel.add("button", undefined, "Create Target Animator");
    var refreshButton = panel.add(
      "button",
      undefined,
      "Refresh Layer Dropdowns",
    );
    var clearLogButton = panel.add("button", undefined, "Clear Log");
    var statusText = panel.add("edittext", undefined, "", {
      multiline: true,
      readonly: true,
    });
    statusText.alignment = ["fill", "top"];
    statusText.minimumSize.height = 180;
    statusText.preferredSize.height = 180;

    clearLogButton.onClick = function () {
      statusText.text = "";
      appendLog(statusText, "Log cleared.");
    };

    createButton.onClick = function () {
      runCreateTarget(statusText, transformModeDropdown);
    };

    refreshButton.onClick = function () {
      runRefresh(statusText, transformModeDropdown);
    };

    panel.onResizing = panel.onResize = function () {
      this.layout.resize();
    };

    appendLog(statusText, "Ready.");

    return panel;
  }

  function getActiveComp() {
    var item = app.project && app.project.activeItem;
    if (item && item instanceof CompItem) {
      return item;
    }
    return null;
  }

  function getSingleSelectedLayer(comp) {
    if (!comp || comp.selectedLayers.length !== 1) {
      return null;
    }
    return comp.selectedLayers[0];
  }

  function getLayerByName(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === layerName) {
        return comp.layer(i);
      }
    }
    return null;
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

  function appendLog(logField, message) {
    if (!logField) {
      return;
    }

    var prefix = "[" + timestampForLog() + "] ";
    var existingText = logField.text || "";
    var lines = existingText.length > 0 ? existingText.split("\n") : [];
    lines.push(prefix + message);

    if (lines.length > MAX_LOG_LINES) {
      lines = lines.slice(lines.length - MAX_LOG_LINES);
    }

    logField.text = lines.join("\n");

    try {
      logField.active = true;
      logField.selection = logField.text.length;
    } catch (error) {}
  }

  function setStatus(statusText, message) {
    appendLog(statusText, message);
  }

  function getEffectsGroup(layer) {
    return layer.property("ADBE Effect Parade");
  }

  function getLayerPositionProperty(layer) {
    if (!layer) {
      return null;
    }

    // Always use the full property path — layer.position shorthand throws
    // "Object is Invalid" on text layers and some other layer types.
    var transformGroup =
      layer.property("ADBE Transform Group") || layer.property("Transform");
    if (!transformGroup) {
      return null;
    }

    return (
      transformGroup.property("ADBE Position") ||
      transformGroup.property("Position")
    );
  }

  function getRotationTargets(layer) {
    if (!layer) {
      return [];
    }

    if (layer.threeDLayer) {
      return [
        {
          label: "X Rotation",
          property: layer.xRotation,
          expressionPropertyName: "transform.xRotation",
        },
        {
          label: "Y Rotation",
          property: layer.yRotation,
          expressionPropertyName: "transform.yRotation",
        },
        {
          label: "Z Rotation",
          property: layer.zRotation,
          expressionPropertyName: "transform.zRotation",
        },
      ];
    }

    return [
      {
        label: "Rotation",
        property: layer.rotation,
        expressionPropertyName: "transform.rotation",
      },
    ];
  }

  function getSelectedTransformMode(modeDropdown) {
    if (!modeDropdown || !modeDropdown.selection) {
      return TRANSFORM_MODE_POSITION_ONLY;
    }

    return modeDropdown.selection.index + 1;
  }

  function getDropdownMenuProperty(effect) {
    if (!effect) {
      return null;
    }

    for (var i = 1; i <= effect.numProperties; i++) {
      var prop = effect.property(i);
      if (prop && prop.isDropdownEffect) {
        return prop;
      }
    }

    return null;
  }

  function getDropdownEffects(effectsGroup) {
    var dropdownEffects = [];
    if (!effectsGroup) {
      return dropdownEffects;
    }

    for (var i = 1; i <= effectsGroup.numProperties; i++) {
      var effect = effectsGroup.property(i);
      if (getDropdownMenuProperty(effect)) {
        dropdownEffects.push(effect);
      }
    }

    return dropdownEffects;
  }

  function findEffectByName(effectsGroup, effectName) {
    if (!effectsGroup) {
      return null;
    }

    for (var i = 1; i <= effectsGroup.numProperties; i++) {
      var effect = effectsGroup.property(i);
      if (effect && effect.name === effectName) {
        return effect;
      }
    }

    return null;
  }

  function findLastDropdownEffect(effectsGroup) {
    if (!effectsGroup) {
      return null;
    }

    for (var i = effectsGroup.numProperties; i >= 1; i--) {
      var effect = effectsGroup.property(i);
      if (getDropdownMenuProperty(effect)) {
        return effect;
      }
    }

    return null;
  }

  function refreshLayerReference(layer) {
    if (!layer) {
      return null;
    }

    var comp = layer.containingComp;
    if (!comp) {
      return layer;
    }

    return getLayerByName(comp, layer.name) || layer;
  }

  function resolveDropdownEffect(layer, effectName) {
    var effectsGroup = getEffectsGroup(layer);
    if (!effectsGroup) {
      return null;
    }

    if (!effectName) {
      return findLastDropdownEffect(effectsGroup);
    }

    return (
      findEffectByName(effectsGroup, effectName) ||
      findLastDropdownEffect(effectsGroup) ||
      findEffectByName(effectsGroup, "Dropdown Menu Control")
    );
  }

  function ensureDropdownEffect(
    layer,
    dropdownSlot,
    items,
    selectedIndex,
    legacyName,
  ) {
    var step = "refreshing layer";

    try {
      layer = refreshLayerReference(layer);

      step = "resolving effects group";
      var effectsGroup = getEffectsGroup(layer);
      if (!effectsGroup) {
        throw new Error("Selected layer does not support effects.");
      }

      step = "finding existing dropdown";
      var dropdownEffects = getDropdownEffects(effectsGroup);
      var effect =
        findEffectByName(effectsGroup, legacyName) ||
        dropdownEffects[dropdownSlot - 1] ||
        null;

      while (!effect) {
        step = "adding dropdown control";
        effectsGroup.addProperty("ADBE Dropdown Control");

        step = "refreshing layer after dropdown creation";
        layer = refreshLayerReference(layer);
        effectsGroup = getEffectsGroup(layer);
        dropdownEffects = getDropdownEffects(effectsGroup);
        effect =
          findEffectByName(effectsGroup, legacyName) ||
          dropdownEffects[dropdownSlot - 1] ||
          null;
      }

      step = "resolving dropdown control";
      effectsGroup = getEffectsGroup(layer);
      dropdownEffects = getDropdownEffects(effectsGroup);
      effect =
        findEffectByName(effectsGroup, legacyName) ||
        dropdownEffects[dropdownSlot - 1] ||
        null;
      if (!effect) {
        throw new Error(
          "Could not resolve dropdown control at slot " + dropdownSlot + ".",
        );
      }

      step = "resolving dropdown menu property";
      var menuProp =
        getDropdownMenuProperty(effect) ||
        effect.property("Menu") ||
        effect.property(1);
      if (!menuProp || !menuProp.isDropdownEffect) {
        throw new Error(
          "Could not create dropdown control at slot " + dropdownSlot + ".",
        );
      }

      var effectIndex = effect.propertyIndex;

      step = "updating dropdown items";
      var updatedMenuProp = menuProp.setPropertyParameters(items);

      if (legacyName && updatedMenuProp && updatedMenuProp.propertyGroup(1)) {
        step = "naming dropdown control";
        updatedMenuProp.propertyGroup(1).name = legacyName;
      }

      step = "refreshing layer after dropdown item update";
      layer = refreshLayerReference(layer);

      step = "resolving dropdown after item update";
      effectsGroup = getEffectsGroup(layer);
      effect = effectsGroup.property(effectIndex);
      if (!effect) {
        dropdownEffects = getDropdownEffects(effectsGroup);
        effect =
          findEffectByName(effectsGroup, legacyName) ||
          dropdownEffects[dropdownSlot - 1] ||
          null;
      }
      if (!effect) {
        throw new Error(
          "Could not resolve dropdown control at slot " +
            dropdownSlot +
            " after updating items.",
        );
      }

      step = "resolving menu property after item update";
      menuProp = effect.property(1) || getDropdownMenuProperty(effect);
      if (!menuProp || !menuProp.isDropdownEffect) {
        throw new Error(
          "Could not resolve dropdown menu at slot " +
            dropdownSlot +
            " after updating items.",
        );
      }

      step = "setting dropdown value";
      var safeIndex = Math.min(Math.max(selectedIndex, 1), items.length);
      menuProp.setValue(safeIndex);

      return effect.propertyIndex;
    } catch (error) {
      throw new Error(
        "Dropdown slot " +
          dropdownSlot +
          "' failed while " +
          step +
          ": " +
          error.toString(),
      );
    }
  }

  function stripTargetSuffix(name) {
    var match = name.match(/^(.*?)(?:_T_|_target_)(\d+)$/i);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }

  function collectTargetGroups(comp) {
    var groups = [];
    var seen = {};

    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var baseName = stripTargetSuffix(layer.name);
      if (baseName && !seen[baseName]) {
        seen[baseName] = true;
        groups.push(baseName);
      }
    }

    groups.sort();
    return groups;
  }

  function nextTargetName(comp, baseName) {
    var highestIndex = 0;
    var escapedBase = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    var pattern = new RegExp(
      "^" + escapedBase + TARGET_SUFFIX + "(\\d+)$",
      "i",
    );

    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var match = layer.name.match(pattern);
      if (match) {
        highestIndex = Math.max(highestIndex, parseInt(match[1], 10));
      }
    }

    return baseName + TARGET_SUFFIX + (highestIndex + 1);
  }

  function copySpatialValues(sourceLayer, targetLayer) {
    targetLayer.threeDLayer = sourceLayer.threeDLayer;

    var sourcePosition = getLayerPositionProperty(sourceLayer);
    var targetPosition = getLayerPositionProperty(targetLayer);

    if (!sourcePosition || !targetPosition) {
      throw new Error("Could not access layer position property.");
    }

    if (sourceLayer.threeDLayer) {
      targetPosition.setValue(sourcePosition.value);
      targetLayer.xRotation.setValue(sourceLayer.xRotation.value);
      targetLayer.yRotation.setValue(sourceLayer.yRotation.value);
      targetLayer.zRotation.setValue(sourceLayer.zRotation.value);
      targetLayer.orientation.setValue(sourceLayer.orientation.value);
    } else {
      targetPosition.setValue([
        sourcePosition.value[0],
        sourcePosition.value[1],
      ]);
      targetLayer.rotation.setValue(sourceLayer.rotation.value);
    }

    targetLayer.anchorPoint.setValue(sourceLayer.anchorPoint.value);
    targetLayer.scale.setValue(sourceLayer.scale.value);

    try {
      targetLayer.label = sourceLayer.label;
    } catch (error) {}
  }

  function moveLayerNearSource(targetLayer, sourceLayer) {
    try {
      targetLayer.moveBefore(sourceLayer);
    } catch (error) {}
  }

  function createTargetForLayer(comp, sourceLayer) {
    var targetLayer = comp.layers.addNull();
    var targetName = nextTargetName(comp, sourceLayer.name);
    targetLayer.name = targetName;
    targetLayer.inPoint = sourceLayer.inPoint;
    targetLayer.outPoint = Math.min(
      comp.duration,
      sourceLayer.inPoint + DEFAULT_TARGET_DURATION,
    );
    targetLayer.startTime = sourceLayer.startTime;
    targetLayer.enabled = true;
    targetLayer.shy = false;

    copySpatialValues(sourceLayer, targetLayer);
    moveLayerNearSource(targetLayer, sourceLayer);

    try {
      targetLayer.selected = false;
      sourceLayer.selected = true;
    } catch (error) {}

    return targetName;
  }

  function sanitizeForExpression(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      out.push(
        '"' + items[i].replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"',
      );
    }
    return "[" + out.join(", ") + "]";
  }

  function buildSpringExpression(
    targetGroups,
    defaultGroup,
    targetsDropdownIndex,
    springCurveDropdownIndex,
    targetPropertyExpression,
  ) {
    var safeGroups = targetGroups.length > 0 ? targetGroups : [defaultGroup];
    var groupArrayLiteral = sanitizeForExpression(safeGroups);

    return [
      'var transitionLayerName = "' + TRANSITION_LAYER_NAME + '";',
      'var transitionSliderName = "' + TRANSITION_SLIDER_NAME + '";',
      "var targetGroups = " + groupArrayLiteral + ";",
      "var targetsDropdownIndex = " + targetsDropdownIndex + ";",
      "var springCurveDropdownIndex = " + springCurveDropdownIndex + ";",
      "var curveStiffness = [120, 200, 320];",
      "var curveDamping = [14, 10, 16];",
      "var curveMass = [1.1, 1.0, 0.9];",
      "var curveDuration = [1.4, 1.0, 0.8];",
      "var epsilon = 0.001;",
      "var velocitySampleFrames = 0.1;",
      "var springOnArrival = true;",
      "var springOnReturn = true;",
      "function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }",
      'function isArrayLike(v) { return v !== null && typeof v === "object" && v.length !== undefined; }',
      "function addValues(a, b) { if (isArrayLike(a)) { var out = []; for (var i = 0; i < a.length; i++) { out[i] = a[i] + b[i]; } return out; } return a + b; }",
      "function subValues(a, b) { if (isArrayLike(a)) { var out = []; for (var i = 0; i < a.length; i++) { out[i] = a[i] - b[i]; } return out; } return a - b; }",
      "function scaleValue(v, amount) { if (isArrayLike(v)) { var out = []; for (var i = 0; i < v.length; i++) { out[i] = v[i] * amount; } return out; } return v * amount; }",
      "function mixValues(a, b, t) { return addValues(a, scaleValue(subValues(b, a), t)); }",
      "function magnitude(v) { if (isArrayLike(v)) { var total = 0; for (var i = 0; i < v.length; i++) { total += v[i] * v[i]; } return Math.sqrt(total); } return Math.abs(v); }",
      'function selectedTargetPrefix() { var index = Math.round(effect(targetsDropdownIndex)(1).value); index = Math.max(1, Math.min(targetGroups.length, index)); return targetGroups[index - 1] + "_T_"; }',
      "function selectedCurveIndex() { var index = Math.round(effect(springCurveDropdownIndex)(1).value); return Math.max(1, Math.min(curveStiffness.length, index)); }",
      "var curveIndex = selectedCurveIndex() - 1;",
      "var stiffness = curveStiffness[curveIndex];",
      "var damping = curveDamping[curveIndex];",
      "var mass = curveMass[curveIndex];",
      "var maxSpringDuration = curveDuration[curveIndex];",
      "var targetPrefix = selectedTargetPrefix();",
      "var transitionLayer = thisComp.layer(transitionLayerName);",
      'var ctrl = transitionLayer.effect(transitionSliderName)("Slider");',
      "var kCount = ctrl.numKeys;",
      "if (kCount < 2) {",
      "  value;",
      "} else {",
      "  var tStart = ctrl.key(1).time;",
      "  var tEnd = ctrl.key(kCount).time;",
      "  var transDur = tEnd - tStart;",
      "  var velocitySampleStep = Math.max(thisComp.frameDuration * velocitySampleFrames, 0.0001);",
      "  var springEnabled = springOnArrival || springOnReturn;",
      "  function transitionProgress(elapsed) { var sampleTime = clamp(tStart + elapsed, tStart, tEnd); return clamp(ctrl.valueAtTime(sampleTime) / 100, 0, 1); }",
      "  function targetValueAtTime(layer, sampleTime) { return layer." +
        targetPropertyExpression +
        ".valueAtTime(sampleTime); }",
      "  var targets = [];",
      "  for (var i = 1; i <= thisComp.numLayers; i++) { var layer = thisComp.layer(i); if (layer.name.indexOf(targetPrefix) === 0) { targets[targets.length] = layer; } }",
      "  if (targets.length < 1) {",
      "    value;",
      "  } else {",
      "    for (var a = 0; a < targets.length - 1; a++) { for (var b = a + 1; b < targets.length; b++) { if (targets[b].inPoint < targets[a].inPoint) { var swap = targets[a]; targets[a] = targets[b]; targets[b] = swap; } } }",
      "    function analyzeTime(sampleTime) {",
      "      var result = valueAtTime(sampleTime);",
      "      var eventTime = -1;",
      "      var eventCutoff = -1;",
      "      if (sampleTime < targets[0].inPoint) { return { value: result, eventTime: eventTime, eventCutoff: eventCutoff }; }",
      "      for (var j = 0; j < targets.length; j++) {",
      "        var cur = targets[j];",
      "        var prev = j > 0 ? targets[j - 1] : null;",
      "        var next = j < targets.length - 1 ? targets[j + 1] : null;",
      "        var chainFromPrev = prev !== null && cur.inPoint <= prev.outPoint + transDur;",
      "        var chainToNext = next !== null && next.inPoint <= cur.outPoint + transDur;",
      "        var inStart = cur.inPoint;",
      "        var inEnd = cur.inPoint + transDur;",
      "        var holdEnd = chainToNext ? next.inPoint : cur.outPoint;",
      "        var outStart = cur.outPoint;",
      "        var outEnd = cur.outPoint + transDur;",
      "        if (sampleTime >= inStart && sampleTime < inEnd) {",
      "          var fromPos = chainFromPrev ? targetValueAtTime(prev, inStart) : valueAtTime(inStart);",
      "          var toPos = targetValueAtTime(cur, sampleTime);",
      "          result = mixValues(fromPos, toPos, transitionProgress(sampleTime - inStart));",
      "          return { value: result, eventTime: eventTime, eventCutoff: eventCutoff };",
      "        }",
      "        if (sampleTime >= inEnd && sampleTime < holdEnd) {",
      "          result = targetValueAtTime(cur, sampleTime);",
      "          if (springOnArrival) { eventTime = inEnd; eventCutoff = holdEnd; }",
      "          return { value: result, eventTime: eventTime, eventCutoff: eventCutoff };",
      "        }",
      "        if (!chainToNext && sampleTime >= outStart && sampleTime < outEnd) {",
      "          var returnFrom = targetValueAtTime(cur, outStart);",
      "          var returnTo = valueAtTime(outEnd);",
      "          result = mixValues(returnFrom, returnTo, transitionProgress(sampleTime - outStart));",
      "          return { value: result, eventTime: eventTime, eventCutoff: eventCutoff };",
      "        }",
      "        if (!chainToNext) {",
      "          var returnHoldEnd = next !== null ? next.inPoint : 999999;",
      "          if (sampleTime >= outEnd && sampleTime < returnHoldEnd) {",
      "            if (springOnReturn) { eventTime = outEnd; eventCutoff = returnHoldEnd; }",
      "            return { value: result, eventTime: eventTime, eventCutoff: eventCutoff };",
      "          }",
      "        }",
      "      }",
      "      return { value: result, eventTime: eventTime, eventCutoff: eventCutoff };",
      "    }",
      "    var current = analyzeTime(time);",
      "    var result = current.value;",
      "    var activeEventTime = current.eventTime;",
      "    var activeEventCutoff = current.eventCutoff;",
      "    if (!springEnabled || activeEventTime < 0) {",
      "      result;",
      "    } else {",
      "      var cappedCutoff = Math.min(activeEventCutoff, activeEventTime + maxSpringDuration);",
      "      if (time >= cappedCutoff) {",
      "        result;",
      "      } else {",
      "        var springTime = time - activeEventTime;",
      "        if (springTime <= 0) {",
      "          result;",
      "        } else {",
      "          var previousSampleTime = Math.max(0, activeEventTime - velocitySampleStep);",
      "          var sampleDelta = Math.max(activeEventTime - previousSampleTime, 0.0001);",
      "          var eventValue = analyzeTime(activeEventTime).value;",
      "          var previousValue = analyzeTime(previousSampleTime).value;",
      "          var incomingVelocity = scaleValue(subValues(eventValue, previousValue), 1 / sampleDelta);",
      "          var wn = Math.sqrt(stiffness / mass);",
      "          var zeta = damping / (2 * Math.sqrt(stiffness * mass));",
      "          if (zeta < 1) {",
      "            var wd = wn * Math.sqrt(1 - zeta * zeta);",
      "            var envelope = Math.exp(-zeta * wn * springTime);",
      "            if (Math.abs(envelope) < epsilon || magnitude(incomingVelocity) < epsilon) {",
      "              result;",
      "            } else {",
      "              var offset = scaleValue(incomingVelocity, (Math.sin(wd * springTime) * envelope) / wd);",
      "              addValues(result, offset);",
      "            }",
      "          } else if (Math.abs(zeta - 1) < 0.0001) {",
      "            var criticalEnvelope = Math.exp(-wn * springTime);",
      "            addValues(result, scaleValue(incomingVelocity, springTime * criticalEnvelope));",
      "          } else {",
      "            var rootTerm = Math.sqrt(zeta * zeta - 1);",
      "            var r1 = -wn * (zeta - rootTerm);",
      "            var r2 = -wn * (zeta + rootTerm);",
      "            var overdampedScale = (Math.exp(r1 * springTime) - Math.exp(r2 * springTime)) / (r2 - r1);",
      "            addValues(result, scaleValue(incomingVelocity, overdampedScale));",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
  }

  function applySpringExpressions(
    layer,
    targetGroups,
    defaultGroup,
    targetsDropdownIndex,
    springCurveDropdownIndex,
    transformMode,
  ) {
    var positionProp = getLayerPositionProperty(layer);
    if (!positionProp || !positionProp.canSetExpression) {
      throw new Error("Selected layer position does not support expressions.");
    }

    positionProp.expression = "";
    positionProp.expression = buildSpringExpression(
      targetGroups,
      defaultGroup,
      targetsDropdownIndex,
      springCurveDropdownIndex,
      "transform.position",
    );

    if (positionProp.expressionError) {
      throw new Error(positionProp.expressionError);
    }

    if (transformMode !== TRANSFORM_MODE_POSITION_AND_ROTATION) {
      return;
    }

    var rotationTargets = getRotationTargets(layer);
    for (var i = 0; i < rotationTargets.length; i++) {
      var rotationProp = rotationTargets[i].property;
      if (!rotationProp || !rotationProp.canSetExpression) {
        throw new Error(
          rotationTargets[i].label + " does not support expressions.",
        );
      }

      rotationProp.expression = "";
      rotationProp.expression = buildSpringExpression(
        targetGroups,
        defaultGroup,
        targetsDropdownIndex,
        springCurveDropdownIndex,
        rotationTargets[i].expressionPropertyName,
      );

      if (rotationProp.expressionError) {
        throw new Error(
          rotationTargets[i].label + ": " + rotationProp.expressionError,
        );
      }
    }
  }

  function refreshDropdownsForLayer(comp, layer, transformMode) {
    var layerName = layer.name;
    var targetGroups = collectTargetGroups(comp);
    var targetOptions =
      targetGroups.length > 0 ? targetGroups : FALLBACK_TARGET_OPTION;
    var targetBaseName = stripTargetSuffix(layerName) || layerName;
    var targetIndex = 1;

    for (var i = 0; i < targetOptions.length; i++) {
      if (targetOptions[i] === targetBaseName) {
        targetIndex = i + 1;
        break;
      }
    }

    var targetsDropdownIndex = ensureDropdownEffect(
      layer,
      1,
      targetOptions,
      targetIndex,
      TARGETS_EFFECT_NAME,
    );

    // Re-fetch layer by name after each effect addition — AE invalidates
    // property/layer references after modifying the effects hierarchy.
    layer = getLayerByName(comp, layerName);
    var springCurveDropdownIndex = ensureDropdownEffect(
      layer,
      2,
      CURVE_PRESETS,
      2,
      CURVE_EFFECT_NAME,
    );

    layer = getLayerByName(comp, layerName);
    applySpringExpressions(
      layer,
      targetOptions,
      targetBaseName,
      targetsDropdownIndex,
      springCurveDropdownIndex,
      transformMode,
    );

    return targetOptions;
  }

  function runCreateTarget(statusText, modeDropdown) {
    var comp = getActiveComp();
    var selectedLayer = getSingleSelectedLayer(comp);
    var transformMode = getSelectedTransformMode(modeDropdown);

    if (!comp) {
      setStatus(statusText, "Open a composition first.");
      return;
    }

    if (!selectedLayer) {
      setStatus(statusText, "Select exactly one layer.");
      return;
    }

    app.beginUndoGroup("Create Smart Animate Target");

    try {
      var sourceLayerName = selectedLayer.name;
      setStatus(
        statusText,
        "[1/6] Creating target null for '" + sourceLayerName + "'...",
      );
      var createdTargetName = createTargetForLayer(comp, selectedLayer);

      setStatus(
        statusText,
        "[2/6] Target null created: '" +
          createdTargetName +
          "'. Re-fetching source layer...",
      );
      var refreshedLayer = getLayerByName(comp, sourceLayerName);
      if (!refreshedLayer) {
        throw new Error(
          "[2/6] FAIL — Could not find source layer '" +
            sourceLayerName +
            "' after target creation.",
        );
      }

      setStatus(
        statusText,
        "[3/6] Adding 'Targets Available' dropdown to '" +
          sourceLayerName +
          "'...",
      );
      var layerName = refreshedLayer.name;
      var targetGroups = collectTargetGroups(comp);
      var targetOptions =
        targetGroups.length > 0 ? targetGroups : FALLBACK_TARGET_OPTION;
      var targetBaseName = stripTargetSuffix(layerName) || layerName;
      var targetIndex = 1;
      for (var i = 0; i < targetOptions.length; i++) {
        if (targetOptions[i] === targetBaseName) {
          targetIndex = i + 1;
          break;
        }
      }
      var targetsDropdownIndex = ensureDropdownEffect(
        refreshedLayer,
        1,
        targetOptions,
        targetIndex,
        TARGETS_EFFECT_NAME,
      );

      setStatus(
        statusText,
        "[4/6] 'Targets Available' done. Re-fetching layer, adding 'Spring Curve' dropdown...",
      );
      refreshedLayer = getLayerByName(comp, layerName);
      if (!refreshedLayer)
        throw new Error(
          "[4/6] FAIL — Lost layer '" +
            layerName +
            "' before adding Spring Curve.",
        );
      var springCurveDropdownIndex = ensureDropdownEffect(
        refreshedLayer,
        2,
        CURVE_PRESETS,
        2,
        CURVE_EFFECT_NAME,
      );

      setStatus(
        statusText,
        "[5/6] 'Spring Curve' done. Re-fetching layer, applying position expression...",
      );
      refreshedLayer = getLayerByName(comp, layerName);
      if (!refreshedLayer)
        throw new Error(
          "[5/6] FAIL — Lost layer '" + layerName + "' before expression.",
        );
      var posProp = getLayerPositionProperty(refreshedLayer);
      if (!posProp)
        throw new Error(
          "[5/6] FAIL — getLayerPositionProperty returned null for '" +
            layerName +
            "' (type: " +
            refreshedLayer.matchName +
            ").",
        );
      if (!posProp.canSetExpression)
        throw new Error(
          "[5/6] FAIL — Position property canSetExpression=false on '" +
            layerName +
            "'.",
        );
      posProp.expression = "";
      applySpringExpressions(
        refreshedLayer,
        targetOptions,
        targetBaseName,
        targetsDropdownIndex,
        springCurveDropdownIndex,
        transformMode,
      );

      setStatus(
        statusText,
        "[6/6] Done! Created '" +
          createdTargetName +
          "', added controls and expression to '" +
          layerName +
          "'.",
      );
    } catch (error) {
      setStatus(statusText, "Error: " + error.toString());
    } finally {
      app.endUndoGroup();
    }
  }

  function runRefresh(statusText, modeDropdown) {
    var comp = getActiveComp();
    var selectedLayer = getSingleSelectedLayer(comp);
    var transformMode = getSelectedTransformMode(modeDropdown);

    if (!comp) {
      setStatus(statusText, "Open a composition first.");
      return;
    }

    if (!selectedLayer) {
      setStatus(statusText, "Select exactly one layer.");
      return;
    }

    app.beginUndoGroup("Refresh Smart Animate Dropdowns");

    try {
      var refreshedLayer = getLayerByName(comp, selectedLayer.name);
      if (!refreshedLayer) {
        throw new Error("Could not find the selected layer.");
      }
      var targetOptions = refreshDropdownsForLayer(
        comp,
        refreshedLayer,
        transformMode,
      );
      setStatus(
        statusText,
        "Refreshed dropdowns and expression for " +
          targetOptions.length +
          " target group(s).",
      );
    } catch (error) {
      setStatus(statusText, "Error: " + error.toString());
    } finally {
      app.endUndoGroup();
    }
  }

  var panel = buildUI(thisObj);

  if (panel instanceof Window) {
    panel.center();
    panel.show();
  } else {
    panel.layout.layout(true);
  }
})(this);
