/*
  Rectangle Resizer Panel

  Dockable ScriptUI panel for anchoring shape rectangle growth to the left,
  right, top, or bottom by assigning an expression to the owning vector
  group's position property.
*/

(function rectangleResizerPanel(thisObj) {
  var PANEL_TITLE = "Rectangle Resizer";
  var MATCH_VECTOR_GROUP = "ADBE Vector Group";
  var MATCH_ROOT_VECTORS_GROUP = "ADBE Root Vectors Group";
  var MATCH_VECTORS_GROUP = "ADBE Vectors Group";
  var MATCH_VECTOR_TRANSFORM_GROUP = "ADBE Vector Transform Group";
  var MATCH_VECTOR_POSITION = "ADBE Vector Position";
  var MATCH_VECTOR_SHAPE_RECT = "ADBE Vector Shape - Rect";
  var MATCH_VECTOR_RECT_SIZE = "ADBE Vector Rect Size";

  var DIRECTION_CONFIG = {
    left: {
      label: "Left",
      axisIndex: 0,
      sign: 1,
      baselineIndex: 0,
      axisLabel: "width",
    },
    right: {
      label: "Right",
      axisIndex: 0,
      sign: -1,
      baselineIndex: 0,
      axisLabel: "width",
    },
    top: {
      label: "Top",
      axisIndex: 1,
      sign: 1,
      baselineIndex: 1,
      axisLabel: "height",
    },
    bottom: {
      label: "Bottom",
      axisIndex: 1,
      sign: -1,
      baselineIndex: 1,
      axisLabel: "height",
    },
  };

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
      var textColor = this.colors.text;
      var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, bgColor);
      var textPen = g.newPen(g.PenType.SOLID_COLOR, textColor, 1);
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

  function getActiveComp() {
    var item = app.project && app.project.activeItem;
    if (item && item instanceof CompItem) {
      return item;
    }
    return null;
  }

  function showMessages(messages) {
    if (!messages || messages.length < 1) {
      return;
    }

    alert(messages.join("\n"));
  }

  function getMatchName(property) {
    try {
      return property && property.matchName ? property.matchName : "";
    } catch (error) {
      return "";
    }
  }

  function getPropertyDepth(property) {
    try {
      return property.propertyDepth;
    } catch (error) {
      return 0;
    }
  }

  function getPropertyGroup(property, depth) {
    try {
      return property.propertyGroup(depth);
    } catch (error) {
      return null;
    }
  }

  function getLayerFromProperty(property) {
    var depth = getPropertyDepth(property);
    if (depth < 1) {
      return null;
    }
    return getPropertyGroup(property, depth);
  }

  function getRootVectorsGroup(layer) {
    if (!layer) {
      return null;
    }

    return (
      layer.property(MATCH_ROOT_VECTORS_GROUP) || layer.property("Contents")
    );
  }

  function getVectorsGroup(parentGroup) {
    if (!parentGroup) {
      return null;
    }

    return (
      parentGroup.property(MATCH_VECTORS_GROUP) ||
      parentGroup.property("Contents")
    );
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

  function getVectorPositionProperty(vectorGroup) {
    var transformGroup = getVectorTransformGroup(vectorGroup);
    if (!transformGroup) {
      return null;
    }

    return (
      transformGroup.property(MATCH_VECTOR_POSITION) ||
      transformGroup.property("Position")
    );
  }

  function getRectangleSizeProperty(vectorGroup) {
    var contentsGroup = getVectorsGroup(vectorGroup);
    if (!contentsGroup) {
      return null;
    }

    for (var i = 1; i <= contentsGroup.numProperties; i++) {
      var child = contentsGroup.property(i);
      if (getMatchName(child) !== MATCH_VECTOR_SHAPE_RECT) {
        continue;
      }

      return (
        child.property(MATCH_VECTOR_RECT_SIZE) || child.property("Size") || null
      );
    }

    return null;
  }

  function getRectanglePathName(vectorGroup) {
    var contentsGroup = getVectorsGroup(vectorGroup);
    if (!contentsGroup) {
      return "";
    }

    for (var i = 1; i <= contentsGroup.numProperties; i++) {
      var child = contentsGroup.property(i);
      if (getMatchName(child) === MATCH_VECTOR_SHAPE_RECT) {
        return child.name;
      }
    }

    return "";
  }

  function isShapeLayer(layer) {
    return !!getRootVectorsGroup(layer);
  }

  function roundNumber(value) {
    return Math.round(value * 10000) / 10000;
  }

  function escapeExpressionName(name) {
    return String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function buildGroupExpressionPath(vectorGroup) {
    var names = [];
    var current = vectorGroup;

    while (current) {
      if (getMatchName(current) === MATCH_VECTOR_GROUP) {
        names.unshift(current.name);
      }
      current = getPropertyGroup(current, 1);
    }

    var path = "";
    for (var i = 0; i < names.length; i++) {
      path += '.content("' + escapeExpressionName(names[i]) + '")';
    }

    return path;
  }

  function getTargetKey(layer, vectorGroup) {
    return (
      String(layer.id || layer.index) +
      ":" +
      buildGroupExpressionPath(vectorGroup)
    );
  }

  function buildTarget(layer, vectorGroup) {
    var positionProperty = getVectorPositionProperty(vectorGroup);
    var sizeProperty = getRectangleSizeProperty(vectorGroup);
    var rectanglePathName = getRectanglePathName(vectorGroup);

    if (!positionProperty || !sizeProperty || !rectanglePathName) {
      return null;
    }

    return {
      key: getTargetKey(layer, vectorGroup),
      layer: layer,
      vectorGroup: vectorGroup,
      positionProperty: positionProperty,
      sizeProperty: sizeProperty,
      rectanglePathName: rectanglePathName,
      label: layer.name + " > " + vectorGroup.name,
    };
  }

  function collectTargetsFromVectorGroup(layer, vectorGroup, results) {
    var target = buildTarget(layer, vectorGroup);
    if (target) {
      results.push(target);
    }

    var contentsGroup = getVectorsGroup(vectorGroup);
    if (!contentsGroup) {
      return;
    }

    for (var i = 1; i <= contentsGroup.numProperties; i++) {
      var child = contentsGroup.property(i);
      if (getMatchName(child) === MATCH_VECTOR_GROUP) {
        collectTargetsFromVectorGroup(layer, child, results);
      }
    }
  }

  function collectLayerTargets(layer) {
    var rootVectorsGroup = getRootVectorsGroup(layer);
    var targets = [];
    if (!rootVectorsGroup) {
      return targets;
    }

    for (var i = 1; i <= rootVectorsGroup.numProperties; i++) {
      var child = rootVectorsGroup.property(i);
      if (getMatchName(child) === MATCH_VECTOR_GROUP) {
        collectTargetsFromVectorGroup(layer, child, targets);
      }
    }

    return targets;
  }

  function findContainingVectorGroup(property) {
    var depth = getPropertyDepth(property);
    for (var i = 1; i <= depth; i++) {
      var group = getPropertyGroup(property, i);
      if (getMatchName(group) === MATCH_VECTOR_GROUP) {
        return group;
      }
    }
    return null;
  }

  function addUniqueTarget(targets, seenKeys, target) {
    if (!target || seenKeys[target.key]) {
      return;
    }

    seenKeys[target.key] = true;
    targets.push(target);
  }

  function resolveTargetsFromSelection(comp) {
    var selectedLayers = comp.selectedLayers || [];
    var selectedProperties = comp.selectedProperties || [];
    var targets = [];
    var seenKeys = {};
    var messages = [];

    for (var i = 0; i < selectedProperties.length; i++) {
      var selectedProperty = selectedProperties[i];
      var layer = getLayerFromProperty(selectedProperty);
      var vectorGroup = findContainingVectorGroup(selectedProperty);
      if (!layer || !vectorGroup) {
        continue;
      }

      addUniqueTarget(targets, seenKeys, buildTarget(layer, vectorGroup));
    }

    if (targets.length > 0) {
      return {
        targets: targets,
        messages: messages,
      };
    }

    if (selectedLayers.length < 1) {
      messages.push(
        "Select at least one shape layer or a rectangle Contents group.",
      );
      return {
        targets: targets,
        messages: messages,
      };
    }

    for (var layerIndex = 0; layerIndex < selectedLayers.length; layerIndex++) {
      var selectedLayer = selectedLayers[layerIndex];
      if (!isShapeLayer(selectedLayer)) {
        messages.push(selectedLayer.name + ": not a shape layer.");
        continue;
      }

      var layerTargets = collectLayerTargets(selectedLayer);
      if (layerTargets.length === 1) {
        addUniqueTarget(targets, seenKeys, layerTargets[0]);
        continue;
      }

      if (layerTargets.length < 1) {
        messages.push(selectedLayer.name + ": no rectangle path found.");
        continue;
      }

      messages.push(
        selectedLayer.name +
          ": multiple rectangles found. Select the specific Contents group in the timeline and retry.",
      );
    }

    return {
      targets: targets,
      messages: messages,
    };
  }

  function buildDirectionExpression(target, directionKey) {
    var config = DIRECTION_CONFIG[directionKey];
    var relativeSizePath =
      "thisProperty.propertyGroup(2)" +
      '.content("' +
      escapeExpressionName(target.rectanglePathName) +
      '").size';
    var sizeValue = target.sizeProperty.value;
    var baselineValue = roundNumber(sizeValue[config.baselineIndex]);
    var signedDelta =
      (config.sign > 0 ? "" : "-") +
      "((" +
      relativeSizePath +
      "[" +
      config.baselineIndex +
      "] - " +
      baselineValue +
      ") / 2)";
    var xExpression =
      config.axisIndex === 0 ? "value[0] + " + signedDelta : "value[0]";
    var yExpression =
      config.axisIndex === 1 ? "value[1] + " + signedDelta : "value[1]";

    return [
      "// Rectangle Resizer: keep the " +
        config.label.toLowerCase() +
        " edge fixed.",
      "[" + xExpression + ", " + yExpression + "]",
    ].join("\n");
  }

  function applyDirectionToTarget(target, directionKey) {
    var positionProperty = target.positionProperty;
    if (!positionProperty || !positionProperty.canSetExpression) {
      return {
        ok: false,
        message:
          target.label + ": cannot set an expression on vector position.",
      };
    }

    positionProperty.expression = buildDirectionExpression(
      target,
      directionKey,
    );
    positionProperty.expressionEnabled = true;

    return {
      ok: true,
      message:
        target.label +
        ": anchored to " +
        DIRECTION_CONFIG[directionKey].label.toLowerCase() +
        " using current " +
        DIRECTION_CONFIG[directionKey].axisLabel +
        " as baseline.",
    };
  }

  function clearTargetExpression(target) {
    var positionProperty = target.positionProperty;
    if (!positionProperty || !positionProperty.canSetExpression) {
      return {
        ok: false,
        message: target.label + ": cannot clear expression on vector position.",
      };
    }

    try {
      positionProperty.setValue(positionProperty.value);
    } catch (error) {}

    positionProperty.expression = "";
    positionProperty.expressionEnabled = false;

    return {
      ok: true,
      message: target.label + ": cleared Rectangle Resizer expression.",
    };
  }

  function runDirection(directionKey) {
    var comp = getActiveComp();
    if (!comp) {
      alert("Select an active composition first.");
      return;
    }

    var resolution = resolveTargetsFromSelection(comp);
    var targets = resolution.targets;
    var messages = resolution.messages;
    var failures = [];
    var i;

    if (targets.length < 1) {
      showMessages(messages);
      return;
    }

    app.beginUndoGroup(
      "Rectangle Resizer " + DIRECTION_CONFIG[directionKey].label,
    );

    for (i = 0; i < targets.length; i++) {
      var result = applyDirectionToTarget(targets[i], directionKey);
      if (!result.ok) {
        failures.push(result.message);
      }
    }

    app.endUndoGroup();

    showMessages(messages.concat(failures));
  }

  function runClear() {
    var comp = getActiveComp();
    if (!comp) {
      alert("Select an active composition first.");
      return;
    }

    var resolution = resolveTargetsFromSelection(comp);
    var targets = resolution.targets;
    var messages = resolution.messages;
    var failures = [];
    var i;

    if (targets.length < 1) {
      showMessages(messages);
      return;
    }

    app.beginUndoGroup("Rectangle Resizer Clear");

    for (i = 0; i < targets.length; i++) {
      var result = clearTargetExpression(targets[i]);
      if (!result.ok) {
        failures.push(result.message);
      }
    }

    app.endUndoGroup();

    showMessages(messages.concat(failures));
  }

  function layoutControls(host, controls) {
    var minButtonHeight = 22;
    var width = host.size.width;
    var height = host.size.height;
    var padding = Math.max(4, Math.min(10, Math.round(height * 0.06)));
    var gap = Math.max(3, Math.min(8, Math.round(height * 0.04)));
    var usableWidth = Math.max(120, width - padding * 2);
    var usableHeight = Math.max(
      minButtonHeight * 3 + gap * 2,
      height - padding * 2,
    );
    var middleHeight = Math.max(
      minButtonHeight,
      Math.round(usableHeight * 0.4),
    );
    var remainingHeight = usableHeight - middleHeight - gap * 2;
    var topHeight = Math.max(minButtonHeight, Math.floor(remainingHeight / 2));
    var bottomHeight = remainingHeight - topHeight;

    if (bottomHeight < minButtonHeight) {
      bottomHeight = minButtonHeight;
      topHeight = minButtonHeight;
      middleHeight = usableHeight - topHeight - bottomHeight - gap * 2;
    }

    var sideWidth = Math.max(52, Math.round(usableWidth * 0.24));
    var centerWidth = usableWidth - sideWidth * 2 - gap * 2;

    if (centerWidth < 64) {
      sideWidth = Math.max(40, Math.round((usableWidth - 64 - gap * 2) / 2));
      centerWidth = usableWidth - sideWidth * 2 - gap * 2;
    }

    var x = padding;
    var y = padding;
    controls.surface.bounds = [0, 0, width, height];
    controls.top.bounds = [x, y, x + usableWidth, y + topHeight];
    y += topHeight + gap;
    controls.left.bounds = [x, y, x + sideWidth, y + middleHeight];
    controls.clear.bounds = [
      x + sideWidth + gap,
      y,
      x + sideWidth + gap + centerWidth,
      y + middleHeight,
    ];
    controls.right.bounds = [
      x + sideWidth + gap + centerWidth + gap,
      y,
      x + usableWidth,
      y + middleHeight,
    ];
    y += middleHeight + gap;
    controls.bottom.bounds = [x, y, x + usableWidth, y + bottomHeight];
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
    cluster.alignment = ["fill", "fill"];
    cluster.minimumSize = [180, 90];
    cluster.layout = null;

    var controls = {
      surface: addControlSurface(cluster),
      top: addCustomButton(cluster, "Top", function () {
        runDirection("top");
      }),
      left: addCustomButton(cluster, "Left", function () {
        runDirection("left");
      }),
      clear: addCustomButton(
        cluster,
        "Clear",
        function () {
          runClear();
        },
        {
          normalColor: [0.3, 0.22, 0.18],
          hoverColor: [0.38, 0.27, 0.21],
          activeColor: [0.24, 0.18, 0.14],
        },
      ),
      right: addCustomButton(cluster, "Right", function () {
        runDirection("right");
      }),
      bottom: addCustomButton(cluster, "Bottom", function () {
        runDirection("bottom");
      }),
    };

    panel._layoutControls = function () {
      layoutControls(cluster, controls);
    };

    panel.onResizing = panel.onResize = function () {
      this.layout.resize();
      this._layoutControls();
    };

    panel.onShow = function () {
      this._layoutControls();
    };

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
