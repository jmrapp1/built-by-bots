"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCreature, buildEgg, type Genes } from "@/lib/creature";

// One garden scene: a grass disc, light, and either an egg or a creature.
export default function Garden({ genes }: { genes: Genes | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f1e4);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 50);
    camera.position.set(0, 2.2, 4.2);
    camera.lookAt(0, 0.9, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb5c9a0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.2, 48), new THREE.MeshStandardMaterial({ color: 0x9cc58a }));
    ground.position.y = -0.1;
    scene.add(ground);
    const subject = genes ? buildCreature(genes) : buildEgg();
    scene.add(subject);
    let raf = 0;
    const tick = (t: number) => {
      subject.position.y = Math.sin(t / 600) * 0.05;
      subject.rotation.y = Math.sin(t / 1500) * 0.4;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [genes]);
  return <div ref={ref} style={{ width: 640, height: 420, borderRadius: 12, overflow: "hidden" }} />;
}
