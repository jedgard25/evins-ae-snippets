(function organicTypewriterSetup() {
  function fail(message) {
    alert("Organic Typewriter: " + message);
  }

  function getActiveComp() {
    var item = app.project ? app.project.activeItem : null;
    if (!item || !(item instanceof CompItem)) {
      return null;
    }

    return item;
  }

  function isTextLayer(layer) {
    if (!layer) {
      return false;
    }

    try {
      return !!layer.property("ADBE Text Properties");
    } catch (err) {
      return false;
    }
  }

  function getEffectsGroup(layer) {
    return layer.property("ADBE Effect Parade");
  }

  function getEffectByName(layer, effectName) {
    var effects = getEffectsGroup(layer);
    if (!effects) {
      return null;
    }

    try {
      return effects.property(effectName);
    } catch (err) {
      return null;
    }
  }

  function addOrReuseEffect(layer, matchName, effectName) {
    var existing = getEffectByName(layer, effectName);
    if (existing) {
      return {
        effect: existing,
        created: false,
      };
    }

    var effects = getEffectsGroup(layer);
    if (!effects) {
      throw new Error("Layer '" + layer.name + "' has no Effects group.");
    }

    var effect = effects.addProperty(matchName);
    effect.name = effectName;
    return {
      effect: effect,
      created: true,
    };
  }

  function setControlValue(effect, propertyName, value) {
    var prop = effect.property(propertyName);
    if (!prop) {
      throw new Error(
        "Effect '" +
          effect.name +
          "' is missing property '" +
          propertyName +
          "'.",
      );
    }

    prop.setValue(value);
  }

  function ensureStandaloneControls(layer) {
    var typingAnimation = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Typing Animation",
    );
    if (typingAnimation.created) {
      setControlValue(typingAnimation.effect, "Slider", 0);
    }

    var cursorOn = addOrReuseEffect(
      layer,
      "ADBE Checkbox Control",
      "Cursor On/Off",
    );
    if (cursorOn.created) {
      setControlValue(cursorOn.effect, "Checkbox", 1);
    }

    var hideCursor = addOrReuseEffect(
      layer,
      "ADBE Checkbox Control",
      "Hide Cursor Once Typed",
    );
    if (hideCursor.created) {
      setControlValue(hideCursor.effect, "Checkbox", 0);
    }

    var blinkSpeed = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Blink Speed",
    );
    if (blinkSpeed.created) {
      setControlValue(blinkSpeed.effect, "Slider", 20);
    }

    var cursorPosition = addOrReuseEffect(
      layer,
      "ADBE Point Control",
      "Cursor Position",
    );
    if (cursorPosition.created) {
      setControlValue(cursorPosition.effect, "Point", [0, 0]);
    }

    var cursorScaleX = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Cursor Scale X",
    );
    if (cursorScaleX.created) {
      setControlValue(cursorScaleX.effect, "Slider", 100);
    }

    var cursorScaleY = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Cursor Scale Y",
    );
    if (cursorScaleY.created) {
      setControlValue(cursorScaleY.effect, "Slider", 130);
    }

    var cursorColor = addOrReuseEffect(
      layer,
      "ADBE Color Control",
      "Cursor Color",
    );
    if (cursorColor.created) {
      setControlValue(cursorColor.effect, "Color", [1, 1, 1, 1]);
    }
  }

  function ensureOrganicControls(layer) {
    var organicStrength = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Organic Strength",
    );
    if (organicStrength.created) {
      setControlValue(organicStrength.effect, "Slider", 35);
    }

    var wordPause = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Word Pause Amount",
    );
    if (wordPause.created) {
      setControlValue(wordPause.effect, "Slider", 30);
    }

    var organicSeed = addOrReuseEffect(
      layer,
      "ADBE Slider Control",
      "Organic Seed",
    );
    if (organicSeed.created) {
      setControlValue(organicSeed.effect, "Slider", 1);
    }
  }

  function hasMobarEffect(layer) {
    return !!getEffectByName(layer, "MoBar Typewriter");
  }

  function escapeForExpressionString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function getStandaloneCursorLayerName(sourceLayer) {
    return sourceLayer.name + " [Organic Cursor]";
  }

  function getTextSourceProperty(layer) {
    var textProps = layer.property("ADBE Text Properties");
    return textProps ? textProps.property("ADBE Text Document") : null;
  }

  function getTextAnimatorsGroup(layer) {
    var textProps = layer.property("ADBE Text Properties");
    return textProps ? textProps.property("ADBE Text Animators") : null;
  }

  function getTextAnimatorByName(layer, animatorName) {
    var animators = getTextAnimatorsGroup(layer);
    if (!animators) {
      return null;
    }

    try {
      return animators.property(animatorName);
    } catch (err) {
      return null;
    }
  }

  function addFirstSupportedProperty(group, matchNames) {
    var lastError = null;
    for (var i = 0; i < matchNames.length; i++) {
      try {
        return group.addProperty(matchNames[i]);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("No supported property match name found.");
  }

  function findPropertyByMatchNames(group, matchNames) {
    if (!group) {
      return null;
    }

    for (var i = 1; i <= group.numProperties; i++) {
      var prop = group.property(i);
      if (!prop) {
        continue;
      }

      for (var j = 0; j < matchNames.length; j++) {
        if (prop.matchName === matchNames[j]) {
          return prop;
        }
      }
    }

    return null;
  }

  function ensureAnimatorProperty(group, displayNames, matchNames) {
    var prop = null;
    for (var i = 0; i < displayNames.length; i++) {
      prop = group.property(displayNames[i]);
      if (prop) {
        return prop;
      }
    }

    prop = findPropertyByMatchNames(group, matchNames);
    if (prop) {
      return prop;
    }

    return addFirstSupportedProperty(group, matchNames);
  }

  function applyExpressionToProperty(
    prop,
    expression,
    layerName,
    propertyLabel,
  ) {
    if (!prop) {
      throw new Error(
        "Layer '" +
          layerName +
          "' cursor animator is missing " +
          propertyLabel +
          ".",
      );
    }

    try {
      prop.expression = "";
      prop.expression = expression;
    } catch (err) {
      throw new Error(
        "Layer '" +
          layerName +
          "' cursor " +
          propertyLabel.toLowerCase() +
          " failed: " +
          (err.message || err.toString()),
      );
    }

    if (prop.expressionError) {
      throw new Error(
        "Layer '" +
          layerName +
          "' cursor " +
          propertyLabel.toLowerCase() +
          " failed: " +
          prop.expressionError,
      );
    }
  }

  function buildStandaloneCursorSelectorExpression() {
    return ["textIndex === textTotal ? 100 : 0;"].join("\n");
  }

  function buildStandaloneCursorOpacityExpression() {
    return [
      "try {",
      "  var isCursorEnabled = !!effect('Cursor On/Off')('Checkbox').value;",
      "  var hideCursorAfterTyping = !!effect('Hide Cursor Once Typed')('Checkbox').value;",
      "  var typingAnimation = effect('Typing Animation')('Slider');",
      "  var blinkSpeed = Math.max(0, effect('Blink Speed')('Slider').value);",
      "  var cursorOpacity = 0;",
      "",
      "  if (isCursorEnabled) {",
      "    if (hideCursorAfterTyping && typingAnimation.value >= 99.999 && typingAnimation.numKeys > 0) {",
      "      var lastKeyTime = typingAnimation.key(typingAnimation.numKeys).time;",
      "      cursorOpacity = time > lastKeyTime ? 0 : (Math.sin(time * blinkSpeed) < 0 ? 100 : 0);",
      "    } else {",
      "      cursorOpacity = Math.sin(time * blinkSpeed) < 0 ? 100 : 0;",
      "    }",
      "  }",
      "",
      "  cursorOpacity;",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorPositionExpression() {
    return [
      "try {",
      "  var point = effect('Cursor Position')('Point').value;",
      "  value.length > 2 ? [point[0], point[1], 0] : point;",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorScaleExpression() {
    return [
      "try {",
      "  var x = effect('Cursor Scale X')('Slider').value;",
      "  var y = effect('Cursor Scale Y')('Slider').value;",
      "  value.length > 2 ? [x, y, 100] : [x, y];",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorColorExpression() {
    return [
      "try {",
      "  effect('Cursor Color')('Color');",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorLayerSourceExpression(sourceLayerName) {
    var safeSourceLayerName = escapeForExpressionString(sourceLayerName);

    return [
      "try {",
      '  var sourceLayer = thisComp.layer("' + safeSourceLayerName + '");',
      '  var glyph = "|";',
      "  var sourceDoc = value;",
      '  if (sourceDoc && sourceDoc.style && sourceDoc.style.setText) {',
      "    var styled = sourceDoc.style.setText(glyph);",
      '    if (styled.setFillColor) {',
      "      styled.setFillColor(sourceLayer.effect('Cursor Color')('Color').value);",
      "    } else {",
      "      styled;",
      "    }",
      "  } else {",
      "    glyph;",
      "  }",
      "} catch (err) {",
      '  "|";',
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorLayerPositionExpression(sourceLayerName) {
    var safeSourceLayerName = escapeForExpressionString(sourceLayerName);

    return [
      "try {",
      '  var sourceLayer = thisComp.layer("' + safeSourceLayerName + '");',
      "  var rect = sourceLayer.sourceRectAtTime(time, false);",
      "  var localPoint = [rect.left + rect.width, 0];",
      "  var offset = sourceLayer.effect('Cursor Position')('Point').value;",
      "  sourceLayer.toComp(localPoint) + offset;",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorLayerScaleExpression(sourceLayerName) {
    var safeSourceLayerName = escapeForExpressionString(sourceLayerName);

    return [
      "try {",
      '  var sourceLayer = thisComp.layer("' + safeSourceLayerName + '");',
      "  var sourceScale = sourceLayer.transform.scale.value;",
      "  var x = sourceLayer.effect('Cursor Scale X')('Slider').value / 100;",
      "  var y = sourceLayer.effect('Cursor Scale Y')('Slider').value / 100;",
      "  [sourceScale[0] * x, sourceScale[1] * y];",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function buildStandaloneCursorLayerOpacityExpression(sourceLayerName) {
    var safeSourceLayerName = escapeForExpressionString(sourceLayerName);

    return [
      "try {",
      '  var sourceLayer = thisComp.layer("' + safeSourceLayerName + '");',
      "  var isCursorEnabled = !!sourceLayer.effect('Cursor On/Off')('Checkbox').value;",
      "  var hideCursorAfterTyping = !!sourceLayer.effect('Hide Cursor Once Typed')('Checkbox').value;",
      "  var typingAnimation = sourceLayer.effect('Typing Animation')('Slider');",
      "  var blinkSpeed = Math.max(0, sourceLayer.effect('Blink Speed')('Slider').value);",
      "  if (!isCursorEnabled) {",
      "    0;",
      "  } else if (hideCursorAfterTyping && typingAnimation.value >= 99.999 && typingAnimation.numKeys > 0) {",
      "    var lastKeyTime = typingAnimation.key(typingAnimation.numKeys).time;",
      "    time > lastKeyTime ? 0 : (Math.sin(time * blinkSpeed) < 0 ? 100 : 0);",
      "  } else {",
      "    Math.sin(time * blinkSpeed) < 0 ? 100 : 0;",
      "  }",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function ensureStandaloneCursorLayer(sourceLayer) {
    var comp = sourceLayer.containingComp;
    var cursorLayerName = getStandaloneCursorLayerName(sourceLayer);
    var cursorLayer = null;

    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === cursorLayerName) {
        cursorLayer = comp.layer(i);
        break;
      }
    }

    if (!cursorLayer) {
      cursorLayer = comp.layers.addText("|");
      cursorLayer.name = cursorLayerName;
      cursorLayer.moveBefore(sourceLayer);
    }

    var sourceTextProp = getTextSourceProperty(sourceLayer);
    var cursorTextProp = getTextSourceProperty(cursorLayer);
    if (!sourceTextProp || !cursorTextProp) {
      throw new Error(
        "Layer '" + sourceLayer.name + "' cannot create a standalone cursor layer.",
      );
    }

    var sourceTextDoc = sourceTextProp.value;
    if (sourceTextDoc) {
      sourceTextDoc.text = "|";
      cursorTextProp.setValue(sourceTextDoc);
    }

    cursorLayer.shy = false;
    cursorLayer.enabled = true;
    cursorLayer.guideLayer = false;

    cursorTextProp.expression = "";
    cursorTextProp.expression = buildStandaloneCursorLayerSourceExpression(
      sourceLayer.name,
    );
    if (cursorTextProp.expressionError) {
      throw new Error(
        "Layer '" + sourceLayer.name + "' cursor source text failed: " +
          cursorTextProp.expressionError,
      );
    }

    cursorLayer.transform.position.expression = "";
    cursorLayer.transform.position.expression =
      buildStandaloneCursorLayerPositionExpression(sourceLayer.name);
    if (cursorLayer.transform.position.expressionError) {
      throw new Error(
        "Layer '" + sourceLayer.name + "' cursor position failed: " +
          cursorLayer.transform.position.expressionError,
      );
    }

    cursorLayer.transform.scale.expression = "";
    cursorLayer.transform.scale.expression =
      buildStandaloneCursorLayerScaleExpression(sourceLayer.name);
    if (cursorLayer.transform.scale.expressionError) {
      throw new Error(
        "Layer '" + sourceLayer.name + "' cursor scale failed: " +
          cursorLayer.transform.scale.expressionError,
      );
    }

    cursorLayer.transform.opacity.expression = "";
    cursorLayer.transform.opacity.expression =
      buildStandaloneCursorLayerOpacityExpression(sourceLayer.name);
    if (cursorLayer.transform.opacity.expressionError) {
      throw new Error(
        "Layer '" + sourceLayer.name + "' cursor opacity failed: " +
          cursorLayer.transform.opacity.expressionError,
      );
    }

    return cursorLayer;
  }

  function ensureStandaloneCursorAnimator(layer) {
    var animator = getTextAnimatorByName(layer, "Organic Typewriter Cursor");
    if (!animator) {
      var animators = getTextAnimatorsGroup(layer);
      if (!animators) {
        throw new Error(
          "Layer '" + layer.name + "' is missing the Text Animators group.",
        );
      }

      animator = animators.addProperty("ADBE Text Animator");
      animator.name = "Organic Typewriter Cursor";
    }

    var animatorProps = animator.property("ADBE Text Animator Properties");
    var selectors = animator.property("ADBE Text Selectors");
    if (!animatorProps || !selectors) {
      throw new Error(
        "Layer '" +
          layer.name +
          "' cursor animator is missing required groups.",
      );
    }

    var opacityProp = ensureAnimatorProperty(
      animatorProps,
      ["Opacity"],
      ["ADBE Text Opacity"],
    );

    var positionProp = ensureAnimatorProperty(
      animatorProps,
      ["Position"],
      ["ADBE Text Position 3D", "ADBE Text Position"],
    );

    var scaleProp = ensureAnimatorProperty(
      animatorProps,
      ["Scale"],
      ["ADBE Text Scale 3D", "ADBE Text Scale"],
    );

    var fillColorProp = ensureAnimatorProperty(
      animatorProps,
      ["Fill Color"],
      ["ADBE Text Fill Color", "ADBE Text Fill Color RGB"],
    );

    var selector = selectors.property("Cursor Selector");
    if (!selector) {
      selector = addFirstSupportedProperty(selectors, [
        "ADBE Text Expressible Selector",
        "ADBE Text Selector",
      ]);
      selector.name = "Cursor Selector";
    }

    var amountProp = selector.property("Amount");
    if (!amountProp) {
      amountProp = selector.property("ADBE Text Selector Amount");
    }

    if (!amountProp) {
      throw new Error(
        "Layer '" +
          layer.name +
          "' cursor selector does not expose an Amount property.",
      );
    }

    applyExpressionToProperty(
      amountProp,
      buildStandaloneCursorSelectorExpression(),
      layer.name,
      "Selector",
    );
    applyExpressionToProperty(
      opacityProp,
      buildStandaloneCursorOpacityExpression(),
      layer.name,
      "Opacity",
    );
    applyExpressionToProperty(
      positionProp,
      buildStandaloneCursorPositionExpression(),
      layer.name,
      "Position",
    );
    applyExpressionToProperty(
      scaleProp,
      buildStandaloneCursorScaleExpression(),
      layer.name,
      "Scale",
    );
    applyExpressionToProperty(
      fillColorProp,
      buildStandaloneCursorColorExpression(),
      layer.name,
      "Fill Color",
    );
  }

  function buildSourceTextExpression() {
    return [
      "try {",
      "  var cursorSymbol = '|';",
      "",
      "  function getProp(name, pseudoName, fallbackLeaf) {",
      "    try {",
      "      return effect('MoBar Typewriter')(pseudoName);",
      "    } catch (err1) {",
      "      try {",
      "        return effect(name)(fallbackLeaf);",
      "      } catch (err2) {",
      "        return null;",
      "      }",
      "    }",
      "  }",
      "",
      "  function getValue(prop, fallback) {",
      "    return prop ? prop.value : fallback;",
      "  }",
      "",
      "  function clamp01(n) {",
      "    return Math.max(0, Math.min(1, n));",
      "  }",
      "",
      "  function isWhitespace(ch) {",
      "    return ch === ' ' || ch === '\\r' || ch === '\\n' || ch === '\\t';",
      "  }",
      "",
      "  var typingAnimationProp = getProp('Typing Animation', 'Typing Animation', 'Slider');",
      "  var cursorEnabledProp = getProp('Cursor On/Off', 'Cursor On/Off', 'Checkbox');",
      "  var hideCursorProp = getProp('Hide Cursor Once Typed', 'Hide Cursor Once Typed', 'Checkbox');",
      "  var blinkSpeedProp = getProp('Blink Speed', 'Blink Speed', 'Slider');",
      "  var organicStrengthProp = getProp('Organic Strength', 'Organic Strength', 'Slider');",
      "  var wordPauseProp = getProp('Word Pause Amount', 'Word Pause Amount', 'Slider');",
      "  var organicSeedProp = getProp('Organic Seed', 'Organic Seed', 'Slider');",
      "",
      "  var hasMobar = false;",
      "  try {",
      "    effect('MoBar Typewriter')('Typing Animation');",
      "    hasMobar = true;",
      "  } catch (mobarErr) {}",
      "",
      "  var typingAnimation = getValue(typingAnimationProp, 0);",
      "  var isCursorEnabled = !!getValue(cursorEnabledProp, 1);",
      "  var hideCursorAfterTyping = !!getValue(hideCursorProp, 0);",
      "  var blinkSpeed = Math.max(0, getValue(blinkSpeedProp, 20));",
      "  var organicStrength = clamp01(getValue(organicStrengthProp, 0) / 100);",
      "  var wordPauseAmount = clamp01(getValue(wordPauseProp, 0) / 100);",
      "  var organicSeed = getValue(organicSeedProp, 1);",
      "",
      "  var sourceTextValue = value;",
      "  var fullText = sourceTextValue.toString ? sourceTextValue.toString() : ('' + sourceTextValue);",
      "  var sourceTextLength = fullText.length;",
      "",
      "  function seededUnit(index) {",
      "    var n = index + organicSeed * 13.371;",
      "    var s = Math.sin(n * 12.9898 + organicSeed * 78.233) * 43758.5453;",
      "    return s - Math.floor(s);",
      "  }",
      "",
      "  var weights = [];",
      "  var totalWeight = 0;",
      "  var wordIndex = 0;",
      "  var inWord = false;",
      "  var currentWordFactor = 1;",
      "",
      "  for (var i = 0; i < sourceTextLength; i++) {",
      "    var ch = fullText.substr(i, 1);",
      "    var weight = 1;",
      "",
      "    if (isWhitespace(ch)) {",
      "      inWord = false;",
      "      weight = 1 + wordPauseAmount * (0.75 + seededUnit(i + 101) * 1.85);",
      "    } else {",
      "      if (!inWord) {",
      "        inWord = true;",
      "        wordIndex += 1;",
      "        currentWordFactor = 1 + (seededUnit(wordIndex * 17) - 0.5) * organicStrength * 1.15;",
      "      }",
      "",
      "      var microFactor = 1 + (seededUnit(i * 29 + 5) - 0.5) * organicStrength * 0.7;",
      "      weight = Math.max(0.15, currentWordFactor * microFactor);",
      "    }",
      "",
      "    weights[i] = weight;",
      "    totalWeight += weight;",
      "  }",
      "",
      "  var targetWeight = clamp01(typingAnimation / 100) * totalWeight;",
      "  var revealCount = 0;",
      "  var consumedWeight = 0;",
      "",
      "  for (var j = 0; j < sourceTextLength; j++) {",
      "    consumedWeight += weights[j];",
      "    if (targetWeight + 0.0001 >= consumedWeight) {",
      "      revealCount = j + 1;",
      "    } else {",
      "      break;",
      "    }",
      "  }",
      "",
      "  var visibleText = fullText.substring(0, revealCount);",
      "",
      "  if (!isCursorEnabled) {",
      "    visibleText;",
      "  } else if (hasMobar) {",
      "    visibleText + cursorSymbol;",
      "  } else {",
      "    visibleText;",
      "  }",
      "} catch (err) {",
      "  value;",
      "}",
    ].join("\n");
  }

  function applySourceTextExpression(layer) {
    var textProps = layer.property("ADBE Text Properties");
    if (!textProps) {
      throw new Error("Layer '" + layer.name + "' is missing text properties.");
    }

    var sourceText = textProps.property("ADBE Text Document");
    if (!sourceText || !sourceText.canSetExpression) {
      throw new Error(
        "Layer '" + layer.name + "' does not allow expressions on Source Text.",
      );
    }

    sourceText.expression = "";
    sourceText.expression = buildSourceTextExpression();
    if (sourceText.expressionError) {
      throw new Error(
        "Layer '" +
          layer.name +
          "' source text expression failed: " +
          sourceText.expressionError,
      );
    }
  }

  function processLayer(layer) {
    var usesMobar = hasMobarEffect(layer);
    if (!usesMobar) {
      ensureStandaloneControls(layer);
      ensureStandaloneCursorLayer(layer);
    }

    ensureOrganicControls(layer);
    applySourceTextExpression(layer);

    return usesMobar;
  }

  var comp = getActiveComp();
  if (!comp) {
    fail("Select or open a composition first.");
    return;
  }

  if (!comp.selectedLayers || comp.selectedLayers.length === 0) {
    fail("Select at least one text layer.");
    return;
  }

  var selectedLayers = comp.selectedLayers;
  var processedCount = 0;
  var mobarCount = 0;
  var standaloneCount = 0;

  app.beginUndoGroup("Organic Typewriter");

  try {
    for (var i = 0; i < selectedLayers.length; i++) {
      var layer = selectedLayers[i];
      if (!isTextLayer(layer)) {
        continue;
      }

      if (processLayer(layer)) {
        mobarCount += 1;
      } else {
        standaloneCount += 1;
      }

      processedCount += 1;
    }

    if (processedCount === 0) {
      throw new Error("No selected text layers were found.");
    }
  } catch (err) {
    app.endUndoGroup();
    fail(err.message || err.toString());
    return;
  }

  app.endUndoGroup();

  alert(
    "Organic Typewriter applied to " +
      processedCount +
      " text layer(s).\n\n" +
      "MoBar-upgraded layers: " +
      mobarCount +
      "\n" +
      "Standalone layers: " +
      standaloneCount +
      "\n\n" +
      "Animate 'Typing Animation', then tune 'Organic Strength' and 'Word Pause Amount'.",
  );
})();
