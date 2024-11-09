// components/ARViewer.js
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
    try {
      // Load AFRAME core
      await loadScript('https://aframe.io/releases/1.4.0/aframe.min.js');
      // Load AR.js with improved image tracking
      await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js');
      // Load gesture handler for better mobile interaction
      await loadScript('https://raw.githack.com/fcor/arjs-gestures/master/dist/gestures.js');
    } catch (error) {
      throw new Error('Failed to load AR libraries');
    }
  };

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

  const getExperienceData = async () => {
    try {
      // Get experience ID from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const experienceId = urlParams.get('id');

      if (!experienceId) {
        throw new Error('No experience ID provided');
      }

      // Query Firestore for the specific experience
      const experienceRef = collection(db, 'arExperiences');
      const q = query(experienceRef, where('__name__', '==', experienceId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Experience not found');
      }

      return querySnapshot.docs[0].data();
    } catch (error) {
      throw new Error('Failed to fetch AR experience data');
    }
  };

  const setupARScene = async (arExperience) => {
    // Create AR Scene
    const scene = document.createElement('a-scene');
    scene.setAttribute('embedded', '');
    scene.setAttribute('gesture-detector', '');
    scene.setAttribute('arjs', `
      sourceType: webcam;
      debugUIEnabled: false;
      detectionMode: mono;
      imageTracking: true;
      sourceWidth: 1280;
      sourceHeight: 960;
      displayWidth: 1280;
      displayHeight: 960;
    `);
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('renderer', 'antialias: true; alpha: true');

    // Create assets container
    const assets = document.createElement('a-assets');

    // Set up video with proper attributes
    const video = document.createElement('video');
    video.id = 'ar-video';
    video.src = arExperience.videoUrl;
    video.preload = 'auto';
    video.response = true;
    video.loop = true;
    video.playsinline = true;
    video.setAttribute('webkit-playsinline', '');
    video.crossOrigin = 'anonymous';
    assets.appendChild(video);
    scene.appendChild(assets);

    // Create image target
    const imageTarget = document.createElement('a-nft');
    imageTarget.setAttribute('type', 'nft');
    imageTarget.setAttribute('url', arExperience.markerUrl);
    imageTarget.setAttribute('smooth', 'true');
    imageTarget.setAttribute('smoothCount', '10');
    imageTarget.setAttribute('smoothTolerance', '.01');
    imageTarget.setAttribute('smoothThreshold', '5');

    // Create video plane
    const videoEntity = document.createElement('a-video');
    videoEntity.setAttribute('src', '#ar-video');
    videoEntity.setAttribute('position', '0 0 0');
    videoEntity.setAttribute('rotation', '-90 0 0');
    videoEntity.setAttribute('width', '1');
    videoEntity.setAttribute('height', '0.75');
    videoEntity.setAttribute('gesture-handler', '');
    imageTarget.appendChild(videoEntity);

    // Add marker detection handlers
    imageTarget.addEventListener('markerFound', () => {
      console.log('Marker detected');
      video.play().catch(console.error);
      const instructions = document.querySelector('.instructions');
      if (instructions) instructions.style.display = 'none';
    });

    imageTarget.addEventListener('markerLost', () => {
      console.log('Marker lost');
      video.pause();
      const instructions = document.querySelector('.instructions');
      if (instructions) instructions.style.display = 'block';
    });

    // Add camera
    const camera = document.createElement('a-entity');
    camera.setAttribute('camera', '');
    camera.setAttribute('position', '0 0 0');
    camera.setAttribute('look-controls', 'enabled: false');

    // Append elements to scene
    scene.appendChild(imageTarget);
    scene.appendChild(camera);

    // Add scene to document
    document.body.appendChild(scene);

    // Handle initial video interaction
    document.addEventListener('click', () => {
      video.play().catch(console.error);
    }, { once: true });
  };

  useEffect(() => {
    const initAR = async () => {
      try {
        await loadARScripts();
        const arExperience = await getExperienceData();
        await setupARScene(arExperience);
        setLoading(false);
      } catch (error) {
        console.error('AR initialization error:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) scene.parentNode.removeChild(scene);
    };
  }, []);

  return (
    <Container>
      {loading && <LoadingScreen>Loading AR Experience...</LoadingScreen>}
      {error && (
        <ErrorContainer>
          <ErrorText>{error}</ErrorText>
          <RetryButton onClick={() => window.location.reload()}>
            Try Again
          </RetryButton>
        </ErrorContainer>
      )}
      <Instructions className="instructions">
        Point your camera at the marker to view AR content
      </Instructions>
    </Container>
  );
};

// Styled Components remain the same
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