import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * renderer + camera + lights + IBL + composer.
 * Không shadow map, không transmission — cả hai đều nhân đôi chi phí mỗi frame
 * (xem README § Performance notes).
 */
export function createScene(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.msaa,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);
  scene.fog = new THREE.Fog(0x0d1117, 11, 26);

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(0, 0.1, 7.2);

  // IBL chất lượng studio mà không tải file .hdr nào
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  const key  = new THREE.DirectionalLight(0x388bfd, 2.4);
  key.position.set(-2.5, 3, 5);
  const fill = new THREE.DirectionalLight(0x1b2c43, 1.1);
  fill.position.set(3.5, -1.5, 2.5);
  const rim  = new THREE.PointLight(0xd29922, 2.2, 12, 2);
  rim.position.set(0, 0.4, -2.4);
  scene.add(key, fill, rim);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(quality.dpr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth * 0.5, innerHeight * 0.5), // half-res: nhìn không khác, nhanh gấp đôi
    quality.bloom,
    0.62,
    0.86
  );
  if (quality.bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w * 0.5, h * 0.5);
  }
  addEventListener('resize', resize);

  return { renderer, scene, camera, composer, bloom, lights: { key, fill, rim }, resize, envRT };
}
