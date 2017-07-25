class CollectedObject {
  guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  }
  id:number
  ref: string
  title: string
  uniqueID: string
  pos: {
    x:number
    y:number
    z:number
  }
  mesh:BABYLON.Mesh
  constructor(public type:string, public src:string){
    this.uniqueID = this.guid()
  }
}

class Game {
  private _canvas: any;//HTMLCanvasElement;
  private _engine: BABYLON.Engine;
  private _scene: BABYLON.Scene;
  private _webVrCamera: BABYLON.WebVRFreeCamera;
  private _camera: BABYLON.FreeCamera;
  private _light: BABYLON.Light;
  private _cursor: BABYLON.Mesh;
  private _gazeTarget: SelectedObject;

  constructor(canvasElement: string) {
    // Create canvas and engine
    this._canvas = document.getElementById(canvasElement);
    this._engine = new BABYLON.Engine(this._canvas, true);

    // TODO: A total hack here since we aren't bundling the controller models in our custom babylon build
    BABYLON['windowsControllerSrc'] = '/vrTemplate/assets/controllers/wmr/';
  }

  async loadModel(root, name): Promise<BABYLON.Mesh> {
    var p: Promise<BABYLON.Mesh> = new Promise((res, rej) => {
      var parent = new BABYLON.Scene(this._engine)
      BABYLON.SceneLoader.ImportMesh(null, root, name, this._scene, (meshses) => {
        var parent = new BABYLON.Mesh("", this._scene)
        meshses.forEach((m,i)=>{
          //console.log(m.parent == this._scene)
          //var other:any = this._scene
          if(!m.parent){
            console.log("hit")
            m.setParent(parent);
            //m.parent = parent
          }
        })
        res(parent);
      }, null, function (scene, message) {
        rej(message)
      })
      var m = new BABYLON.Mesh(null, null);
    });
    return p;
  }

  createCursor() {
    var cursorMaterial = new BABYLON.StandardMaterial("cursor", this._scene);
    cursorMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0);

