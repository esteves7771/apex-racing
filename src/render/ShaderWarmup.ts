import * as THREE from 'three';
/** Temporary material owners keep compileAsync's programs alive during rapid scene/model unmounts. */
export function shaderSnapshot(scene: THREE.Scene) {
  const snapshot = scene.clone(true),
    materials = new Map<THREE.Material, THREE.Material>();
  snapshot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const clone = (material: THREE.Material) => {
      let owned = materials.get(material);
      if (!owned) {
        owned = material.clone();
        owned.onBeforeCompile = material.onBeforeCompile;
        owned.customProgramCacheKey = material.customProgramCacheKey;
        materials.set(material, owned);
      }
      return owned;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(clone)
      : clone(object.material);
  });
  let disposed = false;
  return {
    scene: snapshot,
    dispose() {
      if (disposed) return;
      disposed = true;
      materials.forEach((m) => m.dispose());
      materials.clear();
      snapshot.clear();
    },
  };
}
