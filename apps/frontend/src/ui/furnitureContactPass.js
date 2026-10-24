import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Offscreen postprocessing loses the canvas's MSAA. Smooth fine piping and
// textile edges again after tone mapping, including on resize/high-DPI screens.
export class FurnitureAntialiasPass extends ShaderPass {
  constructor() { super(FXAAShader); }
  render(renderer,writeBuffer,readBuffer,...args) {
    this.uniforms.resolution.value.set(1/readBuffer.width,1/readBuffer.height);
    super.render(renderer,writeBuffer,readBuffer,...args);
  }
}

// SSAO compares NORMALIZED linear depth, not metres. Fixed .001/.06 values
// suppressed furniture contacts with the viewer's 1000 m camera far plane.
export class FurnitureContactPass extends SSAOPass {
  constructor(scene,camera,width,height) {
    super(scene,camera,width,height,24);
    this.kernelRadius=.18;
    this.contactDistance=.22;
    this.contactStrength=.7;
    this.ssaoMaterial.uniforms.contactStrength={value:this.contactStrength};
    this.ssaoMaterial.fragmentShader='uniform float contactStrength;\n'+this.ssaoMaterial.fragmentShader.replace(
      'vec3( 1.0 - occlusion )','vec3( 1.0 - occlusion * contactStrength )');
  }
  render(renderer,writeBuffer,readBuffer) {
    const range=this.camera.far-this.camera.near;
    this.minDistance=.003/range;
    this.maxDistance=this.contactDistance/range;
    this.ssaoMaterial.uniforms.contactStrength.value=this.contactStrength;
    for(const material of [this.ssaoMaterial,this.depthRenderMaterial]) {
      material.uniforms.cameraNear.value=this.camera.near;
      material.uniforms.cameraFar.value=this.camera.far;
    }
    this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    super.render(renderer,writeBuffer,readBuffer);
  }
}
