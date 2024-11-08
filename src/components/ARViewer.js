// components/ARViewer.js
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase configuration
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

const ARViewer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadARScripts = async () => {
    const scripts = [
      'https://aframe.io/releases/1.2.0/aframe.min.js',
      'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js'
    ];

    for (const url of scripts) {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${url}`));
      });
    }
  };

  const setupAREnvironment = async () => {
    try {
      // Get AR data from Firebase
      const querySnapshot = await getDocs(collection(db, 'arExperiences'));
      if (querySnapshot.empty) {
        throw new Error('No AR experiences found');
      }

      const arExperience = querySnapshot.docs[0].data();

      // Create AR Scene
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; trackingMethod: best;');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      scene.setAttribute('renderer', 'antialias: true; alpha: true');
      scene.style.zIndex = '0';

      // Create assets
      const assets = document.createElement('a-assets');
      const video = document.createElement('video');
      video.id = 'video';
      video.src = arExperience.videoUrl;
      video.setAttribute('preload', 'auto');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('crossorigin', 'anonymous');
      video.muted = true;
      assets.appendChild(video);
      scene.appendChild(assets);

      // Create marker
      const marker = document.createElement('a-marker');
      marker.setAttribute('preset', 'custom');
      marker.setAttribute('type', 'pattern');
      marker.setAttribute('url', arExperience.markerUrl);
      marker.setAttribute('smooth', 'true');
      marker.setAttribute('smoothCount', '5');

      // Create video entity
      const videoEntity = document.createElement('a-video');
      videoEntity.setAttribute('src', '#video');
      videoEntity.setAttribute('position', '0 0 0');
      videoEntity.setAttribute('rotation', '-90 0 0');
      videoEntity.setAttribute('width', '2');
      videoEntity.setAttribute('height', '1.5');
      marker.appendChild(videoEntity);

      // Handle marker detection
      marker.addEventListener('markerFound', () => {
        video.muted = false;
        video.play().catch(console.error);
        const instructions = document.querySelector('.instructions');
        if (instructions) instructions.style.display = 'none';
      });

      marker.addEventListener('markerLost', () => {
        video.pause();
        video.muted = true;
        const instructions = document.querySelector('.instructions');
        if (instructions) instructions.style.display = 'block';
      });

      // Add camera
      const camera = document.createElement('a-entity');
      camera.setAttribute('camera', '');
      scene.appendChild(marker);
      scene.appendChild(camera);

      // Add scene to document
      document.body.appendChild(scene);

    } catch (error) {
      console.error('Error setting up AR:', error);
      setError('Failed to load AR experience. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAR = async () => {
      try {
        await loadARScripts();
        // Wait for scripts to initialize
        setTimeout(() => {
          setupAREnvironment();
        }, 1000);
      } catch (error) {
        console.error('Failed to initialize AR:', error);
        setError('Failed to load AR components. Please check your connection.');
        setLoading(false);
      }
    };

    initAR();

    // Cleanup
    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) scene.parentNode.removeChild(scene);
    };
  }, []);

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
};

// Styled Components
const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;

  & > div {
    z-index: 1;
  }

  .a-canvas {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 0 !important;
  }
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
  z-index: 2;
  width: 80%;
  max-width: 400px;
  pointer-events: none;
`;

const LoadingScreen = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  z-index: 999;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  color: white;
  z-index: 999;
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