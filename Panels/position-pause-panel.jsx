/*
  Position Pause Panel

  Dockable ScriptUI panel for temporarily removing transform keyframes,
  moving/changing values freely, then restoring them with an equal offset.
*/

(function positionPausePanel(thisObj) {
  var PANEL_TITLE = "Position Pause";
  var MAX_STATUS_LINES = 120;
  var MAX_LOG_LINES = 200;
  var CONTROLLER_SUFFIX = "_POS_CTRL";
  var GLOBAL_STATE_KEY = "__positionPausePanelState__";
  var TARGET_POSITION = "position";
  var TARGET_ROTATION = "rotation";
  var TARGET_SCALE = "scale";
  var TARGET_ORDER = [TARGET_POSITION, TARGET_ROTATION, TARGET_SCALE];
  var AXIS_LABELS = ["X", "Y", "Z"];

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
      disabled: config.disabledColor || [0.14, 0.14, 0.16],
      text: config.textColor || [0.93, 0.93, 0.95],
      disabledText: config.disabledTextColor || [0.45, 0.45, 0.48],
    };
    button.showIndicator = !!config.showIndicator;
    button.indicatorColor = config.indicatorColor || [0.42, 0.92, 0.76];

    button.onDraw = function () {
      var g = this.graphics;
      var w = this.size.width;
      var h = this.size.height;
      var bgColor = this.enabled
        ? this.colors[this.state] || this.colors.normal
        : this.colors.disabled;
      var textColor = this.enabled
        ? this.colors.text
        : this.colors.disabledText;
      var textPen = g.newPen(g.PenType.SOLID_COLOR, textColor, 1);
      var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, bgColor);
      var textSize = g.measureString(this.text);
      var indicatorDiameter = this.showIndicator
        ? Math.max(8, Math.round(h * 0.18))
        : 0;
      var indicatorGap = this.showIndicator
        ? Math.max(6, Math.round(h * 0.1))
        : 0;
      var contentWidth = textSize.width + indicatorDiameter + indicatorGap;
      var startX = Math.round((w - contentWidth) / 2);
      var textX = startX + indicatorDiameter + indicatorGap;
      var textY = Math.round((h - textSize.height) / 2);

      drawStableRoundedRect(g, 0, 0, w, h, this.cornerRadius, bgBrush);

      if (this.showIndicator) {
        var indicatorBrush = g.newBrush(
          g.BrushType.SOLID_COLOR,
          this.indicatorColor,
        );
        var indicatorX = startX;
        var indicatorY = Math.round((h - indicatorDiameter) / 2);
        g.newPath();
        g.ellipsePath(
          indicatorX,
          indicatorY,
          indicatorDiameter,
          indicatorDiameter,
        );
        g.fillPath(indicatorBrush);
      }

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

  function setCustomButtonEnabled(button, enabled) {
    button.enabled = enabled;
    button.state = "normal";
    button.notify("onDraw");
  }

  function setCustomButtonStyle(button, config) {
    button.colors.normal = config.normalColor;
    button.colors.hover = config.hoverColor;
    button.colors.active = config.activeColor;
    if (config.disabledColor) {
      button.colors.disabled = config.disabledColor;
    }
    if (config.textColor) {
      button.colors.text = config.textColor;
    }
    if (config.disabledTextColor) {
      button.colors.disabledText = config.disabledTextColor;
    }
    button.showIndicator = !!config.showIndicator;
    if (config.indicatorColor) {
      button.indicatorColor = config.indicatorColor;
    }
    button.notify("onDraw");
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
        pausedLayers: {},
        clipboard: null,
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
    if (!logText) {
      return;
    }

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

  function getProject() {
    return app.project || null;
  }

  function getActiveComp() {
    var item = getProject() && getProject().activeItem;
    if (item && item instanceof CompItem) {
      return item;
    }
    return null;
  }

  function getSelectedLayers(comp) {
    if (!comp) {
      return [];
    }

    var selectedLayers = comp.selectedLayers || [];
    var resolvedLayers = [];
    var seen = {};

    for (var i = 0; i < selectedLayers.length; i++) {
      var resolvedLayer =
        resolveLayerReference(comp, getLayerReference(selectedLayers[i])) ||
        selectedLayers[i];
      var layerKey = getLayerIdentifier(resolvedLayer);
      if (seen[layerKey]) {
        continue;
      }

      seen[layerKey] = true;
      resolvedLayers.push(resolvedLayer);
    }

    return resolvedLayers;
  }

  function cloneArray(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value.length !== "number") {
      return value;
    }

    var copy = [];
    for (var i = 0; i < value.length; i++) {
      copy[i] = value[i];
    }
    return copy;
  }

  function roundNumber(value) {
    return Math.round(value * 10000) / 10000;
  }

  function formatLayerForLog(layer) {
    if (!layer) {
      return "<missing layer>";
    }

    return (
      layer.name +
      " [index=" +
      layer.index +
      ", key=" +
      getLayerIdentifier(layer) +
      "]"
    );
  }

  function formatRecordForLog(record) {
    if (!record) {
      return "<missing record>";
    }

    return (
      record.layerName +
      " [index=" +
      record.layerIndex +
      ", layerId=" +
      record.layerId +
      ", paused=" +
      formatTargetKinds(getPausedTargetKinds(record)) +
      "]"
    );
  }

  function formatLayerListForLog(layers) {
    var labels = [];
    for (var i = 0; i < layers.length; i++) {
      labels.push(formatLayerForLog(layers[i]));
    }
    return labels.join(" | ");
  }

  function getValueLength(value) {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value.length === "number") {
      return value.length;
    }

    return 1;
  }

  function normalizeVector(value, axisCount, fallbackValue) {
    var normalized = [];
    var valueLength = getValueLength(value);
    var fallbackLength = getValueLength(fallbackValue);

    for (var i = 0; i < axisCount; i++) {
      if (valueLength > 1 && i < valueLength && value[i] !== undefined) {
        normalized[i] = value[i];
      } else if (valueLength === 1 && i === 0 && value !== undefined) {
        normalized[i] = value;
      } else if (
        fallbackLength > 1 &&
        i < fallbackLength &&
        fallbackValue[i] !== undefined
      ) {
        normalized[i] = fallbackValue[i];
      } else if (
        fallbackLength === 1 &&
        i === 0 &&
        fallbackValue !== undefined
      ) {
        normalized[i] = fallbackValue;
      } else {
        normalized[i] = 0;
      }
    }

    return normalized;
  }

  function vectorToValue(vector, axisCount) {
    if (axisCount === 1) {
      return vector[0];
    }
    return vector;
  }

  function addValues(left, right, axisCount, fallbackValue) {
    var leftVector = normalizeVector(left, axisCount, fallbackValue);
    var rightVector = normalizeVector(right, axisCount, 0);
    var output = [];

    for (var i = 0; i < axisCount; i++) {
      output[i] = leftVector[i] + rightVector[i];
    }

    return vectorToValue(output, axisCount);
  }

  function calculateOffsetForTarget(currentValue, sourceValue, axisCount) {
    var currentVector = normalizeVector(currentValue, axisCount, 0);
    var sourceVector = normalizeVector(sourceValue, axisCount, currentVector);
    var sourceLength = getValueLength(sourceValue);
    var offset = [];

    for (var i = 0; i < axisCount; i++) {
      offset[i] =
        sourceLength > 1 && i >= sourceLength
          ? 0
          : currentVector[i] - sourceVector[i];
    }

    return vectorToValue(offset, axisCount);
  }

  function zeroVector(axisCount) {
    var vector = [];
    for (var i = 0; i < axisCount; i++) {
      vector[i] = 0;
    }
    return vectorToValue(vector, axisCount);
  }

  function valueToString(value) {
    if (getValueLength(value) > 1) {
      return "[" + value.join(", ") + "]";
    }
    return String(value);
  }

  function cloneEaseArray(easeArray) {
    var output = [];
    if (!easeArray) {
      return output;
    }

    for (var i = 0; i < easeArray.length; i++) {
      output.push({
        speed: easeArray[i].speed,
        influence: easeArray[i].influence,
      });
    }
    return output;
  }

  function recreateEaseArray(easeArray) {
    var output = [];
    if (!easeArray) {
      return output;
    }

    for (var i = 0; i < easeArray.length; i++) {
      output.push(new KeyframeEase(easeArray[i].speed, easeArray[i].influence));
    }
    return output;
  }

  function tryCall(fn) {
    try {
      fn();
      return true;
    } catch (error) {
      return false;
    }
  }

  function pushUnique(items, value) {
    for (var i = 0; i < items.length; i++) {
      if (items[i] === value) {
        return;
      }
    }
    items.push(value);
  }

  function getCompIdentifier(comp) {
    try {
      if (comp && comp.id !== undefined && comp.id !== null) {
        return "id:" + comp.id;
      }
    } catch (error) {}

    return "name:" + (comp ? comp.name : "unknown");
  }

  function hasStableId(identifier) {
    return typeof identifier === "string" && identifier.indexOf("id:") === 0;
  }

  function compReferencesMatch(record, comp) {
    if (!record || !comp) {
      return false;
    }

    var currentCompId = getCompIdentifier(comp);
    if (hasStableId(record.compId) && hasStableId(currentCompId)) {
      return record.compId === currentCompId;
    }

    return record.compId === currentCompId || record.compName === comp.name;
  }

  function getLayerIdentifier(layer) {
    try {
      if (layer && layer.id !== undefined && layer.id !== null) {
        return "id:" + layer.id;
      }
    } catch (error) {}

    return "name:" + layer.name + "|index:" + layer.index;
  }

  function getLayerReference(layer) {
    var layerReference = {
      layerId: null,
      layerName: "",
      layerIndex: null,
    };

    if (!layer) {
      return layerReference;
    }

    try {
      if (layer.id !== undefined && layer.id !== null) {
        layerReference.layerId = "id:" + layer.id;
      }
    } catch (error) {}

    try {
      layerReference.layerName = layer.name || "";
    } catch (error) {}

    try {
      if (layer.index !== undefined && layer.index !== null) {
        layerReference.layerIndex = layer.index;
      }
    } catch (error) {}

    return layerReference;
  }

  function buildPausedRecordKey(compId, layerReference) {
    if (layerReference && layerReference.layerId) {
      return compId + "::" + layerReference.layerId;
    }

    return (
      compId +
      "::name:" +
      (layerReference ? layerReference.layerName : "") +
      "|index:" +
      (layerReference ? layerReference.layerIndex : "")
    );
  }

  function resolveLayerReference(comp, layerReference) {
    if (!comp || !layerReference) {
      return null;
    }

    var i;
    var layer;

    if (layerReference.layerId) {
      for (i = 1; i <= comp.numLayers; i++) {
        layer = comp.layer(i);
        if (getLayerIdentifier(layer) === layerReference.layerId) {
          return layer;
        }
      }

      if (hasStableId(layerReference.layerId)) {
        return null;
      }
    }

    if (
      layerReference.layerIndex !== null &&
      layerReference.layerIndex >= 1 &&
      layerReference.layerIndex <= comp.numLayers
    ) {
      layer = comp.layer(layerReference.layerIndex);
      if (
        layer &&
        (!layerReference.layerName || layer.name === layerReference.layerName)
      ) {
        return layer;
      }
    }

    if (layerReference.layerName) {
      for (i = 1; i <= comp.numLayers; i++) {
        layer = comp.layer(i);
        if (layer.name === layerReference.layerName) {
          return layer;
        }
      }
    }

    return null;
  }

  function getRecordLayerReference(record) {
    return {
      layerId: record ? record.layerId : null,
      layerName: record ? record.layerName : "",
      layerIndex: record ? record.layerIndex : null,
    };
  }

  function layerReferencesMatch(left, right) {
    if (!left || !right) {
      return false;
    }

    if (left.layerId && right.layerId && left.layerId === right.layerId) {
      return true;
    }

    if (hasStableId(left.layerId) && hasStableId(right.layerId)) {
      return false;
    }

    if (
      left.layerIndex !== null &&
      right.layerIndex !== null &&
      left.layerIndex === right.layerIndex &&
      left.layerName &&
      right.layerName &&
      left.layerName === right.layerName
    ) {
      return true;
    }

    return false;
  }

  function rekeyPausedRecord(record, comp, layer) {
    var state = getState();
    var compId = getCompIdentifier(comp);
    var layerReference = getLayerReference(layer);
    var key = buildPausedRecordKey(compId, layerReference);

    if (record.key !== key) {
      if (record.key && state.pausedLayers[record.key] === record) {
        delete state.pausedLayers[record.key];
      }
      record.key = key;
      state.pausedLayers[key] = record;
    }

    record.compId = compId;
    record.compName = comp.name;
    record.layerId = layerReference.layerId;
    record.layerName = layerReference.layerName;
    record.layerIndex = layerReference.layerIndex;

    return record;
  }

  function findPausedRecord(comp, layer) {
    var state = getState();
    var pausedLayers = state.pausedLayers;
    var compId = getCompIdentifier(comp);
    var layerReference = getLayerReference(layer);
    var directKey = buildPausedRecordKey(compId, layerReference);
    var resolvedLayer = resolveLayerReference(comp, layerReference) || layer;

    if (pausedLayers[directKey]) {
      return rekeyPausedRecord(pausedLayers[directKey], comp, resolvedLayer);
    }

    for (var key in pausedLayers) {
      if (!pausedLayers.hasOwnProperty(key)) {
        continue;
      }

      var record = pausedLayers[key];
      if (!compReferencesMatch(record, comp)) {
        continue;
      }

      if (
        !layerReferencesMatch(layerReference, getRecordLayerReference(record))
      ) {
        continue;
      }

      return rekeyPausedRecord(record, comp, resolvedLayer);
    }

    return null;
  }

  function getTransformGroup(layer) {
    if (!layer) {
      return null;
    }

    return (
      layer.property("ADBE Transform Group") || layer.property("Transform")
    );
  }

  function getLayerPositionProperty(layer) {
    var transformGroup = getTransformGroup(layer);
    if (!transformGroup) {
      return null;
    }

    return (
      transformGroup.property("ADBE Position") ||
      transformGroup.property("Position")
    );
  }

  function getSeparatedDimensionProperty(transformGroup, axisIndex) {
    var matchNames = [
      "ADBE Position_" + axisIndex,
      AXIS_LABELS[axisIndex] + " Position",
      "ADBE " + AXIS_LABELS[axisIndex] + " Position",
    ];

    for (var i = 0; i < matchNames.length; i++) {
      var property = transformGroup.property(matchNames[i]);
      if (property) {
        return property;
      }
    }

    return null;
  }

  function getPositionAccess(layer) {
    var transformGroup = getTransformGroup(layer);
    var property = getLayerPositionProperty(layer);
    if (!transformGroup || !property) {
      return null;
    }

    var access = {
      kind: TARGET_POSITION,
      label: "Position",
      layer: layer,
      mode: property.dimensionsSeparated ? "channels" : "combined",
      combinedProperty: property,
      channels: [],
      axisCount: 0,
      supportsSpatial: !property.dimensionsSeparated && property.isSpatial,
    };

    if (access.mode === "channels") {
      for (var axisIndex = 0; axisIndex < 3; axisIndex++) {
        var separatedProperty = getSeparatedDimensionProperty(
          transformGroup,
          axisIndex,
        );
        if (separatedProperty) {
          access.channels.push({
            axisIndex: axisIndex,
            axisLabel: AXIS_LABELS[axisIndex],
            property: separatedProperty,
          });
        }
      }
      access.axisCount = access.channels.length;
    } else {
      access.axisCount = getValueLength(property.value);
    }

    return access;
  }

  function getScaleAccess(layer) {
    var transformGroup = getTransformGroup(layer);
    if (!transformGroup) {
      return null;
    }

    var property =
      transformGroup.property("ADBE Scale") || transformGroup.property("Scale");
    if (!property) {
      return null;
    }

    return {
      kind: TARGET_SCALE,
      label: "Scale",
      layer: layer,
      mode: "combined",
      combinedProperty: property,
      channels: [],
      axisCount: getValueLength(property.value),
      supportsSpatial: false,
    };
  }

  function findRotationProperty(transformGroup, matchName, fallbackName) {
    return (
      transformGroup.property(matchName) ||
      transformGroup.property(fallbackName)
    );
  }

  function getRotationAccess(layer) {
    var transformGroup = getTransformGroup(layer);
    if (!transformGroup) {
      return null;
    }

    var channels = [];
    if (layer.threeDLayer) {
      var xRotation = findRotationProperty(
        transformGroup,
        "ADBE Rotate X",
        "X Rotation",
      );
      var yRotation = findRotationProperty(
        transformGroup,
        "ADBE Rotate Y",
        "Y Rotation",
      );
      var zRotation = findRotationProperty(
        transformGroup,
        "ADBE Rotate Z",
        "Z Rotation",
      );

      if (xRotation) {
        channels.push({
          axisIndex: 0,
          axisLabel: "X Rotation",
          property: xRotation,
        });
      }
      if (yRotation) {
        channels.push({
          axisIndex: 1,
          axisLabel: "Y Rotation",
          property: yRotation,
        });
      }
      if (zRotation) {
        channels.push({
          axisIndex: 2,
          axisLabel: "Z Rotation",
          property: zRotation,
        });
      }
    } else {
      var rotation = findRotationProperty(
        transformGroup,
        "ADBE Rotate Z",
        "Rotation",
      );
      if (rotation) {
        channels.push({
          axisIndex: 0,
          axisLabel: "Rotation",
          property: rotation,
        });
      }
    }

    if (channels.length < 1) {
      return null;
    }

    return {
      kind: TARGET_ROTATION,
      label: "Rotation",
      layer: layer,
      mode: "channels",
      combinedProperty: null,
      channels: channels,
      axisCount: channels.length,
      supportsSpatial: false,
    };
  }

  function getTargetAccess(layer, targetKind) {
    if (targetKind === TARGET_POSITION) {
      return getPositionAccess(layer);
    }
    if (targetKind === TARGET_ROTATION) {
      return getRotationAccess(layer);
    }
    if (targetKind === TARGET_SCALE) {
      return getScaleAccess(layer);
    }
    return null;
  }

  function isLiveExpression(property) {
    return property && property.expressionEnabled && property.expression !== "";
  }

  function accessHasLiveExpressions(access) {
    if (!access) {
      return false;
    }

    if (access.mode === "combined") {
      return isLiveExpression(access.combinedProperty);
    }

    for (var i = 0; i < access.channels.length; i++) {
      if (isLiveExpression(access.channels[i].property)) {
        return true;
      }
    }

    return false;
  }

  function snapshotPropertyExpressionState(property) {
    if (!property || !property.canSetExpression) {
      return null;
    }

    return {
      expression: property.expression || "",
      expressionEnabled: !!property.expressionEnabled,
    };
  }

  function disablePropertyExpression(property) {
    if (!property || !property.canSetExpression) {
      return;
    }

    if (property.expression !== "") {
      property.expressionEnabled = false;
    }
  }

  function restorePropertyExpressionState(property, expressionState) {
    if (!property || !property.canSetExpression || !expressionState) {
      return;
    }

    property.expression = expressionState.expression || "";
    property.expressionEnabled = !!expressionState.expressionEnabled;
  }

  function disableAccessExpressions(access) {
    if (!access) {
      return;
    }

    if (access.mode === "combined") {
      disablePropertyExpression(access.combinedProperty);
      return;
    }

    for (var i = 0; i < access.channels.length; i++) {
      disablePropertyExpression(access.channels[i].property);
    }
  }

  function ensureSupportedAccess(access) {
    return !!access;
  }

  function getCurrentTargetValue(access) {
    if (access.mode === "combined") {
      return cloneArray(access.combinedProperty.value);
    }

    var value = [];
    for (var i = 0; i < access.channels.length; i++) {
      value[access.channels[i].axisIndex] = access.channels[i].property.value;
    }
    return value;
  }

  function getTargetValueAtTime(access, time) {
    if (access.mode === "combined") {
      return cloneArray(access.combinedProperty.valueAtTime(time, false));
    }

    var value = [];
    for (var i = 0; i < access.channels.length; i++) {
      value[access.channels[i].axisIndex] = access.channels[
        i
      ].property.valueAtTime(time, false);
    }
    return value;
  }

  function countAccessKeys(access) {
    if (access.mode === "combined") {
      return access.combinedProperty.numKeys;
    }

    var count = 0;
    for (var i = 0; i < access.channels.length; i++) {
      count += access.channels[i].property.numKeys;
    }
    return count;
  }

  function clearAccessKeys(access) {
    if (access.mode === "combined") {
      removeAllKeys(access.combinedProperty);
      return;
    }

    for (var i = 0; i < access.channels.length; i++) {
      removeAllKeys(access.channels[i].property);
    }
  }

  function removeAllKeys(property) {
    for (var keyIndex = property.numKeys; keyIndex >= 1; keyIndex--) {
      property.removeKey(keyIndex);
    }
  }

  function setCurrentTargetValue(access, value) {
    var normalized = normalizeVector(
      value,
      access.axisCount,
      getCurrentTargetValue(access),
    );

    if (access.mode === "combined") {
      access.combinedProperty.setValue(
        vectorToValue(normalized, access.axisCount),
      );
      return;
    }

    for (var i = 0; i < access.channels.length; i++) {
      var channel = access.channels[i];
      channel.property.setValue(normalized[channel.axisIndex]);
    }
  }

  function trySetCurrentTargetValue(access, value) {
    return tryCall(function () {
      setCurrentTargetValue(access, value);
    });
  }

  function snapshotCombinedAccess(access, compTime) {
    var snapshot = {
      targetKind: access.kind,
      targetLabel: access.label,
      mode: "combined",
      axisCount: access.axisCount,
      supportsSpatial: access.supportsSpatial,
      heldValue: cloneArray(getTargetValueAtTime(access, compTime)),
      baseValue: cloneArray(getCurrentTargetValue(access)),
      expressionState: snapshotPropertyExpressionState(access.combinedProperty),
      combinedKeys: [],
      channelKeys: [],
    };

    for (var axisIndex = 0; axisIndex < access.axisCount; axisIndex++) {
      snapshot.channelKeys.push({
        axisIndex: axisIndex,
        axisLabel: AXIS_LABELS[axisIndex],
        keys: [],
      });
    }

    for (
      var keyIndex = 1;
      keyIndex <= access.combinedProperty.numKeys;
      keyIndex++
    ) {
      var relativeTime = roundNumber(
        access.combinedProperty.keyTime(keyIndex) - access.layer.startTime,
      );
      var keyValue = normalizeVector(
        access.combinedProperty.keyValue(keyIndex),
        access.axisCount,
        0,
      );
      var inEase = access.combinedProperty.keyInTemporalEase(keyIndex);
      var outEase = access.combinedProperty.keyOutTemporalEase(keyIndex);
      var combinedKey = {
        relativeTime: relativeTime,
        value: vectorToValue(keyValue, access.axisCount),
        inInterpolationType:
          access.combinedProperty.keyInInterpolationType(keyIndex),
        outInterpolationType:
          access.combinedProperty.keyOutInterpolationType(keyIndex),
        inTemporalEase: cloneEaseArray(inEase),
        outTemporalEase: cloneEaseArray(outEase),
        temporalContinuous:
          access.combinedProperty.keyTemporalContinuous(keyIndex),
        temporalAutoBezier:
          access.combinedProperty.keyTemporalAutoBezier(keyIndex),
      };

      if (snapshot.supportsSpatial) {
        combinedKey.inSpatialTangent = cloneArray(
          access.combinedProperty.keyInSpatialTangent(keyIndex),
        );
        combinedKey.outSpatialTangent = cloneArray(
          access.combinedProperty.keyOutSpatialTangent(keyIndex),
        );
        combinedKey.spatialContinuous =
          access.combinedProperty.keySpatialContinuous(keyIndex);
        combinedKey.spatialAutoBezier =
          access.combinedProperty.keySpatialAutoBezier(keyIndex);
        combinedKey.roving = tryCall(function () {
          combinedKey._roving = access.combinedProperty.keyRoving(keyIndex);
        })
          ? combinedKey._roving
          : false;
        delete combinedKey._roving;
      }

      snapshot.combinedKeys.push(combinedKey);

      for (var axis = 0; axis < access.axisCount; axis++) {
        snapshot.channelKeys[axis].keys.push({
          relativeTime: relativeTime,
          value: keyValue[axis],
          inInterpolationType: combinedKey.inInterpolationType,
          outInterpolationType: combinedKey.outInterpolationType,
          inTemporalEase: cloneEaseArray([
            inEase[Math.min(axis, inEase.length - 1)],
          ]),
          outTemporalEase: cloneEaseArray([
            outEase[Math.min(axis, outEase.length - 1)],
          ]),
          temporalContinuous: combinedKey.temporalContinuous,
          temporalAutoBezier: combinedKey.temporalAutoBezier,
        });
      }
    }

    return snapshot;
  }

  function snapshotChannelAccess(access, compTime) {
    var snapshot = {
      targetKind: access.kind,
      targetLabel: access.label,
      mode: "channels",
      axisCount: access.axisCount,
      supportsSpatial: false,
      heldValue: cloneArray(getTargetValueAtTime(access, compTime)),
      baseValue: cloneArray(getCurrentTargetValue(access)),
      combinedKeys: [],
      channelKeys: [],
    };

    for (
      var channelIndex = 0;
      channelIndex < access.channels.length;
      channelIndex++
    ) {
      var channel = access.channels[channelIndex];
      var channelSnapshot = {
        axisIndex: channel.axisIndex,
        axisLabel: channel.axisLabel,
        expressionState: snapshotPropertyExpressionState(channel.property),
        keys: [],
      };

      for (var keyIndex = 1; keyIndex <= channel.property.numKeys; keyIndex++) {
        channelSnapshot.keys.push({
          relativeTime: roundNumber(
            channel.property.keyTime(keyIndex) - access.layer.startTime,
          ),
          value: channel.property.keyValue(keyIndex),
          inInterpolationType:
            channel.property.keyInInterpolationType(keyIndex),
          outInterpolationType:
            channel.property.keyOutInterpolationType(keyIndex),
          inTemporalEase: cloneEaseArray(
            channel.property.keyInTemporalEase(keyIndex),
          ),
          outTemporalEase: cloneEaseArray(
            channel.property.keyOutTemporalEase(keyIndex),
          ),
          temporalContinuous: channel.property.keyTemporalContinuous(keyIndex),
          temporalAutoBezier: channel.property.keyTemporalAutoBezier(keyIndex),
        });
      }

      snapshot.channelKeys.push(channelSnapshot);
    }

    return snapshot;
  }

  function snapshotAccess(access, compTime) {
    if (access.mode === "combined") {
      return snapshotCombinedAccess(access, compTime);
    }
    return snapshotChannelAccess(access, compTime);
  }

  function findSnapshotChannel(snapshot, axisIndex) {
    for (var i = 0; i < snapshot.channelKeys.length; i++) {
      if (snapshot.channelKeys[i].axisIndex === axisIndex) {
        return snapshot.channelKeys[i];
      }
    }
    return null;
  }

  function countSnapshotKeys(snapshot) {
    var count = snapshot.combinedKeys.length;
    for (var i = 0; i < snapshot.channelKeys.length; i++) {
      count += snapshot.channelKeys[i].keys.length;
    }
    return count;
  }

  function restoreCombinedSnapshot(access, snapshot, offset) {
    clearAccessKeys(access);

    if (snapshot.combinedKeys.length < 1) {
      setCurrentTargetValue(
        access,
        addValues(
          snapshot.heldValue,
          offset,
          access.axisCount,
          getCurrentTargetValue(access),
        ),
      );
      return;
    }

    var currentValue = getCurrentTargetValue(access);
    for (
      var keyIndex = 0;
      keyIndex < snapshot.combinedKeys.length;
      keyIndex++
    ) {
      var keyRecord = snapshot.combinedKeys[keyIndex];
      var restoredValue = addValues(
        keyRecord.value,
        offset,
        access.axisCount,
        currentValue,
      );
      access.combinedProperty.setValueAtTime(
        access.layer.startTime + keyRecord.relativeTime,
        restoredValue,
      );
    }

    for (keyIndex = 0; keyIndex < snapshot.combinedKeys.length; keyIndex++) {
      var storedKey = snapshot.combinedKeys[keyIndex];
      var aeKeyIndex = keyIndex + 1;

      tryCall(function () {
        access.combinedProperty.setInterpolationTypeAtKey(
          aeKeyIndex,
          storedKey.inInterpolationType,
          storedKey.outInterpolationType,
        );
      });

      tryCall(function () {
        access.combinedProperty.setTemporalEaseAtKey(
          aeKeyIndex,
          recreateEaseArray(storedKey.inTemporalEase),
          recreateEaseArray(storedKey.outTemporalEase),
        );
      });

      tryCall(function () {
        access.combinedProperty.setTemporalContinuousAtKey(
          aeKeyIndex,
          storedKey.temporalContinuous,
        );
      });

      tryCall(function () {
        access.combinedProperty.setTemporalAutoBezierAtKey(
          aeKeyIndex,
          storedKey.temporalAutoBezier,
        );
      });

      if (snapshot.supportsSpatial) {
        tryCall(function () {
          access.combinedProperty.setSpatialTangentsAtKey(
            aeKeyIndex,
            cloneArray(storedKey.inSpatialTangent),
            cloneArray(storedKey.outSpatialTangent),
          );
        });

        tryCall(function () {
          access.combinedProperty.setSpatialContinuousAtKey(
            aeKeyIndex,
            storedKey.spatialContinuous,
          );
        });

        tryCall(function () {
          access.combinedProperty.setSpatialAutoBezierAtKey(
            aeKeyIndex,
            storedKey.spatialAutoBezier,
          );
        });

        tryCall(function () {
          access.combinedProperty.setRovingAtKey(aeKeyIndex, storedKey.roving);
        });
      }
    }
  }

  function restoreChannelSnapshot(access, snapshot, offset) {
    var currentValue = getCurrentTargetValue(access);
    var offsetVector = normalizeVector(offset, access.axisCount, 0);

    if (access.mode === "channels") {
      clearAccessKeys(access);

      for (
        var channelIndex = 0;
        channelIndex < access.channels.length;
        channelIndex++
      ) {
        var targetChannel = access.channels[channelIndex];
        var storedChannel = findSnapshotChannel(
          snapshot,
          targetChannel.axisIndex,
        );

        if (!storedChannel || storedChannel.keys.length < 1) {
          targetChannel.property.setValue(
            currentValue[targetChannel.axisIndex],
          );
          continue;
        }

        for (
          var keyIndex = 0;
          keyIndex < storedChannel.keys.length;
          keyIndex++
        ) {
          var keyRecord = storedChannel.keys[keyIndex];
          targetChannel.property.setValueAtTime(
            access.layer.startTime + keyRecord.relativeTime,
            keyRecord.value + offsetVector[targetChannel.axisIndex],
          );
        }

        for (keyIndex = 0; keyIndex < storedChannel.keys.length; keyIndex++) {
          var storedKey = storedChannel.keys[keyIndex];
          var aeKeyIndex = keyIndex + 1;

          tryCall(function () {
            targetChannel.property.setInterpolationTypeAtKey(
              aeKeyIndex,
              storedKey.inInterpolationType,
              storedKey.outInterpolationType,
            );
          });

          tryCall(function () {
            targetChannel.property.setTemporalEaseAtKey(
              aeKeyIndex,
              recreateEaseArray(storedKey.inTemporalEase),
              recreateEaseArray(storedKey.outTemporalEase),
            );
          });

          tryCall(function () {
            targetChannel.property.setTemporalContinuousAtKey(
              aeKeyIndex,
              storedKey.temporalContinuous,
            );
          });

          tryCall(function () {
            targetChannel.property.setTemporalAutoBezierAtKey(
              aeKeyIndex,
              storedKey.temporalAutoBezier,
            );
          });
        }
      }

      return;
    }

    clearAccessKeys(access);

    var keyMap = {};
    var relativeTimes = [];
    for (
      var snapshotChannelIndex = 0;
      snapshotChannelIndex < snapshot.channelKeys.length;
      snapshotChannelIndex++
    ) {
      var snapshotChannel = snapshot.channelKeys[snapshotChannelIndex];
      for (
        var snapshotKeyIndex = 0;
        snapshotKeyIndex < snapshotChannel.keys.length;
        snapshotKeyIndex++
      ) {
        var channelKey = snapshotChannel.keys[snapshotKeyIndex];
        var mapKey = String(channelKey.relativeTime);
        if (!keyMap[mapKey]) {
          keyMap[mapKey] = { relativeTime: channelKey.relativeTime };
          relativeTimes.push(channelKey.relativeTime);
        }
        keyMap[mapKey][snapshotChannel.axisIndex] = channelKey.value;
        keyMap[mapKey]["key_" + snapshotChannel.axisIndex] = channelKey;
      }
    }

    relativeTimes.sort(function (left, right) {
      return left - right;
    });

    for (var timeIndex = 0; timeIndex < relativeTimes.length; timeIndex++) {
      var relativeTime = relativeTimes[timeIndex];
      var entry = keyMap[String(relativeTime)];
      var mergedValue = normalizeVector(currentValue, access.axisCount, 0);

      for (var axisIndex = 0; axisIndex < access.axisCount; axisIndex++) {
        if (entry[axisIndex] !== undefined) {
          mergedValue[axisIndex] = entry[axisIndex] + offsetVector[axisIndex];
        }
      }

      access.combinedProperty.setValueAtTime(
        access.layer.startTime + relativeTime,
        vectorToValue(mergedValue, access.axisCount),
      );
    }

    for (timeIndex = 0; timeIndex < relativeTimes.length; timeIndex++) {
      relativeTime = relativeTimes[timeIndex];
      entry = keyMap[String(relativeTime)];
      var combinedKeyIndex = timeIndex + 1;
      var firstAxisKey = null;
      var inEaseArray = [];
      var outEaseArray = [];

      for (axisIndex = 0; axisIndex < access.axisCount; axisIndex++) {
        var axisKey = entry["key_" + axisIndex];
        if (!axisKey) {
          axisKey = firstAxisKey;
        }
        if (!axisKey) {
          for (
            var fallbackAxis = 0;
            fallbackAxis < access.axisCount;
            fallbackAxis++
          ) {
            axisKey = entry["key_" + fallbackAxis];
            if (axisKey) {
              break;
            }
          }
        }
        if (!axisKey) {
          continue;
        }

        if (!firstAxisKey) {
          firstAxisKey = axisKey;
        }

        var inEase = (axisKey.inTemporalEase && axisKey.inTemporalEase[0]) || {
          speed: 0,
          influence: 33.333,
        };
        var outEase =
          (axisKey.outTemporalEase && axisKey.outTemporalEase[0]) || {
            speed: 0,
            influence: 33.333,
          };
        inEaseArray.push(new KeyframeEase(inEase.speed, inEase.influence));
        outEaseArray.push(new KeyframeEase(outEase.speed, outEase.influence));
      }

      if (!firstAxisKey) {
        continue;
      }

      tryCall(function () {
        access.combinedProperty.setInterpolationTypeAtKey(
          combinedKeyIndex,
          firstAxisKey.inInterpolationType,
          firstAxisKey.outInterpolationType,
        );
      });

      tryCall(function () {
        access.combinedProperty.setTemporalEaseAtKey(
          combinedKeyIndex,
          inEaseArray,
          outEaseArray,
        );
      });

      tryCall(function () {
        access.combinedProperty.setTemporalContinuousAtKey(
          combinedKeyIndex,
          firstAxisKey.temporalContinuous,
        );
      });

      tryCall(function () {
        access.combinedProperty.setTemporalAutoBezierAtKey(
          combinedKeyIndex,
          firstAxisKey.temporalAutoBezier,
        );
      });
    }

    if (relativeTimes.length < 1) {
      setCurrentTargetValue(
        access,
        addValues(snapshot.heldValue, offset, access.axisCount, currentValue),
      );
    }
  }

  function restoreAccess(access, snapshot, offset) {
    if (
      access.mode === "combined" &&
      snapshot.mode === "combined" &&
      access.axisCount === snapshot.axisCount
    ) {
      restoreCombinedSnapshot(access, snapshot, offset);
    } else {
      restoreChannelSnapshot(access, snapshot, offset);
    }

    if (snapshot.mode === "combined" && access.mode === "combined") {
      restorePropertyExpressionState(
        access.combinedProperty,
        snapshot.expressionState,
      );
      return;
    }

    if (access.mode === "channels") {
      for (var i = 0; i < access.channels.length; i++) {
        var accessChannel = access.channels[i];
        var snapshotChannel = findSnapshotChannel(
          snapshot,
          accessChannel.axisIndex,
        );
        if (!snapshotChannel) {
          continue;
        }

        restorePropertyExpressionState(
          accessChannel.property,
          snapshotChannel.expressionState,
        );
      }
    }
  }

  function makeOffsetSnapshot(snapshot, offset) {
    var offsetVector = normalizeVector(offset, snapshot.axisCount, 0);
    var adjustedSnapshot = {
      targetKind: snapshot.targetKind,
      targetLabel: snapshot.targetLabel,
      mode: snapshot.mode,
      axisCount: snapshot.axisCount,
      supportsSpatial: snapshot.supportsSpatial,
      heldValue: addValues(
        snapshot.heldValue,
        offsetVector,
        snapshot.axisCount,
        0,
      ),
      baseValue: addValues(
        snapshot.baseValue,
        offsetVector,
        snapshot.axisCount,
        0,
      ),
      expressionState: snapshot.expressionState,
      combinedKeys: [],
      channelKeys: [],
    };

    for (
      var combinedIndex = 0;
      combinedIndex < snapshot.combinedKeys.length;
      combinedIndex++
    ) {
      var combinedKey = snapshot.combinedKeys[combinedIndex];
      adjustedSnapshot.combinedKeys.push({
        relativeTime: combinedKey.relativeTime,
        value: addValues(
          combinedKey.value,
          offsetVector,
          snapshot.axisCount,
          0,
        ),
        inInterpolationType: combinedKey.inInterpolationType,
        outInterpolationType: combinedKey.outInterpolationType,
        inTemporalEase: cloneEaseArray(combinedKey.inTemporalEase),
        outTemporalEase: cloneEaseArray(combinedKey.outTemporalEase),
        temporalContinuous: combinedKey.temporalContinuous,
        temporalAutoBezier: combinedKey.temporalAutoBezier,
        inSpatialTangent: cloneArray(combinedKey.inSpatialTangent),
        outSpatialTangent: cloneArray(combinedKey.outSpatialTangent),
        spatialContinuous: combinedKey.spatialContinuous,
        spatialAutoBezier: combinedKey.spatialAutoBezier,
        roving: combinedKey.roving,
      });
    }

    for (
      var channelIndex = 0;
      channelIndex < snapshot.channelKeys.length;
      channelIndex++
    ) {
      var sourceChannel = snapshot.channelKeys[channelIndex];
      var adjustedChannel = {
        axisIndex: sourceChannel.axisIndex,
        axisLabel: sourceChannel.axisLabel,
        expressionState: sourceChannel.expressionState,
        keys: [],
      };

      for (var keyIndex = 0; keyIndex < sourceChannel.keys.length; keyIndex++) {
        var sourceKey = sourceChannel.keys[keyIndex];
        adjustedChannel.keys.push({
          relativeTime: sourceKey.relativeTime,
          value: sourceKey.value + offsetVector[sourceChannel.axisIndex],
          inInterpolationType: sourceKey.inInterpolationType,
          outInterpolationType: sourceKey.outInterpolationType,
          inTemporalEase: cloneEaseArray(sourceKey.inTemporalEase),
          outTemporalEase: cloneEaseArray(sourceKey.outTemporalEase),
          temporalContinuous: sourceKey.temporalContinuous,
          temporalAutoBezier: sourceKey.temporalAutoBezier,
        });
      }

      adjustedSnapshot.channelKeys.push(adjustedChannel);
    }

    return adjustedSnapshot;
  }

  function getTargetDisplayName(targetKind) {
    if (targetKind === TARGET_POSITION) {
      return "Position";
    }
    if (targetKind === TARGET_ROTATION) {
      return "Rotation";
    }
    if (targetKind === TARGET_SCALE) {
      return "Scale";
    }
    return targetKind;
  }

  function formatTargetKinds(targetKinds) {
    if (targetKinds.length === 3) {
      return "All";
    }

    var labels = [];
    for (var i = 0; i < TARGET_ORDER.length; i++) {
      for (var j = 0; j < targetKinds.length; j++) {
        if (TARGET_ORDER[i] === targetKinds[j]) {
          labels.push(getTargetDisplayName(targetKinds[j]));
        }
      }
    }

    return labels.join(" + ");
  }

  function classifySelectedProperty(property) {
    if (!property) {
      return null;
    }

    var matchName = property.matchName || "";
    var name = String(property.name || "").toLowerCase();

    if (
      matchName === "ADBE Position" ||
      /^ADBE Position_/.test(matchName) ||
      /position/.test(name)
    ) {
      return TARGET_POSITION;
    }

    if (matchName === "ADBE Scale" || /scale/.test(name)) {
      return TARGET_SCALE;
    }

    if (/^ADBE Rotate/.test(matchName) || /rotation/.test(name)) {
      return TARGET_ROTATION;
    }

    return null;
  }

  function getSelectedTargetKinds(comp) {
    var selectedLayers = getSelectedLayers(comp);
    if (selectedLayers.length < 1) {
      return [];
    }

    var selectedProperties = comp.selectedProperties || [];
    var targetKinds = [];

    for (var i = 0; i < selectedProperties.length; i++) {
      var targetKind = classifySelectedProperty(selectedProperties[i]);
      if (targetKind) {
        pushUnique(targetKinds, targetKind);
      }
    }

    if (targetKinds.length < 1) {
      targetKinds.push(TARGET_POSITION);
    }

    return targetKinds;
  }

  function getOrCreatePausedRecord(comp, layer) {
    var state = getState();
    var record = findPausedRecord(comp, layer);
    if (!record) {
      var layerReference = getLayerReference(layer);
      var key = buildPausedRecordKey(getCompIdentifier(comp), layerReference);
      record = {
        key: key,
        compId: getCompIdentifier(comp),
        compName: comp.name,
        layerId: layerReference.layerId,
        layerName: layerReference.layerName,
        layerIndex: layerReference.layerIndex,
        targets: {},
      };
      state.pausedLayers[key] = record;
    }

    return rekeyPausedRecord(record, comp, layer);
  }

  function getPausedRecord(comp, layer) {
    return findPausedRecord(comp, layer);
  }

  function getPausedTargetKinds(record) {
    var targetKinds = [];
    if (!record) {
      return targetKinds;
    }

    for (var i = 0; i < TARGET_ORDER.length; i++) {
      if (record.targets[TARGET_ORDER[i]]) {
        targetKinds.push(TARGET_ORDER[i]);
      }
    }
    return targetKinds;
  }

  function collectPausedSelectionEntries(comp, layers, logText) {
    var entries = [];

    if (!comp || !layers || layers.length < 1) {
      appendLog(logText, "collectPausedSelectionEntries: no comp or layers.");
      return entries;
    }

    appendLog(
      logText,
      "collectPausedSelectionEntries: scanning " +
        layers.length +
        " selected layer(s): " +
        formatLayerListForLog(layers),
    );

    for (var i = 0; i < layers.length; i++) {
      var selectedLayer = layers[i];
      var record = getPausedRecord(comp, selectedLayer);
      if (!record) {
        appendLog(
          logText,
          "collectPausedSelectionEntries: no paused record for " +
            formatLayerForLog(selectedLayer),
        );
        continue;
      }

      var currentLayer = resolveLayerByIdOrName(
        comp,
        record.layerId,
        record.layerName,
        record.layerIndex,
      );
      if (!currentLayer) {
        appendLog(
          logText,
          "collectPausedSelectionEntries: record found but live layer resolution failed for " +
            formatRecordForLog(record),
        );
        continue;
      }

      appendLog(
        logText,
        "collectPausedSelectionEntries: matched " +
          formatLayerForLog(selectedLayer) +
          " -> " +
          formatRecordForLog(record),
      );

      entries.push({
        selectedLayer: selectedLayer,
        record: rekeyPausedRecord(record, comp, currentLayer),
        currentLayer: currentLayer,
      });
    }

    appendLog(
      logText,
      "collectPausedSelectionEntries: resolved " +
        entries.length +
        " paused entry/entries.",
    );

    return entries;
  }

  function areSelectedTargetsPaused(comp, layers, targetKinds, logText) {
    if (!comp || layers.length < 1 || targetKinds.length < 1) {
      return false;
    }

    var pausedEntries = collectPausedSelectionEntries(comp, layers, logText);
    if (pausedEntries.length !== layers.length) {
      return false;
    }

    for (var i = 0; i < pausedEntries.length; i++) {
      var record = pausedEntries[i].record;
      if (!record) {
        return false;
      }

      for (var j = 0; j < targetKinds.length; j++) {
        if (!record.targets[targetKinds[j]]) {
          return false;
        }
      }
    }

    return true;
  }

  function getPauseSelectionProfile(comp, logText) {
    var layers = getSelectedLayers(comp);
    var targetKinds = getSelectedTargetKinds(comp);
    var pausedEntries = collectPausedSelectionEntries(comp, layers, logText);
    var allPaused =
      comp && layers.length > 0 && targetKinds.length > 0
        ? pausedEntries.length === layers.length
        : false;
    var anyPaused = false;

    if (allPaused || pausedEntries.length > 0) {
      for (var entryIndex = 0; entryIndex < pausedEntries.length; entryIndex++) {
        var record = pausedEntries[entryIndex].record;
        var entryHasAllTargets = true;

        for (var targetIndex = 0; targetIndex < targetKinds.length; targetIndex++) {
          if (record && record.targets[targetKinds[targetIndex]]) {
            anyPaused = true;
          } else {
            entryHasAllTargets = false;
          }
        }

        if (!entryHasAllTargets) {
          allPaused = false;
        }
      }
    }

    return {
      layers: layers,
      targetKinds: targetKinds,
      allPaused: allPaused,
      anyPaused: anyPaused,
    };
  }

  function resolveCompByIdOrName(compId, compName) {
    var project = getProject();
    if (!project) {
      return null;
    }

    var canMatchByName = !hasStableId(compId);
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      if (!(item instanceof CompItem)) {
        continue;
      }

      if (getCompIdentifier(item) === compId) {
        return item;
      }

      if (canMatchByName && item.name === compName) {
        return item;
      }
    }

    return null;
  }

  function resolveLayerByIdOrName(comp, layerId, layerName, layerIndex) {
    return resolveLayerReference(comp, {
      layerId: layerId,
      layerName: layerName,
      layerIndex: layerIndex,
    });
  }

  function pruneEmptyPausedRecords() {
    var pausedLayers = getState().pausedLayers;
    for (var key in pausedLayers) {
      if (!pausedLayers.hasOwnProperty(key)) {
        continue;
      }

      if (getPausedTargetKinds(pausedLayers[key]).length < 1) {
        delete pausedLayers[key];
      }
    }
  }

  function reconcileState() {
    var state = getState();
    var pausedLayers = state.pausedLayers;

    for (var key in pausedLayers) {
      if (!pausedLayers.hasOwnProperty(key)) {
        continue;
      }

      var record = pausedLayers[key];
      var comp = resolveCompByIdOrName(record.compId, record.compName);
      if (!comp) {
        delete pausedLayers[key];
        continue;
      }

      var layer = resolveLayerByIdOrName(
        comp,
        record.layerId,
        record.layerName,
        record.layerIndex,
      );
      if (!layer) {
        delete pausedLayers[key];
        continue;
      }

      rekeyPausedRecord(record, comp, layer);

      for (
        var targetIndex = 0;
        targetIndex < TARGET_ORDER.length;
        targetIndex++
      ) {
        var targetKind = TARGET_ORDER[targetIndex];
        var snapshot = record.targets[targetKind];
        if (!snapshot) {
          continue;
        }

        var access = getTargetAccess(layer, targetKind);
        if (!access) {
          delete record.targets[targetKind];
          continue;
        }

        if (countSnapshotKeys(snapshot) > 0 && countAccessKeys(access) > 0) {
          delete record.targets[targetKind];
          continue;
        }

        if (
          snapshot.mode === "combined" &&
          snapshot.expressionState &&
          snapshot.expressionState.expressionEnabled &&
          access.mode === "combined" &&
          access.combinedProperty.expressionEnabled
        ) {
          delete record.targets[targetKind];
          continue;
        }

        if (access.mode === "channels") {
          for (
            var channelIndex = 0;
            channelIndex < access.channels.length;
            channelIndex++
          ) {
            var accessChannel = access.channels[channelIndex];
            var snapshotChannel = findSnapshotChannel(
              snapshot,
              accessChannel.axisIndex,
            );
            if (
              snapshotChannel &&
              snapshotChannel.expressionState &&
              snapshotChannel.expressionState.expressionEnabled &&
              accessChannel.property.expressionEnabled
            ) {
              delete record.targets[targetKind];
              break;
            }
          }
        }
      }
    }

    if (state.clipboard) {
      var clipboardComp = resolveCompByIdOrName(
        state.clipboard.compId,
        state.clipboard.compName,
      );
      if (!clipboardComp) {
        state.clipboard = null;
      } else {
        var clipboardEntries = getClipboardEntries(state.clipboard);
        var resolvedEntries = [];
        for (
          var clipboardIndex = 0;
          clipboardIndex < clipboardEntries.length;
          clipboardIndex++
        ) {
          var clipboardEntry = clipboardEntries[clipboardIndex];
          var clipboardLayer = resolveLayerByIdOrName(
            clipboardComp,
            clipboardEntry.sourceLayerId,
            clipboardEntry.sourceLayerName,
            clipboardEntry.sourceLayerIndex,
          );
          if (!clipboardLayer) {
            continue;
          }

          clipboardEntry.sourceLayerName = clipboardLayer.name;
          clipboardEntry.sourceLayerIndex = clipboardLayer.index;
          resolvedEntries.push(clipboardEntry);
        }

        if (resolvedEntries.length < 1) {
          state.clipboard = null;
        } else {
          state.clipboard.entries = resolvedEntries;
          state.clipboard.sourceLayerId = resolvedEntries[0].sourceLayerId;
          state.clipboard.sourceLayerName = resolvedEntries[0].sourceLayerName;
          state.clipboard.sourceLayerIndex =
            resolvedEntries[0].sourceLayerIndex;
          state.clipboard.targets = resolvedEntries[0].targets;
          state.clipboard.targetKinds =
            collectClipboardTargetKinds(resolvedEntries);
        }
      }
    }

    pruneEmptyPausedRecords();
  }

  function clearClipboard() {
    getState().clipboard = null;
  }

  function getClipboardTargetKinds(clipboard) {
    if (!clipboard) {
      return [];
    }

    if (clipboard.targetKinds && clipboard.targetKinds.length > 0) {
      return clipboard.targetKinds;
    }

    if (clipboard.snapshot) {
      return [TARGET_POSITION];
    }

    return [];
  }

  function getClipboardEntries(clipboard) {
    if (!clipboard) {
      return [];
    }

    if (clipboard.entries && clipboard.entries.length > 0) {
      return clipboard.entries;
    }

    return [clipboard];
  }

  function getClipboardEntry(clipboard, targetKind) {
    if (!clipboard) {
      return null;
    }

    if (clipboard.targets && clipboard.targets[targetKind]) {
      return clipboard.targets[targetKind];
    }

    if (targetKind === TARGET_POSITION && clipboard.snapshot) {
      return {
        sourceValueAtCopy: cloneArray(clipboard.sourceValueAtCopy),
        snapshot: clipboard.snapshot,
      };
    }

    return null;
  }

  function getClipboardTargetEntry(entry, targetKind) {
    if (!entry) {
      return null;
    }

    if (entry.targets && entry.targets[targetKind]) {
      return entry.targets[targetKind];
    }

    return getClipboardEntry(entry, targetKind);
  }

  function buildClipboardSourceEntry(comp, sourceLayer, targetKinds) {
    var sourceRecord = getPausedRecord(comp, sourceLayer);
    var clipboardTargets = {};
    var copiedTargetKinds = [];

    for (var targetIndex = 0; targetIndex < targetKinds.length; targetIndex++) {
      var targetKind = targetKinds[targetIndex];
      var sourceAccess = getTargetAccess(sourceLayer, targetKind);
      if (!ensureSupportedAccess(sourceAccess)) {
        continue;
      }

      var sourceSnapshot =
        sourceRecord && sourceRecord.targets[targetKind]
          ? sourceRecord.targets[targetKind]
          : null;
      if (!sourceSnapshot) {
        sourceSnapshot = snapshotAccess(sourceAccess, comp.time);
      } else {
        var sourceOffset = calculateOffsetForTarget(
          getCurrentTargetValue(sourceAccess),
          sourceSnapshot.heldValue,
          sourceAccess.axisCount,
        );
        sourceSnapshot = makeOffsetSnapshot(sourceSnapshot, sourceOffset);
      }

      clipboardTargets[targetKind] = {
        sourceValueAtCopy: cloneArray(sourceSnapshot.heldValue),
        snapshot: sourceSnapshot,
      };
      copiedTargetKinds.push(targetKind);
    }

    if (copiedTargetKinds.length < 1) {
      return null;
    }

    return {
      sourceLayerId: getLayerIdentifier(sourceLayer),
      sourceLayerName: sourceLayer.name,
      sourceLayerIndex: sourceLayer.index,
      targetKinds: copiedTargetKinds,
      targets: clipboardTargets,
    };
  }

  function collectClipboardTargetKinds(entries) {
    var targetKinds = [];
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex++) {
      var entryKinds = getClipboardTargetKinds(entries[entryIndex]);
      for (var kindIndex = 0; kindIndex < entryKinds.length; kindIndex++) {
        pushUnique(targetKinds, entryKinds[kindIndex]);
      }
    }
    return targetKinds;
  }

  function buildStatusLines() {
    var state = getState();
    var lines = [];

    for (var key in state.pausedLayers) {
      if (!state.pausedLayers.hasOwnProperty(key)) {
        continue;
      }

      var record = state.pausedLayers[key];
      var pausedKinds = getPausedTargetKinds(record);
      if (pausedKinds.length < 1) {
        continue;
      }

      lines.push(
        "[" +
          record.layerName +
          "] " +
          formatTargetKinds(pausedKinds) +
          " Paused",
      );
    }

    if (state.clipboard) {
      var clipboardEntries = getClipboardEntries(state.clipboard);
      var sourceLabel =
        clipboardEntries.length > 1
          ? clipboardEntries.length + " layers"
          : state.clipboard.sourceLayerName;
      lines.push(
        "[Clipboard] " +
          formatTargetKinds(getClipboardTargetKinds(state.clipboard)) +
          " copied from " +
          sourceLabel,
      );
    }

    if (lines.length > MAX_STATUS_LINES) {
      lines = lines.slice(lines.length - MAX_STATUS_LINES);
    }

    return lines;
  }

  function renderStatus(statusText) {
    statusText.text = buildStatusLines().join("\n");
  }

  function hasAnyPausedTargets() {
    var pausedLayers = getState().pausedLayers;

    for (var key in pausedLayers) {
      if (!pausedLayers.hasOwnProperty(key)) {
        continue;
      }

      if (getPausedTargetKinds(pausedLayers[key]).length > 0) {
        return true;
      }
    }

    return false;
  }

  function buildPauseButtonLabel(comp) {
    var profile = getPauseSelectionProfile(comp);
    return profile.anyPaused ? "Resume" : "Pause";
  }

  function buildCopyButtonLabel(comp) {
    var clipboard = getState().clipboard;
    var clipboardTargetKinds = getClipboardTargetKinds(clipboard);
    if (clipboardTargetKinds.length > 0) {
      return "Paste";
    }

    return "Copy";
  }

  function setLogVisibility(logContainer, logToggleButton, isVisible) {
    logContainer.visible = isVisible;
    logContainer.minimumSize = isVisible ? [220, 110] : [0, 0];
    logContainer.maximumSize = isVisible ? [10000, 10000] : [0, 0];
    logContainer.preferredSize = isVisible ? [220, 180] : [0, 0];
    logToggleButton.text = isVisible ? "v Log" : "> Log";
    logToggleButton.notify("onDraw");
  }

  function refreshUI(pauseResumeButton, copyPasteButton, logText) {
    reconcileState();
    var linkedButtons = pauseResumeButton._linkedButtons || {};
    var comp = getActiveComp();
    var profile = getPauseSelectionProfile(comp);
    var isPaused = profile.anyPaused;
    var hasOpenPause = hasAnyPausedTargets();
    var hasClipboard = getClipboardTargetKinds(getState().clipboard).length > 0;

    pauseResumeButton.text = buildPauseButtonLabel(comp);
    copyPasteButton.text = buildCopyButtonLabel(getActiveComp());

    if (isPaused) {
      setCustomButtonStyle(pauseResumeButton, {
        normalColor: [0.16, 0.4, 0.82],
        hoverColor: [0.22, 0.48, 0.9],
        activeColor: [0.12, 0.32, 0.7],
        showIndicator: true,
        indicatorColor: [0.48, 0.98, 0.82],
      });
    } else {
      setCustomButtonStyle(pauseResumeButton, {
        normalColor: [0.22, 0.22, 0.24],
        hoverColor: [0.28, 0.28, 0.31],
        activeColor: [0.18, 0.18, 0.2],
        showIndicator: false,
      });
    }

    if (linkedButtons.exportControl) {
      setCustomButtonEnabled(linkedButtons.exportControl, !isPaused && !hasClipboard);
    }

    setCustomButtonEnabled(copyPasteButton, !isPaused);
    if (hasClipboard) {
      setCustomButtonStyle(copyPasteButton, {
        normalColor: [0.16, 0.4, 0.82],
        hoverColor: [0.22, 0.48, 0.9],
        activeColor: [0.12, 0.32, 0.7],
        showIndicator: true,
        indicatorColor: [0.48, 0.98, 0.82],
      });
    } else {
      setCustomButtonStyle(copyPasteButton, {
        normalColor: [0.24, 0.21, 0.28],
        hoverColor: [0.3, 0.25, 0.35],
        activeColor: [0.18, 0.16, 0.22],
        showIndicator: false,
      });
    }

    if (linkedButtons.pause) {
      setCustomButtonEnabled(linkedButtons.pause, !hasClipboard);
    }

    if (linkedButtons.refresh) {
      if (hasOpenPause) {
        setCustomButtonStyle(linkedButtons.refresh, {
          normalColor: [0.82, 0.18, 0.16],
          hoverColor: [0.92, 0.24, 0.2],
          activeColor: [0.68, 0.13, 0.12],
        });
      } else {
        setCustomButtonStyle(linkedButtons.refresh, {
          normalColor: [0.22, 0.22, 0.24],
          hoverColor: [0.28, 0.28, 0.31],
          activeColor: [0.18, 0.18, 0.2],
        });
      }
    }

    renderLog(logText);
  }

  function resetPanelState(pauseResumeButton, copyPasteButton, logText) {
    var state = getState();
    state.pausedLayers = {};
    state.clipboard = null;
    clearLog(logText);
    appendLog(
      logText,
      "Reset state: cleared paused layer cache and clipboard.",
    );
    refreshUI(pauseResumeButton, copyPasteButton, logText);
  }

  function pauseSelectedTargets(comp, profile, logText) {
    var state = getState();
    var pausedCount = 0;

    appendLog(
      logText,
      "Pause start: " +
        profile.layers.length +
        " layer(s), targets=" +
        formatTargetKinds(profile.targetKinds),
    );

    for (var layerIndex = 0; layerIndex < profile.layers.length; layerIndex++) {
      var layer = profile.layers[layerIndex];
      var record = getOrCreatePausedRecord(comp, layer);
      appendLog(logText, "Pause layer: " + formatLayerForLog(layer));

      for (
        var targetIndex = 0;
        targetIndex < profile.targetKinds.length;
        targetIndex++
      ) {
        var targetKind = profile.targetKinds[targetIndex];
        if (record.targets[targetKind]) {
          appendLog(
            logText,
            "Pause skip: existing paused snapshot for " +
              targetKind +
              " on " +
              formatLayerForLog(layer),
          );
          continue;
        }

        var access = getTargetAccess(layer, targetKind);
        if (!ensureSupportedAccess(access)) {
          appendLog(
            logText,
            "Pause skip: unsupported access for " +
              targetKind +
              " on " +
              formatLayerForLog(layer),
          );
          continue;
        }

        if (countAccessKeys(access) < 1) {
          appendLog(
            logText,
            "Pause skip: no keys for " +
              targetKind +
              " on " +
              formatLayerForLog(layer),
          );
          continue;
        }

        var snapshot = snapshotAccess(access, comp.time);
        record.targets[targetKind] = snapshot;
        appendLog(
          logText,
          "Pause store: " +
            targetKind +
            " on " +
            formatLayerForLog(layer) +
            ", keys=" +
            countSnapshotKeys(snapshot) +
            ", heldValue=" +
            valueToString(snapshot.heldValue),
        );
        clearAccessKeys(access);
        if (accessHasLiveExpressions(access)) {
          disableAccessExpressions(access);
        }
        trySetCurrentTargetValue(access, snapshot.heldValue);
        pausedCount++;
      }
    }

    clearClipboard();
    pruneEmptyPausedRecords();
    appendLog(
      logText,
      "Pause complete: stored " + pausedCount + " target snapshot(s).",
    );
    return pausedCount;
  }

  function resumeSelectedTargets(comp, profile, logText) {
    var resumedCount = 0;
    var pausedEntries = collectPausedSelectionEntries(
      comp,
      profile.layers,
      logText,
    );

    appendLog(
      logText,
      "Resume start: selected=" +
        profile.layers.length +
        ", resolvedPausedEntries=" +
        pausedEntries.length +
        ", targets=" +
        formatTargetKinds(profile.targetKinds),
    );

    for (var layerIndex = 0; layerIndex < pausedEntries.length; layerIndex++) {
      var resumeEntry = pausedEntries[layerIndex];
      var record = resumeEntry.record;
      var currentLayer = resumeEntry.currentLayer;

      appendLog(
        logText,
        "Resume layer: selected=" +
          formatLayerForLog(resumeEntry.selectedLayer) +
          ", current=" +
          formatLayerForLog(currentLayer) +
          ", record=" +
          formatRecordForLog(record),
      );

      for (
        var targetIndex = 0;
        targetIndex < profile.targetKinds.length;
        targetIndex++
      ) {
        var targetKind = profile.targetKinds[targetIndex];
        var snapshot = record.targets[targetKind];
        if (!snapshot) {
          appendLog(
            logText,
            "Resume skip: no snapshot for " +
              targetKind +
              " on " +
              formatRecordForLog(record),
          );
          continue;
        }

        var access = getTargetAccess(currentLayer, targetKind);
        if (!ensureSupportedAccess(access)) {
          appendLog(
            logText,
            "Resume skip: unsupported access for " +
              targetKind +
              " on " +
              formatLayerForLog(currentLayer),
          );
          continue;
        }

        var offset = calculateOffsetForTarget(
          getCurrentTargetValue(access),
          snapshot.heldValue,
          access.axisCount,
        );

        appendLog(
          logText,
          "Resume restore: " +
            targetKind +
            " on " +
            formatLayerForLog(currentLayer) +
            ", keys=" +
            countSnapshotKeys(snapshot) +
            ", heldValue=" +
            valueToString(snapshot.heldValue) +
            ", currentValue=" +
            valueToString(getCurrentTargetValue(access)) +
            ", offset=" +
            valueToString(offset),
        );

        try {
          restoreAccess(access, snapshot, offset);
          delete record.targets[targetKind];
          resumedCount++;
          appendLog(
            logText,
            "Resume success: restored " +
              targetKind +
              " on " +
              formatLayerForLog(currentLayer),
          );
        } catch (error) {
          appendLog(
            logText,
            "Resume error: " +
              targetKind +
              " on " +
              formatLayerForLog(currentLayer) +
              " failed with " +
              error.toString(),
          );
        }
      }
    }

    clearClipboard();
    pruneEmptyPausedRecords();
    appendLog(
      logText,
      "Resume complete: restored " + resumedCount + " target snapshot(s).",
    );
    return resumedCount;
  }

  function runPauseResume(pauseResumeButton, copyPasteButton, logText) {
    var comp = getActiveComp();
    var profile = getPauseSelectionProfile(comp, logText);

    appendLog(
      logText,
      "Pause/Resume button: comp=" +
        (comp ? comp.name : "<none>") +
        ", selectedLayers=" +
        profile.layers.length +
        ", targets=" +
        formatTargetKinds(profile.targetKinds) +
        ", allPaused=" +
        profile.allPaused,
    );

    if (!comp || profile.layers.length < 1 || profile.targetKinds.length < 1) {
      appendLog(
        logText,
        "Pause/Resume aborted: no active comp, layers, or targets.",
      );
      refreshUI(pauseResumeButton, copyPasteButton, logText);
      return;
    }

    if (profile.anyPaused) {
      app.beginUndoGroup("Resume Transform Keys");
      try {
        resumeSelectedTargets(comp, profile, logText);
      } catch (error) {
        appendLog(logText, "Resume threw: " + error.toString());
      }
      app.endUndoGroup();
    } else {
      app.beginUndoGroup("Pause Transform Keys");
      try {
        pauseSelectedTargets(comp, profile, logText);
      } catch (error) {
        appendLog(logText, "Pause threw: " + error.toString());
      }
      app.endUndoGroup();
    }

    refreshUI(pauseResumeButton, copyPasteButton, logText);
  }

  function findLayerByName(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === layerName) {
        return comp.layer(i);
      }
    }
    return null;
  }

  function nextControllerName(comp, baseName) {
    var candidate = baseName + CONTROLLER_SUFFIX;
    var suffix = 1;

    while (findLayerByName(comp, candidate)) {
      suffix++;
      candidate = baseName + CONTROLLER_SUFFIX + "_" + suffix;
    }

    return candidate;
  }

  function runExportToNull(pauseResumeButton, copyPasteButton, logText) {
    var comp = getActiveComp();
    var selectedLayers = getSelectedLayers(comp);
    var state = getState();

    if (!comp || selectedLayers.length < 1) {
      appendLog(logText, "Export aborted: no active comp or selected layers.");
      refreshUI(pauseResumeButton, copyPasteButton, logText);
      return;
    }

    app.beginUndoGroup("Export Position To Null");
    try {
      for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        var pausedRecord = getPausedRecord(comp, layer);
        var positionSnapshot =
          pausedRecord && pausedRecord.targets[TARGET_POSITION]
            ? pausedRecord.targets[TARGET_POSITION]
            : null;
        var positionAccess = getPositionAccess(layer);
        if (!ensureSupportedAccess(positionAccess)) {
          continue;
        }

        if (!positionSnapshot) {
          if (countAccessKeys(positionAccess) < 1) {
            continue;
          }
          positionSnapshot = snapshotAccess(positionAccess, comp.time);
        }

        var originalParent = layer.parent;
        var controller = comp.layers.addNull();
        controller.name = nextControllerName(comp, layer.name);
        controller.threeDLayer = layer.threeDLayer;
        controller.inPoint = layer.inPoint;
        controller.outPoint = layer.outPoint;
        controller.startTime = layer.startTime;
        controller.enabled = true;
        controller.shy = false;

        if (originalParent) {
          controller.parent = originalParent;
        }

        tryCall(function () {
          controller.label = layer.label;
        });

        var controllerAccess = getPositionAccess(controller);
        var exportOffset = zeroVector(controllerAccess.axisCount);
        if (pausedRecord && pausedRecord.targets[TARGET_POSITION]) {
          exportOffset = calculateOffsetForTarget(
            getCurrentTargetValue(positionAccess),
            positionSnapshot.heldValue,
            controllerAccess.axisCount,
          );
          delete pausedRecord.targets[TARGET_POSITION];
        }

        restoreAccess(controllerAccess, positionSnapshot, exportOffset);
        layer.parent = controller;
        if (!accessHasLiveExpressions(positionAccess)) {
          trySetCurrentTargetValue(
            positionAccess,
            zeroVector(positionAccess.axisCount),
          );
        }

        tryCall(function () {
          controller.moveBefore(layer);
        });
      }
    } catch (error) {
      appendLog(logText, "Export threw: " + error.toString());
    }
    app.endUndoGroup();

    clearClipboard();
    pruneEmptyPausedRecords();
    refreshUI(pauseResumeButton, copyPasteButton, logText);
  }

  function runCopyPaste(pauseResumeButton, copyPasteButton, logText) {
    var comp = getActiveComp();
    var selectedLayers = getSelectedLayers(comp);
    var state = getState();
    var keyboard = ScriptUI.environment.keyboardState;
    var forceCopy = keyboard && keyboard.altKey;
    var targetKinds = getSelectedTargetKinds(comp);

    if (!comp || selectedLayers.length < 1) {
      appendLog(
        logText,
        "Copy/Paste aborted: no active comp or selected layers.",
      );
      refreshUI(pauseResumeButton, copyPasteButton, logText);
      return;
    }

    if (!state.clipboard || forceCopy) {
      var clipboardEntries = [];
      for (var sourceIndex = 0; sourceIndex < selectedLayers.length; sourceIndex++) {
        var sourceLayer = selectedLayers[sourceIndex];
        var sourceEntry = buildClipboardSourceEntry(
          comp,
          sourceLayer,
          targetKinds,
        );
        if (sourceEntry) {
          clipboardEntries.push(sourceEntry);
        }
      }

      if (clipboardEntries.length < 1) {
        appendLog(logText, "Copy aborted: no eligible targets found.");
        refreshUI(pauseResumeButton, copyPasteButton, logText);
        return;
      }

      var copiedTargetKinds = collectClipboardTargetKinds(clipboardEntries);
      var firstEntry = clipboardEntries[0];
      state.clipboard = {
        compId: getCompIdentifier(comp),
        compName: comp.name,
        sourceLayerId: firstEntry.sourceLayerId,
        sourceLayerName: firstEntry.sourceLayerName,
        sourceLayerIndex: firstEntry.sourceLayerIndex,
        targetKinds: copiedTargetKinds,
        targets: firstEntry.targets,
        entries: clipboardEntries,
      };

      appendLog(
        logText,
        "Copy stored: " +
          clipboardEntries.length +
          " source layer(s)" +
          ", targets=" +
          formatTargetKinds(copiedTargetKinds),
      );
      refreshUI(pauseResumeButton, copyPasteButton, logText);
      return;
    }

    app.beginUndoGroup("Paste Transform Keys");
    try {
      var sourceEntries = getClipboardEntries(state.clipboard);
      for (var i = 0; i < selectedLayers.length; i++) {
        var targetLayer = selectedLayers[i];
        var sourceEntry =
          sourceEntries.length === selectedLayers.length
            ? sourceEntries[i]
            : sourceEntries[0];
        if (!sourceEntry) {
          continue;
        }

        if (getLayerIdentifier(targetLayer) === sourceEntry.sourceLayerId) {
          continue;
        }

        var clipboardTargetKinds = getClipboardTargetKinds(sourceEntry);
        for (
          var clipboardIndex = 0;
          clipboardIndex < clipboardTargetKinds.length;
          clipboardIndex++
        ) {
          var clipboardKind = clipboardTargetKinds[clipboardIndex];
          var clipboardEntry = getClipboardTargetEntry(
            sourceEntry,
            clipboardKind,
          );
          if (!clipboardEntry) {
            continue;
          }

          var targetAccess = getTargetAccess(targetLayer, clipboardKind);
          if (!ensureSupportedAccess(targetAccess)) {
            continue;
          }

          var pasteOffset = calculateOffsetForTarget(
            getCurrentTargetValue(targetAccess),
            clipboardEntry.sourceValueAtCopy,
            targetAccess.axisCount,
          );
          restoreAccess(targetAccess, clipboardEntry.snapshot, pasteOffset);
        }
      }
    } catch (error) {
      appendLog(logText, "Paste threw: " + error.toString());
    }
    app.endUndoGroup();

    clearClipboard();
    refreshUI(pauseResumeButton, copyPasteButton, logText);
  }

  function layoutControls(host, controls) {
    var minButtonHeight = 24;
    var width = host.size.width;
    var height = host.size.height;
    var padding = Math.max(6, Math.min(10, Math.round(height * 0.06)));
    var gap = Math.max(4, Math.min(8, Math.round(height * 0.045)));
    var usableWidth = Math.max(140, width - padding * 2);
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

    var leftWidth = Math.max(70, Math.round((usableWidth - gap) * 0.5));
    var x = padding;
    var y = padding;

    controls.surface.bounds = [0, 0, width, height];
    controls.pause.bounds = [x, y, x + usableWidth, y + topHeight];
    y += topHeight + gap;
    controls.exportControl.bounds = [x, y, x + leftWidth, y + middleHeight];
    controls.copy.bounds = [
      x + leftWidth + gap,
      y,
      x + usableWidth,
      y + middleHeight,
    ];
    y += middleHeight + gap;
    controls.refresh.bounds = [x, y, x + usableWidth, y + bottomHeight];
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
    cluster.minimumSize = [220, 110];
    cluster.layout = null;

    var logToggleButton = addCustomButton(
      panel,
      "> Log",
      function () {
        var nextVisible = !logContainer.visible;
        setLogVisibility(logContainer, logToggleButton, nextVisible);
        panel.layout.layout(true);
        panel._layoutControls();
      },
      {
        normalColor: [0.16, 0.16, 0.18],
        hoverColor: [0.22, 0.22, 0.25],
        activeColor: [0.12, 0.12, 0.14],
      },
    );
    logToggleButton.alignment = ["fill", "top"];
    logToggleButton.minimumSize.height = 24;
    logToggleButton.visible = false;
    logToggleButton.minimumSize = [0, 0];
    logToggleButton.maximumSize = [0, 0];
    logToggleButton.preferredSize = [0, 0];

    var logContainer = panel.add("group");
    logContainer.orientation = "column";
    logContainer.alignChildren = ["fill", "fill"];
    logContainer.alignment = ["fill", "fill"];

    var logText = logContainer.add("edittext", undefined, "", {
      multiline: true,
      readonly: true,
      scrolling: true,
    });
    logText.alignment = ["fill", "fill"];
    logText.minimumSize = [220, 180];
    logText.preferredSize.height = 220;

    var controlSurface = addControlSurface(cluster);

    var pauseResumeButton = addCustomButton(
      cluster,
      "Pause Position",
      function () {
        runPauseResume(pauseResumeButton, copyPasteButton, logText);
      },
    );
    var exportButton = addCustomButton(
      cluster,
      "Export To Null",
      function () {
        runExportToNull(pauseResumeButton, copyPasteButton, logText);
      },
      {
        normalColor: [0.2, 0.24, 0.28],
        hoverColor: [0.24, 0.3, 0.35],
        activeColor: [0.16, 0.2, 0.24],
      },
    );
    var copyPasteButton = addCustomButton(
      cluster,
      "Copy Position Keys",
      function () {
        runCopyPaste(pauseResumeButton, copyPasteButton, logText);
      },
      {
        normalColor: [0.24, 0.21, 0.28],
        hoverColor: [0.3, 0.25, 0.35],
        activeColor: [0.18, 0.16, 0.22],
      },
    );
    var refreshButton = addCustomButton(
      cluster,
      "Reset State",
      function () {
        resetPanelState(pauseResumeButton, copyPasteButton, logText);
      },
      {
        normalColor: [0.3, 0.22, 0.18],
        hoverColor: [0.38, 0.27, 0.21],
        activeColor: [0.24, 0.18, 0.14],
      },
    );

    var controls = {
      surface: controlSurface,
      pause: pauseResumeButton,
      exportControl: exportButton,
      copy: copyPasteButton,
      refresh: refreshButton,
    };

    pauseResumeButton._linkedButtons = {
      pause: pauseResumeButton,
      exportControl: exportButton,
      refresh: refreshButton,
      logToggle: logToggleButton,
      logContainer: logContainer,
    };

    setLogVisibility(logContainer, logToggleButton, false);

    panel.onShow = function () {
      appendLog(logText, "Panel shown.");
      refreshUI(pauseResumeButton, copyPasteButton, logText);
      this._layoutControls();
    };

    panel.onActivate = function () {
      refreshUI(pauseResumeButton, copyPasteButton, logText);
    };

    panel._layoutControls = function () {
      layoutControls(cluster, controls);
    };

    panel.onResizing = panel.onResize = function () {
      this.layout.resize();
      this._layoutControls();
    };

    appendLog(logText, "Panel ready.");
    refreshUI(pauseResumeButton, copyPasteButton, logText);

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
