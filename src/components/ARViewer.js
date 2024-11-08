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

  useEffect(() => {
    const loadScripts = async () => {
      try {
        // Load required scripts
        await Promise.all([
          loadScript('https://aframe.io/releases/1.4.2/aframe.min.js'),
          loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.min.js')
        ]);
        return true;
      } catch (error) {
        console.error('Script loading error:', error);
        return false;
      }
    };

    const initAR = async () => {
      try {
        // First load scripts
        const scriptsLoaded = await loadScripts();
        if (!scriptsLoaded) {
          throw new Error('Failed to load AR scripts');
        }

        // Get AR data from Firebase
        const querySnapshot = await getDocs(collection(db, 'arExperiences'));
        if (querySnapshot.empty) {
          throw new Error('No AR experiences found');
        }

        const arExperience = querySnapshot.docs[0].data();

        // Create AR Scene
        const sceneEl = document.createElement('a-scene');
        sceneEl.setAttribute('embedded', '');
        sceneEl.setAttribute('arjs', `
          sourceType: webcam;
          debugUIEnabled: false;
          detectionMode: mono;
          maxDetectionRate: 30;
          canvasWidth: 1920;
          canvasHeight: 1080;
          displayWidth: 1920;
          displayHeight: 1080;
        `);
        sceneEl.setAttribute('vr-mode-ui', 'enabled: false');
        sceneEl.setAttribute('renderer', 'logarithmicDepthBuffer: true; precision: medium;');

        // Add assets
        const assets = document.createElement('a-assets');
        const video = document.createElement('video');
        video.id = 'arVideo';
        video.src = arExperience.videoUrl;
        video.setAttribute('preload', 'auto');
        video.setAttribute('loop', '');
        video.setAttribute('crossorigin', 'anonymous');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        assets.appendChild(video);
        sceneEl.appendChild(assets);

        // Add marker
        const marker = document.createElement('a-marker');
        marker.setAttribute('preset', 'custom');
        marker.setAttribute('type', 'pattern');
        marker.setAttribute('url', arExperience.markerUrl);
        marker.setAttribute('smooth', 'true');
        marker.setAttribute('smoothCount', '5');

        // Add video to marker
        const videoEntity = document.createElement('a-video');
        videoEntity.setAttribute('src', '#arVideo');
        videoEntity.setAttribute('position', '0 0 0');
        videoEntity.setAttribute('rotation', '-90 0 0');
        videoEntity.setAttribute('width', '2');
        videoEntity.setAttribute('height', '1.5');
        marker.appendChild(videoEntity);

        // Handle marker detection
        marker.addEventListener('markerFound', () => {
          video.play();
          const instructions = document.querySelector('.instructions');
          if (instructions) instructions.style.display = 'none';
        });

        marker.addEventListener('markerLost', () => {
          video.pause();
          const instructions = document.querySelector('.instructions');
          if (instructions) instructions.style.display = 'flex';
        });

        // Add camera
        const camera = document.createElement('a-entity');
        camera.setAttribute('camera', '');
        sceneEl.appendChild(marker);
        sceneEl.appendChild(camera);

        // Add scene to document
        document.body.appendChild(sceneEl);

        // Request camera permission explicitly
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (error) {
            throw new Error('Camera permission denied');
          }
        }

      } catch (error) {
        console.error('AR initialization error:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) scene.parentNode.removeChild(scene);
    };
  }, []);

  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
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
        Point your camera at the marker
      </Instructions>
    </Container>
  );
};

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
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
  display: flex;
  justify-content: center;
  align-items: center;
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