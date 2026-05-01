(function leverageSliderSetup(thisObj) {
  var SCRIPT_NAME = "Leverage Slider Setup";
  var REGION_LAYER_NAME = "REGION";
  var CONTROLLER_LAYER_NAME = "CONTROLLER";
  var NUMBER_LAYER_NAME = "NUMBER";
  var X_LAYER_NAME = "x";
  var TRANSITION_LAYER_NAME = "Transition";
  var TRANSITION_SLIDER_NAME = "Slider Control";
  var ACTIVE_HEIGHT_SLIDER_NAME = "Active Tick Height";
  var ACTIVE_WIDTH_SLIDER_NAME = "Active Tick Width";
  var INACTIVE_TICK_OPACITY_SLIDER_NAME = "Inactive Tick Opacity";
  var DEFAULT_TRANSITION_DURATION = 0.35;
  var DEFAULT_ACTIVE_TICK_HEIGHT = 72;
  var DEFAULT_ACTIVE_TICK_WIDTH = 6;
  var DEFAULT_INACTIVE_TICK_OPACITY = 35;

  var MATCH_VECTOR_GROUP = "ADBE Vector Group";
  var MATCH_ROOT_VECTORS_GROUP = "ADBE Root Vectors Group";
  var MATCH_VECTORS_GROUP = "ADBE Vectors Group";
  var MATCH_VECTOR_TRANSFORM_GROUP = "ADBE Vector Transform Group";
  var MATCH_VECTOR_POSITION = "ADBE Vector Position";
  var MATCH_VECTOR_SHAPE_RECT = "ADBE Vector Shape - Rect";
  var MATCH_VECTOR_RECT_SIZE = "ADBE Vector Rect Size";

  function fail(message) {
    throw new Error(SCRIPT_NAME + ": " + message);
  }

  function isCompItem(item) {
    return item && item instanceof CompItem;
  }

  function getActiveComp() {
    var item = app.project && app.project.activeItem;
    if (!isCompItem(item)) {
      fail("Select the target composition and run the script again.");
    }

    return item;
  }

  function findLayerByName(comp, name) {
    var i;

    for (i = 1; i <= comp.numLayers; i += 1) {
      if (comp.layer(i).name === name) {
        return comp.layer(i);
      }
    }

    return null;
  }

  function findEffectByName(layer, name) {
    var effects = layer.property("ADBE Effect Parade");
    var i;

    if (!effects) {
      return null;
    }

    for (i = 1; i <= effects.numProperties; i += 1) {
      if (effects.property(i).name === name) {
        return effects.property(i);
      }
    }

    return null;
  }

  function ensureSlider(layer, name, defaultValue) {
    var effect = findEffectByName(layer, name);

    if (!effect) {
      effect = layer
        .property("ADBE Effect Parade")
        .addProperty("ADBE Slider Control");
      effect.name = name;
    }

    if (
      effect &&
      effect.property("Slider") &&
      effect.property("Slider").numKeys === 0
    ) {
      effect.property("Slider").setValue(defaultValue);
    }

    return effect;
  }

  function ensureTransitionLayer(comp) {
    var layer = findLayerByName(comp, TRANSITION_LAYER_NAME);
    var slider;

    if (!layer) {
      layer = comp.layers.addSolid(
        [1, 1, 1],
        TRANSITION_LAYER_NAME,
        comp.width,
        comp.height,
        comp.pixelAspect,
        comp.duration,
      );
      layer.adjustmentLayer = true;
      layer.guideLayer = true;
      layer.label = 10;
      layer.moveToBeginning();
    }

    slider = ensureSlider(layer, TRANSITION_SLIDER_NAME, 0);
    if (slider.property("Slider").numKeys < 2) {
      while (slider.property("Slider").numKeys > 0) {
        slider.property("Slider").removeKey(1);
      }

      slider.property("Slider").setValueAtTime(comp.displayStartTime, 0);
      slider
        .property("Slider")
        .setValueAtTime(
          comp.displayStartTime + DEFAULT_TRANSITION_DURATION,
          100,
        );
    }

    ensureSlider(layer, ACTIVE_HEIGHT_SLIDER_NAME, DEFAULT_ACTIVE_TICK_HEIGHT);
    ensureSlider(layer, ACTIVE_WIDTH_SLIDER_NAME, DEFAULT_ACTIVE_TICK_WIDTH);
    ensureSlider(
      layer,
      INACTIVE_TICK_OPACITY_SLIDER_NAME,
      DEFAULT_INACTIVE_TICK_OPACITY,
    );

    return layer;
  }

  function ensureParent(layer, parentLayer) {
    if (layer.parent !== parentLayer) {
      layer.parent = parentLayer;
    }
  }

  function parseTrailingNumber(name, prefix) {
    var match = name.match(/(\d+)$/);
    var value;

    if (prefix && name.indexOf(prefix) !== 0) {
      return null;
    }

    if (!match) {
      return null;
    }

    value = parseInt(match[1], 10);
    return isNaN(value) ? null : value;
  }

  function collectLabelLayers(comp) {
    var results = [];
    var i;
    var layer;
    var numericValue;

    for (i = 1; i <= comp.numLayers; i += 1) {
      layer = comp.layer(i);
      numericValue = parseTrailingNumber(layer.name, "");

      if (numericValue !== null && /^\d+$/.test(layer.name)) {
        results[results.length] = {
          layer: layer,
          numericValue: numericValue,
        };
      }
    }

    results.sort(function (a, b) {
      return a.numericValue - b.numericValue;
    });

    return results;
  }

  function getMatchName(prop) {
    return prop && prop.matchName ? prop.matchName : "";
  }

  function getPropertyGroup(prop, depth) {
    try {
      return prop ? prop.propertyGroup(depth) : null;
    } catch (err) {
      return null;
    }
  }

  function getRootVectorsGroup(layer) {
    return (
      layer.property(MATCH_ROOT_VECTORS_GROUP) ||
      layer.property("Contents") ||
      null
    );
  }

  function getVectorsGroup(vectorGroup) {
    return (
      vectorGroup.property(MATCH_VECTORS_GROUP) ||
      vectorGroup.property("Contents") ||
      null
    );
  }

  function getVectorTransformGroup(vectorGroup) {
    return (
      vectorGroup.property(MATCH_VECTOR_TRANSFORM_GROUP) ||
      vectorGroup.property("Transform") ||
      null
    );
  }

  function getVectorPositionProperty(vectorGroup) {
    var transformGroup = getVectorTransformGroup(vectorGroup);
    return transformGroup
      ? transformGroup.property(MATCH_VECTOR_POSITION) ||
          transformGroup.property("Position") ||
          null
      : null;
  }

  function getRectangleSizePropertyDirect(vectorGroup) {
    var contentsGroup = getVectorsGroup(vectorGroup);
    var i;
    var child;

    if (!contentsGroup) {
      return null;
    }

    for (i = 1; i <= contentsGroup.numProperties; i += 1) {
      child = contentsGroup.property(i);
      if (getMatchName(child) === MATCH_VECTOR_SHAPE_RECT) {
        return (
          child.property(MATCH_VECTOR_RECT_SIZE) ||
          child.property("Size") ||
          null
        );
      }
    }

    return null;
  }

  function getRectanglePathNameDirect(vectorGroup) {
    var contentsGroup = getVectorsGroup(vectorGroup);
    var i;
    var child;

    if (!contentsGroup) {
      return "";
    }

    for (i = 1; i <= contentsGroup.numProperties; i += 1) {
      child = contentsGroup.property(i);
      if (getMatchName(child) === MATCH_VECTOR_SHAPE_RECT) {
        return child.name;
      }
    }

    return "";
  }

  function buildTickerTarget(layer, vectorGroup) {
    var sizeProperty = getRectangleSizePropertyDirect(vectorGroup);
    var rectanglePathName = getRectanglePathNameDirect(vectorGroup);
    var positionProperty = getVectorPositionProperty(vectorGroup);

    if (!sizeProperty || !rectanglePathName || !positionProperty) {
      return null;
    }

    return {
      layer: layer,
      vectorGroup: vectorGroup,
      sizeProperty: sizeProperty,
      positionProperty: positionProperty,
      rectanglePathName: rectanglePathName,
      baseSize: sizeProperty.value,
      numericValue: parseTrailingNumber(layer.name, "Container ") / 2,
      baseCompX: 0,
    };
  }

  function collectTargetsFromVectorGroup(layer, vectorGroup, results) {
    var target = buildTickerTarget(layer, vectorGroup);
    var contentsGroup;
    var i;
    var child;

    if (target) {
      results.push(target);
    }

    contentsGroup = getVectorsGroup(vectorGroup);
    if (!contentsGroup) {
      return;
    }

    for (i = 1; i <= contentsGroup.numProperties; i += 1) {
      child = contentsGroup.property(i);
      if (getMatchName(child) === MATCH_VECTOR_GROUP) {
        collectTargetsFromVectorGroup(layer, child, results);
      }
    }
  }

  function findTickerTarget(layer) {
    var results = [];
    var root = getRootVectorsGroup(layer);
    var i;
    var child;

    if (!root) {
      return null;
    }

    for (i = 1; i <= root.numProperties; i += 1) {
      child = root.property(i);
      if (getMatchName(child) === MATCH_VECTOR_GROUP) {
        collectTargetsFromVectorGroup(layer, child, results);
      }
    }

    return results.length > 0 ? results[0] : null;
  }

  function collectTickerLayers(comp) {
    var results = [];
    var i;
    var layer;
    var sourceValue;
    var target;

    for (i = 1; i <= comp.numLayers; i += 1) {
      layer = comp.layer(i);
      sourceValue = parseTrailingNumber(layer.name, "Container ");
      if (sourceValue === null) {
        continue;
      }

      target = findTickerTarget(layer);
      if (!target) {
        fail(
          "Layer '" +
            layer.name +
            "' needs a rectangle path inside a shape group so its height can be expression-driven.",
        );
      }

      results[results.length] = target;
    }

    results.sort(function (a, b) {
      return a.numericValue - b.numericValue;
    });

    return results;
  }

  function escapeExpressionString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function roundNumber(value) {
    return Math.round(value * 10000) / 10000;
  }

  function getLayerCompXAtTime(layer, sampleTime) {
    var current = layer;
    var compX = 0;
    var position;

    while (current) {
      position = current.transform.position.valueAtTime(sampleTime, false);
      compX += position[0];
      current = current.parent;
    }

    return compX;
  }

  function buildActivityProgressLines(
    regionName,
    controllerName,
    transitionLayerName,
    transitionSliderName,
    controllerBaseX,
    layerBaseX,
  ) {
    return [
      'var region = thisComp.layer("' +
        escapeExpressionString(regionName) +
        '");',
      'var transition = thisComp.layer("' +
        escapeExpressionString(transitionLayerName) +
        '");',
      'var ctrl = transition.effect("' +
        escapeExpressionString(transitionSliderName) +
        '")("Slider");',
      'var controller = thisComp.layer("' +
        escapeExpressionString(controllerName) +
        '").transform.position;',
      "var controllerBaseX = " + roundNumber(controllerBaseX) + ";",
      "var layerBaseX = " + roundNumber(layerBaseX) + ";",
      "var rect = region.sourceRectAtTime(time, false);",
      "var leftEdge = region.toComp([rect.left, rect.top])[0];",
      "var rightEdge = region.toComp([rect.left + rect.width, rect.top])[0];",
      "var keyCount = ctrl.numKeys;",
      "var step = Math.max(thisComp.frameDuration / 8, 0.001);",
      "var tStart = 0;",
      "var tEnd = step;",
      "var transDur = step;",
      "",
      "function clamp(v, lo, hi) {",
      "  return Math.max(lo, Math.min(hi, v));",
      "}",
      "",
      "function transitionProgress(elapsed) {",
      "  if (keyCount < 2) {",
      "    return clamp(elapsed / transDur, 0, 1);",
      "  }",
      "  var sampleTime = clamp(tStart + elapsed, tStart, tEnd);",
      "  return clamp(ctrl.valueAtTime(sampleTime) / 100, 0, 1);",
      "}",
      "",
      "function sampleX(sampleTime) {",
      "  return layerBaseX + (controller.valueAtTime(sampleTime)[0] - controllerBaseX);",
      "}",
      "",
      "function isInside(sampleTime) {",
      "  var x = sampleX(sampleTime);",
      "  return x >= leftEdge && x <= rightEdge;",
      "}",
      "",
      "function crossingTimeBetween(t1, t2) {",
      "  var x1 = sampleX(t1);",
      "  var x2 = sampleX(t2);",
      "  var inside1 = x1 >= leftEdge && x1 <= rightEdge;",
      "  var inside2 = x2 >= leftEdge && x2 <= rightEdge;",
      "  var edge = null;",
      "",
      "  if (inside1 === inside2) {",
      "    return -1;",
      "  }",
      "",
      "  if (!inside1 && inside2) {",
      "    edge = x1 < leftEdge ? leftEdge : rightEdge;",
      "  } else if (inside1 && !inside2) {",
      "    edge = x2 < leftEdge ? leftEdge : rightEdge;",
      "  } else {",
      "    return -1;",
      "  }",
      "",
      "  if (Math.abs(x2 - x1) < 0.0001) {",
      "    return t2;",
      "  }",
      "",
      "  return linear(edge, x1, x2, t1, t2);",
      "}",
      "",
      "if (keyCount >= 2) {",
      "  tStart = ctrl.key(1).time;",
      "  tEnd = ctrl.key(keyCount).time;",
      "  transDur = Math.max(step, tEnd - tStart);",
      "}",
      "",
      "var insideNow = isInside(time);",
      "var previousState = insideNow;",
      "var changedToInside = insideNow;",
      "var changeTime = -1;",
      "var searchStart = Math.max(thisComp.displayStartTime, time - transDur - step);",
      "var probe;",
      "for (probe = time - step; probe >= searchStart; probe -= step) {",
      "  var state = isInside(probe);",
      "  if (state !== previousState) {",
      "    changeTime = crossingTimeBetween(probe, probe + step);",
      "    if (changeTime < 0) {",
      "      changeTime = probe + step;",
      "    }",
      "    changedToInside = previousState;",
      "    break;",
      "  }",
      "  previousState = state;",
      "}",
      "",
      "var activity;",
      "if (changeTime < 0) {",
      "  activity = insideNow ? 1 : 0;",
      "} else {",
      "  var eased = transitionProgress(time - changeTime);",
      "  activity = changedToInside ? eased : 1 - eased;",
      "}",
      "activity = clamp(activity, 0, 1);",
    ];
  }

  function buildTickerSizeExpression(
    regionName,
    controllerName,
    transitionLayerName,
    transitionSliderName,
    activeHeightSliderName,
    activeWidthSliderName,
    controllerBaseX,
    layerBaseX,
    baseSize,
  ) {
    var lines = ["try {"];

    lines = lines.concat(
      buildActivityProgressLines(
        regionName,
        controllerName,
        transitionLayerName,
        transitionSliderName,
        controllerBaseX,
        layerBaseX,
      ),
    );

    lines = lines.concat([
      "var expandedHeight = Math.max(" +
        roundNumber(baseSize[1]) +
        ', transition.effect("' +
        escapeExpressionString(activeHeightSliderName) +
        '")("Slider"));',
      "var expandedWidth = Math.max(" +
        roundNumber(baseSize[0]) +
        ', transition.effect("' +
        escapeExpressionString(activeWidthSliderName) +
        '")("Slider"));',
      "var baseWidth = " + roundNumber(baseSize[0]) + ";",
      "var baseHeight = " + roundNumber(baseSize[1]) + ";",
      "[baseWidth + (expandedWidth - baseWidth) * activity, baseHeight + (expandedHeight - baseHeight) * activity];",
      "} catch (err) {",
      "  value;",
      "}",
    ]);

    return lines.join("\n");
  }

  function buildTickerOpacityExpression(
    regionName,
    controllerName,
    transitionLayerName,
    transitionSliderName,
    inactiveTickOpacitySliderName,
    controllerBaseX,
    layerBaseX,
  ) {
    return ["try {"]
      .concat(
        buildActivityProgressLines(
          regionName,
          controllerName,
          transitionLayerName,
          transitionSliderName,
          controllerBaseX,
          layerBaseX,
        ),
      )
      .concat([
        'var minOpacity = clamp(transition.effect("' +
          escapeExpressionString(inactiveTickOpacitySliderName) +
          '")("Slider"), 0, 100);',
        "minOpacity + (value - minOpacity) * activity;",
        "} catch (err) {",
        "  value;",
        "}",
      ])
      .join("\n");
  }

  function clearExpression(property) {
    if (!property) {
      return;
    }

    property.expression = "";
    property.expressionEnabled = false;
  }

  function findTickerForValue(tickers, numericValue) {
    var i;

    for (i = 0; i < tickers.length; i += 1) {
      if (Math.abs(tickers[i].numericValue - numericValue) < 0.001) {
        return tickers[i];
      }
    }

    return null;
  }

  function buildLabelPositionExpression(
    regionName,
    controllerName,
    transitionLayerName,
    transitionSliderName,
    activeHeightSliderName,
    controllerBaseX,
    layerBaseX,
    baseHeight,
  ) {
    return ["try {"]
      .concat(
        buildActivityProgressLines(
          regionName,
          controllerName,
          transitionLayerName,
          transitionSliderName,
          controllerBaseX,
          layerBaseX,
        ),
      )
      .concat([
        "var expandedHeight = Math.max(" +
          roundNumber(baseHeight) +
          ', transition.effect("' +
          escapeExpressionString(activeHeightSliderName) +
          '")("Slider"));',
        "var delta = (expandedHeight - " +
          roundNumber(baseHeight) +
          ") * activity / 2;",
        "[value[0], value[1] - delta];",
        "} catch (err) {",
        "  value;",
        "}",
      ])
      .join("\n");
  }

  function buildNumberOpacityExpression(regionName, labelData) {
    var lines = [
      "try {",
      '  var region = thisComp.layer("' +
        escapeExpressionString(regionName) +
        '");',
      "  var rect = region.sourceRectAtTime(time, false);",
      "  var centerX = region.toComp([rect.left + rect.width / 2, rect.top])[0];",
      "  var bestOpacity = value;",
      "  var bestDistance = 999999;",
      "  var candidateDistance = 0;",
    ];
    var i;

    for (i = 0; i < labelData.length; i += 1) {
      lines[lines.length] =
        "  var labelLayer" +
        i +
        ' = thisComp.layer("' +
        escapeExpressionString(labelData[i].layer.name) +
        '");';
      lines[lines.length] =
        "  candidateDistance = Math.abs(labelLayer" +
        i +
        ".toComp(labelLayer" +
        i +
        ".anchorPoint)[0] - centerX);";
      lines[lines.length] =
        "  if (candidateDistance < bestDistance) { bestDistance = candidateDistance; bestOpacity = labelLayer" +
        i +
        ".transform.opacity; }";
    }

    lines = lines.concat([
      "  bestOpacity;",
      "} catch (err) {",
      "  value;",
      "}",
    ]);

    return lines.join("\n");
  }

  function buildLabelOpacityExpression(
    regionName,
    controllerName,
    transitionLayerName,
    transitionSliderName,
    inactiveTickOpacitySliderName,
    controllerBaseX,
    layerBaseX,
  ) {
    var lines = ["try {"];

    lines = lines.concat(
      buildActivityProgressLines(
        regionName,
        controllerName,
        transitionLayerName,
        transitionSliderName,
        controllerBaseX,
        layerBaseX,
      ),
    );

    lines = lines.concat([
      'var minOpacity = clamp(transition.effect("' +
        escapeExpressionString(inactiveTickOpacitySliderName) +
        '")("Slider"), 0, 100);',
      "minOpacity + (value - minOpacity) * activity;",
      "} catch (err) {",
      "  value;",
      "}",
    ]);

    return lines.join("\n");
  }

  function buildNumberSourceTextExpression(regionName, labelData) {
    var lines = [
      "try {",
      "  function clamp(v, lo, hi) {",
      "    return Math.max(lo, Math.min(hi, v));",
      "  }",
      "",
      '  var region = thisComp.layer("' +
        escapeExpressionString(regionName) +
        '");',
      "  var rect = region.sourceRectAtTime(time, false);",
      "  var centerX = region.toComp([rect.left + rect.width / 2, rect.top])[0];",
      "  var values = [];",
      "  var positions = [];",
    ];
    var i;

    for (i = 0; i < labelData.length; i += 1) {
      lines[lines.length] =
        "  values[" + i + "] = " + labelData[i].numericValue + ";";
      lines[lines.length] =
        "  positions[" +
        i +
        '] = thisComp.layer("' +
        escapeExpressionString(labelData[i].layer.name) +
        '").toComp(thisComp.layer("' +
        escapeExpressionString(labelData[i].layer.name) +
        '").anchorPoint)[0];';
    }

    lines = lines.concat([
      "",
      "  if (values.length < 1) {",
      '    value + "x";',
      "  } else if (values.length === 1) {",
      "    var singleRounded = Math.round(values[0] * 10) / 10;",
      '    ((Math.abs(singleRounded - Math.round(singleRounded)) < 0.001) ? Math.round(singleRounded).toString() : singleRounded.toFixed(1)) + "x";',
      "  } else {",
      "    var avgSpacing = 0;",
      "    var i;",
      "    for (i = 1; i < positions.length; i++) {",
      "      avgSpacing += positions[i] - positions[i - 1];",
      "    }",
      "    avgSpacing = avgSpacing / Math.max(1, positions.length - 1);",
      "",
      "    var displayValue = values[0];",
      "    if (centerX <= positions[0]) {",
      "      displayValue = values[0] + (centerX - positions[0]) / avgSpacing;",
      "    } else if (centerX >= positions[positions.length - 1]) {",
      "      displayValue = values[values.length - 1] + (centerX - positions[positions.length - 1]) / avgSpacing;",
      "    } else {",
      "      for (i = 1; i < positions.length; i++) {",
      "        if (centerX <= positions[i]) {",
      "          displayValue = linear(centerX, positions[i - 1], positions[i], values[i - 1], values[i]);",
      "          break;",
      "        }",
      "      }",
      "    }",
      "",
      "    var minValue = Math.max(0, values[0] - 1);",
      "    var maxValue = values[values.length - 1];",
      "    var rounded = Math.round(clamp(displayValue, minValue, maxValue) * 10) / 10;",
      '    ((Math.abs(rounded - Math.round(rounded)) < 0.001) ? Math.round(rounded).toString() : rounded.toFixed(1)) + "x";',
      "  }",
      "} catch (err) {",
      '  value + "x";',
      "}",
    ]);

    return lines.join("\n");
  }

  function applyExpression(property, expression, label) {
    try {
      property.expression = "";
      property.expression = expression;
      property.expressionEnabled = true;
    } catch (err) {
      fail(
        label +
          " expression failed: " +
          (err && err.message ? err.message : err.toString()),
      );
    }

    if (property.expressionError) {
      fail(label + " expression failed: " + property.expressionError);
    }
  }

  function main() {
    var comp = getActiveComp();
    var region = findLayerByName(comp, REGION_LAYER_NAME);
    var controller = findLayerByName(comp, CONTROLLER_LAYER_NAME);
    var transitionLayer;
    var numberLayer = findLayerByName(comp, NUMBER_LAYER_NAME);
    var xLayer = findLayerByName(comp, X_LAYER_NAME);
    var labels = collectLabelLayers(comp);
    var tickers = collectTickerLayers(comp);
    var controllerBaseX;
    var i;

    if (!region) {
      fail("Missing layer '" + REGION_LAYER_NAME + "'.");
    }

    if (!controller) {
      fail("Missing layer '" + CONTROLLER_LAYER_NAME + "'.");
    }

    if (!numberLayer) {
      fail("Missing layer '" + NUMBER_LAYER_NAME + "'.");
    }

    if (labels.length < 2) {
      fail("Expected numeric label layers named 1 through 15.");
    }

    if (tickers.length < 2) {
      fail(
        "Expected ticker layers named 'Container 2' through 'Container 30'.",
      );
    }

    transitionLayer = ensureTransitionLayer(comp);
    controllerBaseX = controller.transform.position.valueAtTime(
      comp.time,
      false,
    )[0];

    for (i = 0; i < tickers.length; i += 1) {
      ensureParent(tickers[i].layer, controller);
      tickers[i].baseCompX = getLayerCompXAtTime(tickers[i].layer, comp.time);
      applyExpression(
        tickers[i].sizeProperty,
        buildTickerSizeExpression(
          REGION_LAYER_NAME,
          CONTROLLER_LAYER_NAME,
          TRANSITION_LAYER_NAME,
          TRANSITION_SLIDER_NAME,
          ACTIVE_HEIGHT_SLIDER_NAME,
          ACTIVE_WIDTH_SLIDER_NAME,
          controllerBaseX,
          tickers[i].baseCompX,
          tickers[i].baseSize,
        ),
        tickers[i].layer.name + " rectangle size",
      );
      clearExpression(tickers[i].positionProperty);
      applyExpression(
        tickers[i].layer.transform.opacity,
        buildTickerOpacityExpression(
          REGION_LAYER_NAME,
          CONTROLLER_LAYER_NAME,
          TRANSITION_LAYER_NAME,
          TRANSITION_SLIDER_NAME,
          INACTIVE_TICK_OPACITY_SLIDER_NAME,
          controllerBaseX,
          tickers[i].baseCompX,
        ),
        tickers[i].layer.name + " opacity",
      );
    }

    for (i = 0; i < labels.length; i += 1) {
      var matchingTicker = findTickerForValue(tickers, labels[i].numericValue);

      if (!matchingTicker) {
        fail(
          "Could not find a matching ticker layer for label '" +
            labels[i].layer.name +
            "'.",
        );
      }

      ensureParent(labels[i].layer, controller);
      labels[i].baseCompX = getLayerCompXAtTime(labels[i].layer, comp.time);
      applyExpression(
        labels[i].layer.transform.opacity,
        buildLabelOpacityExpression(
          REGION_LAYER_NAME,
          CONTROLLER_LAYER_NAME,
          TRANSITION_LAYER_NAME,
          TRANSITION_SLIDER_NAME,
          INACTIVE_TICK_OPACITY_SLIDER_NAME,
          controllerBaseX,
          labels[i].baseCompX,
        ),
        labels[i].layer.name + " opacity",
      );
      applyExpression(
        labels[i].layer.transform.position,
        buildLabelPositionExpression(
          REGION_LAYER_NAME,
          CONTROLLER_LAYER_NAME,
          TRANSITION_LAYER_NAME,
          TRANSITION_SLIDER_NAME,
          ACTIVE_HEIGHT_SLIDER_NAME,
          controllerBaseX,
          labels[i].baseCompX,
          matchingTicker.baseSize[1],
        ),
        labels[i].layer.name + " position",
      );
    }

    if (
      !numberLayer.property("Source Text") ||
      !numberLayer.property("Source Text").canSetExpression
    ) {
      fail(
        "Layer '" +
          NUMBER_LAYER_NAME +
          "' does not allow Source Text expressions.",
      );
    }

    applyExpression(
      numberLayer.property("Source Text"),
      buildNumberSourceTextExpression(REGION_LAYER_NAME, labels),
      NUMBER_LAYER_NAME + " source text",
    );
    applyExpression(
      numberLayer.transform.opacity,
      buildNumberOpacityExpression(REGION_LAYER_NAME, labels),
      NUMBER_LAYER_NAME + " opacity",
    );

    if (xLayer) {
      xLayer.enabled = false;
      xLayer.shy = true;
    }

    alert(
      SCRIPT_NAME +
        " complete.\n\n" +
        "Animate or scrub CONTROLLER directly.\n" +
        "Tick height now animates from the region edges using the Transition layer timing.\n" +
        "NUMBER now includes the trailing x.",
    );
  }

  app.beginUndoGroup(SCRIPT_NAME);
  try {
    main();
  } catch (err) {
    alert(err && err.message ? err.message : err.toString());
  } finally {
    app.endUndoGroup();
  }
})(this);
