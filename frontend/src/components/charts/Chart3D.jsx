import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function Chart3D({ data, config }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !config.x_axis || !config.y_axis || !config.z_axis) return;
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(15, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Create 3D chart based on data
    createChart3D(scene, data, config);

    // Add grid
    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xdddddd);
    scene.add(gridHelper);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      scene.rotation.y += 0.003;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener('resize', handleResize);
      if (mount && renderer.domElement) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [data, config]);

  const createChart3D = (scene, data, config) => {
    const { x_axis, y_axis, z_axis } = config;

    const xValues = [...new Set(data.map(d => d[x_axis]))];
    const zValues = [...new Set(data.map(d => d[z_axis]))];
    const yMax = Math.max(...data.map(d => d[y_axis] || 0));

    data.forEach((item) => {
      const xIndex = xValues.indexOf(item[x_axis]);
      const zIndex = zValues.indexOf(item[z_axis]);
      const yValue = item[y_axis] || 0;

      if (xIndex === -1 || zIndex === -1) return;

      const height = (yValue / yMax) * 10;
      if (height <= 0) return;

      const geometry = new THREE.BoxGeometry(0.8, height, 0.8);
      const material = new THREE.MeshLambertMaterial({ color: config.color || 0x3B82F6 });
      
      const bar = new THREE.Mesh(geometry, material);
      
      const xPos = (xIndex - (xValues.length - 1) / 2) * 2;
      const zPos = (zIndex - (zValues.length - 1) / 2) * 2;
      
      bar.position.set(xPos, height / 2, zPos);
      bar.castShadow = true;
      bar.receiveShadow = true;
      
      scene.add(bar);
    });
  };

  return (
    <div ref={mountRef} className="w-full h-full min-h-96 bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg" />
  );
}