    this._cursor = BABYLON.Mesh.CreateSphere("cursor", 10, 0.3, this._scene);
    this._cursor.material = cursorMaterial;
    this._cursor.isPickable = false;
  }

  updateCursor() {
    if (!this._cursor)
      return;

    var forward = new BABYLON.Vector3(0, 0, -1);
    forward = vecToLocal(forward, this._camera);
    var origin = this._camera.globalPosition;

    var direction = forward.subtract(origin);
    direction = BABYLON.Vector3.Normalize(direction);

    var length = 30;

    var ray = new BABYLON.Ray(origin, direction, length);
   
    var hit = this._scene.pickWithRay(ray, null);

    if (!hit || !hit.pickedMesh) {
      // draw cursor no selection
      this._cursor.position = this._camera.getFrontPosition(length);

      // gaze removed from an object
      if (this._gazeTarget.mesh) {
        this.removeObjectHighlight(this._gazeTarget);
        this._gazeTarget.mesh = undefined;
      }
    } else {
      // selection cursor
      this._cursor.position = hit.pickedPoint;

      // gaze sees a new object
      if (!this._gazeTarget.mesh || this._gazeTarget.mesh != hit.pickedMesh) {
        this._gazeTarget.mesh = hit.pickedMesh;
        this.addObjectHighlight(this._gazeTarget);
      }
    }
  }

  removeObjectHighlight(selectedObject) {
    if (!selectedObject.mesh || !selectedObject.mesh.name) {
      console.error("Can't hightlight mesh: " + selectedObject);
      return;
    }

    console.debug("hideMenuOptions for: " + selectedObject.mesh.name);
  }

  addObjectHighlight(selectedObject) {
    if (!selectedObject.mesh || !selectedObject.mesh.name) {
      console.error("Can't hightlight mesh: " + selectedObject);
      return;
    }

    // getObjectDetails(mesh.name);
    console.debug("showMenuOptions for: " + selectedObject.mesh.name);
  }

  toggleZoomObjectMode() {
    if (!this._gazeTarget.mesh) {
      console.debug("No object picked");
      return;
    }

    var mesh = this._gazeTarget.mesh;

    if (this._cursor) {
      // zoom in
      this._gazeTarget.positionInCollection = mesh.position;
      mesh.setAbsolutePosition(this._camera.getFrontPosition(this._gazeTarget.GetZoomDistanceToCam()));
      //mesh.scaling = new BABYLON.Vector3(5, 5, 5); - changes the object position weirdly

      // turn off the cursor
      this._cursor.dispose();
      this._cursor = undefined;
    }
    else {
      // zoom out
      //mesh.scaling = new BABYLON.Vector3(1, 1, 1);
      mesh.position = this._gazeTarget.positionInCollection;

      // turn on the cursor back
      this.createCursor();
    }
  }

  async createScene() {
    // create a basic BJS Scene object
    this._scene = new BABYLON.Scene(this._engine);
    this._scene.useRightHandedSystem = true;

    var headset = null;
    // If a VR headset is connected, get its info
    if (navigator.getVRDisplays) {
      var displays = await navigator.getVRDisplays()
      if (displays[0]) {
        headset = displays[0];
      }
    }

    if (headset) {
      // Create a WebVR camera with the trackPosition property set to false so that we can control movement with the gamepad
      this._camera = new BABYLON.WebVRFreeCamera("vrcamera", new BABYLON.Vector3(0, 0, 0), this._scene, { trackPosition: true });

      //this._camera.deviceScaleFactor = 1;
    } else {
      // create a FreeCamera, and set its position to (x:0, y:0, z:-10)
      this._camera = new BABYLON.FreeCamera('camera1', new BABYLON.Vector3(0, 0, -10), this._scene);
    }

    this._scene.onPointerDown = () => {
      console.log("down")
      this._scene.onPointerDown = undefined
      this._camera.attachControl(this._canvas, true);

      this.createCursor();      
      this._scene.registerBeforeRender(() => { this.updateCursor(); });
    };

    window.addEventListener('keydown', (eventArg) => {
      if (eventArg.key == '`')
        this._scene.debugLayer.show();

      if (eventArg.key == ' ') {
        this.toggleZoomObjectMode();
      }
    });

    // target the camera to scene origin
    this._camera.setTarget(BABYLON.Vector3.Zero());

    // attach the camera to the canvas
    this._camera.attachControl(this._canvas, false);

    // create a basic light, aiming 0,1,0 - meaning, to the sky
    this._light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), this._scene);

    // create the skybox cubemap
    var skybox = BABYLON.Mesh.CreateBox("skyBox", 10000, this._scene);
    var skyboxMaterial = new BABYLON.StandardMaterial("skyBox", this._scene);
    skyboxMaterial.reflectionTexture = new BABYLON.CubeTexture("Textures/sky7/sky7", this._scene);
    skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
    skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    skybox.material = skyboxMaterial;
    skybox.isPickable = false;

    // create the ground (round platform)
    var groundMaterial = new BABYLON.StandardMaterial("ground", this._scene);
    groundMaterial.diffuseTexture = new BABYLON.Texture("textures/polar_grid.png", this._scene);
    var ground = BABYLON.Mesh.CreateCylinder("ground", 0.1, 3, 3, 100, 10, this._scene);
    // the user should see the ground below
    ground.position = new BABYLON.Vector3(0, -1.5, -10);
    ground.material = groundMaterial;
    ground.isPickable = false;

    this._gazeTarget = new SelectedObject();

    //BABYLON.SceneLoader.ImportMesh()
    var objectCount = 5
    for (var i = 0; i < objectCount; i++) {
      var meshName = Math.random() > 0.5 ? "Avocado" : "Avocado"
      var parent = await this.loadModel("/docs/assets/", meshName + ".glb")

      var size = 0
      var bottom = Infinity

      //Try to get object x size and bottom y pos
      parent.getChildMeshes().forEach((c) => {

        var diff = c.getBoundingInfo().boundingBox.maximumWorld.x - c.getBoundingInfo().boundingBox.minimumWorld.x
        var bottomY = c.getBoundingInfo().boundingBox.minimum.y + c.position.y
        if (isFinite(diff) && diff != 0) {
          size = Math.max(size, c.getBoundingInfo().boundingBox.maximumWorld.x - c.getBoundingInfo().boundingBox.minimumWorld.x)
          bottom = Math.min(bottom, bottomY)
        }
      })
      //TODO bottom is incorrect?

      //console.log(bottom)
      
      //Put objects randomly in arc in from of camera
      //+Math.random()*1
      var rowSize = 3
      var rowIndex = i%rowSize
      console.log(rowIndex)
      var colIndex = Math.floor(i/rowSize)
      var rot = -Math.PI/2+(Math.PI*(rowIndex/(rowSize-1)))
      parent.position.x = this._camera.position.x + (Math.sin(rot)*5)//2*(i-objectCount/2)
      parent.position.z = this._camera.position.z + (Math.cos(rot)*5)
      parent.position.y = 1 + colIndex*2

      //Scale to be same size
      var desiredSize = 1
      parent.scaling.x = desiredSize / size
      parent.scaling.y = desiredSize / size
      parent.scaling.z = desiredSize / size
    }
  }
  
  animate(): void {
    // run the render loop
    this._engine.runRenderLoop(() => {
      this._scene.render();
    });

    // the canvas/window resize event handler
    window.addEventListener('resize', () => {
      this._engine.resize();
    });
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Create the game using the 'renderCanvas'
  let game = new Game('renderCanvas');

  // Create the scene
  await game.createScene();

  // start animation
  game.animate();
});

/* Utilities */
class SelectedObject {
  public GetZoomDistanceToCam(): number {
    return 2; // we might want to calculate based on the object size
  }

  public mesh: BABYLON.AbstractMesh;
  public positionInCollection: BABYLON.Vector3;
}

var vecToLocal = function (vector, mesh): BABYLON.Vector3 {
  var m = mesh.getWorldMatrix();
  var v = BABYLON.Vector3.TransformCoordinates(vector, m);
  return v;
}