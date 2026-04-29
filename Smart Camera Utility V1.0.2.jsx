(function (thisObj) {
  /********************************************************************************
   *
   * CAMERA UTILITY SUITE
   * VERSION 1.0.2
   *
   * This script provides a set of tools to simplify and enhance camera workflows
   * in Adobe After Effects. It includes a modular camera rig with a compensated
   * dolly-zoom effect and a system for mirroring that rig into pre-compositions.
   *
   ********************************************************************************/

  // --- SECTION: CUSTOM UI DRAWING FUNCTIONS ---
  // These functions are helpers for creating a custom user interface that is more
  // visually appealing and functional than the default ScriptUI elements.

  /**
   * drawStableRoundedRect
   * Draws a rectangle with rounded corners. This function is a workaround for the
   * often unreliable and inconsistent arcTo() method in ScriptUI's drawing module.
   * It constructs the shape from four ellipses (for the corners) and two rectangles
   * (for the body), ensuring a consistent appearance.
   * @param {ScriptUIGraphics} g The graphics context to draw on.
   * @param {number} w The width of the rectangle.
   * @param {number} h The height of the rectangle.
   * @param {number} cornerRadius The radius for each corner.
   * @param {Brush} bgBrush The brush used to fill the shape.
   */
  function drawStableRoundedRect(g, w, h, cornerRadius, bgBrush) {
    g.newPath();
    var cr = cornerRadius;
    g.ellipsePath(0, 0, cr * 2, cr * 2);
    g.ellipsePath(w - cr * 2, 0, cr * 2, cr * 2);
    g.ellipsePath(0, h - cr * 2, cr * 2, cr * 2);
    g.ellipsePath(w - cr * 2, h - cr * 2, cr * 2, cr * 2);
    g.rectPath(cr, 0, w - cr * 2, h);
    g.rectPath(0, cr, w, h - cr * 2);
    g.fillPath(bgBrush);
  }

  /**
   * addCustomButton
   * Creates a custom button element with manually drawn states for normal,
   * hover, active, and disabled. This provides greater control over the button's
   * appearance compared to native buttons.
   * @param {Group|Panel|Window} parent The parent UI element.
   * @param {string} text The text label for the button.
   * @param {Function} onClickCallback The function to execute on click.
   * @returns {CustomButton} The created custom button element.
   */
  function addCustomButton(parent, text, onClickCallback) {
    var btn = parent.add("customButton", undefined);
    btn.text = text;
    btn.alignment = "fill";
    btn.preferredSize.height = 30;

    btn.state = "normal"; // Manages the current visual state.
    var colors = {
      // Color definitions for each state.
      normal: { bg: [0.25, 0.25, 0.25] },
      hover: { bg: [0.35, 0.35, 0.35] },
      active: { bg: [0.2, 0.2, 0.2] },
      disabled: { bg: [0.2, 0.2, 0.2] },
      text: [0.9, 0.9, 0.9],
      disabledText: [0.5, 0.5, 0.5],
    };
    var cornerRadius = 6;

    // The onDraw method is called whenever the button needs to be redrawn.
    btn.onDraw = function () {
      var g = this.graphics;
      var w = this.size.width;
      var h = this.size.height;

      // Select colors based on the button's current state.
      var currentBgColor = colors[this.state]
        ? colors[this.state].bg
        : colors.normal.bg;
      var currentTextColor =
        this.state === "disabled" ? colors.disabledText : colors.text;

      var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, currentBgColor);
      var textPen = g.newPen(g.PenType.SOLID_COLOR, currentTextColor, 1);

      var textSize = g.measureString(btn.text);
      var textX = (w - textSize.width) / 2;
      var textY = (h - textSize.height) / 2;

      // Draw the shape and text.
      drawStableRoundedRect(g, w, h, cornerRadius, bgBrush);
      g.drawString(btn.text, textPen, textX, textY);
    };

    // Event listeners to update the button's state and trigger a redraw.
    btn.addEventListener("mousedown", function () {
      if (!this.enabled) return;
      this.state = "active";
      this.notify("onDraw");
      if (onClickCallback) {
        onClickCallback.call(this);
      }
    });

    btn.addEventListener("mouseup", function () {
      if (!this.enabled) return;
      this.state = "hover";
      this.notify("onDraw");
    });

    btn.addEventListener("mouseover", function () {
      if (!this.enabled) return;
      if (this.state !== "active") {
        this.state = "hover";
        this.notify("onDraw");
      }
    });

    btn.addEventListener("mouseout", function () {
      if (!this.enabled) return;
      this.state = "normal";
      this.notify("onDraw");
    });

    return btn;
  }

  /**
   * addCustomContainer
   * Creates a simple, non-interactive, rounded rectangle shape to serve as a
   * background for other UI elements, like dropdowns.
   * @param {Group|Panel|Window} parent The parent UI element.
   * @returns {CustomButton} The created container element.
   */
  function addCustomContainer(parent) {
    var container = parent.add("customButton", undefined, "");
    container.alignment = "fill";
    var bgColor = [0.25, 0.25, 0.25];
    var cornerRadius = 6;

    container.onDraw = function () {
      var g = this.graphics;
      var w = this.size.width;
      var h = this.size.height;
      var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, bgColor);
      drawStableRoundedRect(g, w, h, cornerRadius, bgBrush);
    };
    return container;
  }

  // --- SECTION: UI CONSTRUCTION ---

  /**
   * buildUI
   * Constructs the main user interface panel for the script.
   * @param {Object} thisObj The context object, typically the script's panel or window.
   */
  function buildUI(thisObj) {
    var panel =
      thisObj instanceof Panel
        ? thisObj
        : new Window("palette", "Camera Utility", undefined, {
            resizeable: true,
          });

    panel.onResize = function () {
      this.layout.resize();
      this.layout.layout(true);
    };

    panel.orientation = "column";
    panel.alignChildren = ["fill", "top"];
    panel.spacing = 10;
    panel.margins = 16;

    // --- Button: Create Camera Rig ---
    var createRigBtn = addCustomButton(panel, "Create Camera Rig", function () {
      app.beginUndoGroup("Create Camera Rig");
      var comp = app.project.activeItem;
      if (comp && comp instanceof CompItem) {
        var rigName = createCameraRig(comp);
        if (!rigName) {
          alert("Failed to create Camera Rig.");
        }
      } else {
        alert("Please select a composition.");
      }
      app.endUndoGroup();
    });
    createRigBtn.helpTip =
      "Generate the base camera rig and a single camera null. (Smart Camera)";

    // --- Button: Add Null ---
    var addNullBtn = addCustomButton(panel, "Add Null", function () {
      app.beginUndoGroup("Add Controller Null");
      var comp = app.project.activeItem;
      if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition first.");
        return;
      }
      var selectedLayers = comp.selectedLayers;
      if (selectedLayers.length > 0) {
        var selectedLayer = selectedLayers[0];
        var nullName = "[" + selectedLayer.name + "]_controller"; // Brackets added for expression compatibility.
        var newNull = comp.layers.addNull();
        newNull.name = nullName;
        newNull.threeDLayer = true;
        newNull.guideLayer = true; // Set as a non-rendering guide layer.
        newNull.inPoint = selectedLayer.inPoint;
        newNull.outPoint = selectedLayer.outPoint;
        newNull.moveBefore(selectedLayer);
        selectedLayer.parent = newNull;
      } else {
        alert("Please select a layer to parent to a new null.");
      }
      app.endUndoGroup();
    });
    addNullBtn.helpTip =
      "Generates a 3D guide null named after the selected layer and parents the layer to it.";

    var divider = panel.add("panel");
    divider.alignment = "fill";
    divider.preferredSize.height = 2;

    var instructionText = panel.add(
      "statictext",
      undefined,
      "Select project root comp below."
    );
    instructionText.alignment = ["center", "center"];

    // --- Dropdown: Source Composition ---
    var compDropdownContainer = panel.add("group");
    compDropdownContainer.orientation = "stack";
    compDropdownContainer.alignment = "fill";
    compDropdownContainer.spacing = 0;
    compDropdownContainer.margins = 0;
    compDropdownContainer.preferredSize.height = 30;
    compDropdownContainer.helpTip =
      "Set to where your main camera rig is setup.";
    addCustomContainer(compDropdownContainer); // Custom background
    var compDropdown = compDropdownContainer.add("dropdownlist", undefined, []);
    compDropdown.alignment = "fill";
    compDropdown.margins = [10, 5, 10, 5];

    // --- Button Group: Precomp & Mirror ---
    var precompContainer = panel.add("group");
    precompContainer.orientation = "row";
    precompContainer.alignChildren = ["fill", "center"];
    precompContainer.alignment = "fill";
    precompContainer.spacing = 10;

    // --- Button: Precomp Selection ---
    var precompBtn = addCustomButton(
      precompContainer,
      "Precomp Selection",
      function () {
        app.beginUndoGroup("Precomp Selection and Create Mirror Rig");
        var mainComp = app.project.activeItem;
        if (!mainComp || !(mainComp instanceof CompItem)) {
          alert("Please select a composition first.");
          app.endUndoGroup();
          return;
        }

        var selectedLayers = mainComp.selectedLayers;
        if (selectedLayers.length > 0) {
          // 1. Calculate the time boundaries of the selected layers and store the earliest inPoint.
          var minInPoint = Infinity;
          var maxOutPoint = -Infinity;
          var layerIndices = [];
          for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            layerIndices.push(layer.index);
            minInPoint = Math.min(minInPoint, layer.inPoint);
            maxOutPoint = Math.max(maxOutPoint, layer.outPoint);
          }
          var newDuration = maxOutPoint - minInPoint;

          // 2. Determine the name for the new pre-composition.
          var sceneNum = getNextSceneNumber("Scene");
          var precompName = "Scene_" + sceneNum;

          // 3. Pre-compose the layers and, critically, store the returned Layer object.
          var newPrecompLayer = mainComp.layers.precompose(
            layerIndices,
            precompName,
            true
          );

          // 4. Find the newly created composition item in the project panel.
          var newComp = null;
          for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === precompName) {
              newComp = item;
              break;
            }
          }

          if (newComp) {
            // 5. Adjust the timing of the new comp and the layers within it.
            newComp.duration = newDuration;

            // This loop shifts all layers inside the new comp to start at time 0.
            for (var j = 1; j <= newComp.numLayers; j++) {
              var innerLayer = newComp.layer(j);
              innerLayer.startTime = innerLayer.startTime - minInPoint;
            }

            // 6. Create the mirror rig.
            newComp.openInViewer();
            createMirrorCameraRig(newComp, mainComp.name);

            // 7. Return to the original composition.
            mainComp.openInViewer();

            // 8. Explicitly set the startTime of the new pre-comp layer to ensure correct positioning.
            if (newPrecompLayer) {
              newPrecompLayer.startTime = minInPoint;
            }
          } else {
            alert(
              "Error: Pre-composition failed or the new comp item could not be found."
            );
          }
        } else {
          alert("Please select layers to precompose.");
        }
        app.endUndoGroup();
      }
    );
    precompBtn.helpTip =
      "Precomps your selection into a scene with a mirrored camera.";

    // --- Button: Add Mirror (Manual) ---
    var mirrorBtn = addCustomButton(precompContainer, "+", function () {
      app.beginUndoGroup("Create or Update Mirror Camera Rig");
      var comp = app.project.activeItem;
      if (comp && comp instanceof CompItem) {
        if (compDropdown.selection && compDropdown.selection.compName) {
          createMirrorCameraRig(comp, compDropdown.selection.compName);
        } else {
          alert("Please select a source composition from the dropdown.");
        }
      } else {
        alert("Please select a target composition.");
      }
      app.endUndoGroup();
    });
    mirrorBtn.helpTip =
      "Manually add a mirror camera setup into the current comp.";

    function populateCompList() {
      var currentSelection = compDropdown.selection
        ? compDropdown.selection.compName
        : "";
      compDropdown.removeAll();
      compDropdown.add("item", ""); // Placeholder
      var compFound = false;
      for (var i = 1; i <= app.project.numItems; i++) {
        if (app.project.item(i) instanceof CompItem) {
          var compName = app.project.item(i).name;
          var displayName =
            compName.length > 30 ? compName.substring(0, 27) + "..." : compName;
          var newItem = compDropdown.add("item", displayName);
          newItem.compName = compName;
          if (compName === currentSelection) {
            compDropdown.selection = newItem;
            compFound = true;
          }
        }
      }
      if (!compFound) {
        compDropdown.selection = 0;
      }
      compDropdownContainer.layout.layout(true);
    }
    compDropdown.onActivate = populateCompList;
    populateCompList(); // Initial population

    precompBtn.alignment = ["fill", "center"];
    mirrorBtn.alignment = ["right", "center"];
    mirrorBtn.preferredSize.width = 50;

    // --- Version Text ---
    var versionText = panel.add(
      "statictext",
      undefined,
      "Camera Utility 1.0.2"
    );
    versionText.alignment = ["center", "top"];
    versionText.graphics.font = ScriptUI.newFont("Arial", "REGULAR", 10);
    versionText.graphics.foregroundColor = versionText.graphics.newPen(
      panel.graphics.PenType.SOLID_COLOR,
      [0.5, 0.5, 0.5],
      1
    );

    if (panel instanceof Window) {
      panel.center();
      panel.show();
    } else {
      panel.layout.layout(true);
    }
  }

  // --- SECTION: CORE LOGIC AND HELPER FUNCTIONS ---

  /**
   * getNextSequenceNumber
   * Finds the highest number used in layer names with a specific prefix within a composition.
   * Used to name new 'Camera_' rigs sequentially (Camera_1, Camera_2, etc.).
   * @param {CompItem} comp The composition to scan.
   * @param {string} baseName The prefix of the layer names to look for (e.g., "Camera_").
   * @returns {number} The next available number in the sequence.
   */
  function getNextSequenceNumber(comp, baseName) {
    var highestNum = 0;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (layer.name.indexOf(baseName) === 0) {
        var numStr = layer.name.split(baseName)[1].trim();
        var num = parseInt(numStr, 10);
        if (!isNaN(num) && num > highestNum) {
          highestNum = num;
        }
      }
    }
    return highestNum + 1;
  }

  /**
   * getNextSceneNumber
   * Finds the highest number used in composition names with a specific prefix in the project.
   * Used to name new 'Scene_' pre-compositions sequentially.
   * @param {string} baseName The prefix of the composition names to look for (e.g., "Scene_").
   * @returns {number} The next available number in the sequence.
   */
  function getNextSceneNumber(baseName) {
    var highestNum = 0;
    var regex = new RegExp("^" + baseName + "[_ ]?(\\d+)$", "i");
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem) {
        var match = item.name.match(regex);
        if (match && match[1]) {
          var num = parseInt(match[1], 10);
          if (num > highestNum) {
            highestNum = num;
          }
        }
      }
    }
    return highestNum + 1;
  }

  /**
   * createCameraRig
   * Builds the primary, modular camera rig in the specified composition.
   * The rig consists of three main parts:
   * 1. The 'Rig' Null: The main layer for animators to keyframe.
   * 2. The 'Controller' Null: An internal layer that reads data from the active 'Rig' null.
   * 3. The 'Camera' Layer: The actual AE camera, driven by expressions from the 'Controller'.
   * @param {CompItem} comp The composition where the rig will be created.
   * @returns {string} The name of the created rig layer.
   */
  function createCameraRig(comp) {
    // --- Constants for camera calculations ---
    var INITIAL_FOCAL_LENGTH = 40; // Default lens focal length in mm.
    var INITIAL_DISTANCE_OFFSET = 0; // Default Z-distance offset.
    var FILM_BACK_WIDTH = 36.0; // Assumes a full-frame sensor (36mm). Critical for dolly-zoom math.

    // --- Layer Creation ---
    var seqNum = getNextSequenceNumber(comp, "Camera_");
    var rigName = "Camera_" + seqNum;
    var controllerName = "Camera Controller " + seqNum;
    var cameraName = "Camera " + seqNum;

    // 1. The 'Rig' Null (Animator's Controls)
    var rig = comp.layers.addNull();
    rig.name = rigName;
    rig.threeDLayer = true;
    rig.guideLayer = true; // Non-rendering.
    rig.outPoint = seqNum === 1 ? comp.duration : 5; // First rig spans the comp, subsequent rigs are for cuts.

    // Add effect sliders for camera control.
    var focalLengthControl = rig.Effects.addProperty("ADBE Slider Control");
    focalLengthControl.name = "Focal Length (mm)";
    focalLengthControl.property("Slider").setValue(INITIAL_FOCAL_LENGTH);

    var distanceControl = rig.Effects.addProperty("ADBE Slider Control");
    distanceControl.name = "Distance";
    distanceControl.property("Slider").setValue(INITIAL_DISTANCE_OFFSET);

    // 2. The 'Controller' Null (Internal Brain)
    var controller = comp.layers.addNull();
    controller.name = controllerName;
    controller.threeDLayer = true;
    controller.shy = true; // Hidden by default.
    controller.outPoint = comp.duration;

    // --- Expression Logic ---
    // This expression block finds the currently active 'Camera_' rig layer based on the timeline indicator.
    // This allows for switching between multiple camera shots without changing expressions.
    var findActiveRigLogic = [
      "var activeRig = null;",
      "for (var i = 1; i <= thisComp.numLayers; i++) {",
      "    var layer = thisComp.layer(i);",
      "    if (layer.name.indexOf('Camera_') === 0 && layer.active) {",
      "        activeRig = layer;",
      "        break;",
      "    }",
      "}",
    ].join("\n");

    // Expressions to link the controller's transforms to the active rig.
    // The rotation expression includes parenting calculations to get the final world rotation.
    controller.transform.anchorPoint.expression =
      findActiveRigLogic +
      "\nif (activeRig) { activeRig.transform.anchorPoint; } else { value; }";
    controller.transform.position.expression =
      findActiveRigLogic +
      "\nif (activeRig) { activeRig.toWorld(activeRig.transform.anchorPoint); } else { value; }";
    controller.transform.scale.expression =
      findActiveRigLogic +
      "\nif (activeRig) { activeRig.transform.scale; } else { value; }";
    controller.transform.orientation.expression =
      findActiveRigLogic +
      "\nif (activeRig) { activeRig.transform.orientation; } else { value; }";
    function createRotationExpression(axis) {
      return (
        findActiveRigLogic +
        "\n" +
        [
          "if (activeRig) {",
          "  var r = activeRig.transform." + axis + "; var l = activeRig;",
          "  while (l.hasParent){ l = l.parent; r += l.transform." +
            axis +
            "; }",
          "  r;",
          "} else { value; }",
        ].join("\n")
      );
    }
    controller.transform.xRotation.expression =
      createRotationExpression("xRotation");
    controller.transform.yRotation.expression =
      createRotationExpression("yRotation");
    controller.transform.zRotation.expression =
      createRotationExpression("zRotation");

    // Expressions to link the controller's effect sliders to the active rig's sliders.
    var controllerFocalLength = controller.Effects.addProperty(
      "ADBE Slider Control"
    );
    controllerFocalLength.name = "active_FocalLength";
    controllerFocalLength.property("Slider").expression =
      findActiveRigLogic +
      "\nif (activeRig && activeRig.effect('Focal Length (mm)')) { activeRig.effect('Focal Length (mm)')('Slider'); } else { " +
      INITIAL_FOCAL_LENGTH +
      "; }";
    var controllerDistance = controller.Effects.addProperty(
      "ADBE Slider Control"
    );
    controllerDistance.name = "active_Distance";
    controllerDistance.property("Slider").expression =
      findActiveRigLogic +
      "\nif (activeRig && activeRig.effect('Distance')) { activeRig.effect('Distance')('Slider'); } else { " +
      INITIAL_DISTANCE_OFFSET +
      "; }";

    // 3. The Camera Layer
    var cam = comp.layers.addCamera(cameraName, [
      comp.width / 2,
      comp.height / 2,
    ]);
    cam.shy = true;
    cam.parent = controller;
    cam.transform.position.setValue([0, 0, 0]); // Position is controlled by expression.

    // --- Dolly-Zoom Expression for Camera Position ---
    // This expression calculates the camera's Z position to create a dolly-zoom effect.
    // It adjusts the camera's distance from the subject to compensate for changes in focal length,
    // keeping the subject framed consistently.
    cam.transform.position.expression = [
      "try {",
      "    var ctrl = thisLayer.parent;", // The 'Controller' null.
      '    var fl = ctrl.effect("active_FocalLength")("Slider");', // Current focal length.
      '    var userSetDist = ctrl.effect("active_Distance")("Slider");', // User-defined distance offset.
      "    var zPosFromFL = -(thisComp.width * fl) / " +
        FILM_BACK_WIDTH.toFixed(1) +
        ";", // Core dolly calculation.
      "    var compensatedDistOffset = (userSetDist / " +
        INITIAL_FOCAL_LENGTH.toFixed(1) +
        ") * fl;", // Scales the distance offset relative to the focal length.
      "    var finalZPos = zPosFromFL + compensatedDistOffset;", // Combines the two values.
      "    [0, 0, finalZPos];",
      "} catch (e) { value; }",
    ].join("\n");

    // The 'Zoom' property in After Effects is analogous to the camera's distance from the film plane.
    // This expression links it directly to the dolly calculation, providing an intuitive value.
    cam.zoom.expression = [
      "try {",
      "    var ctrl = thisLayer.parent;",
      '    var fl = ctrl.effect("active_FocalLength")("Slider");',
      "    var zPosFromFL = -(thisComp.width * fl) / " +
        FILM_BACK_WIDTH.toFixed(1) +
        ";",
      "    Math.abs(zPosFromFL);",
      "} catch (e) { value; }",
    ].join("\n");

    // Linking Focus Distance to the Zoom value keeps the focal plane at the subject.
    cam.focusDistance.expression = "thisLayer.cameraOption.zoom";

    comp.hideShyLayers = true;
    return rigName;
  }

  /**
   * createMirrorCameraRig
   * Builds a "mirror" of the main camera rig inside a pre-composition. This allows animators
   * to work inside a pre-comp and see the correct final framing from the main composition's camera.
   * @param {CompItem} comp The active pre-composition to build the rig in.
   * @param {string} sourceCompName The name of the main composition containing the primary rig.
   */
  function createMirrorCameraRig(comp, sourceCompName) {
    // 1. Find the source composition in the project.
    var sourceComp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      if (
        app.project.item(i) instanceof CompItem &&
        app.project.item(i).name === sourceCompName
      ) {
        sourceComp = app.project.item(i);
        break;
      }
    }
    if (!sourceComp) {
      alert("Source composition '" + sourceCompName + "' not found.");
      return;
    }

    // 2. Find the Camera Controller layer in the source composition.
    var sourceControllerName = null;
    for (var i = 1; i <= sourceComp.numLayers; i++) {
      if (sourceComp.layer(i).name.indexOf("Camera Controller") === 0) {
        sourceControllerName = sourceComp.layer(i).name;
        break;
      }
    }
    if (!sourceControllerName) {
      alert("No 'Camera Controller' found in '" + sourceCompName + "'.");
      return;
    }

    // 3. Clean up any pre-existing mirror rig layers in the current pre-comp.
    for (var i = comp.numLayers; i >= 1; i--) {
      var layer = comp.layer(i);
      if (
        layer.name === "Mirror Camera" ||
        layer.name === "Mirror Camera Controller"
      ) {
        layer.remove();
      }
    }

    // 4. Create the new mirror rig layers.
    var null_obj = comp.layers.addNull();
    null_obj.name = "Mirror Camera Controller";
    null_obj.threeDLayer = true;
    null_obj.shy = true;

    var cam = comp.layers.addCamera("Mirror Camera", [
      comp.width / 2,
      comp.height / 2,
    ]);
    cam.parent = null_obj;
    cam.shy = true;
    cam.transform.position.setValue([0, 0, 0]);

    // --- Expression for Linking to Main Comp ---
    // This helper function creates an expression that reads a value from the main camera controller.
    // Crucially, it uses clamp() to sample the time correctly, preventing motion blur or "double-transform"
    // artifacts at the start/end frames of the pre-comp.
    function createClampedExpression(sourceLayerName, propertyPath) {
      return [
        "try {",
        '    var sourceComp = comp("' + sourceCompName + '");',
        '    var sourceLayer = sourceComp.layer("' + sourceLayerName + '");',
        "    var precompLayer = sourceComp.layer(thisComp.name);", // Find this precomp layer within the main comp.
        "    var timeInMainComp = time + precompLayer.startTime;", // Calculate the equivalent time in the main comp.
        "    var mainCompInPoint = precompLayer.inPoint;",
        "    var mainCompOutPoint = precompLayer.outPoint - sourceComp.frameDuration;",
        "    var clampedTime = clamp(timeInMainComp, mainCompInPoint, mainCompOutPoint);", // Clamp the time.
        "    sourceLayer." + propertyPath + ".valueAtTime(clampedTime);", // Get the value at the correct time.
        "} catch (e) { value; }",
      ].join("\n");
    }

    // 5. Apply the linking expressions to all transform properties and effect sliders.
    var transformProps = [
      "anchorPoint",
      "position",
      "scale",
      "orientation",
      "xRotation",
      "yRotation",
      "zRotation",
    ];
    transformProps.forEach(function (prop) {
      null_obj.transform[prop].expression = createClampedExpression(
        sourceControllerName,
        "transform." + prop
      );
    });

    var mirrorFocalLength = null_obj.Effects.addProperty("ADBE Slider Control");
    mirrorFocalLength.name = "Focal Length (mm)";
    mirrorFocalLength.property("Slider").expression = createClampedExpression(
      sourceControllerName,
      'effect("active_FocalLength")("Slider")'
    );

    var mirrorDistance = null_obj.Effects.addProperty("ADBE Slider Control");
    mirrorDistance.name = "Distance";
    mirrorDistance.property("Slider").expression = createClampedExpression(
      sourceControllerName,
      'effect("active_Distance")("Slider")'
    );

    // 6. Apply the same camera dolly-zoom expressions as the main rig.
    // It's essential that these are identical to ensure the mirror is pixel-perfect.
    var INITIAL_FOCAL_LENGTH = 40;
    var FILM_BACK_WIDTH = 36.0;

    cam.transform.position.expression = [
      "try {",
      "    var ctrl = thisLayer.parent;",
      '    var fl = ctrl.effect("Focal Length (mm)")("Slider");',
      '    var userSetDist = ctrl.effect("Distance")("Slider");',
      "    var zPosFromFL = -(thisComp.width * fl) / " +
        FILM_BACK_WIDTH.toFixed(1) +
        ";",
      "    var compensatedDistOffset = (userSetDist / " +
        INITIAL_FOCAL_LENGTH.toFixed(1) +
        ") * fl;",
      "    var finalZPos = zPosFromFL + compensatedDistOffset;",
      "    [0, 0, finalZPos];",
      "} catch (e) { value; }",
    ].join("\n");

    cam.zoom.expression = [
      "try {",
      "    var ctrl = thisLayer.parent;",
      '    var fl = ctrl.effect("Focal Length (mm)")("Slider");',
      "    var zPosFromFL = -(thisComp.width * fl) / " +
        FILM_BACK_WIDTH.toFixed(1) +
        ";",
      "    Math.abs(zPosFromFL);",
      "} catch (e) { value; }",
    ].join("\n");

    cam.focusDistance.expression = "thisLayer.cameraOption.zoom";

    comp.hideShyLayers = true;
  }

  // --- SCRIPT EXECUTION ---
  buildUI(thisObj);
})(this);
