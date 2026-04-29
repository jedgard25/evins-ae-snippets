/*
  Position Pause Panel

  Dockable ScriptUI panel for temporarily removing position keyframes, moving
  layers freely, then restoring the animation with an equal offset.

  Features:
  - Pause / Resume position keyframes for one or more layers.
  - Export layer position animation to a controller null.
  - Copy / Paste position animation with offset-aware pasting.
*/

(function positionPausePanel(thisObj) {
  var PANEL_TITLE = "Position Pause";
  var MAX_LOG_LINES = 120;
  var CONTROLLER_SUFFIX = "_POS_CTRL";
  var GLOBAL_STATE_KEY = "__positionPausePanelState__";
  var AXIS_LABELS = ["X", "Y", "Z"];

  function getState() {
    if (!$.global[GLOBAL_STATE_KEY]) {
      $.global[GLOBAL_STATE_KEY] = {
        pausedLayers: {},
        clipboard: null,
      };
    }

    return $.global[GLOBAL_STATE_KEY];
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
      "Pause stores position keys in panel memory, Resume restores them after you move the layer. Copy/Paste and Export use the same snapshot data.",
      { multiline: true },
    );
    helpText.alignment = ["fill", "top"];

    var pauseResumeButton = panel.add("button", undefined, "Pause Position");
    var exportButton = panel.add("button", undefined, "Export To Null");
    var copyPasteButton = panel.add("button", undefined, "Copy Position Keys");
    var clearLogButton = panel.add("button", undefined, "Clear Log");

    var statusText = panel.add("edittext", undefined, "", {
      multiline: true,
      readonly: true,
    });
    statusText.alignment = ["fill", "top"];
    statusText.minimumSize.height = 220;
    statusText.preferredSize.height = 220;

    pauseResumeButton.helpTip =
      "If every selected layer is already paused, this resumes them. Otherwise it pauses any eligible selected layers.";
    exportButton.helpTip =
      "Creates one controller null per selected layer and moves that layer's position animation onto the null.";
    copyPasteButton.helpTip =
      "Copies from one selected layer when the clipboard is empty. When the clipboard exists, click to paste to the current selection. Option-click with one selected layer to overwrite the clipboard.";

    clearLogButton.onClick = function () {
      statusText.text = "";
      appendLog(statusText, "Log cleared.");
      refreshButtonLabels(pauseResumeButton, copyPasteButton);
    };

    pauseResumeButton.onClick = function () {
      runPauseResume(statusText);
      refreshButtonLabels(pauseResumeButton, copyPasteButton);
    };

    exportButton.onClick = function () {
      runExportToNull(statusText);
      refreshButtonLabels(pauseResumeButton, copyPasteButton);
    };

    copyPasteButton.onClick = function () {
      runCopyPaste(statusText);
      refreshButtonLabels(pauseResumeButton, copyPasteButton);
    };

    panel.onShow = function () {
      refreshButtonLabels(pauseResumeButton, copyPasteButton);
    };

    panel.onActivate = function () {
      refreshButtonLabels(pauseResumeButton, copyPasteButton);
    };

    panel.onResizing = panel.onResize = function () {
      this.layout.resize();
    };

    appendLog(statusText, "Ready.");
    refreshButtonLabels(pauseResumeButton, copyPasteButton);

    return panel;
  }

  function getActiveComp() {
    var item = app.project && app.project.activeItem;
    if (item && item instanceof CompItem) {
      return item;
    }
    return null;
  }

  function getSelectedLayers(comp) {
    if (!comp) {
      return [];
    }
    return comp.selectedLayers || [];
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

  function roundNumber(value) {
    return Math.round(value * 10000) / 10000;
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
    var output = [];
    for (var i = 0; i < axisCount; i++) {
      output[i] = 0;
    }
    return vectorToValue(output, axisCount);
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
    var combinedProperty = getLayerPositionProperty(layer);
    if (!transformGroup || !combinedProperty) {
      return null;
    }

    var access = {
      layer: layer,
      transformGroup: transformGroup,
      combinedProperty: combinedProperty,
      dimensionsSeparated: combinedProperty.dimensionsSeparated,
      channels: [],
      axisCount: 0,
    };

    if (access.dimensionsSeparated) {
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
      access.axisCount = getValueLength(combinedProperty.value);
    }

    return access;
  }

  function getCurrentPositionValue(access) {
    if (access.dimensionsSeparated) {
      var separatedValue = [];
      for (var i = 0; i < access.channels.length; i++) {
        separatedValue[access.channels[i].axisIndex] =
          access.channels[i].property.value;
      }
      return separatedValue;
    }

    return cloneArray(access.combinedProperty.value);
  }

  function getValueAtTime(access, time) {
    if (access.dimensionsSeparated) {
      var separatedValue = [];
      for (var i = 0; i < access.channels.length; i++) {
        separatedValue[access.channels[i].axisIndex] = access.channels[
          i
        ].property.valueAtTime(time, false);
      }
      return separatedValue;
    }

    return cloneArray(access.combinedProperty.valueAtTime(time, false));
  }

  function getLayerIdentifier(layer) {
    try {
      if (layer.id !== undefined && layer.id !== null) {
        return "id:" + layer.id;
      }
    } catch (error) {}

    return "name:" + layer.name + "|index:" + layer.index;
  }

  function getLayerStateKey(comp, layer) {
    var compKey = "comp:";

    try {
      if (comp && comp.id !== undefined && comp.id !== null) {
        compKey += comp.id;
      } else {
        compKey += comp.name;
      }
    } catch (error) {
      compKey += comp ? comp.name : "unknown";
    }

    return compKey + "::" + getLayerIdentifier(layer);
  }

  function resolveLayerFromSnapshot(comp, snapshot) {
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (getLayerIdentifier(layer) === snapshot.layerId) {
        return layer;
      }
    }

    for (var j = 1; j <= comp.numLayers; j++) {
      var fallbackLayer = comp.layer(j);
      if (fallbackLayer.name === snapshot.layerName) {
        return fallbackLayer;
      }
    }

    return null;
  }

  function ensureSupportedPositionAccess(
    layer,
    access,
    logField,
    contextLabel,
  ) {
    if (!access) {
      appendLog(
        logField,
        contextLabel + " FAIL - '" + layer.name + "' has no position property.",
      );
      return false;
    }

    if (
      access.combinedProperty.expressionEnabled &&
      access.combinedProperty.expression !== ""
    ) {
      appendLog(
        logField,
        contextLabel +
          " SKIP - '" +
          layer.name +
          "' has a live Position expression. Disable it or bake it first.",
      );
      return false;
    }

    for (var i = 0; i < access.channels.length; i++) {
      if (
        access.channels[i].property.expressionEnabled &&
        access.channels[i].property.expression !== ""
      ) {
        appendLog(
          logField,
          contextLabel +
            " SKIP - '" +
            layer.name +
            "' has a live " +
            access.channels[i].axisLabel +
            " Position expression.",
        );
        return false;
      }
    }

    return true;
  }

  function removeAllKeys(property) {
    for (var keyIndex = property.numKeys; keyIndex >= 1; keyIndex--) {
      property.removeKey(keyIndex);
    }
  }

  function clearPositionKeys(access) {
    if (access.dimensionsSeparated) {
      for (var i = 0; i < access.channels.length; i++) {
        removeAllKeys(access.channels[i].property);
      }
      return;
    }

    removeAllKeys(access.combinedProperty);
  }

  function setCurrentPositionValue(access, value) {
    var normalized = normalizeVector(
      value,
      access.axisCount,
      getCurrentPositionValue(access),
    );

    if (access.dimensionsSeparated) {
      for (var i = 0; i < access.channels.length; i++) {
        access.channels[i].property.setValue(
          normalized[access.channels[i].axisIndex],
        );
      }
      return;
    }

    access.combinedProperty.setValue(
      vectorToValue(normalized, access.axisCount),
    );
  }

  function countAccessKeys(access) {
    if (access.dimensionsSeparated) {
      var count = 0;
      for (var i = 0; i < access.channels.length; i++) {
        count += access.channels[i].property.numKeys;
      }
      return count;
    }

    return access.combinedProperty.numKeys;
  }

  function countSnapshotKeys(snapshot) {
    var count = snapshot.combinedKeys.length;
    for (var i = 0; i < snapshot.channelKeys.length; i++) {
      count += snapshot.channelKeys[i].keys.length;
    }
    return count;
  }

  function findSnapshotChannel(snapshot, axisIndex) {
    for (var i = 0; i < snapshot.channelKeys.length; i++) {
      if (snapshot.channelKeys[i].axisIndex === axisIndex) {
        return snapshot.channelKeys[i];
      }
    }
    return null;
  }

  function snapshotPositionAnimation(layer, compTime, logField, contextLabel) {
    var access = getPositionAccess(layer);
    if (!ensureSupportedPositionAccess(layer, access, logField, contextLabel)) {
      return null;
    }

    var snapshot = {
      layerName: layer.name,
      layerId: getLayerIdentifier(layer),
      layerStartTime: layer.startTime,
      dimensionsSeparated: access.dimensionsSeparated,
      dimension: access.axisCount,
      pausedTime: compTime,
      pausedValue: cloneArray(getValueAtTime(access, compTime)),
      baseValue: cloneArray(getCurrentPositionValue(access)),
      hadKeys: countAccessKeys(access) > 0,
      combinedKeys: [],
      channelKeys: [],
    };

    appendLog(
      logField,
      contextLabel +
        " Snapshot '" +
        layer.name +
        "' at t=" +
        roundNumber(compTime) +
        " with " +
        countAccessKeys(access) +
        " key(s), mode=" +
        (access.dimensionsSeparated ? "separated" : "combined") +
        ".",
    );

    if (access.dimensionsSeparated) {
      for (
        var channelIndex = 0;
        channelIndex < access.channels.length;
        channelIndex++
      ) {
        var targetChannel = access.channels[channelIndex];
        var channelSnapshot = {
          axisIndex: targetChannel.axisIndex,
          axisLabel: targetChannel.axisLabel,
          keys: [],
        };

        for (
          var keyIndex = 1;
          keyIndex <= targetChannel.property.numKeys;
          keyIndex++
        ) {
          channelSnapshot.keys.push({
            relativeTime: roundNumber(
              targetChannel.property.keyTime(keyIndex) - layer.startTime,
            ),
            value: targetChannel.property.keyValue(keyIndex),
            inInterpolationType:
              targetChannel.property.keyInInterpolationType(keyIndex),
            outInterpolationType:
              targetChannel.property.keyOutInterpolationType(keyIndex),
            inTemporalEase: cloneEaseArray(
              targetChannel.property.keyInTemporalEase(keyIndex),
            ),
            outTemporalEase: cloneEaseArray(
              targetChannel.property.keyOutTemporalEase(keyIndex),
            ),
            temporalContinuous:
              targetChannel.property.keyTemporalContinuous(keyIndex),
            temporalAutoBezier:
              targetChannel.property.keyTemporalAutoBezier(keyIndex),
          });
        }

        snapshot.channelKeys.push(channelSnapshot);
      }

      return snapshot;
    }

    for (var axisIndex = 0; axisIndex < access.axisCount; axisIndex++) {
      snapshot.channelKeys.push({
        axisIndex: axisIndex,
        axisLabel: AXIS_LABELS[axisIndex],
        keys: [],
      });
    }

    for (
      var combinedKeyIndex = 1;
      combinedKeyIndex <= access.combinedProperty.numKeys;
      combinedKeyIndex++
    ) {
      var relativeTime = roundNumber(
        access.combinedProperty.keyTime(combinedKeyIndex) - layer.startTime,
      );
      var keyValue = cloneArray(
        access.combinedProperty.keyValue(combinedKeyIndex),
      );
      var inEase = access.combinedProperty.keyInTemporalEase(combinedKeyIndex);
      var outEase =
        access.combinedProperty.keyOutTemporalEase(combinedKeyIndex);
      var combinedKey = {
        relativeTime: relativeTime,
        value: keyValue,
        inInterpolationType:
          access.combinedProperty.keyInInterpolationType(combinedKeyIndex),
        outInterpolationType:
          access.combinedProperty.keyOutInterpolationType(combinedKeyIndex),
        inTemporalEase: cloneEaseArray(inEase),
        outTemporalEase: cloneEaseArray(outEase),
        temporalContinuous:
          access.combinedProperty.keyTemporalContinuous(combinedKeyIndex),
        temporalAutoBezier:
          access.combinedProperty.keyTemporalAutoBezier(combinedKeyIndex),
      };

      if (access.combinedProperty.isSpatial) {
        combinedKey.inSpatialTangent = cloneArray(
          access.combinedProperty.keyInSpatialTangent(combinedKeyIndex),
        );
        combinedKey.outSpatialTangent = cloneArray(
          access.combinedProperty.keyOutSpatialTangent(combinedKeyIndex),
        );
        combinedKey.spatialContinuous =
          access.combinedProperty.keySpatialContinuous(combinedKeyIndex);
        combinedKey.spatialAutoBezier =
          access.combinedProperty.keySpatialAutoBezier(combinedKeyIndex);
        combinedKey.roving = tryCall(function () {
          combinedKey._roving =
            access.combinedProperty.keyRoving(combinedKeyIndex);
        })
          ? combinedKey._roving
          : false;
        delete combinedKey._roving;
      }

      snapshot.combinedKeys.push(combinedKey);

      for (axisIndex = 0; axisIndex < access.axisCount; axisIndex++) {
        snapshot.channelKeys[axisIndex].keys.push({
          relativeTime: relativeTime,
          value: keyValue[axisIndex],
          inInterpolationType: combinedKey.inInterpolationType,
          outInterpolationType: combinedKey.outInterpolationType,
          inTemporalEase: cloneEaseArray([
            inEase[Math.min(axisIndex, inEase.length - 1)],
          ]),
          outTemporalEase: cloneEaseArray([
            outEase[Math.min(axisIndex, outEase.length - 1)],
          ]),
          temporalContinuous: combinedKey.temporalContinuous,
          temporalAutoBezier: combinedKey.temporalAutoBezier,
        });
      }
    }

    return snapshot;
  }

  function restoreCombinedSnapshot(
    access,
    snapshot,
    offset,
    logField,
    contextLabel,
  ) {
    appendLog(
      logField,
      contextLabel +
        " Restoring combined mode with " +
        snapshot.combinedKeys.length +
        " key(s), layerStart=" +
        roundNumber(access.layer.startTime) +
        ", offset=" +
        valueToString(offset) +
        ".",
    );

    clearPositionKeys(access);

    if (snapshot.combinedKeys.length < 1) {
      setCurrentPositionValue(
        access,
        addValues(
          snapshot.pausedValue,
          offset,
          access.axisCount,
          getCurrentPositionValue(access),
        ),
      );
      return;
    }

    var currentValue = getCurrentPositionValue(access);
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

      if (access.combinedProperty.isSpatial) {
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

  function restoreSeparatedSnapshot(
    access,
    snapshot,
    offset,
    logField,
    contextLabel,
  ) {
    appendLog(
      logField,
      contextLabel +
        " Restoring per-axis mode with " +
        countSnapshotKeys(snapshot) +
        " stored axis key(s), layerStart=" +
        roundNumber(access.layer.startTime) +
        ", offset=" +
        valueToString(offset) +
        ".",
    );

    var offsetVector = normalizeVector(offset, access.axisCount, 0);
    var currentValue = getCurrentPositionValue(access);

    if (access.dimensionsSeparated) {
      clearPositionKeys(access);

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

    clearPositionKeys(access);

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

    if (relativeTimes.length < 1) {
      setCurrentPositionValue(
        access,
        addValues(snapshot.pausedValue, offset, access.axisCount, currentValue),
      );
    }

    appendLog(
      logField,
      contextLabel +
        " NOTE - Restored through per-axis fallback. If the source was split dimensions, AE cannot reconstruct spatial paths on combined Position.",
    );
  }

  function restorePositionAnimation(
    access,
    snapshot,
    offset,
    logField,
    contextLabel,
  ) {
    if (
      !ensureSupportedPositionAccess(
        access.layer,
        access,
        logField,
        contextLabel,
      )
    ) {
      return;
    }

    if (
      !access.dimensionsSeparated &&
      !snapshot.dimensionsSeparated &&
      access.axisCount === snapshot.dimension &&
      snapshot.combinedKeys.length > 0
    ) {
      restoreCombinedSnapshot(access, snapshot, offset, logField, contextLabel);
      return;
    }

    if (access.axisCount !== snapshot.dimension) {
      appendLog(
        logField,
        contextLabel +
          " NOTE - Source dimension=" +
          snapshot.dimension +
          ", target dimension=" +
          access.axisCount +
          ". Missing axes stay at the target value, extra source axes are dropped.",
      );
    }

    restoreSeparatedSnapshot(access, snapshot, offset, logField, contextLabel);
  }

  function makeOffsetSnapshot(snapshot, offset) {
    var offsetVector = normalizeVector(offset, snapshot.dimension, 0);
    var adjustedSnapshot = {
      layerName: snapshot.layerName,
      layerId: snapshot.layerId,
      layerStartTime: snapshot.layerStartTime,
      dimensionsSeparated: snapshot.dimensionsSeparated,
      dimension: snapshot.dimension,
      pausedTime: snapshot.pausedTime,
      pausedValue: addValues(
        snapshot.pausedValue,
        offsetVector,
        snapshot.dimension,
        0,
      ),
      baseValue: addValues(
        snapshot.baseValue,
        offsetVector,
        snapshot.dimension,
        0,
      ),
      hadKeys: snapshot.hadKeys,
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
          snapshot.dimension,
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

  function areAllSelectedLayersPaused(comp, layers) {
    if (!comp || !layers || layers.length < 1) {
      return false;
    }

    var pausedLayers = getState().pausedLayers;
    var eligibleCount = 0;

    for (var i = 0; i < layers.length; i++) {
      if (pausedLayers[getLayerStateKey(comp, layers[i])]) {
        eligibleCount++;
      }
    }

    return eligibleCount === layers.length;
  }

  function refreshButtonLabels(pauseResumeButton, copyPasteButton) {
    var comp = getActiveComp();
    var layers = getSelectedLayers(comp);
    var state = getState();
    var shouldResume = areAllSelectedLayersPaused(comp, layers);

    if (pauseResumeButton) {
      pauseResumeButton.text = shouldResume
        ? "Resume Position"
        : "Pause Position";
    }

    if (copyPasteButton) {
      copyPasteButton.text = state.clipboard
        ? "Paste Position Keys"
        : "Copy Position Keys";
    }
  }

  function runPauseResume(logField) {
    var comp = getActiveComp();
    var selectedLayers = getSelectedLayers(comp);
    var state = getState();

    if (!comp) {
      appendLog(logField, "Open a composition first.");
      return;
    }

    if (selectedLayers.length < 1) {
      appendLog(logField, "Select at least one layer.");
      return;
    }

    if (areAllSelectedLayersPaused(comp, selectedLayers)) {
      app.beginUndoGroup("Resume Position Keyframes");
      try {
        var resumedCount = 0;
        for (var i = 0; i < selectedLayers.length; i++) {
          var selectedLayer = selectedLayers[i];
          var stateKey = getLayerStateKey(comp, selectedLayer);
          var snapshot = state.pausedLayers[stateKey];
          if (!snapshot) {
            appendLog(
              logField,
              "Resume SKIP - No paused snapshot for '" +
                selectedLayer.name +
                "'.",
            );
            continue;
          }

          var currentLayer = resolveLayerFromSnapshot(comp, snapshot);
          if (!currentLayer) {
            appendLog(
              logField,
              "Resume FAIL - Could not resolve layer '" +
                snapshot.layerName +
                "'.",
            );
            continue;
          }

          var positionAccess = getPositionAccess(currentLayer);
          if (
            !ensureSupportedPositionAccess(
              currentLayer,
              positionAccess,
              logField,
              "Resume",
            )
          ) {
            continue;
          }

          var currentValue = getCurrentPositionValue(positionAccess);
          var offset = calculateOffsetForTarget(
            currentValue,
            snapshot.pausedValue,
            positionAccess.axisCount,
          );

          appendLog(
            logField,
            "Resume Layer '" +
              currentLayer.name +
              "' pausedValue=" +
              valueToString(snapshot.pausedValue) +
              " currentValue=" +
              valueToString(currentValue) +
              " offset=" +
              valueToString(offset) +
              ".",
          );

          restorePositionAnimation(
            positionAccess,
            snapshot,
            offset,
            logField,
            "Resume",
          );
          delete state.pausedLayers[stateKey];
          resumedCount++;
        }

        appendLog(
          logField,
          "Resume complete. Restored " + resumedCount + " layer(s).",
        );
      } catch (error) {
        appendLog(logField, "Resume FAIL - " + error.toString());
      }
      app.endUndoGroup();
      return;
    }

    app.beginUndoGroup("Pause Position Keyframes");
    try {
      var pausedCount = 0;
      for (
        var layerIndex = 0;
        layerIndex < selectedLayers.length;
        layerIndex++
      ) {
        var layer = selectedLayers[layerIndex];
        var positionAccess = getPositionAccess(layer);
        if (
          !ensureSupportedPositionAccess(
            layer,
            positionAccess,
            logField,
            "Pause",
          )
        ) {
          continue;
        }

        if (countAccessKeys(positionAccess) < 1) {
          appendLog(
            logField,
            "Pause SKIP - '" + layer.name + "' has no position keys.",
          );
          continue;
        }

        var snapshot = snapshotPositionAnimation(
          layer,
          comp.time,
          logField,
          "Pause",
        );
        if (!snapshot) {
          continue;
        }

        state.pausedLayers[getLayerStateKey(comp, layer)] = snapshot;

        appendLog(
          logField,
          "Pause Layer '" +
            layer.name +
            "' storing " +
            countSnapshotKeys(snapshot) +
            " stored key records, then flattening to current value " +
            valueToString(snapshot.pausedValue) +
            ".",
        );

        clearPositionKeys(positionAccess);
        setCurrentPositionValue(positionAccess, snapshot.pausedValue);
        pausedCount++;
      }

      appendLog(
        logField,
        "Pause complete. Stored " + pausedCount + " layer(s).",
      );
    } catch (error) {
      appendLog(logField, "Pause FAIL - " + error.toString());
    }
    app.endUndoGroup();
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

  function findLayerByName(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === layerName) {
        return comp.layer(i);
      }
    }
    return null;
  }

  function clonePositionAnimationToProperty(
    access,
    snapshot,
    offset,
    logField,
    contextLabel,
  ) {
    restorePositionAnimation(
      access,
      snapshot,
      offset !== undefined ? offset : zeroVector(access.axisCount),
      logField,
      contextLabel,
    );
  }

  function runExportToNull(logField) {
    var comp = getActiveComp();
    var selectedLayers = getSelectedLayers(comp);
    var state = getState();

    if (!comp) {
      appendLog(logField, "Open a composition first.");
      return;
    }

    if (selectedLayers.length < 1) {
      appendLog(logField, "Select at least one layer.");
      return;
    }

    app.beginUndoGroup("Export Position To Null");
    try {
      var exportedCount = 0;

      for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        var stateKey = getLayerStateKey(comp, layer);
        var snapshot =
          state.pausedLayers[stateKey] ||
          snapshotPositionAnimation(layer, comp.time, logField, "Export");
        if (!snapshot) {
          continue;
        }

        var positionAccess = getPositionAccess(layer);
        if (
          !ensureSupportedPositionAccess(
            layer,
            positionAccess,
            logField,
            "Export",
          )
        ) {
          continue;
        }

        var originalParent = layer.parent;
        var controllerName = nextControllerName(comp, layer.name);
        var controller = comp.layers.addNull();
        controller.name = controllerName;
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
        if (state.pausedLayers[stateKey]) {
          exportOffset = calculateOffsetForTarget(
            getCurrentPositionValue(positionAccess),
            snapshot.pausedValue,
            controllerAccess.axisCount,
          );
          appendLog(
            logField,
            "Export detected paused layer '" +
              layer.name +
              "' with live offset " +
              valueToString(exportOffset) +
              ".",
          );
        }

        clonePositionAnimationToProperty(
          controllerAccess,
          snapshot,
          exportOffset,
          logField,
          "Export",
        );

        appendLog(
          logField,
          "Export Layer '" +
            layer.name +
            "' -> controller '" +
            controllerName +
            "'. Parent before export: " +
            (originalParent ? originalParent.name : "none") +
            ".",
        );

        layer.parent = controller;
        setCurrentPositionValue(
          positionAccess,
          zeroVector(positionAccess.axisCount),
        );

        tryCall(function () {
          controller.moveBefore(layer);
        });

        if (state.pausedLayers[stateKey]) {
          delete state.pausedLayers[stateKey];
          appendLog(
            logField,
            "Export cleared paused snapshot for '" + layer.name + "'.",
          );
        }

        exportedCount++;
      }

      appendLog(
        logField,
        "Export complete. Created " + exportedCount + " controller null(s).",
      );
    } catch (error) {
      appendLog(logField, "Export FAIL - " + error.toString());
    }
    app.endUndoGroup();
  }

  function runCopyPaste(logField) {
    var comp = getActiveComp();
    var selectedLayers = getSelectedLayers(comp);
    var state = getState();
    var keyboard = ScriptUI.environment.keyboardState;
    var forceCopy = keyboard && keyboard.altKey;

    if (!comp) {
      appendLog(logField, "Open a composition first.");
      return;
    }

    if (selectedLayers.length < 1) {
      appendLog(logField, "Select at least one layer.");
      return;
    }

    if (!state.clipboard || forceCopy) {
      if (selectedLayers.length !== 1) {
        appendLog(logField, "Copy requires exactly one selected source layer.");
        return;
      }

      var sourceLayer = selectedLayers[0];
      var sourceStateKey = getLayerStateKey(comp, sourceLayer);
      var sourceSnapshot =
        state.pausedLayers[sourceStateKey] ||
        snapshotPositionAnimation(sourceLayer, comp.time, logField, "Copy");
      if (!sourceSnapshot) {
        return;
      }

      if (state.pausedLayers[sourceStateKey]) {
        var sourcePositionAccess = getPositionAccess(sourceLayer);
        var sourceOffset = calculateOffsetForTarget(
          getCurrentPositionValue(sourcePositionAccess),
          sourceSnapshot.pausedValue,
          sourcePositionAccess.axisCount,
        );
        appendLog(
          logField,
          "Copy detected paused layer '" +
            sourceLayer.name +
            "' with live offset " +
            valueToString(sourceOffset) +
            ".",
        );
        sourceSnapshot = makeOffsetSnapshot(sourceSnapshot, sourceOffset);
      }

      state.clipboard = {
        compName: comp.name,
        sourceLayerName: sourceLayer.name,
        sourceLayerId: getLayerIdentifier(sourceLayer),
        sourceValueAtCopy: cloneArray(sourceSnapshot.pausedValue),
        snapshot: sourceSnapshot,
      };

      appendLog(
        logField,
        "Copy stored '" +
          sourceLayer.name +
          "' with " +
          countSnapshotKeys(sourceSnapshot) +
          " stored key records. Source value at copy time: " +
          valueToString(sourceSnapshot.pausedValue) +
          ".",
      );
      return;
    }

    app.beginUndoGroup("Paste Position Keyframes");
    try {
      var clipboard = state.clipboard;
      var pastedCount = 0;

      for (var i = 0; i < selectedLayers.length; i++) {
        var targetLayer = selectedLayers[i];
        if (getLayerIdentifier(targetLayer) === clipboard.sourceLayerId) {
          appendLog(
            logField,
            "Paste SKIP - Source layer '" +
              targetLayer.name +
              "' is in the selection.",
          );
          continue;
        }

        var targetAccess = getPositionAccess(targetLayer);
        if (
          !ensureSupportedPositionAccess(
            targetLayer,
            targetAccess,
            logField,
            "Paste",
          )
        ) {
          continue;
        }

        var targetCurrentValue = getCurrentPositionValue(targetAccess);
        var pasteOffset = calculateOffsetForTarget(
          targetCurrentValue,
          clipboard.sourceValueAtCopy,
          targetAccess.axisCount,
        );

        appendLog(
          logField,
          "Paste Layer '" +
            targetLayer.name +
            "' current=" +
            valueToString(targetCurrentValue) +
            " sourceCopy=" +
            valueToString(clipboard.sourceValueAtCopy) +
            " offset=" +
            valueToString(pasteOffset) +
            ".",
        );

        restorePositionAnimation(
          targetAccess,
          clipboard.snapshot,
          pasteOffset,
          logField,
          "Paste",
        );
        pastedCount++;
      }

      appendLog(
        logField,
        "Paste complete. Applied animation to " + pastedCount + " layer(s).",
      );
    } catch (error) {
      appendLog(logField, "Paste FAIL - " + error.toString());
    }
    app.endUndoGroup();
  }

  var panel = buildUI(thisObj);

  if (panel instanceof Window) {
    panel.center();
    panel.show();
  }
})(this);
