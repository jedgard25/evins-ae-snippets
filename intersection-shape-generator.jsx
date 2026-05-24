(function intersectionShapeGenerator() {
  var SCRIPT_NAME = "Intersection Shape Generator";
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

  function fail(message) {
    throw new Error(SCRIPT_NAME + ": " + message);
  }

  function isCompItem(item) {
    return item && item instanceof CompItem;
  }

  function getActiveComp() {
    var item = app.project && app.project.activeItem;
    if (!isCompItem(item)) {
      fail("Select a composition and run the script again.");
    }

    return item;
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

  function getMatchName(property) {
    try {
      return property && property.matchName ? property.matchName : "";
    } catch (error) {
      return "";
    }
  }

  function getPropertyDepth(property) {
    try {
      return property ? property.propertyDepth : 0;
    } catch (error) {
      return 0;
    }
  }

  function getPropertyGroup(property, depth) {
    try {
      return property ? property.propertyGroup(depth) : null;
    } catch (error) {
      return null;
    }
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

  function ensureSlider(layer, effectName, defaultValue) {
    var effect = findEffectByName(layer, effectName);
    var slider;

    if (!effect) {
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

  function ensureDropdown(layer, effectName, items, selectedIndex) {
    var effects = layer.property(MATCH_EFFECT_PARADE);
    var effect = findEffectByName(layer, effectName);
    var menuProp;
    var safeIndex;

    if (!effects) {
      fail("The controller layer does not support effects.");
    }

    if (!effect) {
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

  function ensureControllerLayer(comp) {
    var layer = findLayerByName(comp, CONTROL_LAYER_NAME);

    if (!layer) {
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
    }

    ensureDropdown(layer, SHAPE_TYPE_EFFECT_NAME, ["Cube", "Cross"], 1);
    ensureSlider(layer, SIZE_EFFECT_NAME, DEFAULT_SHAPE_SIZE);
    ensureSlider(layer, STROKE_EFFECT_NAME, DEFAULT_STROKE_WEIGHT);
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

  function resolvePathProperty(selectedProperty) {
    var current = selectedProperty;
    var directPathProperty;

    while (current) {
      if (getMatchName(current) === MATCH_VECTOR_PATH_PROP) {
        return current;
      }

      if (getMatchName(current) === MATCH_VECTOR_PATH_GROUP) {
        return getPathPropertyFromPathGroup(current);
      }

      directPathProperty = getPathPropertyFromContainer(current);
      if (directPathProperty) {
        return directPathProperty;
      }

      current = getPropertyGroup(current, 1);
    }

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
    return (
      String(layer.id || layer.index) +
      ":" +
      groupNames.join("/") +
      "/" +
      pathName
    );
  }

  function buildLineLabel(layer, groupNames, pathName) {
    var label = layer.name;
    var i;

    for (i = 0; i < groupNames.length; i += 1) {
      label += " > " + groupNames[i];
    }

    return label + " > " + pathName;
  }

  function buildLineReference(pathProperty) {
    var layer = getLayerFromProperty(pathProperty);
    var pathGroup = getPropertyGroup(pathProperty, 1);
    var shapeValue;
    var groupNames;

    if (!layer || !pathGroup) {
      return null;
    }

    try {
      shapeValue = pathProperty.value;
    } catch (error) {
      return null;
    }

    if (!isLineLikeShape(shapeValue)) {
      return null;
    }

    groupNames = buildGroupNameChain(pathProperty);

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

  function collectPathPropertiesFromContainer(container, results) {
    var i;
    var child;
    var pathProperty;

    if (!container || !container.numProperties) {
      return;
    }

    pathProperty = getPathPropertyFromContainer(container);
    if (pathProperty && getMatchName(container) === MATCH_VECTOR_PATH_GROUP) {
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
          results[results.length] = pathProperty;
        }
      } else if (child.numProperties) {
        collectPathPropertiesFromContainer(child, results);
      } else if (getMatchName(child) === MATCH_VECTOR_PATH_GROUP) {
        pathProperty = getPathPropertyFromPathGroup(child);
        if (pathProperty) {
          results[results.length] = pathProperty;
        }
      }
    }
  }

  function collectPathPropertiesFromLayer(layer) {
    var root = getLayerContents(layer);
    var results = [];

    if (!root) {
      return results;
    }

    collectPathPropertiesFromContainer(root, results);
    return results;
  }

  function getSelectedLineReferences(comp) {
    var selectedProperties = comp.selectedProperties || [];
    var selectedLayers = comp.selectedLayers || [];
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
      pathProperty = resolvePathProperty(selectedProperties[i]);
      if (!pathProperty) {
        continue;
      }

      lineReference = buildLineReference(pathProperty);
      if (lineReference) {
        pushUniqueLine(results, seen, lineReference);
      }
    }

    if (results.length > 0) {
      return results;
    }

    for (i = 0; i < selectedLayers.length; i += 1) {
      beforeCount = results.length;
      layerPathProperties = collectPathPropertiesFromLayer(selectedLayers[i]);
      if (layerPathProperties.length < 1) {
        invalidLabels[invalidLabels.length] = selectedLayers[i].name;
        continue;
      }

      for (j = 0; j < layerPathProperties.length; j += 1) {
        lineReference = buildLineReference(layerPathProperties[j]);
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

    return results;
  }

  function getLineEndpointsFromVertices(vertices) {
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

    if (aspectRatio < MIN_LINE_ASPECT_RATIO) {
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

  function getPathEndpoints(lineReference) {
    var shapeValue = lineReference.pathProperty.value;
    var vertices = getShapeVertices(shapeValue);
    var endpoints = getLineEndpointsFromVertices(vertices);
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
      return null;
    }

    if (distanceBetweenPoints(start, end) <= INTERSECTION_TOLERANCE) {
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

  function buildIntersectionSpecs(lineReferences) {
    var specs = [];
    var i;
    var j;
    var endpointsA;
    var endpointsB;
    var point;
    var k;
    var duplicate;

    for (i = 0; i < lineReferences.length - 1; i += 1) {
      endpointsA = getPathEndpoints(lineReferences[i]);
      if (!endpointsA) {
        continue;
      }

      for (j = i + 1; j < lineReferences.length; j += 1) {
        endpointsB = getPathEndpoints(lineReferences[j]);
        if (!endpointsB) {
          continue;
        }

        point = getSegmentIntersection(endpointsA, endpointsB);
        if (!point) {
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
          specs[specs.length] = {
            point: point,
            lineA: lineReferences[i],
            lineB: lineReferences[j],
          };
        }
      }
    }

    sortIntersectionSpecs(specs);
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

  function buildWorldPointCall(prefix, vertexIndexExpression) {
    return (
      "worldPointFromPath(path" +
      prefix +
      ", layer" +
      prefix +
      ", groups" +
      prefix +
      ", " +
      vertexIndexExpression +
      ")"
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
      "function worldPointFromPath(pathRef, layerRef, groups, vertexIndex) {\n" +
      "  var points = pathRef.points();\n" +
      "  if (points.length < 2) { return value; }\n" +
      "  var point = points[vertexIndex];\n" +
      "  for (var i = 0; i < groups.length; i++) { point = applyVectorTransform(point, groups[i]); }\n" +
      "  return layerRef.toComp(point);\n" +
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
    var groupContents = getVectorContents(group);
    var rect = groupContents.addProperty(MATCH_VECTOR_RECT);
    var rectIndex = rect.propertyIndex;
    var fill;
    var fillIndex;
    var transform;

    group = contentsGroup.property(groupIndex);
    group.name = "Cube";
    groupContents = getVectorContents(group);
    fill = groupContents.addProperty(MATCH_VECTOR_FILL);
    fillIndex = fill.propertyIndex;

    group = contentsGroup.property(groupIndex);
    groupContents = getVectorContents(group);
    rect = groupContents.property(rectIndex);
    fill = groupContents.property(fillIndex);
    transform = group.property(MATCH_VECTOR_TRANSFORM_GROUP);
    rect.property(MATCH_VECTOR_RECT_SIZE).expression =
      buildCubeSizeExpression(controllerName);
    fill.property(MATCH_VECTOR_FILL_COLOR).setValue([1, 1, 1]);
    transform.property(MATCH_VECTOR_OPACITY).expression =
      buildCubeOpacityExpression(controllerName);
  }

  function addCrossLine(pathGroup, vertices) {
    var path = pathGroup;
    var vectorsGroup = getVectorContents(pathGroup);
    var path;

    if (!vectorsGroup) {
      fail("Could not resolve vector contents for cross line group.");
    }

    path = vectorsGroup.addProperty(MATCH_VECTOR_PATH_GROUP);
    path.property(1).setValue(makePath(vertices));
  }

  function addCrossGroup(contentsGroup, controllerName) {
    var group = contentsGroup.addProperty(MATCH_VECTOR_GROUP);
    var groupIndex = group.propertyIndex;
    var groupContents = getVectorContents(group);
    var horizontalGroup = groupContents.addProperty(MATCH_VECTOR_GROUP);
    var horizontalIndex = horizontalGroup.propertyIndex;
    var verticalGroup;
    var verticalIndex;
    var stroke;
    var strokeIndex;
    var transform;

    group = contentsGroup.property(groupIndex);
    group.name = "Cross";
    groupContents = getVectorContents(group);
    verticalGroup = groupContents.addProperty(MATCH_VECTOR_GROUP);
    verticalIndex = verticalGroup.propertyIndex;

    group = contentsGroup.property(groupIndex);
    groupContents = getVectorContents(group);
    stroke = groupContents.addProperty(MATCH_VECTOR_STROKE);
    strokeIndex = stroke.propertyIndex;

    group = contentsGroup.property(groupIndex);
    groupContents = getVectorContents(group);
    horizontalGroup = groupContents.property(horizontalIndex);
    verticalGroup = groupContents.property(verticalIndex);
    stroke = groupContents.property(strokeIndex);
    transform = group.property(MATCH_VECTOR_TRANSFORM_GROUP);
    horizontalGroup.name = "Horizontal";
    verticalGroup.name = "Vertical";

    addCrossLine(horizontalGroup, [
      [-BASE_CROSS_SIZE / 2, 0],
      [BASE_CROSS_SIZE / 2, 0],
    ]);
    addCrossLine(verticalGroup, [
      [0, -BASE_CROSS_SIZE / 2],
      [0, BASE_CROSS_SIZE / 2],
    ]);

    stroke.property(MATCH_VECTOR_STROKE_COLOR).setValue([1, 1, 1]);
    stroke.property(MATCH_VECTOR_STROKE_WIDTH).expression =
      buildStrokeWidthExpression(controllerName);
    stroke.property(MATCH_VECTOR_STROKE_LINE_CAP).setValue(2);
    transform.property(MATCH_VECTOR_SCALE).expression =
      buildCrossScaleExpression(controllerName);
    transform.property(MATCH_VECTOR_OPACITY).expression =
      buildCrossOpacityExpression(controllerName);
  }

  function createIntersectionShapeLayer(
    comp,
    intersectionSpec,
    controllerName,
    index,
  ) {
    var layer = comp.layers.addShape();
    var layerTransform = layer.property(MATCH_TRANSFORM_GROUP);
    var contents = getLayerContents(layer);

    if (!layerTransform) {
      fail("Created shape layer is missing its transform group.");
    }

    if (!contents) {
      fail("Created shape layer is missing its contents group.");
    }

    layer.name = "Intersection Shape " + index;
    layer.label = 11;
    layerTransform.property(MATCH_ANCHOR_POINT).setValue([0, 0]);
    layerTransform.property(MATCH_POSITION).setValue(intersectionSpec.point);
    layerTransform.property(MATCH_POSITION).expression =
      buildIntersectionPositionExpression(
        intersectionSpec.lineA,
        intersectionSpec.lineB,
      );

    addCubeGroup(contents, controllerName);
    addCrossGroup(contents, controllerName);

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

  function main() {
    var comp = getActiveComp();
    var lineReferences = getSelectedLineReferences(comp);
    var intersectionSpecs = buildIntersectionSpecs(lineReferences);
    var controllerLayer;
    var generatedLayers = [];
    var i;

    if (intersectionSpecs.length < 1) {
      fail("No intersections were found across the selected line paths.");
    }

    app.beginUndoGroup(SCRIPT_NAME);
    try {
      controllerLayer = ensureControllerLayer(comp);
      for (i = 0; i < intersectionSpecs.length; i += 1) {
        generatedLayers[generatedLayers.length] = createIntersectionShapeLayer(
          comp,
          intersectionSpecs[i],
          controllerLayer.name,
          i + 1,
        );
      }
      selectGeneratedLayers(controllerLayer, generatedLayers);
    } finally {
      app.endUndoGroup();
    }

    alert(
      "Created " +
        intersectionSpecs.length +
        " intersection shape" +
        (intersectionSpecs.length === 1 ? "" : "s") +
        ".",
    );
  }

  try {
    main();
  } catch (error) {
    alert(error.toString());
  }
})();
