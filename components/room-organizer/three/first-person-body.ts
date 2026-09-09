import type * as THREE from 'three';

/** Keep the actual skinned body in the world; cut the head only at the eye camera. */
export function prepareFirstPersonBody(eye: THREE.Vector3) {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const copies: THREE.Material[] = [];
  return {
    attach(root: THREE.Object3D) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || originals.has(mesh)) return;
        originals.set(mesh, mesh.material);
        const adapt = (source: THREE.Material) => {
          const material = source.clone();
          material.onBeforeCompile = (shader) => {
            shader.uniforms.playerEye = { value: eye };
            shader.vertexShader = 'varying vec3 playerWorldPosition;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nplayerWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = 'uniform vec3 playerEye;\nvarying vec3 playerWorldPosition;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (distance(cameraPosition, playerEye) < 0.02 && playerWorldPosition.y > playerEye.y - 0.22) discard;');
          };
          material.customProgramCacheKey = () => 'first-person-body-v1';
          copies.push(material);
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(adapt) : adapt(mesh.material);
      });
    },
    dispose() {
      originals.forEach((material, mesh) => { mesh.material = material; });
      copies.forEach((material) => material.dispose());
      originals.clear();
    },
  };
}
