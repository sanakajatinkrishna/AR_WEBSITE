import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - Replace with your config
const firebaseConfig = {
 apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function ARViewer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initAR = async () => {
      try {
        // Load AR.js and A-Frame scripts
        await Promise.all([
          loadScript('https://aframe.io/releases/1.2.0/aframe.min.js'),
          loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js')
        ]);

        // Setup AR scene
        setupARScene();
      } catch (err) {
        console.error('AR initialization error:', err);
        setError('Failed to load AR experience. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    };

    initAR();

    // Cleanup function
    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) {
        scene.parentNode.removeChild(scene);
      }
    };
  }, []);

  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  };

  const setupARScene = () => {
    const scene = document.createElement('a-scene');
    scene.setAttribute('embedded', '');
    scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('renderer', 'logarithmicDepthBuffer: true; precision: medium;');

    // Create assets
    const assets = document.createElement('a-assets');
    const video = document.createElement('video');
    video.id = 'ar-video';
    video.setAttribute('preload', 'auto');
    video.setAttribute('response-type', 'arraybuffer');
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('loop', 'true');
    assets.appendChild(video);
    scene.appendChild(assets);

    // Create marker
    const marker = document.createElement('a-marker');
    marker.setAttribute('preset', 'custom');
    marker.setAttribute('type', 'pattern');
    marker.setAttribute('url', '');
    marker.setAttribute('smooth', 'true');
    marker.setAttribute('smoothCount', '5');

    // Create video entity
    const videoEntity = document.createElement('a-video');
    videoEntity.setAttribute('src', '#ar-video');
    videoEntity.setAttribute('position', '0 0 0');
    videoEntity.setAttribute('rotation', '-90 0 0');
    videoEntity.setAttribute('width', '2');
    videoEntity.setAttribute('height', '1.5');
    marker.appendChild(videoEntity);

    // Handle marker detection
    marker.addEventListener('markerFound', () => {
      video.play().catch(console.error);
      const instructions = document.querySelector('.instructions');
      if (instructions) {
        instructions.style.display = 'none';
      }
    });

    marker.addEventListener('markerLost', () => {
      video.pause();
      const instructions = document.querySelector('.instructions');
      if (instructions) {
        instructions.style.display = 'block';
      }
    });

    // Add camera
    const camera = document.createElement('a-entity');
    camera.setAttribute('camera', '');
    scene.appendChild(marker);
    scene.appendChild(camera);

    // Add scene to document
    document.body.appendChild(scene);
  };

  if (loading) {
    return <LoadingScreen>Loading AR Experience...</LoadingScreen>;
  }

  if (error) {
    return (
      <ErrorContainer>
        <ErrorText>{error}</ErrorText>
        <RetryButton onClick={() => window.location.reload()}>
          Try Again
        </RetryButton>
      </ErrorContainer>
    );
  }

  return (
    <Container>
      <Instructions className="instructions">
        Point your camera at the marker to view AR content
      </Instructions>
    </Container>
  );
}

// Styled components
const Container = styled.div`
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background-color: #000;
`;

const Instructions = styled.div`
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 25px;
  border-radius: 25px;
  font-size: 16px;
  text-align: center;
  z-index: 100;
  width: 80%;
  max-width: 400px;
`;

const LoadingScreen = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  color: white;
`;

const ErrorText = styled.div`
  margin-bottom: 20px;
`;

const RetryButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  
  &:hover {
    background: #1976D2;
  }
`;

export default ARViewer;