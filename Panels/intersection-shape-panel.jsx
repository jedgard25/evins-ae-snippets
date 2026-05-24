/*
  Intersection Shape Panel

  Dockable ScriptUI panel for inspecting selected line paths, logging path
  resolution details, and generating tracked intersection markers.
*/

(function intersectionShapePanel(thisObj) {
  var PANEL_TITLE = "Intersection Shape";
  var MAX_LOG_LINES = 300;
  var GLOBAL_STATE_KEY = "__intersectionShapePanelState__";

  var CONTROL_LAYER_NAME = "Intersection Shape Controls";
  var SHAPE_TYPE_EFFECT_NAME = "Shape Type";
  var SIZE_EFFECT_NAME = "Shape Size";
  var STROKE_EFFECT_NAME = "Cross Stroke Weight";
  var DEFAULT_SHAPE_SIZE = 90;
  var DEFAULT_STROKE_WEIGHT = 12;
  var BASE_CROSS_SIZE = 100;
  var INTERSECTION_TOLERANCE = 1;
  var MIN_LINE_ASPECT_RATIO = 2;

  var MATCH_EFFECT_PARADE = "ADBE Effect Parade";
  var MATCH_SLIDER_CONTROL = "ADBE Slider Control";
  var MATCH_DROPDOWN_CONTROL = "ADBE Dropdown Control";
  var MATCH_ROOT_VECTORS_GROUP = "ADBE Root Vectors Group";
  var MATCH_VECTORS_GROUP = "ADBE Vectors Group";
  var MATCH_VECTOR_GROUP = "ADBE Vector Group";
  var MATCH_VECTOR_TRANSFORM_GROUP = "ADBE Vector Transform Group";
  var MATCH_VECTOR_RECT = "ADBE Vector Shape - Rect";
  var MATCH_VECTOR_RECT_SIZE = "ADBE Vector Rect Size";
  var MATCH_VECTOR_FILL = "ADBE Vector Graphic - Fill";
  var MATCH_VECTOR_FILL_COLOR = "ADBE Vector Fill Color";
  var MATCH_VECTOR_STROKE = "ADBE Vector Graphic - Stroke";
  var MATCH_VECTOR_STROKE_COLOR = "ADBE Vector Stroke Color";
  var MATCH_VECTOR_STROKE_WIDTH = "ADBE Vector Stroke Width";
  var MATCH_VECTOR_STROKE_LINE_CAP = "ADBE Vector Stroke Line Cap";
  var MATCH_VECTOR_PATH_GROUP = "ADBE Vector Shape - Group";
  var MATCH_VECTOR_PATH_PROP = "ADBE Vector Shape";
  var MATCH_VECTOR_SCALE = "ADBE Vector Scale";
  var MATCH_VECTOR_OPACITY = "ADBE Vector Opacity";
  var MATCH_TRANSFORM_GROUP = "ADBE Transform Group";
  var MATCH_POSITION = "ADBE Position";
  var MATCH_ANCHOR_POINT = "ADBE Anchor Point";

  function drawStableRoundedRect(g, x, y, w, h, cornerRadius, brush) {
    var cr = Math.min(cornerRadius, Math.min(w, h) / 2);
    g.newPath();
    g.ellipsePath(x, y, cr * 2, cr * 2);
    g.ellipsePath(x + w - cr * 2, y, cr * 2, cr * 2);
    g.ellipsePath(x, y + h - cr * 2, cr * 2, cr * 2);
    g.ellipsePath(x + w - cr * 2, y + h - cr * 2, cr * 2, cr * 2);
    g.rectPath(x + cr, y, w - cr * 2, h);
    g.rectPath(x, y + cr, w, h - cr * 2);
    g.fillPath(brush);
  }

  function addCustomButton(parent, label, onClick, options) {
    var button = parent.add("customButton", undefined);
    var config = options || {};
    button.text = label;
    button.state = "normal";
    button.cornerRadius = config.cornerRadius || 8;
    button.colors = {
      normal: config.normalColor || [0.22, 0.22, 0.24],
      hover: config.hoverColor || [0.28, 0.28, 0.31],
      active: config.activeColor || [0.18, 0.18, 0.2],
      text: config.textColor || [0.93, 0.93, 0.95],
    };

    button.onDraw = function () {
      var g = this.graphics;
      var w = this.size.width;
      var h = this.size.height;
      var bgColor = this.colors[this.state] || this.colors.normal;
      var textPen = g.newPen(g.PenType.SOLID_COLOR, this.colors.text, 1);
      var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, bgColor);
      var textSize = g.measureString(this.text);
      var textX = Math.round((w - textSize.width) / 2);
      var textY = Math.round((h - textSize.height) / 2);

      drawStableRoundedRect(g, 0, 0, w, h, this.cornerRadius, bgBrush);
      g.drawString(this.text, textPen, textX, textY);
    };

    button.addEventListener("mousedown", function () {
      if (!this.enabled) {
        return;
      }
      this.state = "active";
      this.notify("onDraw");
      if (onClick) {
        onClick();
      }
    });

    button.addEventListener("mouseup", function () {
      if (!this.enabled) {
        return;
      }
      this.state = "hover";
      this.notify("onDraw");
    });

    button.addEventListener("mouseover", function () {
      if (!this.enabled || this.state === "active") {
        return;
      }
      this.state = "hover";
      this.notify("onDraw");
    });

    button.addEventListener("mouseout", function () {
      if (!this.enabled) {
        return;
      }
      this.state = "normal";
      this.notify("onDraw");
    });

    return button;
  }

  function addControlSurface(parent) {
    var surface = parent.add("customButton", undefined, "");
    surface.enabled = false;
    surface.onDraw = function () {
      var g = this.graphics;
      var w = this.size.width;
      var h = this.size.height;
      var outerBrush = g.newBrush(g.BrushType.SOLID_COLOR, [0.14, 0.14, 0.15]);
      var innerBrush = g.newBrush(g.BrushType.SOLID_COLOR, [0.1, 0.1, 0.11]);

      drawStableRoundedRect(g, 0, 0, w, h, 16, outerBrush);
      drawStableRoundedRect(g, 10, 10, w - 20, h - 20, 12, innerBrush);
    };
    return surface;
  }

  function getState() {
    if (!$.global[GLOBAL_STATE_KEY]) {
      $.global[GLOBAL_STATE_KEY] = {
        logLines: [],
      };
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
    var state = getState();
    var logLines = state.logLines;
    logLines.push("[" + timestampForLog() + "] " + message);

    if (logLines.length > MAX_LOG_LINES) {
      state.logLines = logLines.slice(logLines.length - MAX_LOG_LINES);
    }

    renderLog(logText);
  }

  function clearLog(logText) {
    getState().logLines = [];
    renderLog(logText);
  }

  function renderLog(logText) {
    if (!logText) {
      return;
    }

    logText.text = getState().logLines.join("\n");
  }

  function logDivider(logText, label) {
    appendLog(logText, "---- " + label + " ----");
  }

  function fail(message) {
    throw new Error(PANEL_TITLE + ": " + message);
  }

  function getProject() {
    return app.project || null;
  }

  function isCompItem(item) {
    return item && item instanceof CompItem;
  }

  function getActiveComp() {
    var item = getProject() && getProject().activeItem;
    if (!isCompItem(item)) {
      fail("Select a composition and run again.");
    }

    return item;
  }

  function getMatchName(property) {
    try {
      return property && property.matchName ? property.matchName : "";
    } catch (error) {
      return "";
    }
  }

  function getPropertyGroup(property, depth) {
    try {
      return property ? property.propertyGroup(depth) : null;
    } catch (error) {
      return null;
    }
  }

  function getPropertyDepth(property) {
    try {
      return property && property.propertyDepth ? property.propertyDepth : 0;
    } catch (error) {
      return 0;
    }
  }

  function safeName(value) {
    try {
      return value && value.name ? value.name : "<unnamed>";
    } catch (error) {
      return "<unnamed>";
    }
  }

  function safePropertySummary(property) {
    if (!property) {
      return "<missing property>";
    }

    return safeName(property) + " [" + getMatchName(property) + "]";
  }

  function buildPropertyChain(property) {
    var labels = [];
    var current = property;
    var safety = 0;

    while (current && safety < 32) {
      labels.unshift(safePropertySummary(current));
      current = getPropertyGroup(current, 1);
      safety += 1;
    }

    return labels.join(" > ");
  }

  function formatLayerForLog(layer) {
    if (!layer) {
      return "<missing layer>";
    }

    return layer.name + " [index=" + layer.index + "]";
  }

  function formatPoint(point) {
    return (
      "[" +
      Math.round(point[0] * 1000) / 1000 +
      ", " +
      Math.round(point[1] * 1000) / 1000 +
      "]"
    );
  }

  function quoteString(value) {
    return (
      '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
    );
  }

  function nearlyEqual(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function distanceBetweenPoints(pointA, pointB) {
    var dx = pointA[0] - pointB[0];
    var dy = pointA[1] - pointB[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function cross2D(pointA, pointB) {
    return pointA[0] * pointB[1] - pointA[1] * pointB[0];
  }

  function subtract2D(pointA, pointB) {
    return [pointA[0] - pointB[0], pointA[1] - pointB[1]];
  }

  function addScaled2D(point, delta, scalar) {
    return [point[0] + delta[0] * scalar, point[1] + delta[1] * scalar];
  }

  function sortIntersectionSpecs(specs) {
    var rowTolerance = DEFAULT_SHAPE_SIZE * 0.5;

    specs.sort(function (a, b) {
      if (!nearlyEqual(a.point[1], b.point[1], rowTolerance)) {
        return a.point[1] - b.point[1];
      }
      return a.point[0] - b.point[0];
    });
  }

  function getLayerFromProperty(property) {
    var depth = getPropertyDepth(property);
    var layer;

    function getCompLayer(candidate) {
      var comp;

      if (!candidate) {
        return null;
      }

      if (typeof candidate.toComp === "function") {
        return candidate;
      }

      try {
        comp = candidate.containingComp || null;
      } catch (error) {
        comp = null;
      }

      if (!comp) {
        return null;
      }

      try {
        return comp.layer(candidate.index);
      } catch (error) {
        return null;
      }
    }

    if (depth < 1) {
      return null;
    }

    layer = getCompLayer(getPropertyGroup(property, depth));
    if (layer) {
      return layer;
    }

    layer = getCompLayer(getPropertyGroup(property, depth + 1));
    if (layer) {
      return layer;
    }

    return null;
  }

  function getLayerContents(layer) {
    return (
      layer.property(MATCH_ROOT_VECTORS_GROUP) || layer.property("Contents")
    );
  }

  function getVectorContents(group) {
    return group.property(MATCH_VECTORS_GROUP) || group.property("Contents");
  }

  function requireVectorContents(group, label) {
    var contents = getVectorContents(group);

    if (!contents) {
      fail("Could not resolve contents for " + label + ".");
    }

    return contents;
  }

  function getSelectedLayers(comp) {
    return comp ? comp.selectedLayers || [] : [];
  }

  function getSelectedProperties(comp) {
    return comp ? comp.selectedProperties || [] : [];
  }

  function logCurrentSelection(comp, logText) {
    var selectedLayers = getSelectedLayers(comp);
    var selectedProperties = getSelectedProperties(comp);
    var i;

    appendLog(
      logText,
      "Active comp: " + comp.name + " [" + comp.width + "x" + comp.height + "]",
    );
    appendLog(logText, "Selected layers: " + selectedLayers.length);
    for (i = 0; i < selectedLayers.length; i += 1) {
      appendLog(
        logText,
        "  layer " + (i + 1) + ": " + formatLayerForLog(selectedLayers[i]),
      );
    }

    appendLog(logText, "Selected properties: " + selectedProperties.length);
    for (i = 0; i < selectedProperties.length; i += 1) {
      appendLog(
        logText,
        "  property " +
          (i + 1) +
          ": " +
          buildPropertyChain(selectedProperties[i]),
      );
    }
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

  function findEffectByName(layer, effectName) {
    var effects = layer.property(MATCH_EFFECT_PARADE);
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

  function getDropdownMenuProperty(effect) {
    var i;
    var prop;

    if (!effect) {
      return null;
    }

    for (i = 1; i <= effect.numProperties; i += 1) {
      prop = effect.property(i);
      if (prop && prop.isDropdownEffect) {
        return prop;
      }
    }

    return null;
  }

  function ensureSlider(layer, effectName, defaultValue, logText) {
    var effect = findEffectByName(layer, effectName);
    var slider;

    if (!effect) {
      appendLog(logText, "Creating slider effect: " + effectName);
      effect = layer
        .property(MATCH_EFFECT_PARADE)
        .addProperty(MATCH_SLIDER_CONTROL);
      effect.name = effectName;
    }

    slider = effect.property("Slider") || effect.property(1);
    if (!slider) {
      fail("Could not create slider effect '" + effectName + "'.");
    }

    if (slider.numKeys === 0) {
      slider.setValue(defaultValue);
    }

    return slider;
  }

  function ensureDropdown(layer, effectName, items, selectedIndex, logText) {
    var effects = layer.property(MATCH_EFFECT_PARADE);
    var effect = findEffectByName(layer, effectName);
    var menuProp;
    var safeIndex;

    if (!effects) {
      fail("The controller layer does not support effects.");
    }

    if (!effect) {
      appendLog(logText, "Creating dropdown effect: " + effectName);
      effect = effects.addProperty(MATCH_DROPDOWN_CONTROL);
      effect.name = effectName;
    }

    menuProp =
      getDropdownMenuProperty(effect) ||
      effect.property("Menu") ||
      effect.property(1);
    if (!menuProp || !menuProp.isDropdownEffect) {
      fail("Could not resolve dropdown menu for '" + effectName + "'.");
    }

    menuProp = menuProp.setPropertyParameters(items) || menuProp;
    if (menuProp.propertyGroup(1)) {
      menuProp.propertyGroup(1).name = effectName;
    }

    safeIndex = Math.min(Math.max(selectedIndex, 1), items.length);
    menuProp.setValue(safeIndex);
    return menuProp;
  }

  function ensureControllerLayer(comp, logText) {
    var layer = findLayerByName(comp, CONTROL_LAYER_NAME);

    if (!layer) {
      appendLog(logText, "Creating control layer: " + CONTROL_LAYER_NAME);
      layer = comp.layers.addSolid(
        [1, 1, 1],
        CONTROL_LAYER_NAME,
        comp.width,
        comp.height,
        comp.pixelAspect,
        comp.duration,
      );
      layer.adjustmentLayer = true;
      layer.guideLayer = true;
      layer.label = 10;
      layer.moveToBeginning();
    } else {
      appendLog(
        logText,
        "Using existing control layer: " + formatLayerForLog(layer),
      );
    }

    ensureDropdown(
      layer,
      SHAPE_TYPE_EFFECT_NAME,
      ["Cube", "Cross"],
      1,
      logText,
    );
    ensureSlider(layer, SIZE_EFFECT_NAME, DEFAULT_SHAPE_SIZE, logText);
    ensureSlider(layer, STROKE_EFFECT_NAME, DEFAULT_STROKE_WEIGHT, logText);
    return layer;
  }

  function getVectorTransformGroup(vectorGroup) {
    if (!vectorGroup) {
      return null;
    }

    return (
      vectorGroup.property(MATCH_VECTOR_TRANSFORM_GROUP) ||
      vectorGroup.property("Transform")
    );
  }

  function getPropertyByMatchNameOrName(group, matchName, fallbackName) {
    if (!group) {
      return null;
    }

    return group.property(matchName) || group.property(fallbackName) || null;
  }

  function requirePropertyByMatchNameOrName(
    group,
    matchName,
    fallbackName,
    label,
  ) {
    var prop = getPropertyByMatchNameOrName(group, matchName, fallbackName);

    if (!prop) {
      fail("Could not resolve " + label + ".");
    }

    return prop;
  }

  function findChildPropertyByName(group, name) {
    var i;
    var child;

    if (!group || !group.numProperties) {
      return null;
    }

    for (i = 1; i <= group.numProperties; i += 1) {
      child = group.property(i);
      if (child && child.name === name) {
        return child;
      }
    }

    return null;
  }

  function requireChildPropertyByName(group, name, label) {
    var child = findChildPropertyByName(group, name);

    if (!child) {
      fail("Could not resolve " + label + ".");
    }

    return child;
  }

  function getTransformValue(group, matchName, fallbackName, defaultValue) {
    var prop;

    if (!group) {
      return defaultValue;
    }

    prop = group.property(matchName) || group.property(fallbackName);
    if (!prop) {
      return defaultValue;
    }

    try {
      return prop.value;
    } catch (error) {
      return defaultValue;
    }
  }

  function scalePoint(point, scale) {
    return [point[0] * scale[0], point[1] * scale[1]];
  }

  function rotatePoint(point, angleDegrees) {
    var radians = (angleDegrees * Math.PI) / 180;
    var cosine = Math.cos(radians);
    var sine = Math.sin(radians);

    return [
      point[0] * cosine - point[1] * sine,
      point[0] * sine + point[1] * cosine,
    ];
  }

  function applyVectorGroupTransform(point, vectorGroup) {
    var transform = getVectorTransformGroup(vectorGroup);
    var anchor = getTransformValue(
      transform,
      "ADBE Vector Anchor",
      "Anchor Point",
      [0, 0],
    );
    var position = getTransformValue(
      transform,
      "ADBE Vector Position",
      "Position",
      [0, 0],
    );
    var scale = getTransformValue(
      transform,
      "ADBE Vector Scale",
      "Scale",
      [100, 100],
    );
    var rotation = getTransformValue(
      transform,
      "ADBE Vector Rotation",
      "Rotation",
      0,
    );
    var relativePoint = [point[0] - anchor[0], point[1] - anchor[1]];
    var scaledPoint = scalePoint(relativePoint, [
      scale[0] / 100,
      scale[1] / 100,
    ]);
    var rotatedPoint = rotatePoint(scaledPoint, rotation);

    return [rotatedPoint[0] + position[0], rotatedPoint[1] + position[1]];
  }

  function buildGroupChain(pathProperty) {
    var chain = [];
    var current = pathProperty;

    while (current) {
      if (getMatchName(current) === MATCH_VECTOR_GROUP) {
        chain.unshift(current);
      }
      current = getPropertyGroup(current, 1);
    }

    return chain;
  }

  function buildGroupNameChain(pathProperty) {
    var groups = buildGroupChain(pathProperty);
    var names = [];
    var i;

    for (i = 0; i < groups.length; i += 1) {
      names[names.length] = groups[i].name;
    }

    return names;
  }

  function layerPointToComp(layer, point) {
    if (!layer) {
      return null;
    }

    try {
      if (typeof layer.sourcePointToComp === "function") {
        return layer.sourcePointToComp(point);
      }
    } catch (error) {}

    try {
      if (typeof layer.toComp === "function") {
        return layer.toComp(point);
      }
    } catch (error) {}

    return null;
  }

  function getPathPropertyFromContainer(container) {
    var i;
    var child;

    if (!container) {
      return null;
    }

    if (getMatchName(container) === MATCH_VECTOR_PATH_PROP) {
      return container;
    }

    if (!container.numProperties) {
      return null;
    }

    for (i = 1; i <= container.numProperties; i += 1) {
      child = container.property(i);
      if (getMatchName(child) === MATCH_VECTOR_PATH_PROP) {
        return child;
      }
    }

    return null;
  }

  function getPathPropertyFromPathGroup(pathGroup) {
    return getPathPropertyFromContainer(pathGroup);
  }

  function resolvePathProperty(selectedProperty, logText) {
    var current = selectedProperty;
    var directPathProperty;

    appendLog(
      logText,
      "Resolving selected property: " + buildPropertyChain(selectedProperty),
    );

    while (current) {
      if (getMatchName(current) === MATCH_VECTOR_PATH_PROP) {
        appendLog(
          logText,
          "Resolved direct path property: " + safePropertySummary(current),
        );
        return current;
      }

      if (getMatchName(current) === MATCH_VECTOR_PATH_GROUP) {
        directPathProperty = getPathPropertyFromPathGroup(current);
        appendLog(
          logText,
          directPathProperty
            ? "Resolved path from path group: " +
                safePropertySummary(directPathProperty)
            : "Path group found but no path child resolved: " +
                safePropertySummary(current),
        );
        return directPathProperty;
      }

      directPathProperty = getPathPropertyFromContainer(current);
      if (directPathProperty) {
        appendLog(
          logText,
          "Resolved nested path property: " +
            safePropertySummary(directPathProperty),
        );
        return directPathProperty;
      }

      current = getPropertyGroup(current, 1);
    }

    appendLog(logText, "No path property resolved from selection.");
    return null;
  }

  function getShapeVertices(shapeValue) {
    return shapeValue && shapeValue.vertices ? shapeValue.vertices : null;
  }

  function isLineLikeShape(shapeValue) {
    var vertices = getShapeVertices(shapeValue);
    return vertices && vertices.length >= 2;
  }

  function buildLineKey(layer, groupNames, pathName) {
    return String(layer.index) + ":" + groupNames.join("/") + "/" + pathName;
  }

  function buildLineLabel(layer, groupNames, pathName) {
    var label = layer.name;
    var i;

    for (i = 0; i < groupNames.length; i += 1) {
      label += " > " + groupNames[i];
    }

    return label + " > " + pathName;
  }

  function buildLineReference(pathProperty, logText) {
    var layer = getLayerFromProperty(pathProperty);
    var pathGroup = getPropertyGroup(pathProperty, 1);
    var shapeValue;
    var groupNames;
    var vertices;

    if (!layer || !pathGroup) {
      appendLog(
        logText,
        "Rejecting path: missing layer or path group for " +
          safePropertySummary(pathProperty),
      );
      return null;
    }

    try {
      shapeValue = pathProperty.value;
    } catch (error) {
      appendLog(
        logText,
        "Rejecting path: failed reading value for " +
          safePropertySummary(pathProperty) +
          " -> " +
          error.toString(),
      );
      return null;
    }

    vertices = getShapeVertices(shapeValue);
    appendLog(
      logText,
      "Candidate path: " +
        buildPropertyChain(pathProperty) +
        ", layer=" +
        formatLayerForLog(layer) +
        ", vertices=" +
        (vertices ? vertices.length : 0) +
        ", closed=" +
        (shapeValue && shapeValue.closed ? "true" : "false"),
    );

    if (!isLineLikeShape(shapeValue)) {
      appendLog(logText, "Rejected candidate: not line-like.");
      return null;
    }

    groupNames = buildGroupNameChain(pathProperty);
    appendLog(
      logText,
      "Accepted line reference: " +
        buildLineLabel(layer, groupNames, pathGroup.name),
    );

    return {
      key: buildLineKey(layer, groupNames, pathGroup.name),
      label: buildLineLabel(layer, groupNames, pathGroup.name),
      layer: layer,
      layerName: layer.name,
      groupNames: groupNames,
      pathName: pathGroup.name,
      pathProperty: pathProperty,
    };
  }

  function pushUniqueLine(results, seen, lineReference) {
    if (!lineReference || seen[lineReference.key]) {
      return;
    }

    seen[lineReference.key] = true;
    results[results.length] = lineReference;
  }

  function collectPathPropertiesFromContainer(
    container,
    results,
    logText,
    depth,
  ) {
    var i;
    var child;
    var pathProperty;
    var nextDepth = depth || 0;

    if (!container || !container.numProperties) {
      return;
    }

    if (nextDepth < 4) {
      appendLog(
        logText,
        "Scanning container: " + safePropertySummary(container),
      );
    }

    pathProperty = getPathPropertyFromContainer(container);
    if (pathProperty && getMatchName(container) === MATCH_VECTOR_PATH_GROUP) {
      appendLog(
        logText,
        "Found path in group: " + buildPropertyChain(pathProperty),
      );
      results[results.length] = pathProperty;
    }

    for (i = 1; i <= container.numProperties; i += 1) {
      child = container.property(i);

      if (child === pathProperty) {
        continue;
      }

      if (getMatchName(child) === MATCH_VECTOR_PATH_GROUP) {
        pathProperty = getPathPropertyFromPathGroup(child);
        if (pathProperty) {
          appendLog(
            logText,
            "Found path group child: " + buildPropertyChain(pathProperty),
          );
          results[results.length] = pathProperty;
        }
      } else if (child.numProperties) {
        collectPathPropertiesFromContainer(
          child,
          results,
          logText,
          nextDepth + 1,
        );
      }
    }
  }

  function collectPathPropertiesFromLayer(layer, logText) {
    var root = getLayerContents(layer);
    var results = [];

    if (!root) {
      appendLog(
        logText,
        "Layer has no contents group: " + formatLayerForLog(layer),
      );
      return results;
    }

    appendLog(
      logText,
      "Collecting paths from layer: " + formatLayerForLog(layer),
    );
    collectPathPropertiesFromContainer(root, results, logText, 0);
    appendLog(
      logText,
      "Collected " +
        results.length +
        " path candidate(s) from layer " +
        layer.name,
    );
    return results;
  }

  function getSelectedLineReferences(comp, logText) {
    var selectedProperties = getSelectedProperties(comp);
    var selectedLayers = getSelectedLayers(comp);
    var results = [];
    var seen = {};
    var invalidLabels = [];
    var i;
    var pathProperty;
    var lineReference;
    var layerPathProperties;
    var j;
    var beforeCount;

    for (i = 0; i < selectedProperties.length; i += 1) {
      pathProperty = resolvePathProperty(selectedProperties[i], logText);
      if (!pathProperty) {
        continue;
      }

      lineReference = buildLineReference(pathProperty, logText);
      if (lineReference) {
        pushUniqueLine(results, seen, lineReference);
      }
    }

    if (results.length > 0) {
      appendLog(
        logText,
        "Resolved " +
          results.length +
          " line reference(s) from selected properties.",
      );
      return results;
    }

    for (i = 0; i < selectedLayers.length; i += 1) {
      beforeCount = results.length;
      layerPathProperties = collectPathPropertiesFromLayer(
        selectedLayers[i],
        logText,
      );
      if (layerPathProperties.length < 1) {
        invalidLabels[invalidLabels.length] = selectedLayers[i].name;
        continue;
      }

      for (j = 0; j < layerPathProperties.length; j += 1) {
        lineReference = buildLineReference(layerPathProperties[j], logText);
        if (lineReference) {
          pushUniqueLine(results, seen, lineReference);
        }
      }

      if (results.length === beforeCount) {
        invalidLabels[invalidLabels.length] = selectedLayers[i].name;
      }
    }

    if (results.length < 2) {
      fail(
        "Select at least two shape paths or line shape layers before running the script." +
          (invalidLabels.length > 0
            ? " Invalid selections: " + invalidLabels.join(", ")
            : ""),
      );
    }

    appendLog(
      logText,
      "Resolved " + results.length + " total line reference(s).",
    );
    return results;
  }

  function getLineEndpointsFromVertices(vertices, logText, label) {
    var minX = vertices[0][0];
    var maxX = vertices[0][0];
    var minY = vertices[0][1];
    var maxY = vertices[0][1];
    var i;
    var width;
    var height;
    var aspectRatio;

    if (vertices.length === 2) {
      return {
        pointA: [vertices[0][0], vertices[0][1]],
        pointB: [vertices[1][0], vertices[1][1]],
      };
    }

    for (i = 1; i < vertices.length; i += 1) {
      minX = Math.min(minX, vertices[i][0]);
      maxX = Math.max(maxX, vertices[i][0]);
      minY = Math.min(minY, vertices[i][1]);
      maxY = Math.max(maxY, vertices[i][1]);
    }

    width = maxX - minX;
    height = maxY - minY;
    aspectRatio =
      Math.max(width, height) / Math.max(Math.min(width, height), 0.0001);
    appendLog(
      logText,
      "Line bounds for " +
        label +
        ": width=" +
        width +
        ", height=" +
        height +
        ", ratio=" +
        aspectRatio,
    );

    if (aspectRatio < MIN_LINE_ASPECT_RATIO) {
      appendLog(
        logText,
        "Rejected endpoints for " +
          label +
          ": shape is not thin enough to infer a centerline.",
      );
      return null;
    }

    if (width >= height) {
      return {
        pointA: [minX, minY + height / 2],
        pointB: [maxX, minY + height / 2],
      };
    }

    return {
      pointA: [minX + width / 2, minY],
      pointB: [minX + width / 2, maxY],
    };
  }

  function getPathEndpoints(lineReference, logText) {
    var shapeValue = lineReference.pathProperty.value;
    var vertices = getShapeVertices(shapeValue);
    var endpoints = getLineEndpointsFromVertices(
      vertices,
      logText,
      lineReference.label,
    );
    var groups = buildGroupChain(lineReference.pathProperty);
    var start;
    var end;
    var i;

    if (!endpoints) {
      return null;
    }

    start = endpoints.pointA;
    end = endpoints.pointB;

    for (i = 0; i < groups.length; i += 1) {
      start = applyVectorGroupTransform(start, groups[i]);
      end = applyVectorGroupTransform(end, groups[i]);
    }

    start = layerPointToComp(lineReference.layer, start);
    end = layerPointToComp(lineReference.layer, end);

    if (!start || !end) {
      appendLog(
        logText,
        "Rejected endpoints for " +
          lineReference.label +
          ": layer point conversion to comp space is unavailable.",
      );
      return null;
    }

    appendLog(
      logText,
      "World endpoints for " +
        lineReference.label +
        ": " +
        formatPoint(start) +
        " -> " +
        formatPoint(end),
    );

    if (distanceBetweenPoints(start, end) <= INTERSECTION_TOLERANCE) {
      appendLog(
        logText,
        "Rejected endpoints for " +
          lineReference.label +
          ": zero-length after transforms.",
      );
      return null;
    }

    return {
      pointA: start,
      pointB: end,
    };
  }

  function getSegmentIntersection(segmentA, segmentB) {
    var startA = segmentA.pointA;
    var endA = segmentA.pointB;
    var startB = segmentB.pointA;
    var endB = segmentB.pointB;
    var directionA = subtract2D(endA, startA);
    var directionB = subtract2D(endB, startB);
    var betweenStarts = subtract2D(startB, startA);
    var denominator = cross2D(directionA, directionB);
    var t;
    var u;

    if (nearlyEqual(denominator, 0, 0.0001)) {
      return null;
    }

    t = cross2D(betweenStarts, directionB) / denominator;
    u = cross2D(betweenStarts, directionA) / denominator;

    if (t < -0.0001 || t > 1.0001 || u < -0.0001 || u > 1.0001) {
      return null;
    }

    return addScaled2D(startA, directionA, t);
  }

  function buildIntersectionSpecs(lineReferences, logText) {
    var specs = [];
    var i;
    var j;
    var endpointsA;
    var endpointsB;
    var point;
    var k;
    var duplicate;

    for (i = 0; i < lineReferences.length - 1; i += 1) {
      endpointsA = getPathEndpoints(lineReferences[i], logText);
      if (!endpointsA) {
        continue;
      }

      for (j = i + 1; j < lineReferences.length; j += 1) {
        endpointsB = getPathEndpoints(lineReferences[j], logText);
        if (!endpointsB) {
          continue;
        }

        point = getSegmentIntersection(endpointsA, endpointsB);
        if (!point) {
          appendLog(
            logText,
            "No intersection: " +
              lineReferences[i].label +
              " x " +
              lineReferences[j].label,
          );
          continue;
        }

        duplicate = false;
        for (k = 0; k < specs.length; k += 1) {
          if (
            distanceBetweenPoints(specs[k].point, point) <=
            INTERSECTION_TOLERANCE
          ) {
            duplicate = true;
            break;
          }
        }

        if (!duplicate) {
          appendLog(
            logText,
            "Intersection found: " +
              formatPoint(point) +
              " from " +
              lineReferences[i].label +
              " x " +
              lineReferences[j].label,
          );
          specs[specs.length] = {
            point: point,
            lineA: lineReferences[i],
            lineB: lineReferences[j],
          };
        }
      }
    }

    sortIntersectionSpecs(specs);
    appendLog(
      logText,
      "Built " + specs.length + " unique intersection spec(s).",
    );
    return specs;
  }

  function makePath(vertices) {
    var shape = new Shape();
    var tangents = [];
    var i;

    shape.vertices = vertices;
    for (i = 0; i < vertices.length; i += 1) {
      tangents[i] = [0, 0];
    }
    shape.inTangents = tangents;
    shape.outTangents = tangents;
    shape.closed = false;
    return shape;
  }

  function buildContentPathFromNames(groupNames, pathName) {
    var path = "";
    var i;

    for (i = 0; i < groupNames.length; i += 1) {
      path += ".content(" + quoteString(groupNames[i]) + ")";
    }

    return path + ".content(" + quoteString(pathName) + ")";
  }

  function buildGroupReferenceListExpression(layerVarName, groupNames) {
    var parts = [];
    var currentPath = layerVarName;
    var i;

    for (i = 0; i < groupNames.length; i += 1) {
      currentPath += ".content(" + quoteString(groupNames[i]) + ")";
      parts[parts.length] = currentPath;
    }

    return "[" + parts.join(", ") + "]";
  }

  function buildLineSetupExpression(prefix, lineReference) {
    var layerName = quoteString(lineReference.layerName);
    var contentPath = buildContentPathFromNames(
      lineReference.groupNames,
      lineReference.pathName,
    );
    var layerVar = "layer" + prefix;
    var pathVar = "path" + prefix;
    var groupsVar = "groups" + prefix;

    return (
      "var " +
      layerVar +
      " = thisComp.layer(" +
      layerName +
      ");\n" +
      "var " +
      pathVar +
      " = " +
      layerVar +
      contentPath +
      ".path;\n" +
      "var " +
      groupsVar +
      " = " +
      buildGroupReferenceListExpression(layerVar, lineReference.groupNames) +
      ";\n"
    );
  }

  function buildIntersectionPositionExpression(lineA, lineB) {
    return (
      "function cross2D(a, b) { return a[0] * b[1] - a[1] * b[0]; }\n" +
      "function sub2D(a, b) { return [a[0] - b[0], a[1] - b[1]]; }\n" +
      "function addScaled2D(p, d, t) { return [p[0] + d[0] * t, p[1] + d[1] * t]; }\n" +
      "function getLineEndpoints(points) {\n" +
      "  if (!points || points.length < 2) { return null; }\n" +
      "  if (points.length == 2) { return { pointA: points[0], pointB: points[1] }; }\n" +
      "  var minX = points[0][0];\n" +
      "  var maxX = points[0][0];\n" +
      "  var minY = points[0][1];\n" +
      "  var maxY = points[0][1];\n" +
      "  for (var i = 1; i < points.length; i++) {\n" +
      "    minX = Math.min(minX, points[i][0]);\n" +
      "    maxX = Math.max(maxX, points[i][0]);\n" +
      "    minY = Math.min(minY, points[i][1]);\n" +
      "    maxY = Math.max(maxY, points[i][1]);\n" +
      "  }\n" +
      "  var width = maxX - minX;\n" +
      "  var height = maxY - minY;\n" +
      "  var ratio = Math.max(width, height) / Math.max(Math.min(width, height), 0.0001);\n" +
      "  if (ratio < " +
      MIN_LINE_ASPECT_RATIO +
      ") { return null; }\n" +
      "  if (width >= height) { return { pointA: [minX, minY + height / 2], pointB: [maxX, minY + height / 2] }; }\n" +
      "  return { pointA: [minX + width / 2, minY], pointB: [minX + width / 2, maxY] };\n" +
      "}\n" +
      "function applyVectorTransform(point, groupRef) {\n" +
      "  var tf = groupRef.transform;\n" +
      "  var anchor = tf.anchorPoint;\n" +
      "  var position = tf.position;\n" +
      "  var scale = tf.scale / 100;\n" +
      "  var rotation = degreesToRadians(tf.rotation);\n" +
      "  var local = [point[0] - anchor[0], point[1] - anchor[1]];\n" +
      "  var scaled = [local[0] * scale[0], local[1] * scale[1]];\n" +
      "  var rotated = [scaled[0] * Math.cos(rotation) - scaled[1] * Math.sin(rotation), scaled[0] * Math.sin(rotation) + scaled[1] * Math.cos(rotation)];\n" +
      "  return [rotated[0] + position[0], rotated[1] + position[1]];\n" +
      "}\n" +
      "function worldEndpoints(pathRef, layerRef, groups) {\n" +
      "  var points = pathRef.points();\n" +
      "  var endpoints = getLineEndpoints(points);\n" +
      "  if (!endpoints) { return null; }\n" +
      "  var pointA = endpoints.pointA;\n" +
      "  var pointB = endpoints.pointB;\n" +
      "  for (var i = 0; i < groups.length; i++) {\n" +
      "    pointA = applyVectorTransform(pointA, groups[i]);\n" +
      "    pointB = applyVectorTransform(pointB, groups[i]);\n" +
      "  }\n" +
      "  return { pointA: layerRef.toComp(pointA), pointB: layerRef.toComp(pointB) };\n" +
      "}\n" +
      buildLineSetupExpression("A", lineA) +
      buildLineSetupExpression("B", lineB) +
      "var lineAEndpoints = worldEndpoints(pathA, layerA, groupsA);\n" +
      "var lineBEndpoints = worldEndpoints(pathB, layerB, groupsB);\n" +
      "if (!lineAEndpoints || !lineBEndpoints) { value; } else {\n" +
      "var a0 = lineAEndpoints.pointA;\n" +
      "var a1 = lineAEndpoints.pointB;\n" +
      "var b0 = lineBEndpoints.pointA;\n" +
      "var b1 = lineBEndpoints.pointB;\n" +
      "var da = sub2D(a1, a0);\n" +
      "var db = sub2D(b1, b0);\n" +
      "var delta = sub2D(b0, a0);\n" +
      "var denom = cross2D(da, db);\n" +
      "if (Math.abs(denom) < 0.0001) { value; } else {\n" +
      "  var t = cross2D(delta, db) / denom;\n" +
      "  var u = cross2D(delta, da) / denom;\n" +
      "  if (t < -0.0001 || t > 1.0001 || u < -0.0001 || u > 1.0001) { value; } else { addScaled2D(a0, da, t); }\n" +
      "}\n" +
      "}"
    );
  }

  function buildCubeOpacityExpression(controllerName) {
    return (
      "var shapeType = thisComp.layer(" +
      quoteString(controllerName) +
      ").effect(" +
      quoteString(SHAPE_TYPE_EFFECT_NAME) +
      ")(" +
      quoteString("Menu") +
      ");\n" +
      "shapeType == 1 ? 100 : 0;"
    );
  }

  function buildCrossOpacityExpression(controllerName) {
    return (
      "var shapeType = thisComp.layer(" +
      quoteString(controllerName) +
      ").effect(" +
      quoteString(SHAPE_TYPE_EFFECT_NAME) +
      ")(" +
      quoteString("Menu") +
      ");\n" +
      "shapeType == 2 ? 100 : 0;"
    );
  }

  function buildCubeSizeExpression(controllerName) {
    return (
      "var sizeValue = Math.max(thisComp.layer(" +
      quoteString(controllerName) +
      ").effect(" +
      quoteString(SIZE_EFFECT_NAME) +
      ")(" +
      quoteString("Slider") +
      "), 0);\n" +
      "[sizeValue, sizeValue];"
    );
  }

  function buildCrossScaleExpression(controllerName) {
    return (
      "var sizeValue = Math.max(thisComp.layer(" +
      quoteString(controllerName) +
      ").effect(" +
      quoteString(SIZE_EFFECT_NAME) +
      ")(" +
      quoteString("Slider") +
      "), 0);\n" +
      "var percentage = (sizeValue / " +
      BASE_CROSS_SIZE +
      ") * 100;\n" +
      "[percentage, percentage];"
    );
  }

  function buildStrokeWidthExpression(controllerName) {
    return (
      "Math.max(thisComp.layer(" +
      quoteString(controllerName) +
      ").effect(" +
      quoteString(STROKE_EFFECT_NAME) +
      ")(" +
      quoteString("Slider") +
      "), 1);"
    );
  }

  function addCubeGroup(contentsGroup, controllerName) {
    var group = contentsGroup.addProperty(MATCH_VECTOR_GROUP);
    var groupIndex = group.propertyIndex;
    var groupContents;
    var rect;
    var rectSize;
    var fill;
    var fillColor;
    var transform;
    var opacity;

    group = contentsGroup.property(groupIndex);
    group.name = "Cube";

    groupContents = requireVectorContents(group, "cube group");
    rect = groupContents.addProperty(MATCH_VECTOR_RECT);
    rectSize = requirePropertyByMatchNameOrName(
      rect,
      MATCH_VECTOR_RECT_SIZE,
      "Size",
      "cube rectangle size property",
    );
    rectSize.expression = buildCubeSizeExpression(controllerName);

    group = contentsGroup.property(groupIndex);
    groupContents = requireVectorContents(group, "cube group");
    fill = groupContents.addProperty(MATCH_VECTOR_FILL);
    fillColor = requirePropertyByMatchNameOrName(
      fill,
      MATCH_VECTOR_FILL_COLOR,
      "Color",
      "cube fill color property",
    );
    fillColor.setValue([1, 1, 1]);

    group = contentsGroup.property(groupIndex);
    transform = getVectorTransformGroup(group);
    opacity = requirePropertyByMatchNameOrName(
      transform,
      MATCH_VECTOR_OPACITY,
      "Opacity",
      "cube vector opacity property",
    );
    opacity.expression = buildCubeOpacityExpression(controllerName);
  }

  function addCrossLine(pathGroup, vertices) {
    var vectorsGroup = requireVectorContents(
      pathGroup,
      pathGroup.name || "cross line group",
    );
    var path;
    var pathProp;

    path = vectorsGroup.addProperty(MATCH_VECTOR_PATH_GROUP);
    pathProp = requirePropertyByMatchNameOrName(
      path,
      MATCH_VECTOR_PATH_PROP,
      "Path",
      "cross line path property",
    );
    pathProp.setValue(makePath(vertices));
  }

  function addCrossGroup(contentsGroup, controllerName) {
    var group = contentsGroup.addProperty(MATCH_VECTOR_GROUP);
    var groupIndex = group.propertyIndex;
    var groupContents;
    var horizontalGroup;
    var verticalGroup;
    var stroke;
    var strokeColor;
    var strokeWidth;
    var lineCap;
    var transform;
    var scale;
    var opacity;

    group = contentsGroup.property(groupIndex);
    group.name = "Cross";

    groupContents = requireVectorContents(group, "cross group");
    horizontalGroup = groupContents.addProperty(MATCH_VECTOR_GROUP);
    horizontalGroup.name = "Horizontal";

    group = contentsGroup.property(groupIndex);
    groupContents = requireVectorContents(group, "cross group");
    verticalGroup = groupContents.addProperty(MATCH_VECTOR_GROUP);
    verticalGroup.name = "Vertical";

    group = contentsGroup.property(groupIndex);
    groupContents = requireVectorContents(group, "cross group");
    stroke = groupContents.addProperty(MATCH_VECTOR_STROKE);
    strokeColor = requirePropertyByMatchNameOrName(
      stroke,
      MATCH_VECTOR_STROKE_COLOR,
      "Color",
      "cross stroke color property",
    );
    strokeWidth = requirePropertyByMatchNameOrName(
      stroke,
      MATCH_VECTOR_STROKE_WIDTH,
      "Stroke Width",
      "cross stroke width property",
    );
    lineCap = requirePropertyByMatchNameOrName(
      stroke,
      MATCH_VECTOR_STROKE_LINE_CAP,
      "Line Cap",
      "cross stroke line cap property",
    );
    strokeColor.setValue([1, 1, 1]);
    strokeWidth.expression = buildStrokeWidthExpression(controllerName);
    lineCap.setValue(2);

    group = contentsGroup.property(groupIndex);
    groupContents = requireVectorContents(group, "cross group");
    horizontalGroup = requireChildPropertyByName(
      groupContents,
      "Horizontal",
      "cross horizontal group",
    );
    addCrossLine(horizontalGroup, [
      [-BASE_CROSS_SIZE / 2, 0],
      [BASE_CROSS_SIZE / 2, 0],
    ]);

    group = contentsGroup.property(groupIndex);
    groupContents = requireVectorContents(group, "cross group");
    verticalGroup = requireChildPropertyByName(
      groupContents,
      "Vertical",
      "cross vertical group",
    );
    addCrossLine(verticalGroup, [
      [0, -BASE_CROSS_SIZE / 2],
      [0, BASE_CROSS_SIZE / 2],
    ]);

    group = contentsGroup.property(groupIndex);
    transform = getVectorTransformGroup(group);
    scale = requirePropertyByMatchNameOrName(
      transform,
      MATCH_VECTOR_SCALE,
      "Scale",
      "cross vector scale property",
    );
    opacity = requirePropertyByMatchNameOrName(
      transform,
      MATCH_VECTOR_OPACITY,
      "Opacity",
      "cross vector opacity property",
    );
    scale.expression = buildCrossScaleExpression(controllerName);
    opacity.expression = buildCrossOpacityExpression(controllerName);
  }

  function createIntersectionShapeLayer(
    comp,
    intersectionSpec,
    controllerName,
    index,
    logText,
  ) {
    var layer = comp.layers.addShape();
    var layerTransform =
      layer.property(MATCH_TRANSFORM_GROUP) || layer.property("Transform");
    var contents = getLayerContents(layer);
    var anchorPoint;
    var position;

    if (!layerTransform) {
      fail("Created shape layer is missing its transform group.");
    }

    if (!contents) {
      fail("Created shape layer is missing its contents group.");
    }

    layer.name = "Intersection Shape " + index;
    layer.label = 11;
    appendLog(logText, "Configuring shape layer: " + formatLayerForLog(layer));
    anchorPoint = requirePropertyByMatchNameOrName(
      layerTransform,
      MATCH_ANCHOR_POINT,
      "Anchor Point",
      "shape layer anchor point property",
    );
    position = requirePropertyByMatchNameOrName(
      layerTransform,
      MATCH_POSITION,
      "Position",
      "shape layer position property",
    );
    anchorPoint.setValue([0, 0]);
    position.setValue(intersectionSpec.point);
    appendLog(logText, "Applied base transform on " + layer.name + ".");
    position.expression = buildIntersectionPositionExpression(
      intersectionSpec.lineA,
      intersectionSpec.lineB,
    );

    appendLog(logText, "Adding cube group to " + layer.name + ".");
    addCubeGroup(contents, controllerName);
    appendLog(logText, "Adding cross group to " + layer.name + ".");
    addCrossGroup(contents, controllerName);
    appendLog(
      logText,
      "Created shape layer: " +
        formatLayerForLog(layer) +
        " at " +
        formatPoint(intersectionSpec.point),
    );

    return layer;
  }

  function selectGeneratedLayers(controllerLayer, generatedLayers) {
    var i;

    for (i = 1; i <= controllerLayer.containingComp.numLayers; i += 1) {
      controllerLayer.containingComp.layer(i).selected = false;
    }

    controllerLayer.selected = true;
    for (i = 0; i < generatedLayers.length; i += 1) {
      generatedLayers[i].selected = true;
    }
  }

  function inspectSelection(logText) {
    var comp = getActiveComp();
    var lineReferences;
    var intersections;
    var i;

    logDivider(logText, "Inspect");
    logCurrentSelection(comp, logText);
    lineReferences = getSelectedLineReferences(comp, logText);
    for (i = 0; i < lineReferences.length; i += 1) {
      appendLog(logText, "Line " + (i + 1) + ": " + lineReferences[i].label);
    }

    intersections = buildIntersectionSpecs(lineReferences, logText);
    appendLog(
      logText,
      "Inspection complete. Intersections found: " + intersections.length,
    );
    return {
      comp: comp,
      lineReferences: lineReferences,
      intersections: intersections,
    };
  }

  function generateShapes(logText) {
    var inspection = inspectSelection(logText);
    var comp = inspection.comp;
    var intersections = inspection.intersections;
    var controllerLayer;
    var generatedLayers = [];
    var i;

    if (intersections.length < 1) {
      fail("No intersections were found across the selected line paths.");
    }

    app.beginUndoGroup(PANEL_TITLE);
    try {
      controllerLayer = ensureControllerLayer(comp, logText);
      for (i = 0; i < intersections.length; i += 1) {
        appendLog(
          logText,
          "Generating layer " +
            (i + 1) +
            " of " +
            intersections.length +
            " at " +
            formatPoint(intersections[i].point),
        );
        generatedLayers[generatedLayers.length] = createIntersectionShapeLayer(
          comp,
          intersections[i],
          controllerLayer.name,
          i + 1,
          logText,
        );
      }
      selectGeneratedLayers(controllerLayer, generatedLayers);
      appendLog(
        logText,
        "Generate complete. Created " +
          generatedLayers.length +
          " shape layer(s).",
      );
    } finally {
      app.endUndoGroup();
    }
  }

  function runInspect(logText) {
    try {
      inspectSelection(logText);
    } catch (error) {
      appendLog(logText, "Inspect failed: " + error.toString());
      alert(error.toString());
    }
  }

  function runGenerate(logText) {
    try {
      generateShapes(logText);
    } catch (error) {
      appendLog(logText, "Generate failed: " + error.toString());
      alert(error.toString());
    }
  }

  function layoutControls(cluster, controls) {
    var width = cluster.size.width;
    var height = cluster.size.height;
    var padding = 10;
    var buttonGap = 10;
    var buttonWidth = Math.floor((width - padding * 2 - buttonGap) / 2);
    var buttonHeight = 34;

    controls.surface.bounds = [0, 0, width, height];
    controls.generate.bounds = [
      padding,
      padding,
      padding + buttonWidth,
      padding + buttonHeight,
    ];
    controls.inspect.bounds = [
      padding + buttonWidth + buttonGap,
      padding,
      width - padding,
      padding + buttonHeight,
    ];
    controls.clear.bounds = [
      padding,
      padding + buttonHeight + buttonGap,
      padding + buttonWidth,
      padding + buttonHeight * 2 + buttonGap,
    ];
    controls.refresh.bounds = [
      padding + buttonWidth + buttonGap,
      padding + buttonHeight + buttonGap,
      width - padding,
      padding + buttonHeight * 2 + buttonGap,
    ];
  }

  function buildUI(container) {
    var panel =
      container instanceof Panel
        ? container
        : new Window("palette", PANEL_TITLE, undefined, { resizeable: true });

    panel.orientation = "column";
    panel.alignChildren = ["fill", "fill"];
    panel.spacing = 0;
    panel.margins = 8;

    var cluster = panel.add("group");
    cluster.alignment = ["fill", "top"];
    cluster.minimumSize = [220, 94];
    cluster.maximumSize.height = 110;
    cluster.layout = null;

    var logText = panel.add("edittext", undefined, "", {
      multiline: true,
      readonly: true,
      scrolling: true,
    });
    logText.alignment = ["fill", "fill"];
    logText.minimumSize = [220, 240];
    logText.preferredSize.height = 300;

    var controlSurface = addControlSurface(cluster);
    var generateButton = addCustomButton(
      cluster,
      "Generate Shapes",
      function () {
        runGenerate(logText);
      },
    );
    var inspectButton = addCustomButton(
      cluster,
      "Inspect Selection",
      function () {
        runInspect(logText);
      },
      {
        normalColor: [0.2, 0.24, 0.28],
        hoverColor: [0.24, 0.3, 0.35],
        activeColor: [0.16, 0.2, 0.24],
      },
    );
    var clearButton = addCustomButton(
      cluster,
      "Clear Log",
      function () {
        clearLog(logText);
        appendLog(logText, "Log cleared.");
      },
      {
        normalColor: [0.24, 0.21, 0.28],
        hoverColor: [0.3, 0.25, 0.35],
        activeColor: [0.18, 0.16, 0.22],
      },
    );
    var refreshButton = addCustomButton(
      cluster,
      "Log Selection",
      function () {
        try {
          logDivider(logText, "Selection Snapshot");
          logCurrentSelection(getActiveComp(), logText);
        } catch (error) {
          appendLog(logText, "Selection snapshot failed: " + error.toString());
          alert(error.toString());
        }
      },
      {
        normalColor: [0.3, 0.22, 0.18],
        hoverColor: [0.38, 0.27, 0.21],
        activeColor: [0.24, 0.18, 0.14],
      },
    );

    var controls = {
      surface: controlSurface,
      generate: generateButton,
      inspect: inspectButton,
      clear: clearButton,
      refresh: refreshButton,
    };

    panel.onShow = function () {
      appendLog(logText, "Panel shown.");
      this._layoutControls();
    };

    panel.onActivate = function () {
      renderLog(logText);
    };

    panel._layoutControls = function () {
      layoutControls(cluster, controls);
    };

    panel.onResizing = panel.onResize = function () {
      this.layout.resize();
      this._layoutControls();
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
