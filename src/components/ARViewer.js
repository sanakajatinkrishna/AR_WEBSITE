// components/ARViewer.js
import React, { useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ARViewer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [arExperience, setArExperience] = useState(null);

  const loadARScripts = useCallback(async () => {
    try {
      const scripts = [
        'https://aframe.io/releases/1.4.0/aframe.min.js',
        'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js'
      ];

      for (const url of scripts) {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error(`Failed to load ${url}`));
          document.head.appendChild(script);
        });
      }
    } catch (error) {
      throw new Error('Failed to load AR scripts: ' + error.message);
    }
  }, []);

  const fetchARExperience = useCallback(async () => {
    try {
      const q = query(
        collection(db, 'arExperiences'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('No AR experiences found');
      }

      const data = querySnapshot.docs[0].data();
      setArExperience(data);
      return data;
    } catch (error) {
      throw new Error('Failed to fetch AR experience: ' + error.message);
    }
  }, []);

  const setupARScene = useCallback(async (experience) => {
    try {
      // Create scene
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      scene.setAttribute('arjs', `
        sourceType: webcam;
        debugUIEnabled: false;
        detectionMode: mono_and_matrix;
        matrixCodeType: 3x3;
        sourceWidth: 1280;
        sourceHeight: 960;
        displayWidth: 1280;
        displayHeight: 960;
        maxDetectionRate: 60;
        canvasWidth: 1280;
        canvasHeight: 960;
      `);
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      scene.setAttribute('renderer', 'antialias: true; alpha: true; precision: mediump;');
      scene.setAttribute('loading-screen', 'dotsColor: white; backgroundColor: black');
      scene.style.zIndex = '0';

      // Create assets
      const assets = document.createElement('a-assets');
      const video = document.createElement('video');
      video.id = 'ar-video';
      video.src = experience.videoUrl;
      video.setAttribute('preload', 'auto');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('crossorigin', 'anonymous');
      video.setAttribute('loop', '');
      video.muted = true;
      assets.appendChild(video);
      scene.appendChild(assets);

      // Create marker
      const marker = document.createElement('a-marker');
      marker.setAttribute('preset', 'custom');
      marker.setAttribute('type', 'pattern');
      marker.setAttribute('url', experience.markerUrl);
      marker.setAttribute('smooth', 'true');
      marker.setAttribute('smoothCount', '10');
      marker.setAttribute('smoothTolerance', '0.01');
      marker.setAttribute('raycaster', 'objects: .clickable');
      marker.setAttribute('emitevents', 'true');
      marker.setAttribute('cursor', 'fuse: false; rayOrigin: mouse;');

      // Create video entity
      const videoEntity = document.createElement('a-video');
      videoEntity.setAttribute('src', '#ar-video');
      videoEntity.setAttribute('position', '0 0.1 0');
      videoEntity.setAttribute('rotation', '-90 0 0');
      videoEntity.setAttribute('width', '2');
      videoEntity.setAttribute('height', '1.5');
      videoEntity.setAttribute('class', 'clickable');
      marker.appendChild(videoEntity);

      // Handle marker events
      marker.addEventListener('markerFound', () => {
        video.play().catch(console.error);
        document.querySelector('.instructions').style.display = 'none';
      });

      marker.addEventListener('markerLost', () => {
        video.pause();
        document.querySelector('.instructions').style.display = 'flex';
      });

      // Add camera
      const camera = document.createElement('a-entity');
      camera.setAttribute('camera', '');
      camera.setAttribute('position', '0 0 0');
      camera.setAttribute('look-controls', 'enabled: false');

      scene.appendChild(marker);
      scene.appendChild(camera);

      // Add scene to document
      document.body.appendChild(scene);

      // Add device orientation permission request for iOS
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permissionButton = document.createElement('button');
        permissionButton.innerHTML = 'Enable AR';
        permissionButton.className = 'permission-button';
        permissionButton.style.display = 'block';
        document.body.appendChild(permissionButton);

        permissionButton.addEventListener('click', async () => {
          try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
              permissionButton.style.display = 'none';
            } else {
              throw new Error('Permission not granted');
            }
          } catch (error) {
            console.error('Error requesting device orientation permission:', error);
            setError('Please enable device orientation permissions for AR');
          }
        });
      }

    } catch (error) {
      throw new Error('Failed to setup AR scene: ' + error.message);
    }
  }, []);

  useEffect(() => {
    const initAR = async () => {
      try {
        setLoading(true);
        await loadARScripts();
        const experience = await fetchARExperience();
        
        // Wait for scripts to fully initialize
        setTimeout(async () => {
          await setupARScene(experience);
          setLoading(false);
        }, 2000);
      } catch (error) {
        console.error('AR initialization error:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) {
        scene.parentNode.removeChild(scene);
      }
      const permissionButton = document.querySelector('.permission-button');
      if (permissionButton) {
        permissionButton.parentNode.removeChild(permissionButton);
      }
    };
  }, [loadARScripts, fetchARExperience, setupARScene]);

  if (error) {
    return (
      <ErrorContainer>
        <ErrorContent>
          <ErrorText>{error}</ErrorText>
          <RetryButton onClick={() => window.location.reload()}>
            Try Again
          </RetryButton>
        </ErrorContent>
      </ErrorContainer>
    );
  }

  return (
    <Container>
      {loading && <LoadingScreen>Loading AR Experience...</LoadingScreen>}
      <Instructions className="instructions">
        <InstructionsText>
          Point your camera at the marker image to view AR content
        </InstructionsText>
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
  font-size: 24px;
  z-index: 1000;
`;

const Instructions = styled.div`
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  width: 90%;
  max-width: 400px;
`;

const InstructionsText = styled.p`
  color: white;
  font-size: 16px;
  text-align: center;
  margin: 0;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ErrorContent = styled.div`
  background: rgba(255, 255, 255, 0.1);
  padding: 30px;
  border-radius: 15px;
  text-align: center;
  max-width: 80%;
`;

const ErrorText = styled.p`
  color: white;
  font-size: 18px;
  margin-bottom: 20px;
`;

const RetryButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background: #1976D2;
  }
`;